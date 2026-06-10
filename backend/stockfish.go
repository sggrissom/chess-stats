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

		// moves[i-1] is the move that was played; the delta prevEval→currEval is its effect.
		// For white, a drop in wpAfter is bad. For black, a rise in wpAfter is bad.
		prevColor := moves[i-1].Color
		var wpLoss float64
		if prevColor == "white" {
			wpLoss = wpBefore - wpAfter
		} else {
			wpLoss = wpAfter - wpBefore
		}

		acc := moveAccuracy(wpLoss)
		if prevColor == "white" {
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

// TagBrilliantMoves marks engine-best tactical sacrifices that preserve the
// mover's winning chances. Material is checked after the opponent's reply so
// accepted sacrifices (the common case) are visible to the heuristic.
func TagBrilliantMoves(pgn string, moves []MoveAnalysis) []MoveAnalysis {
	if len(moves) < 2 {
		return moves
	}

	reader := strings.NewReader(pgn)
	pgnReader, err := chess.PGN(reader)
	if err != nil {
		return moves
	}
	game := chess.NewGame(pgnReader)
	positions := game.Positions()
	if len(positions) < 2 {
		return moves
	}

	for i := 0; i < len(moves)-1 && i+1 < len(positions); i++ {
		m := &moves[i]
		if m.MovePlayed != m.BestMove {
			continue
		}

		wpBefore := winProbability(normalizeEvalCp(moves[i]))
		wpAfter := winProbability(normalizeEvalCp(moves[i+1]))
		var wpLoss float64
		if m.Color == "white" {
			wpLoss = wpBefore - wpAfter
		} else {
			wpLoss = wpAfter - wpBefore
		}
		// A brilliant sacrifice should be sound, not merely a flashy blunder.
		if wpLoss > 2.0 {
			continue
		}

		beforeMaterial := materialBalanceForColor(positions[i].Board(), m.Color)
		afterIndex := i + 1
		if i+2 < len(positions) {
			afterIndex = i + 2
		}
		afterMaterial := materialBalanceForColor(positions[afterIndex].Board(), m.Color)
		if afterMaterial-beforeMaterial > -2 {
			continue
		}

		m.Brilliant = true
		m.BrilliantReason = "sound_material_sacrifice"
	}

	return moves
}

func normalizeEvalCp(ma MoveAnalysis) int {
	if !ma.IsMate {
		return ma.Evaluation
	}
	if ma.MateIn > 0 {
		return 10000
	}
	return -10000
}

func materialBalanceForColor(board *chess.Board, color string) int {
	white, black := materialBySide(board)
	if color == "white" {
		return white - black
	}
	return black - white
}

func materialBySide(board *chess.Board) (white int, black int) {
	for sq := chess.Square(0); sq <= chess.H8; sq++ {
		piece := board.Piece(sq)
		if piece == chess.NoPiece {
			continue
		}
		value := pieceValue(piece.Type())
		if piece.Color() == chess.White {
			white += value
		} else {
			black += value
		}
	}
	return
}

func pieceValue(pieceType chess.PieceType) int {
	switch pieceType {
	case chess.Pawn:
		return 1
	case chess.Knight, chess.Bishop:
		return 3
	case chess.Rook:
		return 5
	case chess.Queen:
		return 9
	default:
		return 0
	}
}
