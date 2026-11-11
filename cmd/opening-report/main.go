// opening-report classifies every stored game with the position-based opening
// book and prints how it compares with chess.com's labels, including games
// whose family changed after the opening was chosen (transpositions).
//
// Usage: go run ./cmd/opening-report [path/to/db.bolt]
// Copy the DB first if the server is running; bolt holds a file lock.
package main

import (
	"chess/backend"
	"chess/cfg"
	"fmt"
	"os"
	"sort"
	"strings"

	"go.hasen.dev/vbolt"
)

type counter map[string]int

func (c counter) top(n int) []string {
	keys := make([]string, 0, len(c))
	for k := range c {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if c[keys[i]] != c[keys[j]] {
			return c[keys[i]] > c[keys[j]]
		}
		return keys[i] < keys[j]
	})
	if n > 0 && len(keys) > n {
		keys = keys[:n]
	}
	return keys
}

func section(title string, c counter, n int) {
	fmt.Printf("\n## %s\n", title)
	for _, k := range c.top(n) {
		fmt.Printf("%5d  %s\n", c[k], k)
	}
}

func main() {
	dbPath := cfg.DBPath
	if len(os.Args) > 1 {
		dbPath = os.Args[1]
	}
	db := vbolt.Open(dbPath)
	vbolt.InitBuckets(db, &cfg.Info)

	var total, unclassified, transposed int
	families := counter{}       // "color  committed family"
	variations := counter{}     // "color  family > variation"
	transpositions := counter{} // "color  committed -> deepest"
	chesscomVsBook := counter{} // "chess.com opening  =>  book family" where they disagree
	examples := map[string]string{}

	vbolt.WithReadTx(db, func(tx *vbolt.Tx) {
		vbolt.IterateAll(tx, backend.GameBkt, func(gameId string, game backend.Game) bool {
			var pgn string
			vbolt.Read(tx, backend.GamePgnBkt, gameId, &pgn)
			if pgn == "" || game.Rules != "chess" {
				return true
			}
			total++
			c := backend.ClassifyOpening(pgn)
			if c.Unclassified {
				unclassified++
				return true
			}
			color := fmt.Sprintf("%-5s", game.UserColor)
			families[color+"  "+c.Committed.Family]++
			if c.Deepest.Family == c.Committed.Family {
				v := c.Deepest.Variation
				if v == "" {
					v = "(main line)"
				}
				variations[color+"  "+c.Deepest.Family+" > "+v]++
			}
			if c.Transposed {
				transposed++
				key := color + "  " + c.Committed.Family + "  ->  " + c.Deepest.Name
				transpositions[key]++
				if _, ok := examples[key]; !ok {
					examples[key] = gameId
				}
			}
			var info backend.OpeningInfo
			vbolt.Read(tx, backend.GameOpeningBkt, gameId, &info)
			if info.Opening != "" && !strings.EqualFold(info.Opening, c.Deepest.Family) {
				chesscomVsBook[info.Opening+"  =>  "+c.Deepest.Family]++
			}
			return true
		})
	})

	fmt.Printf("games: %d  unclassified: %d  transposed after move %d: %d\n",
		total, unclassified, backend.OpeningCommitPly/2, transposed)
	section("Families (by opening chosen by move 3)", families, 0)
	section("Variations (games that stayed in their family)", variations, 60)
	section("Transpositions: chosen family -> where the game ended up", transpositions, 40)
	fmt.Println("\nexample game ids:")
	for _, k := range transpositions.top(15) {
		fmt.Printf("  %s  %s\n", examples[k], k)
	}
	section("chess.com top-level name vs book family (disagreements)", chesscomVsBook, 30)
}
