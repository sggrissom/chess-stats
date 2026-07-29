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
	if !hasTag(res.Tags, "ConvertedWin") || !hasTag(res.Tags, "WhiteHadWin") {
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

func TestTagGameSingleSwing(t *testing.T) {
	thr := DefaultGameTagThresholds()
	e := []float64{0.1, 0.3, 0.4, -3.2, -3.3}
	m := []int{1, 1, 2, 2, 3}
	res := TagGameFromSeries("black", e, m, thr)
	if !hasTag(res.Tags, "SingleSwingGame") {
		t.Fatalf("expected single swing tag: %+v", res.Tags)
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

func TestTagGameMateAndPracticalSpike(t *testing.T) {
	thr := DefaultGameTagThresholds()
	fromMoves := []MoveAnalysis{{MoveNumber: 1, Evaluation: 20}, {MoveNumber: 2, IsMate: true, MateIn: 3}}
	resMate := TagGameFromEvals("white", fromMoves, thr)
	resTac := TagGameFromSeries("white", []float64{0.1, 5.1, 0.0}, []int{1, 2, 2}, thr)
	if !hasTag(resMate.Tags, "WhiteHadWin") || !hasTag(resTac.Tags, "WhiteHadWin") {
		t.Fatalf("expected practical win via mate/spike: mate=%+v tac=%+v", resMate.Tags, resTac.Tags)
	}
}

func TestTagGameBriefThreeNotSustained(t *testing.T) {
	thr := DefaultGameTagThresholds()
	res := TagGameFromSeries("white", []float64{0.1, 3.1, 0.2, 0.3}, []int{1, 2, 2, 3}, thr)
	if hasTag(res.Tags, "WhiteHadWin") {
		t.Fatalf("should not be practical win: %+v", res.Tags)
	}
}

func TestTagGameNoComebackFromSmallLead(t *testing.T) {
	thr := DefaultGameTagThresholds()
	e := []float64{0.4, 0.2, -0.3, 0.1, 0.2}
	m := []int{1, 1, 2, 2, 3}
	res := TagGameFromSeries("white", e, m, thr)
	if hasTag(res.Tags, "ComebackWin") || hasTag(res.Tags, "BackAndForthGame") {
		t.Fatalf("should not tag small-advantage game as comeback/back-and-forth: %+v", res.Tags)
	}
}

func TestRecordTaggedPositionResultTracksTwoBinaryPositionRecords(t *testing.T) {
	var records TaggedRecords
	recordTaggedPositionResult(&records, "win", true, false)
	recordTaggedPositionResult(&records, "loss", false, true)
	recordTaggedPositionResult(&records, "draw", false, false)

	if records.AnalyzedGames != 3 {
		t.Fatalf("expected every analyzed game to be counted, got %d", records.AnalyzedGames)
	}
	if records.HadWinningPosition.Yes != 1 || records.HadWinningPosition.No != 2 {
		t.Fatalf("expected a binary user winning-position split without result buckets: %+v", records)
	}
	if records.OpponentNeverHadWinningPosition.Yes != 2 || records.OpponentNeverHadWinningPosition.No != 1 {
		t.Fatalf("expected a binary opponent-never-had-winning-position split without result buckets: %+v", records)
	}
}

func TestClassifyGameStories(t *testing.T) {
	thr := DefaultGameTagThresholds()
	failed := TagGameFromSeries("black", []float64{3.2, 3.4, 3.5, 3.7, 3.8, 3.9, 0, -4}, nil, thr)
	story := ClassifyGame("loss", "white", "checkmated", nil, failed)
	if story.Category != "failed_conversion" || story.Score != 58 {
		t.Fatalf("expected credit for a failed conversion, got %+v", story)
	}

	timeWin := TagGameFromSeries("white", []float64{-4, -4.2, -4.1, -4.3, -4.4, -4.5}, nil, thr)
	story = ClassifyGame("win", "white", "win (opponent timeout)", nil, timeWin)
	if story.Category != "time_win" {
		t.Fatalf("expected a time swindle, got %+v", story)
	}
}

func TestClassifyEarlyCheckmate(t *testing.T) {
	evals := []MoveAnalysis{{MoveNumber: 12, IsMate: true, MateIn: 2}}
	tagged := TagGameFromEvals("white", evals, DefaultGameTagThresholds())
	story := ClassifyGame("win", "white", "win", evals, tagged)
	if story.Category != "early_checkmate" || story.Score != 98 {
		t.Fatalf("expected early mate to be the highest-value outcome, got %+v", story)
	}
}

func TestModulateGameStoryScoreRewardsAccuracyAndResistance(t *testing.T) {
	base := GameStory{Category: "converted_win", Score: 80}
	moves := make([]MoveAnalysis, 40)
	for i := range moves {
		moves[i] = MoveAnalysis{MoveNumber: i/2 + 1}
	}

	accurate := ModulateGameStoryScore(base, "white", 95, 95, moves)
	poorOpponent := ModulateGameStoryScore(base, "white", 95, 40, moves)
	poorUser := ModulateGameStoryScore(base, "white", 40, 95, moves)
	if accurate.Score <= poorOpponent.Score {
		t.Fatalf("accurate resistance should improve an otherwise similar game: accurate=%d poor opponent=%d", accurate.Score, poorOpponent.Score)
	}
	if poorOpponent.Score <= poorUser.Score {
		t.Fatalf("user accuracy should carry more weight than opponent accuracy: poor opponent=%d poor user=%d", poorOpponent.Score, poorUser.Score)
	}
}

func TestModulateGameStoryScoreRewardsUserBrilliants(t *testing.T) {
	base := GameStory{Category: "tactical_win", Score: 70}
	moves := []MoveAnalysis{
		{MoveNumber: 12, Color: "white", Brilliant: true},
		{MoveNumber: 13, Color: "black", Brilliant: true},
		{MoveNumber: 14, Color: "white", Brilliant: true},
	}

	white := ModulateGameStoryScore(base, "white", -1, -1, moves)
	black := ModulateGameStoryScore(base, "black", -1, -1, moves)
	if white.Score != 86 || black.Score != 78 {
		t.Fatalf("expected only the user's brilliants to count, got white=%d black=%d", white.Score, black.Score)
	}
}

func TestModulateGameStoryScoreUsesLengthWithoutTaxingEarlyMate(t *testing.T) {
	base := GameStory{Category: "converted_win", Score: 80}
	short := []MoveAnalysis{{MoveNumber: 8}}
	long := []MoveAnalysis{{MoveNumber: 45}}
	if got := ModulateGameStoryScore(base, "white", -1, -1, short).Score; got != 77 {
		t.Fatalf("expected short-game adjustment, got %d", got)
	}
	if got := ModulateGameStoryScore(base, "white", -1, -1, long).Score; got != 82 {
		t.Fatalf("expected long-game adjustment, got %d", got)
	}
	earlyMate := GameStory{Category: "early_checkmate", Score: 98}
	if got := ModulateGameStoryScore(earlyMate, "white", -1, -1, short).Score; got != 98 {
		t.Fatalf("early mate should not receive the short-game tax, got %d", got)
	}
}

func TestModulateGameStoryScoreClampsToRange(t *testing.T) {
	story := GameStory{Category: "tactical_win", Score: 95}
	moves := []MoveAnalysis{
		{MoveNumber: 40, Color: "white", Brilliant: true},
		{MoveNumber: 41, Color: "white", Brilliant: true},
		{MoveNumber: 42, Color: "white", Brilliant: true},
		{MoveNumber: 43, Color: "white", Brilliant: true},
	}
	if got := ModulateGameStoryScore(story, "white", 100, 100, moves).Score; got != 100 {
		t.Fatalf("score should be capped at 100, got %d", got)
	}
}
