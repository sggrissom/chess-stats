package backend

import (
	"chess/cfg"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/corentings/chess/v2"
	"go.hasen.dev/vbeam"
	"go.hasen.dev/vbolt"
	"go.hasen.dev/vpack"
)

func RegisterChessMethods(app *vbeam.Application) {
	vbeam.RegisterProc(app, SetChessUsername)
	vbeam.RegisterProc(app, GetChessProfile)
	vbeam.RegisterProc(app, SyncGames)
	vbeam.RegisterProc(app, GetGameStats)
	vbeam.RegisterProc(app, GetOpeningStats)
	vbeam.RegisterProc(app, GetRecentGames)
	vbeam.RegisterProc(app, GetGameDetail)
	vbeam.RegisterProc(app, RequestGameAnalysis)
	vbeam.RegisterProc(app, RequestAllGameAnalysis)
	vbeam.RegisterProc(app, GetRatingHistory)
}

// Request/Response types

type SetChessUsernameRequest struct {
	ChesscomUsername string `json:"chesscomUsername"`
}

type SetChessUsernameResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type GetChessProfileResponse struct {
	ChesscomUsername string `json:"chesscomUsername"`
	GameCount        int    `json:"gameCount"`
}

type TimeClassRecord struct {
	Wins   int `json:"wins"`
	Losses int `json:"losses"`
	Draws  int `json:"draws"`
}

type GetGameStatsResponse struct {
	Overall TimeClassRecord            `json:"overall"`
	ByClass map[string]TimeClassRecord `json:"byClass"`
}

type GameFilter struct {
	TimeClass         string `json:"timeClass,omitempty"`
	MinOpponentRating int    `json:"minOpponentRating,omitempty"`
	MaxOpponentRating int    `json:"maxOpponentRating,omitempty"`
	Since             int64  `json:"since,omitempty"` // unix timestamp; 0 = no filter
}

func gameMatchesFilter(game *Game, f GameFilter) bool {
	if f.TimeClass != "" && game.TimeClass != f.TimeClass {
		return false
	}
	if f.Since != 0 && game.StartTime < f.Since {
		return false
	}
	opponentRating := game.BlackRating
	if game.UserColor == "black" {
		opponentRating = game.WhiteRating
	}
	if f.MinOpponentRating != 0 && opponentRating < f.MinOpponentRating {
		return false
	}
	if f.MaxOpponentRating != 0 && opponentRating > f.MaxOpponentRating {
		return false
	}
	return true
}

type ColorRecord struct {
	Wins           int `json:"wins"`
	Losses         int `json:"losses"`
	Draws          int `json:"draws"`
	OpeningEvalSum int `json:"openingEvalSum"` // centipawns, user perspective, summed across analyzed games
	OpeningEvalN   int `json:"openingEvalN"`   // count of games with opening analysis
}

type VariationRecord struct {
	AsWhite ColorRecord `json:"asWhite"`
	AsBlack ColorRecord `json:"asBlack"`
}

type OpeningRecord struct {
	ECO        string                     `json:"eco"`
	AsWhite    ColorRecord                `json:"asWhite"`
	AsBlack    ColorRecord                `json:"asBlack"`
	Variations map[string]VariationRecord `json:"variations"`
}

type GetOpeningStatsResponse struct {
	ByOpening map[string]OpeningRecord `json:"byOpening"`
}

type SyncGamesResponse struct {
	Success       bool   `json:"success"`
	Error         string `json:"error,omitempty"`
	NewGamesAdded int    `json:"newGamesAdded"`
	TotalGames    int    `json:"totalGames"`
}

type RecentGameItem struct {
	Id             string `json:"id"`
	WhiteUsername  string `json:"whiteUsername"`
	WhiteRating    int    `json:"whiteRating"`
	BlackUsername  string `json:"blackUsername"`
	BlackRating    int    `json:"blackRating"`
	TimeClass      string `json:"timeClass"`
	TimeControl    string `json:"timeControl"`
	Result         string `json:"result"`
	UserColor      string `json:"userColor"`
	StartTime      int64  `json:"startTime"`
	Opening        string `json:"opening"`
	OpeningECO     string `json:"openingEco"`
	AnalysisStatus int    `json:"analysisStatus"` // -1=none, 0=pending, 1=analyzing, 2=done, 3=failed
}

type GetRecentGamesRequest struct {
	Filter GameFilter `json:"filter"`
	Limit  int        `json:"limit"`  // 0 = default 50
	Offset int        `json:"offset"` // for pagination
}

type GetRecentGamesResponse struct {
	Games []RecentGameItem `json:"games"`
	Total int              `json:"total"`
}

