import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as server from "../../server";
import * as auth from "../../lib/authCache";
import {
  GetGameStatsResponse, GetOpeningStatsResponse, GetRatingHistoryResponse,
  GetStreaksResponse, RecentGameItem, GameFilter, RatingPoint,
} from "../../server";
import { requireAuthInView, ensureAuthInFetch } from "../../lib/authHelpers";
import { DashboardLayout } from "../../lib/dashboardLayout";
import { StreaksSection, TIME_CLASS_ORDER, formatDate } from "../../lib/dashboardComponents";

type Data = {
  chesscomUsername: string;
  gameCount: number;
  stats: GetGameStatsResponse | null;
  openingStats: GetOpeningStatsResponse | null;
  ratingHistory: GetRatingHistoryResponse | null;
  streaks: GetStreaksResponse | null;
  recentGames: RecentGameItem[] | null;
};

type OverviewState = {
  usernameInput: string;
  saving: boolean;
  syncing: boolean;
  analyzingAll: boolean;
  statusMessage: string;
  isError: boolean;
};

const useOverviewState = vlens.declareHook((): OverviewState => ({
  usernameInput: "",
  saving: false,
  syncing: false,
  analyzingAll: false,
  statusMessage: "",
  isError: false,
}));

let _data: Data;

async function onSaveUsername(state: OverviewState, event: Event) {
  event.preventDefault();
  state.saving = true;
  state.statusMessage = "";
  state.isError = false;
  vlens.scheduleRedraw();
  const [resp] = await server.SetChessUsername({ chesscomUsername: state.usernameInput });
  state.saving = false;
  if (resp?.success) {
    _data.chesscomUsername = state.usernameInput;
    state.usernameInput = "";
    state.statusMessage = "Chess.com username saved.";
    state.isError = false;
  } else {
    state.statusMessage = resp?.error || "Failed to save username";
    state.isError = true;
  }
  vlens.scheduleRedraw();
}

async function onSyncGames(state: OverviewState, event: Event) {
  event.preventDefault();
  state.syncing = true;
  state.statusMessage = "";
  state.isError = false;
  vlens.scheduleRedraw();
  const [resp] = await server.SyncGames({});
  state.syncing = false;
  if (resp?.success) {
    _data.gameCount = resp.totalGames;
    state.statusMessage = `Sync complete. ${resp.newGamesAdded} new games added. Total: ${resp.totalGames}.`;
    state.isError = false;
  } else {
    state.statusMessage = resp?.error || "Sync failed";
    state.isError = true;
  }
  vlens.scheduleRedraw();
}

async function onAnalyzeAllGames(state: OverviewState, event: Event) {
  event.preventDefault();
  state.analyzingAll = true;
  state.statusMessage = "";
  state.isError = false;
  vlens.scheduleRedraw();
  const [resp] = await server.RequestAllGameAnalysis({});
  state.analyzingAll = false;
  if (resp && !resp.error) {
    state.statusMessage = resp.queued === 0
      ? "All games are already analyzed."
      : `Queued ${resp.queued} game${resp.queued === 1 ? "" : "s"} for analysis.`;
    state.isError = false;
  } else {
    state.statusMessage = resp?.error || "Failed to queue games for analysis";
    state.isError = true;
  }
  vlens.scheduleRedraw();
}

function onChangeUsername(state: OverviewState, event: Event) {
  event.preventDefault();
  state.usernameInput = "";
  state.statusMessage = "";
  vlens.scheduleRedraw();
}

function latestRatingByClass(ratingHistory: GetRatingHistoryResponse | null): Record<string, number> {
  if (!ratingHistory) return {};
  const result: Record<string, number> = {};
  for (const p of ratingHistory.points) {
    result[p.timeClass] = p.rating;
  }
  return result;
}

function winPct(r: { wins: number; losses: number; draws: number }): string {
  const total = r.wins + r.losses + r.draws;
  if (total === 0) return "—";
  return Math.round((r.wins / total) * 100) + "%";
}

