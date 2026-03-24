package backend

import (
	"chess/cfg"
	"fmt"
	"log"
	"math"
	"os/exec"
	"time"

	"go.hasen.dev/vbolt"
)

// AnalysisJob holds the data needed to analyze a single game.
type AnalysisJob struct {
	GameId string
}

type analysisWorker struct {
	jobQueue    chan AnalysisJob
	stopChannel chan bool
	db          *vbolt.DB
}

var globalAnalysisWorker *analysisWorker

// InitializeAnalysisWorker starts the background Stockfish analysis worker.
// It is a no-op if already initialized or if the Stockfish binary is not found.
func InitializeAnalysisWorker(db *vbolt.DB) {
	if globalAnalysisWorker != nil {
		log.Printf("[ANALYSIS] Worker already initialized, skipping")
		return
	}

	if _, err := exec.LookPath(cfg.StockfishPath); err != nil {
		log.Printf("[ANALYSIS] Stockfish not found at %q, analysis worker disabled: %v", cfg.StockfishPath, err)
		return
	}

	globalAnalysisWorker = &analysisWorker{
		jobQueue:    make(chan AnalysisJob, 50),
		stopChannel: make(chan bool),
		db:          db,
	}

	go globalAnalysisWorker.processJobs()
	log.Printf("[ANALYSIS] Worker started (stockfish: %s)", cfg.StockfishPath)
}

// QueueGameAnalysis enqueues a game for Stockfish analysis.
// Returns an error if the worker is not running or the queue is full.
func QueueGameAnalysis(job AnalysisJob) error {
	if globalAnalysisWorker == nil {
		return fmt.Errorf("analysis worker not initialized")
	}
	select {
	case globalAnalysisWorker.jobQueue <- job:
		log.Printf("[ANALYSIS] Game %s queued", job.GameId)
		return nil
	default:
		return fmt.Errorf("analysis queue full, game %s not queued", job.GameId)
	}
}

func (w *analysisWorker) processJobs() {
	for {
		select {
		case job := <-w.jobQueue:
			w.processAnalysisJob(job)
		case <-w.stopChannel:
			log.Printf("[ANALYSIS] Worker stopped")
			return
		}
	}
}

func (w *analysisWorker) processAnalysisJob(job AnalysisJob) {
	log.Printf("[ANALYSIS] Starting analysis of game %s", job.GameId)

	// Mark as analyzing
	setAnalysisStatus(w.db, job.GameId, AnalysisStatusAnalyzing, "")

	// Read PGN
	var pgn string
	vbolt.WithReadTx(w.db, func(tx *vbolt.Tx) {
		vbolt.Read(tx, GamePgnBkt, job.GameId, &pgn)
	})
	if pgn == "" {
		log.Printf("[ANALYSIS] No PGN found for game %s", job.GameId)
		setAnalysisStatus(w.db, job.GameId, AnalysisStatusFailed, "no PGN found")
		return
	}

	// Check that this is a standard chess game (no variants)
	var game Game
	vbolt.WithReadTx(w.db, func(tx *vbolt.Tx) {
		vbolt.Read(tx, GameBkt, job.GameId, &game)
	})
	if game.Rules != "" && game.Rules != "chess" {
		log.Printf("[ANALYSIS] Skipping variant game %s (rules: %s)", job.GameId, game.Rules)
		setAnalysisStatus(w.db, job.GameId, AnalysisStatusFailed, fmt.Sprintf("variant not supported: %s", game.Rules))
		return
	}

	// Run Stockfish
	engine, err := NewStockfishEngine(cfg.StockfishPath)
	if err != nil {
		log.Printf("[ANALYSIS] Failed to start Stockfish for game %s: %v", job.GameId, err)
		setAnalysisStatus(w.db, job.GameId, AnalysisStatusFailed, err.Error())
		return
	}
	defer engine.Close()

	const analysisDepth = 18
	moves, err := engine.AnalyzeGame(pgn, analysisDepth)
	if err != nil {
		log.Printf("[ANALYSIS] Analysis failed for game %s: %v", job.GameId, err)
		setAnalysisStatus(w.db, job.GameId, AnalysisStatusFailed, err.Error())
		return
	}

	whiteAccuracy, blackAccuracy := ComputeAccuracy(moves)
	// Round to 1 decimal place
	whiteAccuracy = math.Round(whiteAccuracy*10) / 10
	blackAccuracy = math.Round(blackAccuracy*10) / 10

	result := GameAnalysis{
		GameId:        job.GameId,
		Status:        AnalysisStatusDone,
		AnalysisDepth: analysisDepth,
		WhiteAccuracy: whiteAccuracy,
		BlackAccuracy: blackAccuracy,
		Moves:         moves,
		AnalyzedAt:    time.Now().Unix(),
	}

	vbolt.WithWriteTx(w.db, func(tx *vbolt.Tx) {
		vbolt.Write(tx, GameAnalysisBkt, result.GameId, &result)
		vbolt.SetTargetSingleTerm(tx, AnalysisByStatusIdx, result.GameId, result.Status)
		vbolt.TxCommit(tx)
	})

	log.Printf("[ANALYSIS] Completed game %s (white: %.1f%%, black: %.1f%%)", job.GameId, whiteAccuracy, blackAccuracy)
}

func setAnalysisStatus(db *vbolt.DB, gameId string, status int, errMsg string) {
	vbolt.WithWriteTx(db, func(tx *vbolt.Tx) {
		var existing GameAnalysis
		vbolt.Read(tx, GameAnalysisBkt, gameId, &existing)
		existing.GameId = gameId
		existing.Status = status
		existing.ErrorMessage = errMsg
		vbolt.Write(tx, GameAnalysisBkt, gameId, &existing)
		vbolt.SetTargetSingleTerm(tx, AnalysisByStatusIdx, gameId, status)
		vbolt.TxCommit(tx)
	})
}
