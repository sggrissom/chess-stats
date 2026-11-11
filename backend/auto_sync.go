package backend

import (
	"chess/cfg"
	"fmt"
	"log"
	"sync"
	"time"

	"go.hasen.dev/vbolt"
	"go.hasen.dev/vpack"
)

const (
	// autoSyncInterval is how often the background loop syncs every connected account.
	autoSyncInterval = time.Hour
	// visitSyncStaleness is how old a user's last sync must be before visiting
	// the dashboard kicks off another one.
	visitSyncStaleness = 10 * time.Minute
)

// LastSyncBkt records the unix time of each user's last successful sync.
// key: userId
var LastSyncBkt = vbolt.Bucket(&cfg.Info, "last_sync", vpack.FInt, vpack.VInt64)

var autoSyncDB *vbolt.DB

// syncInFlight tracks users whose sync is currently running so manual,
// visit-triggered and scheduled syncs don't overlap.
var syncInFlight sync.Map

// StartAutoSync re-queues analysis interrupted by a restart and starts the
// loop that periodically syncs and analyzes games for every connected account.
func StartAutoSync(db *vbolt.DB) {
	autoSyncDB = db
	requeueStalledAnalysis(db)
	go func() {
		for {
			syncAllUsers(db)
			time.Sleep(autoSyncInterval)
		}
	}()
	log.Printf("[SYNC] Auto-sync started (interval: %s)", autoSyncInterval)
}

func syncAllUsers(db *vbolt.DB) {
	var userIds []int
	vbolt.WithReadTx(db, func(tx *vbolt.Tx) {
		vbolt.IterateAll(tx, ChessProfileBkt, func(userId int, profile ChessProfile) bool {
			if profile.ChesscomUsername != "" {
				userIds = append(userIds, userId)
			}
			return true
		})
	})
	for _, userId := range userIds {
		if added, _, err := syncAndAnalyze(db, userId); err != nil {
			log.Printf("[SYNC] User %d: %v", userId, err)
		} else if added > 0 {
			log.Printf("[SYNC] User %d: %d new games", userId, added)
		}
	}
}

// TriggerSyncIfStale starts a background sync for the user if their last sync
// is older than visitSyncStaleness. It returns immediately, reporting whether
// a sync for the user is now running.
func TriggerSyncIfStale(userId int) (syncing bool) {
	db := autoSyncDB
	if db == nil {
		return false
	}
	var lastSync int64
	vbolt.WithReadTx(db, func(tx *vbolt.Tx) {
		vbolt.Read(tx, LastSyncBkt, userId, &lastSync)
	})
	if time.Since(time.Unix(lastSync, 0)) < visitSyncStaleness {
		_, syncing = syncInFlight.Load(userId)
		return
	}
	if _, running := syncInFlight.LoadOrStore(userId, true); running {
		return true
	}
	go func() {
		defer syncInFlight.Delete(userId)
		if _, _, err := fetchAndStoreGames(db, userId); err != nil {
			log.Printf("[SYNC] Visit sync for user %d: %v", userId, err)
			return
		}
		queueUnanalyzedGames(db, userId)
	}()
	return true
}

// syncAndAnalyze syncs a user's games from chess.com, then queues any games
// without analysis.
func syncAndAnalyze(db *vbolt.DB, userId int) (added, total int, err error) {
	if _, running := syncInFlight.LoadOrStore(userId, true); running {
		return 0, 0, errSyncInProgress
	}
	defer syncInFlight.Delete(userId)

	added, total, err = fetchAndStoreGames(db, userId)
	if err != nil {
		return
	}
	queueUnanalyzedGames(db, userId)
	return
}

var errSyncInProgress = fmt.Errorf("sync already in progress")

