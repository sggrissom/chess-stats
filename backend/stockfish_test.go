package backend

import "testing"

func TestTagBrilliantMovesRecognizesAcceptedSoundSacrifice(t *testing.T) {
	pgn := `[Event "Legal's Mate"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 d6 4. Nc3 Bg4 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`
	moves := alternatingAnalysisMoves(13)
	moves[8].MovePlayed = "f3e5"
	moves[8].BestMove = "f3e5"
	moves[8].Evaluation = 0
	moves[9].Evaluation = 50
	moves[10].Evaluation = 900

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

func TestTagBrilliantMovesRequiresTacticalUpside(t *testing.T) {
	pgn := `[Event "Live Chess"]
[Result "0-1"]

1. e4 c6 2. Nc3 d5 3. exd5 cxd5 4. Qf3 Nf6 5. Bb5+ Bd7 6. Bxd7+ Qxd7 7. Nge2 e6 8. Nd4 Nc6 9. Nxc6 Qxc6 10. O-O Bd6 11. a4 O-O 12. Nb5 Bc5 13. c3 a6 14. Na3 b5 15. axb5 axb5 16. Nc2 Rxa1 17. Nxa1 b4 18. cxb4 Bxb4 19. Nb3 Ra8 20. Nd4 Qc4 21. Qe3 Ra1 22. b3 Qxc1 23. Rxc1 Rxc1+ 24. Qe1 Rxe1# 0-1`
	moves := alternatingAnalysisMoves(48)

	// 16. Nc2 is only followed by routine rook/knight trades, not a tactic.
	moves[30].MovePlayed = "a3c2"
	moves[30].BestMove = "a3c2"
	moves[30].Evaluation = 0
	moves[31].Evaluation = 0
	moves[32].Evaluation = 10

	// 22...Qxc1 is a real queen sacrifice: if White accepts, Black's tactic
	// resolves into a decisive attack.
	moves[43].MovePlayed = "c4c1"
	moves[43].BestMove = "c4c1"
	moves[43].Evaluation = -250
	moves[44].Evaluation = -400
	moves[45].Evaluation = -900

	// 24. Qe1 is forced in a dead-lost position and should not be rewarded.
	moves[46].MovePlayed = "e3e1"
	moves[46].BestMove = "e3e1"
	moves[46].Evaluation = -10000
	moves[47].Evaluation = -10000

	got := TagBrilliantMoves(pgn, moves)
	if got[30].Brilliant {
		t.Fatal("TagBrilliantMoves() marked a routine equal trade as brilliant")
	}
	if !got[43].Brilliant {
		t.Fatal("TagBrilliantMoves() did not mark the decisive queen sacrifice")
	}
	if got[46].Brilliant {
		t.Fatal("TagBrilliantMoves() marked a forced move before mate as brilliant")
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
