package backend

import (
	"math"
	"sort"
	"strings"
)

const mateEval = 100.0

type GameTag string

const (
	TagWhiteHadWin GameTag = "WhiteHadWin"
	TagBlackHadWin GameTag = "BlackHadWin"
	TagChaoticGame GameTag = "ChaoticGame"

	TagConvertedWin GameTag = "ConvertedWin"
	TagMissedWin    GameTag = "MissedWin"
	TagSavedGame    GameTag = "SavedGame"
	TagComebackWin  GameTag = "ComebackWin"
	TagThrow        GameTag = "Throw"

	TagStableGame        GameTag = "StableGame"
	TagSingleSwingGame   GameTag = "SingleSwingGame"
	TagMultipleSwingGame GameTag = "MultipleSwingGame"
	TagDecidedBySwing    GameTag = "DecidedBySwing"
	TagGradualOutplay    GameTag = "GradualOutplay"
	TagBackAndForthGame  GameTag = "BackAndForthGame"

	TagWhiteWonOpening GameTag = "WhiteWonOpening"
	TagBlackWonOpening GameTag = "BlackWonOpening"
	TagOpeningNeutral  GameTag = "OpeningNeutral"
	TagEarlySwing      GameTag = "EarlySwing"
	TagLateSwing       GameTag = "LateSwing"
	TagEndgameDecision GameTag = "EndgameDecision"
)

type GameTagThresholds struct {
	PracticalWinningEval  float64
	PracticalWinningPlies int
	ImmediateWinningEval  float64
	OpeningEvalThreshold  float64
	OpeningMoveNumber     int
	MajorSwingThreshold   float64
	StableSwingThreshold  float64
	LateMoveNumber        int
}

func DefaultGameTagThresholds() GameTagThresholds {
	return GameTagThresholds{3, 6, 5, 2, 10, 3, 2, 30}
}

type GameTagMetrics struct {
	MaxWhiteEval         float64
	MaxBlackEval         float64
	LargestSwing         float64
	MajorSwingCount      int
	FirstWhiteWinningPly int
	FirstBlackWinningPly int
	OpeningEval          float64
}

type GameTagResult struct {
	Tags    []string
	Metrics GameTagMetrics
}

