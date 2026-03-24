import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as auth from "../lib/authCache";
import * as server from "../server";
import { GetGameStatsResponse, GetOpeningStatsResponse, OpeningRecord, ColorRecord, GameFilter, RecentGameItem } from "../server";
import { requireAuthInView, ensureAuthInFetch } from "../lib/authHelpers";
import { ANALYSIS_NONE, ANALYSIS_PENDING, ANALYSIS_ANALYZING, ANALYSIS_DONE, ANALYSIS_FAILED } from "../lib/analysisStatus";

type Data = {
  chesscomUsername: string;
  gameCount: number;
  stats: GetGameStatsResponse | null;
  openingStats: GetOpeningStatsResponse | null;
  recentGames: RecentGameItem[] | null;
  gamesTotal: number;
};

type ChessState = {
  usernameInput: string;
  saving: boolean;
  syncing: boolean;
  statusMessage: string;
  isError: boolean;
  expandedOpenings: Record<string, boolean>;
  filterTimeClass: string;
  filterTimePeriod: string;
  filterMinRating: string;
  filterMaxRating: string;
  activeTab: "stats" | "openings" | "games";
  gamesOffset: number;
  gamesLoading: boolean;
};

const useChessState = vlens.declareHook(
  (): ChessState => ({
    usernameInput: "",
    saving: false,
    syncing: false,
    statusMessage: "",
    isError: false,
    expandedOpenings: {},
    filterTimeClass: "",
    filterTimePeriod: "all",
    filterMinRating: "",
    filterMaxRating: "",
    activeTab: "stats",
    gamesOffset: 0,
    gamesLoading: false,
  })
);

function periodToSince(period: string): number {
  const now = Date.now() / 1000;
  switch (period) {
    case "7d":  return Math.floor(now - 7 * 86400);
    case "30d": return Math.floor(now - 30 * 86400);
    case "90d": return Math.floor(now - 90 * 86400);
    case "1y":  return Math.floor(now - 365 * 86400);
    default:    return 0;
  }
}

function buildFilter(state: ChessState): GameFilter {
  return {
    timeClass: state.filterTimeClass,
    minOpponentRating: parseInt(state.filterMinRating) || 0,
    maxOpponentRating: parseInt(state.filterMaxRating) || 0,
    since: periodToSince(state.filterTimePeriod),
  };
}

async function fetchStats(filter: GameFilter, data: Data) {
  const [[s], [os]] = await Promise.all([
    server.GetGameStats(filter),
    server.GetOpeningStats(filter),
  ]);
  data.stats = s ?? null;
  data.openingStats = os ?? null;
}

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAuthInFetch())) {
    return rpc.ok<Data>({ chesscomUsername: "", gameCount: 0, stats: null, openingStats: null, recentGames: null, gamesTotal: 0 });
  }
  const [profile] = await server.GetChessProfile({});
  const username = profile?.chesscomUsername ?? "";
  let stats: GetGameStatsResponse | null = null;
  let openingStats: GetOpeningStatsResponse | null = null;
  if (username) {
    const defaultFilter: GameFilter = { timeClass: "", minOpponentRating: 0, maxOpponentRating: 0, since: 0 };
    const [[s], [os]] = await Promise.all([
      server.GetGameStats(defaultFilter),
      server.GetOpeningStats(defaultFilter),
    ]);
    stats = s ?? null;
    openingStats = os ?? null;
  }
  return rpc.ok<Data>({
    chesscomUsername: username,
    gameCount: profile?.gameCount ?? 0,
    stats,
    openingStats,
    recentGames: null,
    gamesTotal: 0,
  });
}

async function loadRecentGames(state: ChessState, data: Data) {
  state.gamesLoading = true;
  vlens.scheduleRedraw();
  const [resp] = await server.GetRecentGames({
    filter: buildFilter(state),
    limit: 50,
    offset: state.gamesOffset,
  });
  data.recentGames = resp?.games ?? [];
  data.gamesTotal = resp?.total ?? 0;
  state.gamesLoading = false;
  vlens.scheduleRedraw();
}