type GetGameDetailRequest struct {
	GameId string `json:"gameId"`
}

type MoveAnalysisItem struct {
	MoveNumber  int     `json:"moveNumber"`
	Color       string  `json:"color"`
	MovePlayed  string  `json:"movePlayed"`  // SAN when convertible, UCI fallback
	BestMove    string  `json:"bestMove"`    // SAN when convertible, UCI fallback
	Evaluation  int     `json:"evaluation"`  // centipawns, white-positive
	IsMate      bool    `json:"isMate"`
	MateIn      int     `json:"mateIn"`
	Accuracy    float64 `json:"accuracy"`    // per-move accuracy 0–100; -1 for first move (no prior position)
	MoveQuality string  `json:"moveQuality"` // "best"|"excellent"|"good"|"inaccuracy"|"mistake"|"blunder"|""
}

type GetGameDetailResponse struct {
	Game           RecentGameItem     `json:"game"`
	Pgn            string             `json:"pgn"`
	AnalysisStatus int                `json:"analysisStatus"`
	AnalysisDepth  int                `json:"analysisDepth"`
	WhiteAccuracy  float64            `json:"whiteAccuracy"`
	BlackAccuracy  float64            `json:"blackAccuracy"`
	Moves          []MoveAnalysisItem `json:"moves"`
	ErrorMessage   string             `json:"errorMessage,omitempty"`
	AnalyzedAt     int64              `json:"analyzedAt"`
}

type RequestGameAnalysisRequest struct {
	GameId string `json:"gameId"`
}

type RequestGameAnalysisResponse struct {
	Queued bool   `json:"queued"`
	Status int    `json:"status"`
	Error  string `json:"error,omitempty"`
}

type RequestAllGameAnalysisRequest struct{}

type RequestAllGameAnalysisResponse struct {
	Queued int    `json:"queued"`
	Error  string `json:"error,omitempty"`
}

type RatingPoint struct {
	StartTime int64  `json:"startTime"`
	Rating    int    `json:"rating"`
	Result    string `json:"result"`
	TimeClass string `json:"timeClass"`
}

type GetRatingHistoryResponse struct {
	Points []RatingPoint `json:"points"`
}

// Database types

type ChessProfile struct {
	UserId           int
	ChesscomUsername string
}

func PackChessProfile(self *ChessProfile, buf *vpack.Buffer) {
	vpack.Version(1, buf)
	vpack.Int(&self.UserId, buf)
	vpack.String(&self.ChesscomUsername, buf)
}

type Game struct {
	Id            string
	UserId        int
	WhiteUsername string
	WhiteRating   int
	BlackUsername string
	BlackRating   int
	TimeClass     string // bullet/blitz/rapid/daily
	TimeControl   string // e.g. "600+5"
	Result        string // "win", "loss", or "draw" from user's perspective
	UserColor     string // "white" or "black"
	StartTime     int64  // unix timestamp
	Rules         string // "chess" or variant name
}

func PackGame(self *Game, buf *vpack.Buffer) {
	vpack.Version(1, buf)
	vpack.String(&self.Id, buf)
	vpack.Int(&self.UserId, buf)
	vpack.String(&self.WhiteUsername, buf)
	vpack.Int(&self.WhiteRating, buf)
	vpack.String(&self.BlackUsername, buf)
	vpack.Int(&self.BlackRating, buf)
	vpack.String(&self.TimeClass, buf)
	vpack.String(&self.TimeControl, buf)
	vpack.String(&self.Result, buf)
	vpack.String(&self.UserColor, buf)
	vpack.VInt64(&self.StartTime, buf)
	vpack.String(&self.Rules, buf)
}

// Database types for openings

type OpeningInfo struct {
	ECO       string
	Opening   string
	Variation string
}

func PackOpeningInfo(self *OpeningInfo, buf *vpack.Buffer) {
	vpack.Version(1, buf)
	vpack.String(&self.ECO, buf)
	vpack.String(&self.Opening, buf)
	vpack.String(&self.Variation, buf)
}

// Buckets

// userId => ChessProfile
var ChessProfileBkt = vbolt.Bucket(&cfg.Info, "chess_profile", vpack.FInt, PackChessProfile)

// gameId (chess.com game URL ID) => Game
var GameBkt = vbolt.Bucket(&cfg.Info, "chess_games", vpack.StringZ, PackGame)

// gameId => PGN string (stored separately to keep GameBkt lean)
var GamePgnBkt = vbolt.Bucket(&cfg.Info, "chess_game_pgn", vpack.StringZ, vpack.String)