function OverviewContent({ data }: { data: Data }) {
  const latestRatings = latestRatingByClass(data.ratingHistory);
  const ratingClasses = TIME_CLASS_ORDER.filter(tc => latestRatings[tc] !== undefined);

  const openingEntries = data.openingStats ? Object.entries(data.openingStats.byOpening) : [];
  const topWhite = openingEntries
    .filter(([, rec]) => rec.asWhite.wins + rec.asWhite.losses + rec.asWhite.draws > 0)
    .sort((a, b) => (b[1].asWhite.wins + b[1].asWhite.losses + b[1].asWhite.draws) - (a[1].asWhite.wins + a[1].asWhite.losses + a[1].asWhite.draws))
    .slice(0, 3);
  const topBlack = openingEntries
    .filter(([, rec]) => rec.asBlack.wins + rec.asBlack.losses + rec.asBlack.draws > 0)
    .sort((a, b) => (b[1].asBlack.wins + b[1].asBlack.losses + b[1].asBlack.draws) - (a[1].asBlack.wins + a[1].asBlack.losses + a[1].asBlack.draws))
    .slice(0, 3);

  return (
    <>
      {data.streaks && (
        <StreaksSection streaks={data.streaks} />
      )}

      {ratingClasses.length > 0 && (
        <div class="overview-section">
          <div class="overview-section-header">
            <h3>Current Ratings</h3>
          </div>
          <div class="rating-snapshot">
            {ratingClasses.map(tc => (
              <div key={tc} class="rating-snapshot-item">
                <div class="rating-snapshot-value">{latestRatings[tc]}</div>
                <div class="rating-snapshot-class">{tc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.stats && (
        <div class="overview-section">
          <div class="overview-section-header">
            <h3>30-Day Record</h3>
            <a href="/dashboard/stats" class="overview-section-link" onClick={(e) => { e.preventDefault(); core.setRoute("/dashboard/stats"); }}>Full stats →</a>
          </div>
          <table class="stats-table">
            <thead>
              <tr><th></th><th>W</th><th>L</th><th>D</th><th>Win%</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Overall</td>
                <td>{data.stats.overall.wins}</td>
                <td>{data.stats.overall.losses}</td>
                <td>{data.stats.overall.draws}</td>
                <td>{winPct(data.stats.overall)}</td>
              </tr>
              {TIME_CLASS_ORDER.filter(tc => data.stats!.byClass[tc]).map(tc => {
                const r = data.stats!.byClass[tc];
                return (
                  <tr key={tc}>
                    <td>{tc.charAt(0).toUpperCase() + tc.slice(1)}</td>
                    <td>{r.wins}</td>
                    <td>{r.losses}</td>
                    <td>{r.draws}</td>
                    <td>{winPct(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(topWhite.length > 0 || topBlack.length > 0) && (
        <div class="overview-section">
          <div class="overview-section-header">
            <h3>Top Openings</h3>
            <a href="/dashboard/openings" class="overview-section-link" onClick={(e) => { e.preventDefault(); core.setRoute("/dashboard/openings"); }}>All openings →</a>
          </div>
          <div class="overview-two-col">
            {topWhite.length > 0 && (
              <div>
                <h4 style="margin-bottom:8px;font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.05em">As White</h4>
                <table class="stats-table">
                  <thead><tr><th>Opening</th><th>W</th><th>L</th><th>D</th><th>Win%</th></tr></thead>
                  <tbody>
                    {topWhite.map(([name, rec]) => {
                      const r = rec.asWhite;
                      return (
                        <tr key={name}>
                          <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{name}</td>
                          <td>{r.wins}</td>
                          <td>{r.losses}</td>
                          <td>{r.draws}</td>
                          <td>{winPct(r)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {topBlack.length > 0 && (
              <div>
                <h4 style="margin-bottom:8px;font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.05em">As Black</h4>
                <table class="stats-table">
                  <thead><tr><th>Opening</th><th>W</th><th>L</th><th>D</th><th>Win%</th></tr></thead>
                  <tbody>
                    {topBlack.map(([name, rec]) => {
                      const r = rec.asBlack;
                      return (
                        <tr key={name}>
                          <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{name}</td>
                          <td>{r.wins}</td>
                          <td>{r.losses}</td>
                          <td>{r.draws}</td>
                          <td>{winPct(r)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {data.recentGames && data.recentGames.length > 0 && (
        <div class="overview-section">
          <div class="overview-section-header">
            <h3>Recent Games</h3>
            <a href="/dashboard/games" class="overview-section-link" onClick={(e) => { e.preventDefault(); core.setRoute("/dashboard/games"); }}>All games →</a>
          </div>
          <div class="mini-games-list">
            {data.recentGames.map(g => {
              const opponent = g.userColor === "white" ? g.blackUsername : g.whiteUsername;
              const resultClass = g.result === "win" ? "result-win" : g.result === "loss" ? "result-loss" : "result-draw";
              return (
                <div key={g.id} class="mini-game-row" onClick={() => core.setRoute("/game/" + g.id)}>
                  <span class="mini-game-date">{formatDate(g.startTime)}</span>
                  <span class="mini-game-opponent">{opponent}</span>
                  <span class={resultClass} style="min-width:36px;font-weight:600;font-size:13px">{g.result.charAt(0).toUpperCase() + g.result.slice(1)}</span>
                  <span class="mini-game-opening">{g.opening || "—"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAuthInFetch())) {
    return rpc.ok<Data>({ chesscomUsername: "", gameCount: 0, stats: null, openingStats: null, ratingHistory: null, streaks: null, recentGames: null });
  }
  const [profile] = await server.GetChessProfile({});
  const username = profile?.chesscomUsername ?? "";
  const gameCount = profile?.gameCount ?? 0;
  const data: Data = { chesscomUsername: username, gameCount, stats: null, openingStats: null, ratingHistory: null, streaks: null, recentGames: null };

  if (username) {
    if (gameCount < 1000) {
      await server.SyncGames({});
      await server.RequestAllGameAnalysis({});
      const [updatedProfile] = await server.GetChessProfile({});
      data.gameCount = updatedProfile?.gameCount ?? gameCount;
    }
    const thirtyDayFilter: GameFilter = {
      timeClass: "",
      minOpponentRating: 0,
      maxOpponentRating: 0,
      since: Math.floor(Date.now() / 1000 - 30 * 86400),
    };
    const allTimeFilter: GameFilter = { timeClass: "", minOpponentRating: 0, maxOpponentRating: 0, since: 0 };
    const [[s], [os], [rh], [st], [gamesResp]] = await Promise.all([
      server.GetGameStats(thirtyDayFilter),
      server.GetOpeningStats(allTimeFilter),
      server.GetRatingHistory(allTimeFilter),
      server.GetStreaks({}),
      server.GetRecentGames({ filter: allTimeFilter, limit: 10, offset: 0 }),
    ]);
    data.stats = s ?? null;
    data.openingStats = os ?? null;
    data.ratingHistory = rh ?? null;
    data.streaks = st ?? null;
    data.recentGames = gamesResp?.games ?? null;
  }
  _data = data;
  return rpc.ok(data);
}

export function view(route: string, prefix: string, data: Data): preact.ComponentChild {
  const currentAuth = requireAuthInView();
  if (!currentAuth) return null;
  const state = useOverviewState();

  return (
    <DashboardLayout name={currentAuth.name} route={route}>
      <div class="chess-section" style="margin-bottom:20px">
        <h2>Chess.com</h2>
        {data.chesscomUsername ? (
          <div class="chess-connected">
            <p>
              Connected as <strong>{data.chesscomUsername}</strong>{" "}
              <a href="#" class="auth-link" onClick={vlens.cachePartial(onChangeUsername, state)}>Change</a>
            </p>
            <p class="game-count">{data.gameCount} games synced</p>
            <button class="btn btn-primary" disabled={state.syncing} onClick={vlens.cachePartial(onSyncGames, state)}>
              {state.syncing ? "Syncing..." : "Sync Games"}
            </button>
            <button class="btn btn-secondary" disabled={state.analyzingAll} onClick={vlens.cachePartial(onAnalyzeAllGames, state)}>
              {state.analyzingAll ? "Queueing..." : "Analyze All Games"}
            </button>
          </div>
        ) : (
          <form class="chess-username-form" onSubmit={vlens.cachePartial(onSaveUsername, state)}>
            <p>Enter your chess.com username to start syncing your games.</p>
            <div class="form-group">
              <label htmlFor="chesscom-username">Chess.com Username</label>
              <input
                type="text"
                id="chesscom-username"
                placeholder="e.g. hikaru"
                {...vlens.attrsBindInput(vlens.ref(state, "usernameInput"))}
                disabled={state.saving}
                required
              />
            </div>
            <button type="submit" class="btn btn-primary" disabled={state.saving}>
              {state.saving ? "Saving..." : "Save Username"}
            </button>
          </form>
        )}
        {state.statusMessage && (
          <p class={state.isError ? "error-message" : "success-message"}>
            {state.statusMessage}
          </p>
        )}
      </div>
      {data.chesscomUsername && <OverviewContent data={data} />}
    </DashboardLayout>
  );
}
