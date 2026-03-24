package backend

import (
	"bufio"
	"fmt"
	"io"
	"math"
	"os/exec"
	"strconv"
	"strings"

	"github.com/corentings/chess/v2"
)

// StockfishEngine manages a Stockfish subprocess via the UCI protocol.
type StockfishEngine struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	reader *bufio.Reader
}

// NewStockfishEngine starts a Stockfish subprocess and performs the UCI handshake.
func NewStockfishEngine(path string) (*StockfishEngine, error) {
	cmd := exec.Command(path)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stockfish stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stockfish stdout pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("stockfish start: %w", err)
	}

	e := &StockfishEngine{
		cmd:    cmd,
		stdin:  stdin,
		reader: bufio.NewReader(stdout),
	}

	// UCI handshake
	if err := e.send("uci"); err != nil {
		cmd.Process.Kill()
		return nil, err
	}
	if err := e.waitFor("uciok"); err != nil {
		cmd.Process.Kill()
		return nil, fmt.Errorf("waiting for uciok: %w", err)
	}

	// Set options for background analysis (single thread, modest hash)
	e.send("setoption name Hash value 64")
	e.send("setoption name Threads value 1")

	// Confirm ready
	if err := e.send("isready"); err != nil {
		cmd.Process.Kill()
		return nil, err
	}
	if err := e.waitFor("readyok"); err != nil {
		cmd.Process.Kill()
		return nil, fmt.Errorf("waiting for readyok: %w", err)
	}

	return e, nil
}

// Close sends quit to Stockfish and waits for the process to exit.
func (e *StockfishEngine) Close() {
	e.send("quit")
	e.cmd.Wait()
}

func (e *StockfishEngine) send(cmd string) error {
	_, err := fmt.Fprintln(e.stdin, cmd)
	return err
}

// waitFor reads lines until one starts with the target token.
func (e *StockfishEngine) waitFor(token string) error {
	for {
		line, err := e.reader.ReadString('\n')
		if err != nil {
			return err
		}
		if strings.HasPrefix(strings.TrimSpace(line), token) {
			return nil
		}
	}
}

// AnalyzeGame runs Stockfish on each ply of the game described by pgn.
// Returns one MoveAnalysis per ply. Evaluations are from white's absolute perspective.
func (e *StockfishEngine) AnalyzeGame(pgn string, depth int) ([]MoveAnalysis, error) {
	// Parse PGN using notnil/chess
	reader := strings.NewReader(pgn)
	pgnReader, err := chess.PGN(reader)
	if err != nil {
		return nil, fmt.Errorf("parse pgn: %w", err)
	}
	game := chess.NewGame(pgnReader)

	moves := game.Moves()
	if len(moves) == 0 {
		return nil, nil
	}

	results := make([]MoveAnalysis, 0, len(moves))

	// We replay the game move by move, analyzing the position before each move.

	for i, move := range moves {
		moveNumber := i/2 + 1
		color := "white"
		if i%2 == 1 {
			color = "black"
		}

		// Build the UCI move list for moves played so far
		playedMoves := make([]string, i)
		for j, m := range moves[:i] {
			_ = j
			playedMoves[j] = m.String()
		}

		// Send position before this move
		posCmd := "position startpos"
		if len(playedMoves) > 0 {
			posCmd += " moves " + strings.Join(playedMoves, " ")
		}
		if err := e.send(posCmd); err != nil {
			return nil, err
		}

		// Start analysis
		if err := e.send(fmt.Sprintf("go depth %d", depth)); err != nil {
			return nil, err
		}

		// Collect analysis output
		eval, isMate, mateIn, bestMove, err := e.collectAnalysis(depth)
		if err != nil {
			return nil, err
		}

		// Stockfish reports score from side-to-move's perspective.
		// Negate on black's turn to get white's absolute perspective.
		if color == "black" {
			eval = -eval
			mateIn = -mateIn
		}

		// Get the actual move in UCI notation
		movePlayed := move.String()

		results = append(results, MoveAnalysis{
			MoveNumber: moveNumber,
			Color:      color,
			MovePlayed: movePlayed,
			BestMove:   bestMove,
			Evaluation: eval,
			IsMate:     isMate,
			MateIn:     mateIn,
		})

	}

	return results, nil
}