// gameId => OpeningInfo (derived from PGN headers)
var GameOpeningBkt = vbolt.Bucket(&cfg.Info, "chess_game_opening", vpack.StringZ, PackOpeningInfo)

// Index: term=userId(int), target=gameId(string)
// Enables listing and counting all game IDs for a given user.
var GamesByUserIdx = vbolt.Index[string, int](&cfg.Info, "games_by_user", vpack.FInt, vpack.StringZ)

// Synced-month sentinel: key="userId/YYYY/MM", value=true means month has been fully fetched.
// Current month is never marked synced so new games are always picked up.
var SyncedMonthsBkt = vbolt.Bucket(&cfg.Info, "synced_months", vpack.StringZ, vpack.Bool)

// Procedures

func SetChessUsername(ctx *vbeam.Context, req SetChessUsernameRequest) (resp SetChessUsernameResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		resp.Error = "Authentication required"
		return
	}

	username := strings.TrimSpace(req.ChesscomUsername)
	if username == "" {
		resp.Error = "Username is required"
		return
	}

	// Verify the username exists on chess.com before saving
	_, fetchErr := fetchArchiveList(username)
	if fetchErr != nil {
		resp.Error = "Could not verify chess.com username: " + fetchErr.Error()
		return
	}

	profile := ChessProfile{
		UserId:           user.Id,
		ChesscomUsername: username,
	}
	vbeam.UseWriteTx(ctx)
	vbolt.Write(ctx.Tx, ChessProfileBkt, user.Id, &profile)
	vbolt.TxCommit(ctx.Tx)

	resp.Success = true
	return
}

func GetChessProfile(ctx *vbeam.Context, req Empty) (resp GetChessProfileResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		return
	}

	var profile ChessProfile
	vbolt.Read(ctx.Tx, ChessProfileBkt, user.Id, &profile)
	resp.ChesscomUsername = profile.ChesscomUsername
	vbolt.ReadTermCount(ctx.Tx, GamesByUserIdx, &user.Id, &resp.GameCount)
	return
}

func SyncGames(ctx *vbeam.Context, req Empty) (resp SyncGamesResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		resp.Error = "Authentication required"
		return
	}

	// Read profile from existing read tx
	var profile ChessProfile
	vbolt.Read(ctx.Tx, ChessProfileBkt, user.Id, &profile)
	if profile.ChesscomUsername == "" {
		resp.Error = "No chess.com username configured"
		return
	}

	now := time.Now()
	currentMonthKey := fmt.Sprintf("%d/%02d", now.Year(), int(now.Month()))

	// Fetch archive list (network call, no tx held after this)
	archives, fetchErr := fetchArchiveList(profile.ChesscomUsername)
	if fetchErr != nil {
		resp.Error = "Failed to fetch archive list: " + fetchErr.Error()
		return
	}

	type pendingGame struct {
		game        Game
		pgn         string
		sentinelKey string
	}

	var pending []pendingGame
	var monthsToMark []string

	for _, archiveURL := range archives {
		monthKey := extractMonthKey(archiveURL)
		if monthKey == "" {
			continue
		}
		sentinelKey := fmt.Sprintf("%d/%s", user.Id, monthKey)

		// Skip already-synced months (except the current month)
		if monthKey != currentMonthKey {
			var synced bool
			vbolt.Read(ctx.Tx, SyncedMonthsBkt, sentinelKey, &synced)
			if synced {
				continue
			}
		}

		rawGames, monthErr := fetchMonthlyGames(archiveURL)
		if monthErr != nil {
			// Skip this month on error; don't fail the whole sync
			continue
		}

		for _, raw := range rawGames {
			gameId := extractGameID(raw.URL)
			if gameId == "" {
				continue
			}
			g := buildGame(raw, gameId, user.Id, profile.ChesscomUsername)
			pending = append(pending, pendingGame{game: g, pgn: raw.PGN, sentinelKey: sentinelKey})
		}

		if monthKey != currentMonthKey {
			monthsToMark = append(monthsToMark, sentinelKey)
		}
	}

	// Switch to write tx and persist everything
	vbeam.UseWriteTx(ctx)

	var added int
	for _, pg := range pending {
		if vbolt.HasKey(ctx.Tx, GameBkt, pg.game.Id) {
			// Backfill StartTime for games stored before the EndTime fallback was added
			if pg.game.StartTime != 0 {
				var existing Game
				vbolt.Read(ctx.Tx, GameBkt, pg.game.Id, &existing)
				if existing.StartTime == 0 {
					existing.StartTime = pg.game.StartTime
					vbolt.Write(ctx.Tx, GameBkt, pg.game.Id, &existing)
				}
			}
			continue
		}
		vbolt.Write(ctx.Tx, GameBkt, pg.game.Id, &pg.game)
		pgn := pg.pgn
		vbolt.Write(ctx.Tx, GamePgnBkt, pg.game.Id, &pgn)
		vbolt.SetTargetSingleTerm(ctx.Tx, GamesByUserIdx, pg.game.Id, user.Id)
		if info := extractOpeningFromPGN(pg.pgn); info.ECO != "" {
			vbolt.Write(ctx.Tx, GameOpeningBkt, pg.game.Id, &info)
		}
		added++
	}

	// Backfill opening info for games that don't have it yet (runs once on upgrade, then is fast)
	vbolt.IterateTerm(ctx.Tx, GamesByUserIdx, user.Id, func(gameId string, _ uint16) bool {
		if vbolt.HasKey(ctx.Tx, GameOpeningBkt, gameId) {
			return true
		}
		var pgn string
		vbolt.Read(ctx.Tx, GamePgnBkt, gameId, &pgn)
		if pgn == "" {
			return true
		}
		info := extractOpeningFromPGN(pgn)
		if info.ECO != "" {
			vbolt.Write(ctx.Tx, GameOpeningBkt, gameId, &info)
		}
		return true
	})

	synced := true
	for _, mk := range monthsToMark {
		vbolt.Write(ctx.Tx, SyncedMonthsBkt, mk, &synced)
	}

	var total int
	vbolt.ReadTermCount(ctx.Tx, GamesByUserIdx, &user.Id, &total)

	vbolt.TxCommit(ctx.Tx)

	resp.Success = true
	resp.NewGamesAdded = added
	resp.TotalGames = total
	return
}

