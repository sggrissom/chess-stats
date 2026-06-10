package backend

import "testing"

func TestTagBrilliantMovesRecognizesAcceptedSoundSacrifice(t *testing.T) {
	pgn := `[Event "Legal's Mate"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 d6 4. Nc3 Bg4 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`
	moves := alternatingAnalysisMoves(13)
	moves[8].MovePlayed = "f3e5"
	moves[8].BestMove = "f3e5"

	got := TagBrilliantMoves(pgn, moves)
	if !got[8].Brilliant {
		t.Fatal("TagBrilliantMoves() did not mark the accepted queen sacrifice")
	}
	if got[8].BrilliantReason != "sound_material_sacrifice" {
		t.Fatalf("BrilliantReason = %q, want sound_material_sacrifice", got[8].BrilliantReason)
	}
}

func TestTagBrilliantMovesRejectsUnsoundSacrifice(t *testing.T) {
	pgn := `[Event "Legal's Mate"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 d6 4. Nc3 Bg4 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`
	moves := alternatingAnalysisMoves(13)
	moves[8].MovePlayed = "f3e5"
	moves[8].BestMove = "f3e5"
	moves[8].Evaluation = 300
	moves[9].Evaluation = -300

	got := TagBrilliantMoves(pgn, moves)
	if got[8].Brilliant {
		t.Fatal("TagBrilliantMoves() marked a sacrifice with a large evaluation loss")
	}
}

func alternatingAnalysisMoves(count int) []MoveAnalysis {
	moves := make([]MoveAnalysis, count)
	for i := range moves {
		moves[i].Color = "white"
		if i%2 == 1 {
			moves[i].Color = "black"
		}
	}
	return moves
}
