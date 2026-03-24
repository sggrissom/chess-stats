package backend

import (
	"chess/cfg"

	"go.hasen.dev/vbolt"
	"go.hasen.dev/vpack"
)

// Analysis status constants
const (
	AnalysisStatusNone      = -1 // no analysis record exists; never requested
	AnalysisStatusPending   = 0
	AnalysisStatusAnalyzing = 1
	AnalysisStatusDone      = 2
	AnalysisStatusFailed    = 3
)

// MoveAnalysis holds Stockfish evaluation data for a single ply.
// Evaluation is always from white's absolute perspective (positive = white winning).
type MoveAnalysis struct {
	MoveNumber int    // 1-based full-move number
	Color      string // "white" or "black"
	MovePlayed string // UCI notation e.g. "e2e4"
	BestMove   string // UCI notation from Stockfish bestmove
	Evaluation int    // centipawns; ignored when IsMate is true
	IsMate     bool   // true when score is a forced mate
	MateIn     int    // positive = white mates in N, negative = black mates in N
}

func packMoveAnalysis(self *MoveAnalysis, buf *vpack.Buffer) {
	vpack.Version(1, buf)
	vpack.Int(&self.MoveNumber, buf)
	vpack.String(&self.Color, buf)
	vpack.String(&self.MovePlayed, buf)
	vpack.String(&self.BestMove, buf)
	vpack.Int(&self.Evaluation, buf)
	vpack.Bool(&self.IsMate, buf)
	vpack.Int(&self.MateIn, buf)
}

func packMoveAnalysisSlice(moves *[]MoveAnalysis, buf *vpack.Buffer) {
	count := len(*moves)
	vpack.Int(&count, buf)
	if !buf.Writing {
		*moves = make([]MoveAnalysis, count)
	}
	for i := range *moves {
		packMoveAnalysis(&(*moves)[i], buf)
	}
}

// GameAnalysis stores the full Stockfish analysis result for a game.
type GameAnalysis struct {
	GameId        string
	Status        int
	AnalysisDepth int
	WhiteAccuracy float64
	BlackAccuracy float64
	Moves         []MoveAnalysis
	ErrorMessage  string
	AnalyzedAt    int64 // unix timestamp
}

func PackGameAnalysis(self *GameAnalysis, buf *vpack.Buffer) {
	vpack.Version(1, buf)
	vpack.String(&self.GameId, buf)
	vpack.Int(&self.Status, buf)
	vpack.Int(&self.AnalysisDepth, buf)
	vpack.Float64(&self.WhiteAccuracy, buf)
	vpack.Float64(&self.BlackAccuracy, buf)
	packMoveAnalysisSlice(&self.Moves, buf)
	vpack.String(&self.ErrorMessage, buf)
	vpack.VInt64(&self.AnalyzedAt, buf)
}

// Buckets

// gameId => GameAnalysis
var GameAnalysisBkt = vbolt.Bucket(&cfg.Info, "chess_game_analysis", vpack.StringZ, PackGameAnalysis)

// Index: term=status(int), target=gameId(string)
// Enables querying games by analysis status (e.g. all pending games).
var AnalysisByStatusIdx = vbolt.Index[string, int](&cfg.Info, "analysis_by_status", vpack.FInt, vpack.StringZ)