func GetGameStats(ctx *vbeam.Context, req GameFilter) (resp GetGameStatsResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		return
	}
	resp.ByClass = make(map[string]TimeClassRecord)
	vbolt.IterateTerm(ctx.Tx, GamesByUserIdx, user.Id, func(gameId string, _ uint16) bool {
		var game Game
		vbolt.Read(ctx.Tx, GameBkt, gameId, &game)
		if !gameMatchesFilter(&game, req) {
			return true
		}
		update := func(r *TimeClassRecord) {
			switch game.Result {
			case "win":
				r.Wins++
			case "loss":
				r.Losses++
			default:
				r.Draws++
			}
		}
		update(&resp.Overall)
		tc := resp.ByClass[game.TimeClass]
		update(&tc)
		resp.ByClass[game.TimeClass] = tc
		return true
	})
	return
}

// OpeningEndMove is the full-move number used as the end of the opening phase.
const OpeningEndMove = 10

// openingEvalForGame returns the centipawn evaluation at the end of the opening phase
// from the user's perspective (positive = user is winning). Returns (0, false) if
// analysis is unavailable.
func openingEvalForGame(analysis *GameAnalysis, userColor string) (int, bool) {
	if analysis.Status != AnalysisStatusDone || len(analysis.Moves) == 0 {
		return 0, false
	}
	lastIdx := 0
	for i, m := range analysis.Moves {
		if m.MoveNumber <= OpeningEndMove {
			lastIdx = i
		} else {
			break
		}
	}
	m := analysis.Moves[lastIdx]
	var eval int
	if m.IsMate {
		if m.MateIn > 0 {
			eval = 1000
		} else {
			eval = -1000
		}
	} else {
		eval = m.Evaluation
	}
	if userColor == "black" {
		eval = -eval
	}
	return eval, true
}

