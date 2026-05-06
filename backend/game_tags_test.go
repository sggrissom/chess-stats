package backend

import "testing"

func hasTag(tags []string, target string) bool {
	for _, t := range tags {
		if t == target {
			return true
		}
	}
	return false
}

func TestTagGameCleanConvertedWin(t *testing.T) {
	thr := DefaultGameTagThresholds()
	e := []float64{0.2, 0.4, 1, 2, 3.2, 3.4, 3.5, 3.7, 3.6, 3.8}
	m := []int{1, 1, 2, 2, 3, 3, 4, 4, 5, 5}
	res := TagGameFromSeries("white", e, m, thr)
	if !hasTag(res.Tags, "ConvertedWin") || !hasTag(res.Tags, "WhiteHadSustainedWin") {
		t.Fatalf("expected converted sustained win tags: %+v", res.Tags)
	}
}

func TestTagGameMissedWinThrow(t *testing.T) {
	thr := DefaultGameTagThresholds()
	e := []float64{-3.2, -3.3, -3.5, -3.6, -3.8, -3.9, 0.1, 0.2}
	m := []int{1, 1, 2, 2, 3, 3, 4, 4}
	res := TagGameFromSeries("white", e, m, thr)
	if !hasTag(res.Tags, "Throw") || !hasTag(res.Tags, "MissedWin") {
		t.Fatalf("expected throw and missed win tags: %+v", res.Tags)
	}
}

func TestTagGameSavedGame(t *testing.T) {
	thr := DefaultGameTagThresholds()
	e := []float64{0.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.9, 0.0}
	m := []int{1, 1, 2, 2, 3, 3, 4, 4}
	res := TagGameFromSeries("draw", e, m, thr)
	if !hasTag(res.Tags, "SavedGame") {
		t.Fatalf("expected saved game tag: %+v", res.Tags)
	}
}

func TestTagGameChaoticBothWinning(t *testing.T) {
	thr := DefaultGameTagThresholds()
	e := []float64{3.1, 3.2, 3.4, 3.6, 3.7, 3.8, -3.2, -3.3, -3.4, -3.5, -3.6, -3.7}
	m := []int{1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6}
	res := TagGameFromSeries("black", e, m, thr)
	if !hasTag(res.Tags, "ChaoticGame") {
		t.Fatalf("expected chaotic game tag: %+v", res.Tags)
	}
}

func TestTagGameSingleBlunder(t *testing.T) {
	thr := DefaultGameTagThresholds()
	e := []float64{0.1, 0.3, 0.4, -3.2, -3.3}
	m := []int{1, 1, 2, 2, 3}
	res := TagGameFromSeries("black", e, m, thr)
	if !hasTag(res.Tags, "SingleBlunderGame") {
		t.Fatalf("expected single blunder tag: %+v", res.Tags)
	}
}

func TestTagGameGradualOutplay(t *testing.T) {
	thr := DefaultGameTagThresholds()
	e := []float64{0.0, -0.2, -0.5, -0.8, -1.1, -1.3, -1.6}
	m := []int{1, 1, 2, 2, 3, 3, 4, 4}
	res := TagGameFromSeries("black", e, m, thr)
	if !hasTag(res.Tags, "GradualOutplay") {
		t.Fatalf("expected gradual outplay tag: %+v", res.Tags)
	}
}

func TestTagGameOpeningTags(t *testing.T) {
	thr := DefaultGameTagThresholds()
	resW := TagGameFromSeries("white", []float64{0.1, 2.2}, []int{1, 10}, thr)
	resB := TagGameFromSeries("black", []float64{0.1, -2.2}, []int{1, 10}, thr)
	resN := TagGameFromSeries("draw", []float64{0.1, 0.4}, []int{1, 10}, thr)
	if !hasTag(resW.Tags, "WhiteWonOpening") || !hasTag(resB.Tags, "BlackWonOpening") || !hasTag(resN.Tags, "OpeningNeutral") {
		t.Fatalf("opening tags missing: W=%+v B=%+v N=%+v", resW.Tags, resB.Tags, resN.Tags)
	}
}

func TestTagGameMateAndTacticalSpike(t *testing.T) {
	thr := DefaultGameTagThresholds()
	fromMoves := []MoveAnalysis{{MoveNumber: 1, Evaluation: 20}, {MoveNumber: 2, IsMate: true, MateIn: 3}}
	resMate := TagGameFromEvals("white", fromMoves, thr)
	resTac := TagGameFromSeries("white", []float64{0.1, 5.1, 0.0}, []int{1, 2, 2}, thr)
	if !hasTag(resMate.Tags, "WhiteHadTacticalWin") || !hasTag(resTac.Tags, "WhiteHadTacticalWin") {
		t.Fatalf("expected tactical win via mate/spike: mate=%+v tac=%+v", resMate.Tags, resTac.Tags)
	}
}

func TestTagGameBriefThreeNotSustained(t *testing.T) {
	thr := DefaultGameTagThresholds()
	res := TagGameFromSeries("white", []float64{0.1, 3.1, 0.2, 0.3}, []int{1, 2, 2, 3}, thr)
	if hasTag(res.Tags, "WhiteHadSustainedWin") {
		t.Fatalf("should not be sustained win: %+v", res.Tags)
	}
}
