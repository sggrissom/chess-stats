package backend

import (
	"embed"
	"io/fs"
	"strings"
	"sync"

	"github.com/corentings/chess/v2"
)

// Opening book from https://github.com/lichess-org/chess-openings (CC0).
// Each TSV row is "eco<TAB>name<TAB>pgn"; names look like
// "Caro-Kann Defense: Advance Variation, Short Variation".
//
//go:embed openingbook/*.tsv
var openingBookFS embed.FS

// OpeningClassifyMaxPly bounds how deep into a game we look for book positions.
const OpeningClassifyMaxPly = 40

// OpeningCommitPly is the ply by which a game is considered to have chosen its
// opening family (end of move 3). Later family changes count as transpositions.
const OpeningCommitPly = 6

type BookOpening struct {
	ECO       string
	Name      string // full lichess name
	Family    string // e.g. "Caro-Kann Defense", "Danish Gambit"
	Variation string // e.g. "Advance Variation", "Accepted"
	SubLine   string // remainder after the variation, may be empty
}

type OpeningClassification struct {
	Deepest      BookOpening // deepest book position reached
	DeepestPly   int
	Committed    BookOpening // last non-generic book position reached by OpeningCommitPly
	Line         BookOpening // deepest book position within Committed.Family; what stats group by
	Families     []string    // distinct non-generic families in the order they were reached
	Transposed   bool        // Committed.Family != Deepest.Family
	Unclassified bool
}

// genericFamilies are names that describe early moves rather than an opening
// choice, so they never count as the family a game "committed" to.
var genericFamilies = map[string]bool{
	"King's Pawn Game":      true,
	"King's Pawn Opening":   true,
	"King's Knight Opening": true,
	"Queen's Pawn Game":     true,
	"Queen's Pawn Opening":  true,
}

// bookFamilyAliases folds top-level book names into a parent family + variation.
var bookFamilyAliases = map[string][2]string{
	"Vienna Gambit": {"Vienna Game", "Vienna Gambit"},
	"Queen's Pawn":  {"Queen's Pawn Game", ""},
}

var (
	openingBookOnce sync.Once
	openingBook     map[string]BookOpening // position key => opening
	// "family\x00variation" => position of the shortest book line with that
	// name; variation "" is the family's first position.
	openingBookBoards map[string]*chess.Position
)

func bookBoardKey(family, variation string) string {
	return family + "\x00" + variation
}

// positionKey identifies a position independent of move order: board, side to
// move, castling rights and a capturable en passant square (no move counters).
func positionKey(pos *chess.Position) string {
	fields := strings.Fields(pos.XFENString())
	if len(fields) < 4 {
		return pos.XFENString()
	}
	return strings.Join(fields[:4], " ")
}

func splitBookName(eco, name string) BookOpening {
	op := BookOpening{ECO: eco, Name: name}
	family, rest, _ := strings.Cut(name, ":")
	var parts []string
	// A few top-level names carry a qualifier, e.g. "London System, with Bd3".
	family, qualifier, _ := strings.Cut(family, ",")
	family = strings.TrimSpace(family)
	for _, p := range strings.Split(qualifier+","+rest, ",") {
		if p = strings.TrimSpace(p); p != "" {
			parts = append(parts, p)
		}
	}
	// "Danish Gambit Accepted: Chigorin Defense" => family "Danish Gambit",
	// variation "Accepted", sub-line "Chigorin Defense". Queen's Gambit
	// Accepted/Declined are distinct enough to stay their own families.
	if family != "Queen's Gambit Accepted" && family != "Queen's Gambit Declined" {
		for _, suffix := range []string{"Accepted", "Declined", "Refused"} {
			if base, ok := strings.CutSuffix(family, " "+suffix); ok {
				family = base
				parts = append([]string{suffix}, parts...)
				break
			}
		}
	}
	if alias, ok := bookFamilyAliases[family]; ok {
		family = alias[0]
		if alias[1] != "" {
			parts = append([]string{alias[1]}, parts...)
		}
	}
	op.Family = family
	if len(parts) > 0 {
		op.Variation = parts[0]
	}
	if len(parts) > 1 {
		op.SubLine = strings.Join(parts[1:], ", ")
	}
	return op
}

