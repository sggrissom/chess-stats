package backend

import (
	"bytes"
	"chess/cfg"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/corentings/chess/v2"
	chessimage "github.com/corentings/chess/v2/image"
	"go.hasen.dev/vbolt"
	"go.hasen.dev/vpack"
)

// OpeningClassVersion is bumped whenever the book or classification rules
// change; stored classifications with an older version are recomputed.
const OpeningClassVersion = 1

// OtherLinesLabel names games that reached a family's own position but no
// named variation (or sub-line) within it.
const OtherLinesLabel = "Other lines"

// GameOpeningClass is a game's position-based opening, see ClassifyOpening.
type GameOpeningClass struct {
	Version      int
	ECO          string
	Name         string // full book name of the line the game is grouped under
	Family       string // "" when no book position was reached
	Variation    string
	SubLine      string
	TransposedTo string // full book name of where the game ended up, when it left Family
}

func PackGameOpeningClass(self *GameOpeningClass, buf *vpack.Buffer) {
	vpack.Version(1, buf)
	vpack.Int(&self.Version, buf)
	vpack.String(&self.ECO, buf)
	vpack.String(&self.Name, buf)
	vpack.String(&self.Family, buf)
	vpack.String(&self.Variation, buf)
	vpack.String(&self.SubLine, buf)
	vpack.String(&self.TransposedTo, buf)
}

// gameId => GameOpeningClass
var GameOpeningClassBkt = vbolt.Bucket(&cfg.Info, "chess_game_opening_class", vpack.StringZ, PackGameOpeningClass)

func classifyGameOpening(pgn string) GameOpeningClass {
	cls := GameOpeningClass{Version: OpeningClassVersion}
	c := ClassifyOpening(pgn)
	if c.Unclassified {
		return cls
	}
	cls.ECO = c.Line.ECO
	cls.Name = c.Line.Name
	cls.Family = c.Line.Family
	cls.Variation = c.Line.Variation
	cls.SubLine = c.Line.SubLine
	if c.Transposed {
		cls.TransposedTo = c.Deepest.Name
	}
	return cls
}

// readGameOpeningClass returns the stored classification, computing it on the
// fly when the backfill hasn't reached this game yet.
func readGameOpeningClass(tx *vbolt.Tx, gameId string) GameOpeningClass {
	var cls GameOpeningClass
	vbolt.Read(tx, GameOpeningClassBkt, gameId, &cls)
	if cls.Version == OpeningClassVersion {
		return cls
	}
	var pgn string
	vbolt.Read(tx, GamePgnBkt, gameId, &pgn)
	return classifyGameOpening(pgn)
}

// readGameOpening returns the chess.com opening headers with the display name
// replaced by the book name, so every view names openings the same way.
func readGameOpening(tx *vbolt.Tx, gameId string) OpeningInfo {
	var info OpeningInfo
	vbolt.Read(tx, GameOpeningBkt, gameId, &info)
	if cls := readGameOpeningClass(tx, gameId); cls.Family != "" {
		info.ECO = cls.ECO
		info.Opening = cls.Name
		info.Variation = cls.Variation
		info.TransposedTo = cls.TransposedTo
	}
	return info
}

// variationLabel and subLineLabel are the keys games are grouped under.
func variationLabel(cls GameOpeningClass) string {
	if cls.Variation == "" {
		return OtherLinesLabel
	}
	return cls.Variation
}

func subLineLabel(cls GameOpeningClass) string {
	if cls.SubLine == "" {
		return OtherLinesLabel
	}
	return cls.SubLine
}

// BackfillOpeningClasses classifies stored games that have no classification
// or an outdated one. Runs in the background at startup.
func BackfillOpeningClasses(db *vbolt.DB) {
	go func() {
		start := time.Now()
		openingBookOnce.Do(loadOpeningBook)

		var stale []string
		vbolt.WithReadTx(db, func(tx *vbolt.Tx) {
			vbolt.IterateAll(tx, GamePgnBkt, func(gameId string, _ string) bool {
				var cls GameOpeningClass
				vbolt.Read(tx, GameOpeningClassBkt, gameId, &cls)
				if cls.Version != OpeningClassVersion {
					stale = append(stale, gameId)
				}
				return true
			})
		})
		if len(stale) == 0 {
			return
		}

		const batchSize = 200
		for i := 0; i < len(stale); i += batchSize {
			batch := stale[i:min(i+batchSize, len(stale))]
			classes := make([]GameOpeningClass, len(batch))
			vbolt.WithReadTx(db, func(tx *vbolt.Tx) {
				for j, gameId := range batch {
					var pgn string
					vbolt.Read(tx, GamePgnBkt, gameId, &pgn)
					classes[j] = classifyGameOpening(pgn)
				}
			})
			vbolt.WithWriteTx(db, func(tx *vbolt.Tx) {
				for j, gameId := range batch {
					vbolt.Write(tx, GameOpeningClassBkt, gameId, &classes[j])
				}
				vbolt.TxCommit(tx)
			})
		}
		log.Printf("[OPENINGS] Classified %d games in %s", len(stale), time.Since(start).Round(time.Millisecond))
	}()
}

var openingBoardSvgCache sync.Map // "family\x00variation\x00perspective" => svg

// openingBoardHandler serves the book position that names an opening family or
// variation as an SVG.
// URL: /opening-board.svg?family=...&variation=...&perspective=white|black
// No authentication required — book positions aren't user data.
func openingBoardHandler(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	family, variation := q.Get("family"), q.Get("variation")
	if variation == OtherLinesLabel {
		variation = ""
	}
	perspective := chess.White
	if q.Get("perspective") == "black" {
		perspective = chess.Black
	}
	cacheKey := bookBoardKey(family, variation) + "\x00" + perspective.String()
	svg, ok := openingBoardSvgCache.Load(cacheKey)
	if !ok {
		pos, found := OpeningBookBoard(family, variation)
		if !found {
			http.Error(w, "opening not found", http.StatusNotFound)
			return
		}
		var buf bytes.Buffer
		if err := chessimage.SVG(&buf, pos.Board(), chessimage.Perspective(perspective)); err != nil {
			http.Error(w, "failed to render board", http.StatusInternalServerError)
			return
		}
		// The library emits width/height but no viewBox; without viewBox, CSS
		// scaling clips rather than scales.
		svg = strings.Replace(buf.String(),
			`width="360" height="360"`,
			`width="360" height="360" viewBox="0 0 360 360"`, 1)
		openingBoardSvgCache.Store(cacheKey, svg)
	}
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Write([]byte(svg.(string)))
}
