package backend

import "math"

const mateEval = 100.0

type GameTag string

const (
	TagWhiteHadSustainedWin GameTag = "WhiteHadSustainedWin"
	TagBlackHadSustainedWin GameTag = "BlackHadSustainedWin"
	TagWhiteHadTacticalWin  GameTag = "WhiteHadTacticalWin"
	TagBlackHadTacticalWin  GameTag = "BlackHadTacticalWin"
	TagWhiteHadWin          GameTag = "WhiteHadWin"
	TagBlackHadWin          GameTag = "BlackHadWin"
	TagChaoticGame          GameTag = "ChaoticGame"

	TagConvertedWin GameTag = "ConvertedWin"
	TagMissedWin    GameTag = "MissedWin"
	TagSavedGame    GameTag = "SavedGame"
	TagComebackWin  GameTag = "ComebackWin"
	TagThrow        GameTag = "Throw"

	TagStableGame          GameTag = "StableGame"
	TagSingleBlunderGame   GameTag = "SingleBlunderGame"
	TagMultipleBlunderGame GameTag = "MultipleBlunderGame"
	TagDecidedByBlunder    GameTag = "DecidedByBlunder"
	TagGradualOutplay      GameTag = "GradualOutplay"
	TagBackAndForthGame    GameTag = "BackAndForthGame"

	TagWhiteWonOpening GameTag = "WhiteWonOpening"
	TagBlackWonOpening GameTag = "BlackWonOpening"
	TagOpeningNeutral  GameTag = "OpeningNeutral"
	TagEarlyBlunder    GameTag = "EarlyBlunder"
	TagLateBlunder     GameTag = "LateBlunder"
	TagEndgameDecision GameTag = "EndgameDecision"
)

type GameTagThresholds struct {
	SustainedWinningEval  float64
	SustainedWinningPlies int
	TacticalWinningEval   float64
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
	whiteTac := false
	blackTac := false
	whiteSustain := false
	blackSustain := false
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
		if v >= t.TacticalWinningEval {
			whiteTac = true
		}
		if v <= -t.TacticalWinningEval {
			blackTac = true
		}
		if v >= t.SustainedWinningEval {
			wRun++
		} else {
			wRun = 0
		}
		if v <= -t.SustainedWinningEval {
			bRun++
		} else {
			bRun = 0
		}
		if !whiteSustain && wRun >= t.SustainedWinningPlies {
			whiteSustain = true
			m.FirstWhiteWinningPly = i + 1
			if firstSustainMove == 0 {
				firstSustainMove = moveNumbers[i]
			}
		}
		if !blackSustain && bRun >= t.SustainedWinningPlies {
			blackSustain = true
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

	whiteHadWin := whiteTac || whiteSustain
	blackHadWin := blackTac || blackSustain
	if whiteSustain {
		tags[TagWhiteHadSustainedWin] = true
	}
	if blackSustain {
		tags[TagBlackHadSustainedWin] = true
	}
	if whiteTac {
		tags[TagWhiteHadTacticalWin] = true
	}
	if blackTac {
		tags[TagBlackHadTacticalWin] = true
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
	whiteLosingAtSomePoint := m.MaxBlackEval >= t.SustainedWinningEval
	blackLosingAtSomePoint := m.MaxWhiteEval >= t.SustainedWinningEval
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
		tags[TagSingleBlunderGame] = true
	}
	if m.MajorSwingCount >= 2 {
		tags[TagMultipleBlunderGame] = true
	}
	if m.MajorSwingCount == 0 && !whiteTac && !blackTac {
		tags[TagStableGame] = true
	}
	if crosses > 1 {
		tags[TagBackAndForthGame] = true
	}
	if earlyBlunder {
		tags[TagEarlyBlunder] = true
	}
	if lateBlunder {
		tags[TagLateBlunder] = true
	}

	if largestSwingIdx >= 0 {
		if (result == "white" && largestSwingAfter > 0) || (result == "black" && largestSwingAfter < 0) {
			tags[TagDecidedByBlunder] = true
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