// fetchAndStoreGames fetches new games from chess.com and stores them.
// Network calls happen outside of any transaction. Callers must hold the
// user's syncInFlight entry.
func fetchAndStoreGames(db *vbolt.DB, userId int) (added, total int, err error) {
	var profile ChessProfile
	vbolt.WithReadTx(db, func(tx *vbolt.Tx) {
		vbolt.Read(tx, ChessProfileBkt, userId, &profile)
	})
	if profile.ChesscomUsername == "" {
		return 0, 0, fmt.Errorf("no chess.com username configured")
	}

	now := time.Now()
	currentMonthKey := fmt.Sprintf("%d/%02d", now.Year(), int(now.Month()))

	archives, fetchErr := fetchArchiveList(profile.ChesscomUsername)
	if fetchErr != nil {
		return 0, 0, fmt.Errorf("failed to fetch archive list: %w", fetchErr)
	}

	type pendingGame struct {
		game Game
		pgn  string
	}

	var pending []pendingGame
	var monthsToMark []string

	for _, archiveURL := range archives {
		monthKey := extractMonthKey(archiveURL)
		if monthKey == "" {
			continue
		}
		sentinelKey := fmt.Sprintf("%d/%s", userId, monthKey)

		// Skip already-synced months (except the current month)
		if monthKey != currentMonthKey {
			var synced bool
			vbolt.WithReadTx(db, func(tx *vbolt.Tx) {
				vbolt.Read(tx, SyncedMonthsBkt, sentinelKey, &synced)
			})
			if synced {
				continue
			}
		}

		rawGames, monthErr := fetchMonthlyGames(archiveURL)
		if monthErr != nil {
			// Skip this month on error; don't fail the whole sync
			continue
		}

		for _, raw := range rawGames {
			gameId := extractGameID(raw.URL)
			if gameId == "" {
				continue
			}
			g := buildGame(raw, gameId, userId, profile.ChesscomUsername)
			pending = append(pending, pendingGame{game: g, pgn: raw.PGN})
		}

		if monthKey != currentMonthKey {
			monthsToMark = append(monthsToMark, sentinelKey)
		}
	}

	vbolt.WithWriteTx(db, func(tx *vbolt.Tx) {
		for _, pg := range pending {
			if vbolt.HasKey(tx, GameBkt, pg.game.Id) {
				// Backfill StartTime for games stored before the EndTime fallback was added
				if pg.game.StartTime != 0 {
					var existing Game
					vbolt.Read(tx, GameBkt, pg.game.Id, &existing)
					if existing.StartTime == 0 {
						existing.StartTime = pg.game.StartTime
						vbolt.Write(tx, GameBkt, pg.game.Id, &existing)
					}
				}
				continue
			}
			vbolt.Write(tx, GameBkt, pg.game.Id, &pg.game)
			pgn := pg.pgn
			vbolt.Write(tx, GamePgnBkt, pg.game.Id, &pgn)
			vbolt.SetTargetSingleTerm(tx, GamesByUserIdx, pg.game.Id, userId)
			if info := extractOpeningFromPGN(pg.pgn); info.ECO != "" {
				vbolt.Write(tx, GameOpeningBkt, pg.game.Id, &info)
			}
			cls := classifyGameOpening(pg.pgn)
			vbolt.Write(tx, GameOpeningClassBkt, pg.game.Id, &cls)
			added++
		}

		synced := true
		for _, mk := range monthsToMark {
			vbolt.Write(tx, SyncedMonthsBkt, mk, &synced)
		}

		syncedAt := now.Unix()
		vbolt.Write(tx, LastSyncBkt, userId, &syncedAt)

		vbolt.ReadTermCount(tx, GamesByUserIdx, &userId, &total)
		vbolt.TxCommit(tx)
	})
	return
}

// queueUnanalyzedGames marks every standard game of the user that has no
// analysis record as pending and feeds it to the analysis worker.
func queueUnanalyzedGames(db *vbolt.DB, userId int) (queued int, err error) {
	if globalAnalysisWorker == nil {
		return 0, fmt.Errorf("analysis worker not available")
	}

	const maxBulkAnalysis = 1000
	var gameIds []string
	vbolt.WithReadTx(db, func(tx *vbolt.Tx) {
		vbolt.IterateTerm(tx, GamesByUserIdx, userId, func(gameId string, _ uint16) bool {
			if len(gameIds) >= maxBulkAnalysis {
				return false
			}
			if vbolt.HasKey(tx, GameAnalysisBkt, gameId) {
				return true
			}
			var g Game
			vbolt.Read(tx, GameBkt, gameId, &g)
			if g.Rules != "" && g.Rules != "chess" {
				return true
			}
			gameIds = append(gameIds, gameId)
			return true
		})
	})

	if len(gameIds) == 0 {
		return 0, nil
	}

	vbolt.WithWriteTx(db, func(tx *vbolt.Tx) {
		for _, gameId := range gameIds {
			pending := GameAnalysis{GameId: gameId, Status: AnalysisStatusPending}
			vbolt.Write(tx, GameAnalysisBkt, gameId, &pending)
			vbolt.SetTargetSingleTerm(tx, AnalysisByStatusIdx, gameId, AnalysisStatusPending)
		}
		vbolt.TxCommit(tx)
	})

	enqueueAnalysisJobs(gameIds)
	return len(gameIds), nil
}

// requeueStalledAnalysis re-queues games left pending or mid-analysis when the
// server last stopped, since the job queue only lives in memory.
func requeueStalledAnalysis(db *vbolt.DB) {
	if globalAnalysisWorker == nil {
		return
	}
	var gameIds []string
	vbolt.WithReadTx(db, func(tx *vbolt.Tx) {
		for _, status := range []int{AnalysisStatusAnalyzing, AnalysisStatusPending} {
			vbolt.IterateTerm(tx, AnalysisByStatusIdx, status, func(gameId string, _ uint16) bool {
				gameIds = append(gameIds, gameId)
				return true
			})
		}
	})
	if len(gameIds) == 0 {
		return
	}
	log.Printf("[ANALYSIS] Re-queueing %d stalled games", len(gameIds))
	enqueueAnalysisJobs(gameIds)
}

// enqueueAnalysisJobs feeds jobs to the worker without blocking the caller.
func enqueueAnalysisJobs(gameIds []string) {
	go func() {
		for _, id := range gameIds {
			globalAnalysisWorker.jobQueue <- AnalysisJob{GameId: id}
		}
	}()
}
