package backend

import (
	"chess/cfg"
	"fmt"
	"strings"
	"time"

	"go.hasen.dev/vbeam"
	"go.hasen.dev/vbolt"
	"go.hasen.dev/vpack"
)

func RegisterChessMethods(app *vbeam.Application) {
	vbeam.RegisterProc(app, SetChessUsername)
	vbeam.RegisterProc(app, GetChessProfile)
	vbeam.RegisterProc(app, SyncGames)
}

// Request/Response types

type SetChessUsernameRequest struct {
	ChesscomUsername string `json:"chesscomUsername"`
}

type SetChessUsernameResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type GetChessProfileResponse struct {
	ChesscomUsername string `json:"chesscomUsername"`
	GameCount        int    `json:"gameCount"`
}

type SyncGamesResponse struct {
	Success       bool   `json:"success"`
	Error         string `json:"error,omitempty"`
	NewGamesAdded int    `json:"newGamesAdded"`
	TotalGames    int    `json:"totalGames"`
}

// Database types

type ChessProfile struct {
	UserId           int
	ChesscomUsername string
}

func PackChessProfile(self *ChessProfile, buf *vpack.Buffer) {
	vpack.Version(1, buf)
	vpack.Int(&self.UserId, buf)
	vpack.String(&self.ChesscomUsername, buf)
}

type Game struct {
	Id            string
	UserId        int
	WhiteUsername string
	WhiteRating   int
	BlackUsername string
	BlackRating   int
	TimeClass     string // bullet/blitz/rapid/daily
	TimeControl   string // e.g. "600+5"
	Result        string // "win", "loss", or "draw" from user's perspective
	UserColor     string // "white" or "black"
	StartTime     int64  // unix timestamp
	Rules         string // "chess" or variant name
}

func PackGame(self *Game, buf *vpack.Buffer) {
	vpack.Version(1, buf)
	vpack.String(&self.Id, buf)
	vpack.Int(&self.UserId, buf)
	vpack.String(&self.WhiteUsername, buf)
	vpack.Int(&self.WhiteRating, buf)
	vpack.String(&self.BlackUsername, buf)
	vpack.Int(&self.BlackRating, buf)
	vpack.String(&self.TimeClass, buf)
	vpack.String(&self.TimeControl, buf)
	vpack.String(&self.Result, buf)
	vpack.String(&self.UserColor, buf)
	vpack.VInt64(&self.StartTime, buf)
	vpack.String(&self.Rules, buf)
}

// Buckets

// userId => ChessProfile
var ChessProfileBkt = vbolt.Bucket(&cfg.Info, "chess_profile", vpack.FInt, PackChessProfile)

// gameId (chess.com game URL ID) => Game
var GameBkt = vbolt.Bucket(&cfg.Info, "chess_games", vpack.StringZ, PackGame)

// gameId => PGN string (stored separately to keep GameBkt lean)
var GamePgnBkt = vbolt.Bucket(&cfg.Info, "chess_game_pgn", vpack.StringZ, vpack.String)

// Index: term=userId(int), target=gameId(string)
// Enables listing and counting all game IDs for a given user.
var GamesByUserIdx = vbolt.Index[string, int](&cfg.Info, "games_by_user", vpack.FInt, vpack.StringZ)

// Synced-month sentinel: key="userId/YYYY/MM", value=true means month has been fully fetched.
// Current month is never marked synced so new games are always picked up.
var SyncedMonthsBkt = vbolt.Bucket(&cfg.Info, "synced_months", vpack.StringZ, vpack.Bool)

// Procedures

func SetChessUsername(ctx *vbeam.Context, req SetChessUsernameRequest) (resp SetChessUsernameResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		resp.Error = "Authentication required"
		return
	}

	username := strings.TrimSpace(req.ChesscomUsername)
	if username == "" {
		resp.Error = "Username is required"
		return
	}

	// Verify the username exists on chess.com before saving
	_, fetchErr := fetchArchiveList(username)
	if fetchErr != nil {
		resp.Error = "Could not verify chess.com username: " + fetchErr.Error()
		return
	}

	profile := ChessProfile{
		UserId:           user.Id,
		ChesscomUsername: username,
	}
	vbeam.UseWriteTx(ctx)
	vbolt.Write(ctx.Tx, ChessProfileBkt, user.Id, &profile)
	vbolt.TxCommit(ctx.Tx)

	resp.Success = true
	return
}