export function view(
  route: string,
  prefix: string,
  data: Data
): preact.ComponentChild {
  const currentAuth = requireAuthInView();
  if (!currentAuth) {
    return null;
  }
  const state = useChessState();
  return <DashboardPage name={currentAuth.name} data={data} state={state} />;
}

async function onLogoutClicked() {
  await auth.logout();
}

async function onSaveUsername(state: ChessState, data: Data, event: Event) {
  event.preventDefault();
  state.saving = true;
  state.statusMessage = "";
  state.isError = false;
  vlens.scheduleRedraw();

  const [resp] = await server.SetChessUsername({
    chesscomUsername: state.usernameInput,
  });

  state.saving = false;
  if (resp?.success) {
    data.chesscomUsername = state.usernameInput;
    state.usernameInput = "";
    state.statusMessage = "Chess.com username saved.";
    state.isError = false;
  } else {
    state.statusMessage = resp?.error || "Failed to save username";
    state.isError = true;
  }
  vlens.scheduleRedraw();
}

async function onSyncGames(state: ChessState, data: Data, event: Event) {
  event.preventDefault();
  state.syncing = true;
  state.statusMessage = "";
  state.isError = false;
  vlens.scheduleRedraw();

  const [resp] = await server.SyncGames({});

  state.syncing = false;
  if (resp?.success) {
    data.gameCount = resp.totalGames;
    state.statusMessage = `Sync complete. ${resp.newGamesAdded} new games added. Total: ${resp.totalGames}.`;
    state.isError = false;
    await fetchStats(buildFilter(state), data);
  } else {
    state.statusMessage = resp?.error || "Sync failed";
    state.isError = true;
  }
  vlens.scheduleRedraw();
}

function onChangeUsername(state: ChessState, event: Event) {
  event.preventDefault();
  state.usernameInput = "";
  state.statusMessage = "";
  vlens.scheduleRedraw();
}

async function onFilterTimeClass(state: ChessState, data: Data, tc: string, event: Event) {
  event.preventDefault();
  state.filterTimeClass = tc;
  vlens.scheduleRedraw();
  await fetchStats(buildFilter(state), data);
  if (state.activeTab === "games") await loadRecentGames(state, data);
  vlens.scheduleRedraw();
}

async function onFilterTimePeriod(state: ChessState, data: Data, event: Event) {
  state.filterTimePeriod = (event.target as HTMLSelectElement).value;
  await fetchStats(buildFilter(state), data);
  if (state.activeTab === "games") await loadRecentGames(state, data);
  vlens.scheduleRedraw();
}

async function onApplyRatingFilter(state: ChessState, data: Data, event: Event) {
  event.preventDefault();
  await fetchStats(buildFilter(state), data);
  if (state.activeTab === "games") await loadRecentGames(state, data);
  vlens.scheduleRedraw();
}

async function onSwitchTab(state: ChessState, data: Data, tab: ChessState["activeTab"], event: Event) {
  event.preventDefault();
  state.activeTab = tab;
  if (tab === "games" && data.recentGames === null) {
    state.gamesOffset = 0;
    await loadRecentGames(state, data);
  } else {
    vlens.scheduleRedraw();
  }
}

async function onGamesPagePrev(state: ChessState, data: Data, event: Event) {
  event.preventDefault();
  if (state.gamesOffset === 0) return;
  state.gamesOffset = Math.max(0, state.gamesOffset - 50);
  await loadRecentGames(state, data);
}

async function onGamesPageNext(state: ChessState, data: Data, event: Event) {
  event.preventDefault();
  state.gamesOffset += 50;
  await loadRecentGames(state, data);
}

const TIME_CLASS_ORDER = ["bullet", "blitz", "rapid", "daily"];

function winPct(r: { wins: number; losses: number; draws: number }): string {
  const total = r.wins + r.losses + r.draws;
  if (total === 0) return "0%";
  return Math.round((r.wins / total) * 100) + "%";
}

function RecordRow({ label, r }: { label: string; r: { wins: number; losses: number; draws: number } }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{r.wins}</td>
      <td>{r.losses}</td>
      <td>{r.draws}</td>
      <td>{winPct(r)}</td>
    </tr>
  );
}

function totalColor(r: ColorRecord): number {
  return r.wins + r.losses + r.draws;
}