func GetOpeningStats(ctx *vbeam.Context, req GameFilter) (resp GetOpeningStatsResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		return
	}
	resp.ByOpening = make(map[string]OpeningRecord)
	vbolt.IterateTerm(ctx.Tx, GamesByUserIdx, user.Id, func(gameId string, _ uint16) bool {
		var info OpeningInfo
		vbolt.Read(ctx.Tx, GameOpeningBkt, gameId, &info)
		if info.Opening == "" {
			return true
		}
		if alias, ok := openingAliases[info.Opening]; ok {
			info.Opening = alias[0]
			if info.Variation == "" {
				info.Variation = alias[1]
			}
		}
		var game Game
		vbolt.Read(ctx.Tx, GameBkt, gameId, &game)
		if !gameMatchesFilter(&game, req) {
			return true
		}
		rec := resp.ByOpening[info.Opening]
		if rec.Variations == nil {
			rec.Variations = make(map[string]VariationRecord)
		}
		if rec.ECO == "" && info.ECO != "" {
			rec.ECO = info.ECO
		}
		bumpColor := func(cr *ColorRecord) {
			switch game.Result {
			case "win":
				cr.Wins++
			case "loss":
				cr.Losses++
			default:
				cr.Draws++
			}
		}
		var analysis GameAnalysis
		vbolt.Read(ctx.Tx, GameAnalysisBkt, gameId, &analysis)
		openingEval, hasEval := openingEvalForGame(&analysis, game.UserColor)
		bumpEval := func(cr *ColorRecord) {
			if hasEval {
				cr.OpeningEvalSum += openingEval
				cr.OpeningEvalN++
			}
		}
		if game.UserColor == "white" {
			bumpColor(&rec.AsWhite)
			bumpEval(&rec.AsWhite)
		} else {
			bumpColor(&rec.AsBlack)
			bumpEval(&rec.AsBlack)
		}
		if info.Variation != "" {
			vr := rec.Variations[info.Variation]
			if game.UserColor == "white" {
				bumpColor(&vr.AsWhite)
				bumpEval(&vr.AsWhite)
			} else {
				bumpColor(&vr.AsBlack)
				bumpEval(&vr.AsBlack)
			}
			rec.Variations[info.Variation] = vr
		}
		resp.ByOpening[info.Opening] = rec
		return true
	})
	return
}

// parsePGNHeader extracts the value of a PGN header tag, e.g. parsePGNHeader(pgn, "ECO") -> "B12"
func parsePGNHeader(pgn, key string) string {
	prefix := `[` + key + ` "`
	idx := strings.Index(pgn, prefix)
	if idx == -1 {
		return ""
	}
	rest := pgn[idx+len(prefix):]
	end := strings.Index(rest, `"`)
	if end == -1 {
		return ""
	}
	return rest[:end]
}

// openingKeywords are checked in order; the first match splits opening from variation in an ECOUrl path.
var openingKeywords = []string{
	// Longer/more specific first to avoid partial matches
	"Gambit-Declined", "Gambit-Accepted",
	"Game", "Defense", "Defence", "Opening", "Attack", "Gambit",
	"Dutch", "System",
}

// openingAliases maps stored opening names to a canonical parent opening + variation name.
// Needed for Chess.com ECO URLs that place a modifier before the base opening name
// (e.g. "Alapin-Sicilian-Defense" instead of "Sicilian-Defense-Alapin-Variation").
var openingAliases = map[string][2]string{
	"Alapin Sicilian Defense":        {"Sicilian Defense", "Alapin"},
	"Closed Sicilian Defense":        {"Sicilian Defense", "Closed"},
	"Vienna Game Max Lange Defense":  {"Vienna Game", "Max Lange Defense"},
	"Vienna Game Anderssen Defense":  {"Vienna Game", "Anderssen Defense"},
}

// parseECOUrl splits a chess.com ECOUrl into top-level opening name and variation name.
// e.g. "https://www.chess.com/openings/Caro-Kann-Defense-Advance-Variation"
//
//	-> ("Caro-Kann Defense", "Advance Variation")
func parseECOUrl(ecoURL string) (opening, variation string) {
	if ecoURL == "" {
		return "", ""
	}
	parts := strings.Split(strings.TrimRight(ecoURL, "/"), "/")
	path := parts[len(parts)-1]
	for _, kw := range openingKeywords {
		idx := strings.Index(path, kw)
		if idx == -1 {
			continue
		}
		end := idx + len(kw)
		opening = strings.ReplaceAll(path[:end], "-", " ")
		variation = strings.TrimSpace(strings.ReplaceAll(strings.TrimLeft(path[end:], "-"), "-", " "))
		return
	}
	// Fallback: whole path is the opening name
	opening = strings.ReplaceAll(path, "-", " ")
	return
}

func extractOpeningFromPGN(pgn string) OpeningInfo {
	eco := parsePGNHeader(pgn, "ECO")
	ecoURL := parsePGNHeader(pgn, "ECOUrl")
	opening, variation := parseECOUrl(ecoURL)
	return OpeningInfo{ECO: eco, Opening: opening, Variation: variation}
}

func buildGame(raw chesscomGame, gameId string, userId int, username string) Game {
	startTime := raw.StartTime
	if startTime == 0 {
		startTime = raw.EndTime
	}
	g := Game{
		Id:            gameId,
		UserId:        userId,
		WhiteUsername: raw.White.Username,
		WhiteRating:   raw.White.Rating,
		BlackUsername: raw.Black.Username,
		BlackRating:   raw.Black.Rating,
		TimeClass:     raw.TimeClass,
		TimeControl:   raw.TimeControl,
		StartTime:     startTime,
		Rules:         raw.Rules,
	}
	if strings.EqualFold(raw.White.Username, username) {
		g.UserColor = "white"
		g.Result = normalizeResult(raw.White.Result)
	} else {
		g.UserColor = "black"
		g.Result = normalizeResult(raw.Black.Result)
	}
	return g
}

