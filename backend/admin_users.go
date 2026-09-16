package backend

import (
	"sort"
	"time"

	"go.hasen.dev/vbeam"
	"go.hasen.dev/vbolt"
)

// AdminUserSummary is one row of the admin "registered users" table.
type AdminUserSummary struct {
	Id               int    `json:"id"`
	Name             string `json:"name"`
	Email            string `json:"email"`
	IsAdmin          bool   `json:"isAdmin"`
	AuthProvider     string `json:"authProvider"` // "password" or "google"
	Creation         int64  `json:"creation"`     // unix seconds
	LastLogin        int64  `json:"lastLogin"`    // unix seconds
	ChesscomUsername string `json:"chesscomUsername"`
	GameCount        int    `json:"gameCount"`
	LastGameAt       int64  `json:"lastGameAt"` // unix seconds, 0 when no games
	FollowedAccounts int    `json:"followedAccounts"`
	ActiveSessions   int    `json:"activeSessions"`
}

type GetRegisteredUsersResponse struct {
	Success            bool               `json:"success"`
	Error              string             `json:"error,omitempty"`
	Users              []AdminUserSummary `json:"users"`
	TotalUsers         int                `json:"totalUsers"`
	NewUsersLast30Days int                `json:"newUsersLast30Days"`
	ActiveLast7Days    int                `json:"activeLast7Days"`
	LinkedAccounts     int                `json:"linkedAccounts"`
	TotalGames         int                `json:"totalGames"`
}

func RegisterAdminMethods(app *vbeam.Application) {
	vbeam.RegisterProc(app, GetRegisteredUsers)
}

// lastGameTimeByUser makes a single pass over the games bucket and returns the
// most recent game start time per user. One pass is cheaper than walking each
// user's game index and re-reading every game record.
func lastGameTimeByUser(tx *vbolt.Tx) map[int]int64 {
	lastGame := make(map[int]int64)
	vbolt.IterateAll(tx, GameBkt, func(_ string, game Game) bool {
		if game.StartTime > lastGame[game.UserId] {
			lastGame[game.UserId] = game.StartTime
		}
		return true
	})
	return lastGame
}

func activeSessionCount(tx *vbolt.Tx, userId int, now time.Time) int {
	var tokenIds []int
	vbolt.ReadTermTargets(tx, RefreshTokenByUserIndex, userId, &tokenIds, vbolt.Window{})

	var active int
	for _, tokenId := range tokenIds {
		var token RefreshToken
		vbolt.Read(tx, RefreshTokenBkt, tokenId, &token)
		if token.Id == 0 || token.ExpiresAt.Before(now) {
			continue
		}
		active++
	}
	return active
}

func GetRegisteredUsers(ctx *vbeam.Context, req Empty) (resp GetRegisteredUsersResponse, err error) {
	admin, authErr := GetAuthUser(ctx)
	if authErr != nil || admin.Id == 0 {
		resp.Error = "Authentication required"
		return
	}
	if !GetAuthResponseFromUser(admin).IsAdmin {
		resp.Error = "Admin access required"
		return
	}

	resp = collectRegisteredUsers(ctx.Tx, time.Now())
	resp.Success = true
	return
}

// collectRegisteredUsers gathers every registered account plus the per-account
// activity the admin page displays.
func collectRegisteredUsers(tx *vbolt.Tx, now time.Time) (resp GetRegisteredUsersResponse) {
	newCutoff := now.AddDate(0, 0, -30)
	activeCutoff := now.AddDate(0, 0, -7)
	lastGame := lastGameTimeByUser(tx)

	vbolt.IterateAll(tx, UsersBkt, func(_ int, user User) bool {
		if user.Id == 0 {
			return true
		}

		summary := AdminUserSummary{
			Id:           user.Id,
			Name:         user.Name,
			Email:        user.Email,
			IsAdmin:      GetAuthResponseFromUser(user).IsAdmin,
			AuthProvider: "password",
			LastGameAt:   lastGame[user.Id],
		}
		if !user.Creation.IsZero() {
			summary.Creation = user.Creation.Unix()
		}
		if !user.LastLogin.IsZero() {
			summary.LastLogin = user.LastLogin.Unix()
		}
		if len(GetPassHash(tx, user.Id)) == 0 {
			summary.AuthProvider = "google"
		}

		var profile ChessProfile
		vbolt.Read(tx, ChessProfileBkt, user.Id, &profile)
		summary.ChesscomUsername = profile.ChesscomUsername

		vbolt.ReadTermCount(tx, GamesByUserIdx, &user.Id, &summary.GameCount)
		vbolt.ReadTermCount(tx, FollowedChessAccountsByUserIdx, &user.Id, &summary.FollowedAccounts)
		summary.ActiveSessions = activeSessionCount(tx, user.Id, now)

		resp.Users = append(resp.Users, summary)
		resp.TotalGames += summary.GameCount
		if summary.ChesscomUsername != "" {
			resp.LinkedAccounts++
		}
		if !user.Creation.IsZero() && user.Creation.After(newCutoff) {
			resp.NewUsersLast30Days++
		}
		if !user.LastLogin.IsZero() && user.LastLogin.After(activeCutoff) {
			resp.ActiveLast7Days++
		}
		return true
	})

	sort.Slice(resp.Users, func(i, j int) bool {
		return resp.Users[i].Id < resp.Users[j].Id
	})

	resp.TotalUsers = len(resp.Users)
	return
}