function totalOpening(rec: OpeningRecord): number {
  return totalColor(rec.asWhite) + totalColor(rec.asBlack);
}

function toggleOpening(state: ChessState, name: string, event: Event) {
  event.preventDefault();
  state.expandedOpenings = {
    ...state.expandedOpenings,
    [name]: !state.expandedOpenings[name],
  };
  vlens.scheduleRedraw();
}

function ColorCells({ r }: { r: ColorRecord }) {
  const total = totalColor(r);
  if (total === 0) return <><td>—</td><td>—</td><td>—</td><td>—</td></>;
  return (
    <>
      <td>{r.wins}</td>
      <td>{r.losses}</td>
      <td>{r.draws}</td>
      <td>{winPct(r)}</td>
    </>
  );
}

function OpeningsSection({
  openingStats,
  state,
}: {
  openingStats: GetOpeningStatsResponse | null;
  state: ChessState;
}) {
  if (!openingStats) return null;
  const entries = Object.entries(openingStats.byOpening).sort(
    (a, b) => totalOpening(b[1]) - totalOpening(a[1])
  );
  if (entries.length === 0) return null;

  const grandTotal = entries.reduce((sum, [, rec]) => sum + totalOpening(rec), 0);
  const threshold = grandTotal * 0.05;
  const mainEntries = entries.filter(([, rec]) => totalOpening(rec) >= threshold);
  const otherEntries = entries.filter(([, rec]) => totalOpening(rec) < threshold);

  const otherWhite: ColorRecord = { wins: 0, losses: 0, draws: 0 };
  const otherBlack: ColorRecord = { wins: 0, losses: 0, draws: 0 };
  for (const [, rec] of otherEntries) {
    otherWhite.wins += rec.asWhite.wins;
    otherWhite.losses += rec.asWhite.losses;
    otherWhite.draws += rec.asWhite.draws;
    otherBlack.wins += rec.asBlack.wins;
    otherBlack.losses += rec.asBlack.losses;
    otherBlack.draws += rec.asBlack.draws;
  }
  const otherExpanded = !!state.expandedOpenings["__other__"];

  return (
    <div class="stats-section">
      <h3>Openings</h3>
      <table class="stats-table">
        <thead>
          <tr>
            <th></th>
            <th colspan={4}>As White</th>
            <th colspan={4}>As Black</th>
          </tr>
          <tr>
            <th></th>
            <th>W</th><th>L</th><th>D</th><th>Win%</th>
            <th>W</th><th>L</th><th>D</th><th>Win%</th>
          </tr>
        </thead>
        <tbody>
          {mainEntries.map(([name, rec]) => {
            const expanded = !!state.expandedOpenings[name];
            const variations = Object.entries(rec.variations ?? {}).sort(
              (a, b) => (totalColor(b[1].asWhite) + totalColor(b[1].asBlack)) - (totalColor(a[1].asWhite) + totalColor(a[1].asBlack))
            );
            return (
              <>
                <tr key={name}>
                  <td>
                    {variations.length > 0 ? (
                      <a
                        href="#"
                        class="opening-toggle"
                        onClick={vlens.cachePartial(toggleOpening, state, name)}
                      >
                        {expanded ? "▾" : "▸"} {name}
                      </a>
                    ) : (
                      name
                    )}
                  </td>
                  <ColorCells r={rec.asWhite} />
                  <ColorCells r={rec.asBlack} />
                </tr>
                {expanded &&
                  variations.map(([varName, vr]) => (
                    <tr key={`${name}/${varName}`} class="variation-row">
                      <td style="padding-left: 1.5em">{varName}</td>
                      <ColorCells r={vr.asWhite} />
                      <ColorCells r={vr.asBlack} />
                    </tr>
                  ))}
              </>
            );
          })}
          {otherEntries.length > 0 && (
            <>
              <tr key="__other__">
                <td>
                  <a
                    href="#"
                    class="opening-toggle"
                    onClick={vlens.cachePartial(toggleOpening, state, "__other__")}
                  >
                    {otherExpanded ? "▾" : "▸"} Other ({otherEntries.length} openings)
                  </a>
                </td>
                <ColorCells r={otherWhite} />
                <ColorCells r={otherBlack} />
              </tr>
              {otherExpanded &&
                otherEntries.map(([name, rec]) => (
                  <tr key={`__other__/${name}`} class="variation-row">
                    <td style="padding-left: 1.5em">{name}</td>
                    <ColorCells r={rec.asWhite} />
                    <ColorCells r={rec.asBlack} />
                  </tr>
                ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function analysisBadge(status: number, whiteAccuracy: number, blackAccuracy: number, userColor: string): preact.ComponentChild {
  if (status === ANALYSIS_NONE) return <span class="badge badge-none">—</span>;
  if (status === ANALYSIS_PENDING) return <span class="badge badge-pending">Pending</span>;
  if (status === ANALYSIS_ANALYZING) return <span class="badge badge-analyzing">Analyzing…</span>;
  if (status === ANALYSIS_FAILED) return <span class="badge badge-failed">Failed</span>;
  if (status === ANALYSIS_DONE) {
    const acc = userColor === "white" ? whiteAccuracy : blackAccuracy;
    return <span class="badge badge-done">{acc.toFixed(1)}%</span>;
  }
  return null;
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function RecentGamesSection({
  data,
  state,
}: {
  data: Data;
  state: ChessState;
}) {
  if (state.gamesLoading && data.recentGames === null) {
    return <div class="stats-section"><p>Loading games…</p></div>;
  }
  const games = data.recentGames ?? [];
  if (games.length === 0 && !state.gamesLoading) {
    return <div class="stats-section"><p>No games found.</p></div>;
  }
  const showPrev = state.gamesOffset > 0;
  const showNext = state.gamesOffset + 50 < data.gamesTotal;
  return (
    <div class="stats-section">
      <table class="stats-table games-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Opponent</th>
            <th>Color</th>
            <th>Result</th>
            <th>Opening</th>
            <th>Rating</th>
            <th>Analysis</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => {
            const opponent = g.userColor === "white" ? g.blackUsername : g.whiteUsername;
            const opponentRating = g.userColor === "white" ? g.blackRating : g.whiteRating;
            const resultClass = g.result === "win" ? "result-win" : g.result === "loss" ? "result-loss" : "result-draw";
            return (
              <tr key={g.id} class="game-row" onClick={() => core.setRoute("/game/" + g.id)}>
                <td>{formatDate(g.startTime)}</td>
                <td>{opponent}</td>
                <td>{g.userColor === "white" ? "♙ White" : "♟ Black"}</td>
                <td class={resultClass}>{g.result.charAt(0).toUpperCase() + g.result.slice(1)}</td>
                <td class="opening-cell">{g.opening || "—"}</td>
                <td>{opponentRating}</td>
                <td>{analysisBadge(g.analysisStatus, 0, 0, g.userColor)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(showPrev || showNext) && (
        <div class="pagination">
          <button
            class="btn btn-secondary btn-sm"
            disabled={!showPrev || state.gamesLoading}
            onClick={vlens.cachePartial(onGamesPagePrev, state, data)}
          >
            ← Previous
          </button>
          <span class="pagination-info">
            {state.gamesOffset + 1}–{Math.min(state.gamesOffset + 50, data.gamesTotal)} of {data.gamesTotal}
          </span>
          <button
            class="btn btn-secondary btn-sm"
            disabled={!showNext || state.gamesLoading}
            onClick={vlens.cachePartial(onGamesPageNext, state, data)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function StatsSection({ stats }: { stats: GetGameStatsResponse | null }) {
  if (!stats) return null;
  const classes = TIME_CLASS_ORDER.filter((tc) => stats.byClass[tc]);
  return (
    <div class="stats-section">
      <h3>Record</h3>
      <table class="stats-table">
        <thead>
          <tr>
            <th></th>
            <th>W</th>
            <th>L</th>
            <th>D</th>
            <th>Win%</th>
          </tr>
        </thead>
        <tbody>
          <RecordRow label="Overall" r={stats.overall} />
          {classes.map((tc) => (
            <RecordRow key={tc} label={tc.charAt(0).toUpperCase() + tc.slice(1)} r={stats.byClass[tc]} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilterBar({ state, data }: { state: ChessState; data: Data }) {
  const timeClasses = ["", ...TIME_CLASS_ORDER];
  const timeClassLabels: Record<string, string> = { "": "All", bullet: "Bullet", blitz: "Blitz", rapid: "Rapid", daily: "Daily" };
  return (
    <div class="filter-bar">
      <div class="filter-row">
        {timeClasses.map((tc) => (
          <button
            key={tc}
            class={"filter-pill" + (state.filterTimeClass === tc ? " active" : "")}
            onClick={vlens.cachePartial(onFilterTimeClass, state, data, tc)}
          >
            {timeClassLabels[tc]}
          </button>
        ))}
      </div>
      <div class="filter-row">
        <select
          value={state.filterTimePeriod}
          onChange={vlens.cachePartial(onFilterTimePeriod, state, data)}
        >
          <option value="all">All time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="1y">Last year</option>
        </select>
      </div>
      <form class="filter-row" onSubmit={vlens.cachePartial(onApplyRatingFilter, state, data)}>
        <label>Opponent rating:</label>
        <input
          type="number"
          placeholder="Min"
          style="width:5em"
          {...vlens.attrsBindInput(vlens.ref(state, "filterMinRating"))}
        />
        <span>–</span>
        <input
          type="number"
          placeholder="Max"
          style="width:5em"
          {...vlens.attrsBindInput(vlens.ref(state, "filterMaxRating"))}
        />
        <button type="submit" class="btn btn-secondary btn-sm">Apply</button>
      </form>
    </div>
  );
}

interface DashboardPageProps {
  name: string;
  data: Data;
  state: ChessState;
}

const DashboardPage = ({ name, data, state }: DashboardPageProps) => (
  <div class="dashboard-page">
    <div class="dashboard-header">
      <h1>Welcome, {name}</h1>
      <button class="btn btn-secondary" onClick={onLogoutClicked}>
        Logout
      </button>
    </div>
    <div class="dashboard-content">
      <div class="chess-section">
        <h2>Chess.com</h2>
        {data.chesscomUsername ? (
          <div class="chess-connected">
            <p>
              Connected as <strong>{data.chesscomUsername}</strong>{" "}
              <a
                href="#"
                class="auth-link"
                onClick={vlens.cachePartial(onChangeUsername, state)}
              >
                Change
              </a>
            </p>
            <p class="game-count">{data.gameCount} games synced</p>
            <button
              class="btn btn-primary"
              disabled={state.syncing}
              onClick={vlens.cachePartial(onSyncGames, state, data)}
            >
              {state.syncing ? "Syncing..." : "Sync Games"}
            </button>
          </div>
        ) : (
          <form
            class="chess-username-form"
            onSubmit={vlens.cachePartial(onSaveUsername, state, data)}
          >
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
            <button
              type="submit"
              class="btn btn-primary"
              disabled={state.saving}
            >
              {state.saving ? "Saving..." : "Save Username"}
            </button>
          </form>
        )}
        {state.statusMessage && (
          <p class={state.isError ? "error-message" : "success-message"}>
            {state.statusMessage}
          </p>
        )}
        {data.chesscomUsername && (
          <>
            <FilterBar state={state} data={data} />
            <div class="tab-strip">
              <button
                class={"tab-btn" + (state.activeTab === "stats" ? " active" : "")}
                onClick={vlens.cachePartial(onSwitchTab, state, data, "stats")}
              >Stats</button>
              <button
                class={"tab-btn" + (state.activeTab === "openings" ? " active" : "")}
                onClick={vlens.cachePartial(onSwitchTab, state, data, "openings")}
              >Openings</button>
              <button
                class={"tab-btn" + (state.activeTab === "games" ? " active" : "")}
                onClick={vlens.cachePartial(onSwitchTab, state, data, "games")}
              >Recent Games</button>
            </div>
            {state.activeTab === "stats" && <StatsSection stats={data.stats} />}
            {state.activeTab === "openings" && <OpeningsSection openingStats={data.openingStats} state={state} />}
            {state.activeTab === "games" && <RecentGamesSection data={data} state={state} />}
          </>
        )}
      </div>
    </div>
  </div>
);