// GameStory is a user-relative summary of how the game was decided.  Score is
// deliberately a "how good did this game feel?" score rather than another
// accuracy number: getting a winning position still earns credit after a loss.
type GameStory struct {
	Category    string `json:"category"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Score       int    `json:"score"`
}

func ClassifyGame(result, userColor, endReason string, evals []MoveAnalysis, tagged GameTagResult) GameStory {
	userHadWin := hasGameTag(tagged.Tags, string(TagWhiteHadWin))
	opponentHadWin := hasGameTag(tagged.Tags, string(TagBlackHadWin))
	userWonOpening := hasGameTag(tagged.Tags, string(TagWhiteWonOpening))
	opponentWonOpening := hasGameTag(tagged.Tags, string(TagBlackWonOpening))
	if userColor == "black" {
		userHadWin, opponentHadWin = opponentHadWin, userHadWin
		userWonOpening, opponentWonOpening = opponentWonOpening, userWonOpening
	}
	timedOut := strings.Contains(strings.ToLower(endReason), "timeout") || strings.Contains(strings.ToLower(endReason), "time")
	earlyMate := false
	for _, move := range evals {
		if move.IsMate && move.MoveNumber <= 20 && ((userColor == "white" && move.MateIn > 0) || (userColor == "black" && move.MateIn < 0)) {
			earlyMate = true
			break
		}
	}

	if result == "win" {
		switch {
		case earlyMate:
			return GameStory{"early_checkmate", "Early checkmate", "A decisive attack ended the game before move 20.", 98}
		case timedOut && opponentHadWin:
			return GameStory{"time_win", "Time swindle", "You turned a losing position around on the clock.", 76}
		case hasGameTag(tagged.Tags, string(TagGradualOutplay)):
			return GameStory{"slow_outplay", "Slow outplay", "No single blunder decided it; your advantage grew steadily.", 94}
		case userWonOpening:
			return GameStory{"opening_win", "Opening win", "You earned a decisive advantage in the opening and brought it home.", 90}
		case opponentHadWin:
			return GameStory{"comeback_win", "Comeback win", "Your opponent had a winning position, but you fought back.", 84}
		case hasGameTag(tagged.Tags, string(TagDecidedBySwing)):
			return GameStory{"tactical_win", "Tactical breakthrough", "One major middle-game swing decided the result.", 86}
		default:
			return GameStory{"converted_win", "Clean conversion", "You reached a winning position and converted it.", 88}
		}
	}
	if result == "loss" {
		switch {
		case timedOut && userHadWin:
			return GameStory{"time_loss", "Time loss", "You had a winning position, but the clock changed the result.", 52}
		case userHadWin:
			return GameStory{"failed_conversion", "Failed conversion", "You did the hard part and reached a winning position, but did not convert it.", 58}
		case opponentWonOpening:
			return GameStory{"opening_loss", "Opening loss", "The decisive disadvantage began in the opening.", 18}
		case hasGameTag(tagged.Tags, string(TagDecidedBySwing)):
			return GameStory{"tactical_loss", "Tactical blunder", "One major evaluation swing decided the game.", 24}
		case hasGameTag(tagged.Tags, string(TagGradualOutplay)):
			return GameStory{"slow_outplay", "Slow outplay", "The position slipped away gradually without one decisive blunder.", 20}
		default:
			return GameStory{"loss", "Decisive loss", "Your opponent built and converted the better position.", 28}
		}
	}
	if opponentHadWin {
		return GameStory{"saved_draw", "Saved game", "You held a draw after your opponent reached a winning position.", 62}
	}
	if userHadWin {
		return GameStory{"missed_win", "Missed win", "You reached a winning position before the game ended in a draw.", 55}
	}
	return GameStory{"balanced_draw", "Balanced draw", "Neither player established a sustained winning advantage.", 50}
}

func TagGameFromEvals(result string, evals []MoveAnalysis, thresholds GameTagThresholds) GameTagResult {
	vals := make([]float64, 0, len(evals))
	moves := make([]int, 0, len(evals))
	for _, e := range evals {
		vals = append(vals, normalizeEval(e))
		moves = append(moves, e.MoveNumber)
	}
	return TagGameFromSeries(result, vals, moves, thresholds)
}

func TagGameFromSeries(result string, whiteEvals []float64, moveNumbers []int, t GameTagThresholds) GameTagResult {
	if len(whiteEvals) == 0 {
		return GameTagResult{Tags: []string{string(TagOpeningNeutral)}}
	}
	if len(moveNumbers) != len(whiteEvals) {
		moveNumbers = make([]int, len(whiteEvals))
		for i := range whiteEvals {
			moveNumbers[i] = (i / 2) + 1
		}
	}
	m := GameTagMetrics{MaxBlackEval: math.MaxFloat64 * -1}
	tags := map[GameTag]bool{}
	whiteHadWin := false
	blackHadWin := false
	wRun := 0
	bRun := 0
	crosses := 0
	zone := 0
	largestSwingAfter := 0.0
	largestSwingIdx := -1
	earlyBlunder := false
	lateBlunder := false
	firstSustainMove := 0

	for i, v := range whiteEvals {
		if v > m.MaxWhiteEval {
			m.MaxWhiteEval = v
		}
		if -v > m.MaxBlackEval {
			m.MaxBlackEval = -v
		}
		if v >= t.ImmediateWinningEval {
			whiteHadWin = true
		}
		if v <= -t.ImmediateWinningEval {
			blackHadWin = true
		}
		if v >= t.PracticalWinningEval {
			wRun++
		} else {
			wRun = 0
		}
		if v <= -t.PracticalWinningEval {
			bRun++
		} else {
			bRun = 0
		}
		if !whiteHadWin && wRun >= t.PracticalWinningPlies {
			whiteHadWin = true
			m.FirstWhiteWinningPly = i + 1
			if firstSustainMove == 0 {
				firstSustainMove = moveNumbers[i]
			}
		}
		if !blackHadWin && bRun >= t.PracticalWinningPlies {
			blackHadWin = true
			m.FirstBlackWinningPly = i + 1
			if firstSustainMove == 0 {
				firstSustainMove = moveNumbers[i]
			}
		}

		z := 0
		if v >= t.StableSwingThreshold {
			z = 1
		}
		if v <= -t.StableSwingThreshold {
			z = -1
		}
		if zone != 0 && z != 0 && z != zone {
			crosses++
		}
		if z != 0 {
			zone = z
		}

		if i > 0 {
			sw := math.Abs(v - whiteEvals[i-1])
			if sw >= t.MajorSwingThreshold {
				m.MajorSwingCount++
				if moveNumbers[i] <= t.OpeningMoveNumber {
					earlyBlunder = true
				}
				if moveNumbers[i] >= t.LateMoveNumber {
					lateBlunder = true
				}
				if sw > m.LargestSwing {
					m.LargestSwing = sw
					largestSwingAfter = v
					largestSwingIdx = i
				}
			}
		}
	}

	if whiteHadWin {
		tags[TagWhiteHadWin] = true
	}
	if blackHadWin {
		tags[TagBlackHadWin] = true
	}
	if whiteHadWin && blackHadWin {
		tags[TagChaoticGame] = true
	}

	finalEval := whiteEvals[len(whiteEvals)-1]
	whiteLosingAtSomePoint := blackHadWin
	blackLosingAtSomePoint := whiteHadWin
	switch result {
	case "white":
		if whiteHadWin {
			tags[TagConvertedWin] = true
		}
		if blackHadWin {
			tags[TagMissedWin], tags[TagThrow] = true, true
		}
		if whiteLosingAtSomePoint {
			tags[TagComebackWin] = true
		}
	case "black":
		if blackHadWin {
			tags[TagConvertedWin] = true
		}
		if whiteHadWin {
			tags[TagMissedWin], tags[TagThrow] = true, true
		}
		if blackLosingAtSomePoint {
			tags[TagComebackWin] = true
		}
	case "draw":
		if whiteHadWin || blackHadWin {
			tags[TagSavedGame] = true
		}
		if whiteHadWin {
			tags[TagMissedWin] = true
		}
		if blackHadWin {
			tags[TagMissedWin] = true
		}
	}

	if m.MajorSwingCount == 1 {
		tags[TagSingleSwingGame] = true
	}
	if m.MajorSwingCount >= 2 {
		tags[TagMultipleSwingGame] = true
	}
	if m.MajorSwingCount == 0 && !whiteHadWin && !blackHadWin {
		tags[TagStableGame] = true
	}
	if crosses > 1 {
		tags[TagBackAndForthGame] = true
	}
	if earlyBlunder {
		tags[TagEarlySwing] = true
	}
	if lateBlunder {
		tags[TagLateSwing] = true
	}

	if largestSwingIdx >= 0 {
		if (result == "white" && largestSwingAfter > 0) || (result == "black" && largestSwingAfter < 0) {
			tags[TagDecidedBySwing] = true
		}
	}

	if result == "white" && finalEval > 0 && m.MajorSwingCount == 0 {
		tags[TagGradualOutplay] = true
	}
	if result == "black" && finalEval < 0 && m.MajorSwingCount == 0 {
		tags[TagGradualOutplay] = true
	}

	m.OpeningEval = whiteEvals[len(whiteEvals)-1]
	for i := range whiteEvals {
		if moveNumbers[i] >= t.OpeningMoveNumber {
			m.OpeningEval = whiteEvals[i]
			break
		}
	}
	if m.OpeningEval >= t.OpeningEvalThreshold {
		tags[TagWhiteWonOpening] = true
	} else if m.OpeningEval <= -t.OpeningEvalThreshold {
		tags[TagBlackWonOpening] = true
	} else {
		tags[TagOpeningNeutral] = true
	}

	if (largestSwingIdx >= 0 && moveNumbers[largestSwingIdx] >= t.LateMoveNumber) || (firstSustainMove >= t.LateMoveNumber && firstSustainMove > 0) {
		tags[TagEndgameDecision] = true
	}

	out := make([]string, 0, len(tags))
	for k := range tags {
		out = append(out, string(k))
	}
	sort.Strings(out)
	return GameTagResult{Tags: out, Metrics: m}
}

func normalizeEval(ma MoveAnalysis) float64 {
	if ma.IsMate {
		if ma.MateIn > 0 {
			return mateEval
		}
		if ma.MateIn < 0 {
			return -mateEval
		}
	}
	return float64(ma.Evaluation) / 100.0
}
