package backend

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const chesscomBase = "https://api.chess.com/pub"
const chesscomUserAgent = "chess-stats/1.0"

var chesscomClient = &http.Client{Timeout: 30 * time.Second}

type chesscomArchiveList struct {
	Archives []string `json:"archives"`
}

type chesscomMonthlyGames struct {
	Games []chesscomGame `json:"games"`
}

type chesscomGame struct {
	URL         string         `json:"url"`
	PGN         string         `json:"pgn"`
	TimeClass   string         `json:"time_class"`
	TimeControl string         `json:"time_control"`
	Rules       string         `json:"rules"`
	StartTime   int64          `json:"start_time"`
	EndTime     int64          `json:"end_time"`
	White       chesscomPlayer `json:"white"`
	Black       chesscomPlayer `json:"black"`
}

type chesscomPlayer struct {
	Username string `json:"username"`
	Rating   int    `json:"rating"`
	Result   string `json:"result"`
}

func fetchArchiveList(username string) ([]string, error) {
	url := fmt.Sprintf("%s/player/%s/games/archives", chesscomBase, username)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", chesscomUserAgent)

	resp, err := chesscomClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("chess.com returned status %d for user %q", resp.StatusCode, username)
	}

	var result chesscomArchiveList
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Archives, nil
}

func fetchMonthlyGames(archiveURL string) ([]chesscomGame, error) {
	req, err := http.NewRequest("GET", archiveURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", chesscomUserAgent)

	resp, err := chesscomClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("chess.com returned status %d for %s", resp.StatusCode, archiveURL)
	}

	var result chesscomMonthlyGames
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Games, nil
}

// extractGameID returns the numeric ID from the end of a chess.com game URL.
// e.g. "https://www.chess.com/game/live/12345678" -> "12345678"
func extractGameID(gameURL string) string {
	parts := strings.Split(strings.TrimRight(gameURL, "/"), "/")
	if len(parts) == 0 {
		return ""
	}
	return parts[len(parts)-1]
}

// extractMonthKey returns the "YYYY/MM" portion from a chess.com archive URL.
// e.g. "https://api.chess.com/pub/player/hikaru/games/2024/01" -> "2024/01"
func extractMonthKey(archiveURL string) string {
	parts := strings.Split(strings.TrimRight(archiveURL, "/"), "/")
	if len(parts) < 2 {
		return ""
	}
	return parts[len(parts)-2] + "/" + parts[len(parts)-1]
}
