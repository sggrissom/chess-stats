package backend

import "testing"

func TestClassifyOpeningByPosition(t *testing.T) {
	cases := []struct {
		name          string
		pgn           string
		wantFamily    string
		wantVariation string
		wantCommitted string
	}{
		{
			name:          "caro-kann advance",
			pgn:           "1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 e6 *",
			wantFamily:    "Caro-Kann Defense",
			wantVariation: "Advance Variation",
			wantCommitted: "Caro-Kann Defense",
		},
		{
			// 1.d4 c6 2.e4 d5 3.e5 reaches the same position by a different move order
			name:          "caro-kann advance via transposition",
			pgn:           "1. d4 c6 2. e4 d5 3. e5 Bf5 4. Nf3 *",
			wantFamily:    "Caro-Kann Defense",
			wantVariation: "Advance Variation",
		},
		{
			name:          "danish into goring",
			pgn:           "1. e4 e5 2. d4 exd4 3. c3 Nc6 4. Nf3 *",
			wantFamily:    "Scotch Game",
			wantCommitted: "Danish Gambit",
		},
		{
			name:          "danish accepted",
			pgn:           "1. e4 e5 2. d4 exd4 3. c3 dxc3 4. Bc4 *",
			wantFamily:    "Danish Gambit",
			wantVariation: "Accepted",
			wantCommitted: "Danish Gambit",
		},
		{
			name:          "vienna gambit",
			pgn:           "1. e4 e5 2. Nc3 Nf6 3. f4 *",
			wantFamily:    "Vienna Game",
			wantVariation: "Vienna Gambit",
			wantCommitted: "Vienna Game",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := ClassifyOpening(tc.pgn)
			if c.Unclassified {
				t.Fatalf("unclassified")
			}
			if c.Deepest.Family != tc.wantFamily {
				t.Errorf("family = %q (%s), want %q", c.Deepest.Family, c.Deepest.Name, tc.wantFamily)
			}
			if tc.wantVariation != "" && c.Deepest.Variation != tc.wantVariation {
				t.Errorf("variation = %q (%s), want %q", c.Deepest.Variation, c.Deepest.Name, tc.wantVariation)
			}
			if tc.wantCommitted != "" && c.Committed.Family != tc.wantCommitted {
				t.Errorf("committed = %q, want %q (families %v)", c.Committed.Family, tc.wantCommitted, c.Families)
			}
		})
	}
}

func TestClassifyOpeningGroupsTranspositionsUnderChosenFamily(t *testing.T) {
	// 1.e4 e5 2.Nc3 Nf6 3.Bc4 Nc6 4.d3 reaches "Bishop's Opening: Vienna Hybrid",
	// but the game chose the Vienna by move 3.
	c := ClassifyOpening("1. e4 e5 2. Nc3 Nf6 3. Bc4 Nc6 4. d3 *")
	if c.Line.Family != "Vienna Game" || c.Line.Variation != "Stanley Variation" {
		t.Errorf("line = %q / %q (%s), want Vienna Game / Stanley Variation", c.Line.Family, c.Line.Variation, c.Line.Name)
	}
	if !c.Transposed || c.Deepest.Family != "Bishop's Opening" {
		t.Errorf("transposed = %v, deepest = %q, want transposition into Bishop's Opening", c.Transposed, c.Deepest.Name)
	}
}

func TestClassifyOpeningNormalizesVariationNames(t *testing.T) {
	// The book names this "Caro-Kann Defense: Advance, Short Variation".
	c := ClassifyOpening("1. e4 c6 2. d4 d5 3. e5 Bf5 4. c3 e6 5. Be2 *")
	if c.Line.Variation != "Advance Variation" {
		t.Errorf("variation = %q (%s), want Advance Variation", c.Line.Variation, c.Line.Name)
	}
}

func TestSplitBookName(t *testing.T) {
	cases := []struct{ name, family, variation, subLine string }{
		{"Caro-Kann Defense: Advance Variation, Short Variation", "Caro-Kann Defense", "Advance Variation", "Short Variation"},
		{"Danish Gambit Accepted: Chigorin Defense", "Danish Gambit", "Accepted", "Chigorin Defense"},
		{"Vienna Gambit, with Max Lange Defense: Knight Variation", "Vienna Game", "Vienna Gambit", "with Max Lange Defense, Knight Variation"},
		{"London System, with Bd3", "London System", "with Bd3", ""},
		{"Queen's Gambit Declined: Exchange Variation", "Queen's Gambit Declined", "Exchange Variation", ""},
	}
	for _, tc := range cases {
		op := splitBookName("", tc.name)
		if op.Family != tc.family || op.Variation != tc.variation || op.SubLine != tc.subLine {
			t.Errorf("%q => %q / %q / %q, want %q / %q / %q", tc.name, op.Family, op.Variation, op.SubLine, tc.family, tc.variation, tc.subLine)
		}
	}
}