func loadOpeningBook() {
	openingBook = make(map[string]BookOpening)
	openingBookBoards = make(map[string]*chess.Position)
	boardPly := make(map[string]int)
	setBoard := func(key string, pos *chess.Position, ply int) {
		if cur, ok := boardPly[key]; !ok || ply < cur {
			openingBookBoards[key], boardPly[key] = pos, ply
		}
	}
	files, _ := fs.Glob(openingBookFS, "openingbook/*.tsv")
	for _, f := range files {
		data, err := openingBookFS.ReadFile(f)
		if err != nil {
			continue
		}
		for i, line := range strings.Split(string(data), "\n") {
			cols := strings.Split(line, "\t")
			if i == 0 || len(cols) != 3 {
				continue
			}
			pgnFn, err := chess.PGN(strings.NewReader(cols[2]))
			if err != nil {
				continue
			}
			positions := chess.NewGame(pgnFn).Positions()
			if len(positions) < 2 {
				continue
			}
			final := positions[len(positions)-1]
			key := positionKey(final)
			// Several lines can share a final position; keep the first (files are
			// sorted by ECO, so the canonical name usually comes first).
			if _, exists := openingBook[key]; !exists {
				openingBook[key] = splitBookName(cols[0], cols[1])
			}
			op := splitBookName(cols[0], cols[1])
			setBoard(bookBoardKey(op.Family, ""), final, len(positions))
			if op.Variation != "" {
				setBoard(bookBoardKey(op.Family, op.Variation), final, len(positions))
			}
		}
	}
	// The book sometimes shortens a name ("Advance, Short Variation" next to
	// "Advance Variation"); fold the short form into the full one.
	for key, op := range openingBook {
		full := op.Variation + " Variation"
		if op.Variation == "" || strings.HasSuffix(op.Variation, "Variation") {
			continue
		}
		if _, ok := openingBookBoards[bookBoardKey(op.Family, full)]; ok {
			op.Variation = full
			openingBook[key] = op
		}
	}
}

func classifyPositions(positions []*chess.Position) (c OpeningClassification) {
	openingBookOnce.Do(loadOpeningBook)
	limit := min(len(positions)-1, OpeningClassifyMaxPly)
	var matches []BookOpening
	for ply := 1; ply <= limit; ply++ {
		op, ok := openingBook[positionKey(positions[ply])]
		if !ok {
			continue
		}
		matches = append(matches, op)
		c.Deepest, c.DeepestPly = op, ply
		if genericFamilies[op.Family] {
			continue
		}
		if ply <= OpeningCommitPly || c.Committed.Family == "" {
			c.Committed = op
		}
		if n := len(c.Families); n == 0 || c.Families[n-1] != op.Family {
			c.Families = append(c.Families, op.Family)
		}
	}
	if c.DeepestPly == 0 {
		c.Unclassified = true
		return
	}
	if c.Committed.Family == "" {
		c.Committed = c.Deepest
	}
	for _, op := range matches {
		if op.Family == c.Committed.Family {
			c.Line = op
		}
	}
	c.Transposed = c.Committed.Family != c.Deepest.Family
	return
}

// OpeningBookBoard returns the book position that names a family (variation
// "") or one of its variations.
func OpeningBookBoard(family, variation string) (*chess.Position, bool) {
	openingBookOnce.Do(loadOpeningBook)
	pos, ok := openingBookBoards[bookBoardKey(family, variation)]
	return pos, ok
}

// ClassifyOpening replays a PGN and names its opening by the positions reached.
func ClassifyOpening(pgn string) OpeningClassification {
	pgnFn, err := chess.PGN(strings.NewReader(pgn))
	if err != nil {
		return OpeningClassification{Unclassified: true}
	}
	return classifyPositions(chess.NewGame(pgnFn).Positions())
}