func GetChessProfile(ctx *vbeam.Context, req Empty) (resp GetChessProfileResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		return
	}

	var profile ChessProfile
	vbolt.Read(ctx.Tx, ChessProfileBkt, user.Id, &profile)
	resp.ChesscomUsername = profile.ChesscomUsername
	vbolt.ReadTermCount(ctx.Tx, GamesByUserIdx, &user.Id, &resp.GameCount)
	return
}

func SyncGames(ctx *vbeam.Context, req Empty) (resp SyncGamesResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		resp.Error = "Authentication required"
		return
	}

	// Read profile from existing read tx
	var profile ChessProfile
	vbolt.Read(ctx.Tx, ChessProfileBkt, user.Id, &profile)
	if profile.ChesscomUsername == "" {
		resp.Error = "No chess.com username configured"
		return
	}

	now := time.Now()
	currentMonthKey := fmt.Sprintf("%d/%02d", now.Year(), int(now.Month()))

	// Fetch archive list (network call, no tx held after this)
	archives, fetchErr := fetchArchiveList(profile.ChesscomUsername)
	if fetchErr != nil {
		resp.Error = "Failed to fetch archive list: " + fetchErr.Error()
		return
	}

	type pendingGame struct {
		game        Game
		pgn         string
		sentinelKey string
	}

	var pending []pendingGame
	var monthsToMark []string

	for _, archiveURL := range archives {
		monthKey := extractMonthKey(archiveURL)
		if monthKey == "" {
			continue
		}
		sentinelKey := fmt.Sprintf("%d/%s", user.Id, monthKey)

		// Skip already-synced months (except the current month)
		if monthKey != currentMonthKey {
			var synced bool
			vbolt.Read(ctx.Tx, SyncedMonthsBkt, sentinelKey, &synced)
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
			g := buildGame(raw, gameId, user.Id, profile.ChesscomUsername)
			pending = append(pending, pendingGame{game: g, pgn: raw.PGN, sentinelKey: sentinelKey})
		}

		if monthKey != currentMonthKey {
			monthsToMark = append(monthsToMark, sentinelKey)
		}
	}

	// Switch to write tx and persist everything
	vbeam.UseWriteTx(ctx)

	var added int
	for _, pg := range pending {
		if vbolt.HasKey(ctx.Tx, GameBkt, pg.game.Id) {
			continue
		}
		vbolt.Write(ctx.Tx, GameBkt, pg.game.Id, &pg.game)
		pgn := pg.pgn
		vbolt.Write(ctx.Tx, GamePgnBkt, pg.game.Id, &pgn)
		vbolt.SetTargetSingleTerm(ctx.Tx, GamesByUserIdx, pg.game.Id, user.Id)
		added++
	}

	synced := true
	for _, mk := range monthsToMark {
		vbolt.Write(ctx.Tx, SyncedMonthsBkt, mk, &synced)
	}

	var total int
	vbolt.ReadTermCount(ctx.Tx, GamesByUserIdx, &user.Id, &total)

	vbolt.TxCommit(ctx.Tx)

	resp.Success = true
	resp.NewGamesAdded = added
	resp.TotalGames = total
	return
}

func buildGame(raw chesscomGame, gameId string, userId int, username string) Game {
	g := Game{
		Id:            gameId,
		UserId:        userId,
		WhiteUsername: raw.White.Username,
		WhiteRating:   raw.White.Rating,
		BlackUsername: raw.Black.Username,
		BlackRating:   raw.Black.Rating,
		TimeClass:     raw.TimeClass,
		TimeControl:   raw.TimeControl,
		StartTime:     raw.StartTime,
		Rules:         raw.Rules,
	}
	if strings.EqualFold(raw.White.Username, username) {
		g.UserColor = "white"
		g.Result = normalizeResult(raw.White.Result)
	} else {
		g.UserColor = "black"
		g.Result = normalizeResult(raw.Black.Result)
	}
	return g
}

func normalizeResult(r string) string {
	switch r {
	case "win":
		return "win"
	case "agreed", "stalemate", "insufficient", "repetition", "timevsinsufficient", "50move":
		return "draw"
	default:
		return "loss"
	}
}