func normalizeResult(r string) string {
	switch r {
	case "win":
		return "win"
	case "agreed", "stalemate", "insufficient", "repetition", "timevsinsufficient", "50move":
		return "draw"
	default:
		return "loss"
	}
}

func gameToRecentItem(g Game, opening OpeningInfo, analysisStatus int) RecentGameItem {
	return RecentGameItem{
		Id:             g.Id,
		WhiteUsername:  g.WhiteUsername,
		WhiteRating:    g.WhiteRating,
		BlackUsername:  g.BlackUsername,
		BlackRating:    g.BlackRating,
		TimeClass:      g.TimeClass,
		TimeControl:    g.TimeControl,
		Result:         g.Result,
		UserColor:      g.UserColor,
		StartTime:      g.StartTime,
		Opening:        opening.Opening,
		OpeningECO:     opening.ECO,
		AnalysisStatus: analysisStatus,
	}
}

func GetRatingHistory(ctx *vbeam.Context, req GameFilter) (resp GetRatingHistoryResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		return
	}
	vbolt.IterateTerm(ctx.Tx, GamesByUserIdx, user.Id, func(gameId string, _ uint16) bool {
		var game Game
		vbolt.Read(ctx.Tx, GameBkt, gameId, &game)
		if !gameMatchesFilter(&game, req) {
			return true
		}
		rating := game.WhiteRating
		if game.UserColor == "black" {
			rating = game.BlackRating
		}
		if rating == 0 || game.StartTime == 0 {
			return true
		}
		resp.Points = append(resp.Points, RatingPoint{
			StartTime: game.StartTime,
			Rating:    rating,
			Result:    game.Result,
			TimeClass: game.TimeClass,
		})
		return true
	})
	sort.Slice(resp.Points, func(i, j int) bool {
		return resp.Points[i].StartTime < resp.Points[j].StartTime
	})
	return
}

func GetRecentGames(ctx *vbeam.Context, req GetRecentGamesRequest) (resp GetRecentGamesResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		return
	}

	limit := req.Limit
	if limit <= 0 {
		limit = 50
	}

	var games []Game
	vbolt.IterateTerm(ctx.Tx, GamesByUserIdx, user.Id, func(gameId string, _ uint16) bool {
		var g Game
		vbolt.Read(ctx.Tx, GameBkt, gameId, &g)
		if gameMatchesFilter(&g, req.Filter) {
			games = append(games, g)
		}
		return true
	})

	sort.Slice(games, func(i, j int) bool {
		return games[i].StartTime > games[j].StartTime
	})

	resp.Total = len(games)

	start := req.Offset
	if start >= len(games) {
		resp.Games = []RecentGameItem{}
		return
	}
	end := start + limit
	if end > len(games) {
		end = len(games)
	}
	page := games[start:end]

	resp.Games = make([]RecentGameItem, len(page))
	for i, g := range page {
		var opening OpeningInfo
		vbolt.Read(ctx.Tx, GameOpeningBkt, g.Id, &opening)
		status := AnalysisStatusNone
		if vbolt.HasKey(ctx.Tx, GameAnalysisBkt, g.Id) {
			var analysis GameAnalysis
			vbolt.Read(ctx.Tx, GameAnalysisBkt, g.Id, &analysis)
			status = analysis.Status
		}
		resp.Games[i] = gameToRecentItem(g, opening, status)
	}
	return
}

func GetGameDetail(ctx *vbeam.Context, req GetGameDetailRequest) (resp GetGameDetailResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		return
	}
	if req.GameId == "" {
		return
	}

	var g Game
	vbolt.Read(ctx.Tx, GameBkt, req.GameId, &g)
	if g.Id == "" || g.UserId != user.Id {
		return
	}

	var opening OpeningInfo
	vbolt.Read(ctx.Tx, GameOpeningBkt, req.GameId, &opening)

	var pgn string
	vbolt.Read(ctx.Tx, GamePgnBkt, req.GameId, &pgn)

	status := AnalysisStatusNone
	var analysis GameAnalysis
	if vbolt.HasKey(ctx.Tx, GameAnalysisBkt, req.GameId) {
		vbolt.Read(ctx.Tx, GameAnalysisBkt, req.GameId, &analysis)
		status = analysis.Status
	}

	resp.Game = gameToRecentItem(g, opening, status)
	resp.Pgn = pgn
	resp.AnalysisStatus = status
	resp.AnalysisDepth = analysis.AnalysisDepth
	resp.WhiteAccuracy = analysis.WhiteAccuracy
	resp.BlackAccuracy = analysis.BlackAccuracy
	resp.ErrorMessage = analysis.ErrorMessage
	resp.AnalyzedAt = analysis.AnalyzedAt

	if status == AnalysisStatusDone && len(analysis.Moves) > 0 {
		resp.Moves = convertMovesToSAN(pgn, analysis.Moves)
	}
	return
}