// collectAnalysis reads Stockfish output until bestmove, returning the evaluation
// from the deepest info line seen.
func (e *StockfishEngine) collectAnalysis(targetDepth int) (eval int, isMate bool, mateIn int, bestMove string, err error) {
	for {
		var line string
		line, err = e.reader.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimSpace(line)

		if strings.HasPrefix(line, "bestmove") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				bestMove = parts[1]
			}
			return
		}

		if strings.HasPrefix(line, "info") && strings.Contains(line, "score") {
			// Only use lines with a depth token at or near target depth
			depth := parseInfoField(line, "depth")
			if depth < targetDepth {
				continue
			}
			// Parse score
			if idx := strings.Index(line, "score cp"); idx >= 0 {
				cpStr := strings.Fields(line[idx+len("score cp"):])[0]
				if v, e2 := strconv.Atoi(cpStr); e2 == nil {
					eval = v
					isMate = false
					mateIn = 0
				}
			} else if idx := strings.Index(line, "score mate"); idx >= 0 {
				mateStr := strings.Fields(line[idx+len("score mate"):])[0]
				if v, e2 := strconv.Atoi(mateStr); e2 == nil {
					isMate = true
					mateIn = v
					// Use large sentinel for accuracy calculations
					if v > 0 {
						eval = 10000
					} else {
						eval = -10000
					}
				}
			}
		}
	}
}

// parseInfoField extracts an integer value following a named token in a Stockfish info line.
func parseInfoField(line, field string) int {
	idx := strings.Index(line, field)
	if idx < 0 {
		return 0
	}
	parts := strings.Fields(line[idx+len(field):])
	if len(parts) == 0 {
		return 0
	}
	v, _ := strconv.Atoi(parts[0])
	return v
}

// ComputeAccuracy computes per-color accuracy percentages from a list of move evaluations.
// Uses the chess.com accuracy formula based on win probability changes.
func ComputeAccuracy(moves []MoveAnalysis) (whiteAccuracy, blackAccuracy float64) {
	var whiteSum, blackSum float64
	var whiteCount, blackCount int

	for i, move := range moves {
		if i == 0 {
			continue // Need the previous position's eval to compute accuracy
		}
		prevEval := moves[i-1].Evaluation
		if moves[i-1].IsMate {
			if moves[i-1].MateIn > 0 {
				prevEval = 10000
			} else {
				prevEval = -10000
			}
		}
		currEval := move.Evaluation
		if move.IsMate {
			if move.MateIn > 0 {
				currEval = 10000
			} else {
				currEval = -10000
			}
		}

		// WP from white's absolute perspective
		wpBefore := winProbability(prevEval)
		wpAfter := winProbability(currEval)

		// The accuracy of a move depends on how much WP the mover lost.
		// For white, a decrease in wpAfter is bad. For black, an increase is bad.
		var wpLoss float64
		if move.Color == "white" {
			wpLoss = wpBefore - wpAfter
		} else {
			wpLoss = wpAfter - wpBefore
		}

		acc := moveAccuracy(wpLoss)
		if move.Color == "white" {
			whiteSum += acc
			whiteCount++
		} else {
			blackSum += acc
			blackCount++
		}
	}

	if whiteCount > 0 {
		whiteAccuracy = whiteSum / float64(whiteCount)
	}
	if blackCount > 0 {
		blackAccuracy = blackSum / float64(blackCount)
	}
	return
}

// winProbability converts a centipawn evaluation (white's perspective) to a
// win probability in [0, 100].
func winProbability(cp int) float64 {
	return 50 + 50*(2/(1+math.Exp(-0.00368208*float64(cp)))-1)
}

// moveAccuracy converts a win-probability loss into a move accuracy in [0, 100].
func moveAccuracy(wpLoss float64) float64 {
	if wpLoss < 0 {
		wpLoss = 0 // Move improved the position; treat as perfect
	}
	acc := 103.1668*math.Exp(-0.04354*wpLoss) - 3.1669
	if acc > 100 {
		return 100
	}
	if acc < 0 {
		return 0
	}
	return acc
}
