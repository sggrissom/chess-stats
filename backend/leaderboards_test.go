package backend

import (
	"math"
	"testing"
)

func TestCompetitivePositionPct(t *testing.T) {
	moves := []MoveAnalysis{
		{Evaluation: 0},
		{Evaluation: 100},
		{Evaluation: -100},
		{Evaluation: 101},
		{Evaluation: -250},
		{IsMate: true, MateIn: 2},
	}

	got := competitivePositionPct(moves)
	if math.Abs(got-60) > 0.001 {
		t.Fatalf("competitivePositionPct() = %.2f, want 60", got)
	}
}

func TestCompetitivePositionPctWithNoCentipawnPositions(t *testing.T) {
	moves := []MoveAnalysis{{IsMate: true, MateIn: 1}}
	if got := competitivePositionPct(moves); got != 0 {
		t.Fatalf("competitivePositionPct() = %.2f, want 0", got)
	}
}

func TestPgnFullMoveCount(t *testing.T) {
	pgn := `[Event "Test"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0`
	if got := pgnFullMoveCount(pgn); got != 3 {
		t.Fatalf("pgnFullMoveCount() = %d, want 3", got)
	}
}

func TestPgnFullMoveCountRejectsInvalidPgn(t *testing.T) {
	if got := pgnFullMoveCount("not a pgn"); got != 0 {
		t.Fatalf("pgnFullMoveCount() = %d, want 0", got)
	}
}