func RequestGameAnalysis(ctx *vbeam.Context, req RequestGameAnalysisRequest) (resp RequestGameAnalysisResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		resp.Error = "Authentication required"
		return
	}

	var g Game
	vbolt.Read(ctx.Tx, GameBkt, req.GameId, &g)
	if g.Id == "" || g.UserId != user.Id {
		resp.Error = "Game not found"
		return
	}

	if g.Rules != "" && g.Rules != "chess" {
		resp.Error = fmt.Sprintf("Analysis not available for variant: %s", g.Rules)
		return
	}

	if vbolt.HasKey(ctx.Tx, GameAnalysisBkt, req.GameId) {
		var existing GameAnalysis
		vbolt.Read(ctx.Tx, GameAnalysisBkt, req.GameId, &existing)
		if existing.Status == AnalysisStatusDone || existing.Status == AnalysisStatusAnalyzing {
			resp.Status = existing.Status
			return
		}
	}

	vbeam.UseWriteTx(ctx)
	pending := GameAnalysis{
		GameId: req.GameId,
		Status: AnalysisStatusPending,
	}
	vbolt.Write(ctx.Tx, GameAnalysisBkt, req.GameId, &pending)
	vbolt.SetTargetSingleTerm(ctx.Tx, AnalysisByStatusIdx, req.GameId, AnalysisStatusPending)
	vbolt.TxCommit(ctx.Tx)

	if qErr := QueueGameAnalysis(AnalysisJob{GameId: req.GameId}); qErr != nil {
		resp.Error = qErr.Error()
		resp.Status = AnalysisStatusPending
		return
	}

	resp.Queued = true
	resp.Status = AnalysisStatusPending
	return
}

func RequestAllGameAnalysis(ctx *vbeam.Context, req RequestAllGameAnalysisRequest) (resp RequestAllGameAnalysisResponse, err error) {
	user, authErr := GetAuthUser(ctx)
	if authErr != nil || user.Id == 0 {
		resp.Error = "Authentication required"
		return
	}

	if globalAnalysisWorker == nil {
		resp.Error = "Analysis worker not available"
		return
	}

	const maxBulkAnalysis = 1000
	var gameIds []string
	vbolt.IterateTerm(ctx.Tx, GamesByUserIdx, user.Id, func(gameId string, _ uint16) bool {
		if len(gameIds) >= maxBulkAnalysis {
			return false
		}
		if vbolt.HasKey(ctx.Tx, GameAnalysisBkt, gameId) {
			return true
		}
		var g Game
		vbolt.Read(ctx.Tx, GameBkt, gameId, &g)
		if g.Rules != "" && g.Rules != "chess" {
			return true
		}
		gameIds = append(gameIds, gameId)
		return true
	})

	if len(gameIds) == 0 {
		return
	}

	vbeam.UseWriteTx(ctx)
	for _, gameId := range gameIds {
		pending := GameAnalysis{GameId: gameId, Status: AnalysisStatusPending}
		vbolt.Write(ctx.Tx, GameAnalysisBkt, gameId, &pending)
		vbolt.SetTargetSingleTerm(ctx.Tx, AnalysisByStatusIdx, gameId, AnalysisStatusPending)
	}
	vbolt.TxCommit(ctx.Tx)

	go func(ids []string) {
		for _, id := range ids {
			if globalAnalysisWorker == nil {
				return
			}
			globalAnalysisWorker.jobQueue <- AnalysisJob{GameId: id}
		}
	}(gameIds)

	resp.Queued = len(gameIds)
	return
}

// normEval converts a stored evaluation (with optional mate flag) to a centipawn sentinel
// suitable for win-probability calculations.
func normEval(eval int, isMate bool, mateIn int) int {
	if !isMate {
		return eval
	}
	if mateIn > 0 {
		return 10000
	}
	return -10000
}

// classifyMove computes the per-move accuracy and quality label for the move at index i-1,
// given the evaluation of position i-1 (before the move) and position i (after the move).
// color is the color of the player who made the move.
// uciPlayed and uciBest are the UCI strings from the stored MoveAnalysis (pre-SAN conversion).
func classifyMove(
	prevEval, currEval int,
	prevMate, currMate bool,
	prevMateIn, currMateIn int,
	color, uciPlayed, uciBest string,
) (accuracy float64, quality string) {
	pe := normEval(prevEval, prevMate, prevMateIn)
	ce := normEval(currEval, currMate, currMateIn)

	wpBefore := winProbability(pe)
	wpAfter := winProbability(ce)

	var wpLoss float64
	if color == "white" {
		wpLoss = wpBefore - wpAfter
	} else {
		wpLoss = wpAfter - wpBefore
	}
	accuracy = moveAccuracy(wpLoss)

	switch {
	case uciPlayed == uciBest:
		quality = "best"
	case accuracy >= 90:
		quality = "excellent"
	case accuracy >= 75:
		quality = "good"
	case accuracy >= 50:
		quality = "inaccuracy"
	case accuracy >= 20:
		quality = "mistake"
	default:
		quality = "blunder"
	}
	return
}

// convertMovesToSAN maps stored MoveAnalysis (UCI notation) to MoveAnalysisItem (SAN notation).
// Falls back to UCI strings if parsing fails.
func convertMovesToSAN(pgn string, moves []MoveAnalysis) []MoveAnalysisItem {
	notation := chess.AlgebraicNotation{}

	// Parse the PGN to get positions
	reader := strings.NewReader(pgn)
	pgnReader, parseErr := chess.PGN(reader)
	if parseErr != nil {
		return uciMoveItems(moves)
	}
	game := chess.NewGame(pgnReader)
	positions := game.Positions()
	gameMoves := game.Moves()

	items := make([]MoveAnalysisItem, len(moves))
	for i, m := range moves {
		item := MoveAnalysisItem{
			MoveNumber: m.MoveNumber,
			Color:      m.Color,
			MovePlayed: m.MovePlayed,
			BestMove:   m.BestMove,
			Evaluation: m.Evaluation,
			IsMate:     m.IsMate,
			MateIn:     m.MateIn,
			Accuracy:   -1, // first move has no prior position
		}

		// Convert MovePlayed to SAN using the stored game move at this ply
		if i < len(gameMoves) && i < len(positions) {
			item.MovePlayed = notation.Encode(positions[i], gameMoves[i])
		}

		// Convert BestMove (UCI) to SAN by finding the matching legal move
		if i < len(positions) && m.BestMove != "" {
			pos := positions[i]
			legalMoves := pos.ValidMoves()
			for j := range legalMoves {
				if legalMoves[j].String() == m.BestMove {
					item.BestMove = notation.Encode(pos, &legalMoves[j])
					break
				}
			}
		}

		// Classify the move played at index i-1 (we now have both before and after evals)
		if i > 0 {
			prev := moves[i-1]
			acc, qual := classifyMove(
				prev.Evaluation, m.Evaluation,
				prev.IsMate, m.IsMate,
				prev.MateIn, m.MateIn,
				prev.Color, prev.MovePlayed, prev.BestMove,
			)
			items[i-1].Accuracy = acc
			items[i-1].MoveQuality = qual
		}

		items[i] = item
	}
	// Classify the last move (no i+1 exists; use its own eval as "after" since it's the final position)
	// We skip classifying the last move because there's no next position to compare against.
	// It keeps Accuracy=-1 and MoveQuality="" which the frontend treats as unclassified.
	return items
}

func uciMoveItems(moves []MoveAnalysis) []MoveAnalysisItem {
	items := make([]MoveAnalysisItem, len(moves))
	for i, m := range moves {
		items[i] = MoveAnalysisItem{
			MoveNumber:  m.MoveNumber,
			Color:       m.Color,
			MovePlayed:  m.MovePlayed,
			BestMove:    m.BestMove,
			Evaluation:  m.Evaluation,
			IsMate:      m.IsMate,
			MateIn:      m.MateIn,
			Accuracy:    -1,
			MoveQuality: "",
		}
		if i > 0 {
			prev := moves[i-1]
			acc, qual := classifyMove(
				prev.Evaluation, m.Evaluation,
				prev.IsMate, m.IsMate,
				prev.MateIn, m.MateIn,
				prev.Color, prev.MovePlayed, prev.BestMove,
			)
			items[i-1].Accuracy = acc
			items[i-1].MoveQuality = qual
		}
	}
	return items
}
