import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as auth from "../lib/authCache";
import * as server from "../server";
import { GetGameStatsResponse, GetOpeningStatsResponse, OpeningRecord, ColorRecord, VariationRecord, GameFilter, RecentGameItem, GetRatingHistoryResponse, RatingPoint, GetWinRateTrendResponse, WinRateBucket, AccuracyPoint, GetAccuracyTrendResponse, GetFrequentOpponentsResponse, FrequentOpponentRecord, OpeningGamesAggregate, GetStreaksResponse, GetOpeningTrendResponse, MissedWinGame, GetMissedWinsResponse, GetSavedGamesResponse } from "../server";
import { requireAuthInView, ensureAuthInFetch } from "../lib/authHelpers";
import { ANALYSIS_NONE, ANALYSIS_PENDING, ANALYSIS_ANALYZING, ANALYSIS_DONE, ANALYSIS_FAILED } from "../lib/analysisStatus";

type Data = {
  chesscomUsername: string;
  gameCount: number;
  stats: GetGameStatsResponse | null;
  openingStats: GetOpeningStatsResponse | null;
  recentGames: RecentGameItem[] | null;
  gamesTotal: number;
  ratingHistory: GetRatingHistoryResponse | null;
  winRateTrend: GetWinRateTrendResponse | null;
  accuracyTrend: GetAccuracyTrendResponse | null;
  frequentOpponents: GetFrequentOpponentsResponse | null;
  streaks: GetStreaksResponse | null;
  missedWins: GetMissedWinsResponse | null;
  savedGames: GetSavedGamesResponse | null;
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
  activeTab: "stats" | "openings" | "games" | "opponents";
  gamesOffset: number;
  gamesLoading: boolean;
  analyzingAll: boolean;
  ratingChartSeries: Record<string, boolean>;
  openingExplorer: Record<string, { games: RecentGameItem[]; total: number; aggregate: OpeningGamesAggregate | null; offset: number; loading: boolean }>;
  openingTrends: Record<string, WinRateBucket[]>;
  expandedGameSections: Record<string, boolean>;
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
    analyzingAll: false,
    ratingChartSeries: { bullet: true, blitz: true, rapid: true, daily: true },
    openingExplorer: {},
    openingTrends: {},
    expandedGameSections: {},
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
  const [[s], [os], [rh], [wrt], [at], [fo], [mw], [sg]] = await Promise.all([
    server.GetGameStats(filter),
    server.GetOpeningStats(filter),
    server.GetRatingHistory(filter),
    server.GetWinRateTrend(filter),
    server.GetAccuracyTrend(filter),
    server.GetFrequentOpponents(filter),
    server.GetMissedWins(filter),
    server.GetSavedGames(filter),
  ]);
  data.stats = s ?? null;
  data.openingStats = os ?? null;
  data.ratingHistory = rh ?? null;
  data.winRateTrend = wrt ?? null;
  data.accuracyTrend = at ?? null;
  data.frequentOpponents = fo ?? null;
  data.missedWins = mw ?? null;
  data.savedGames = sg ?? null;
}

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAuthInFetch())) {
    return rpc.ok<Data>({ chesscomUsername: "", gameCount: 0, stats: null, openingStats: null, recentGames: null, gamesTotal: 0, ratingHistory: null, winRateTrend: null, accuracyTrend: null, frequentOpponents: null, streaks: null, missedWins: null, savedGames: null });
  }
  const [profile] = await server.GetChessProfile({});
  const username = profile?.chesscomUsername ?? "";
  let stats: GetGameStatsResponse | null = null;
  let openingStats: GetOpeningStatsResponse | null = null;
  let ratingHistory: GetRatingHistoryResponse | null = null;
  let winRateTrend: GetWinRateTrendResponse | null = null;
  let accuracyTrend: GetAccuracyTrendResponse | null = null;
  let frequentOpponents: GetFrequentOpponentsResponse | null = null;
  let streaks: GetStreaksResponse | null = null;
  let missedWins: GetMissedWinsResponse | null = null;
  let savedGames: GetSavedGamesResponse | null = null;
  if (username) {
    const defaultFilter: GameFilter = { timeClass: "", minOpponentRating: 0, maxOpponentRating: 0, since: 0 };
    const [[s], [os], [rh], [wrt], [at], [fo], [st], [mw], [sg]] = await Promise.all([
      server.GetGameStats(defaultFilter),
      server.GetOpeningStats(defaultFilter),
      server.GetRatingHistory(defaultFilter),
      server.GetWinRateTrend(defaultFilter),
      server.GetAccuracyTrend(defaultFilter),
      server.GetFrequentOpponents(defaultFilter),
      server.GetStreaks({}),
      server.GetMissedWins(defaultFilter),
      server.GetSavedGames(defaultFilter),
    ]);
    stats = s ?? null;
    openingStats = os ?? null;
    ratingHistory = rh ?? null;
    winRateTrend = wrt ?? null;
    accuracyTrend = at ?? null;
    frequentOpponents = fo ?? null;
    streaks = st ?? null;
    missedWins = mw ?? null;
    savedGames = sg ?? null;
  }
  const gameCount = profile?.gameCount ?? 0;
  if (username && gameCount < 1000) {
    await server.SyncGames({});
    await server.RequestAllGameAnalysis({});
    const [updatedProfile] = await server.GetChessProfile({});
    return rpc.ok<Data>({
      chesscomUsername: username,
      gameCount: updatedProfile?.gameCount ?? gameCount,
      stats,
      openingStats,
      recentGames: null,
      gamesTotal: 0,
      ratingHistory,
      winRateTrend,
      accuracyTrend,
      frequentOpponents,
      streaks,
      missedWins,
      savedGames,
    });
  }
  return rpc.ok<Data>({
    chesscomUsername: username,
    gameCount,
    stats,
    openingStats,
    recentGames: null,
    gamesTotal: 0,
    ratingHistory,
    winRateTrend,
    accuracyTrend,
    frequentOpponents,
    streaks,
    missedWins,
    savedGames,
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

async function onAnalyzeAllGames(state: ChessState, _data: Data, event: Event) {
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

function onToggleRatingSeries(state: ChessState, tc: string, event: Event) {
  event.preventDefault();
  state.ratingChartSeries = { ...state.ratingChartSeries, [tc]: !state.ratingChartSeries[tc] };
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

async function onExportPgn(state: ChessState, event: Event) {
  event.preventDefault();
  const [resp] = await server.ExportPgn({ filter: buildFilter(state) });
  if (!resp || !resp.pgn) return;
  const blob = new Blob([resp.pgn], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'games.pgn';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

async function loadOpeningGames(
  state: ChessState,
  filter: GameFilter,
  opening: string,
  color: string,
  offset: number
) {
  const key = `${opening}|${color}`;
  const current = state.openingExplorer[key] ?? { games: [], total: 0, aggregate: null, offset: 0, loading: false };
  state.openingExplorer = { ...state.openingExplorer, [key]: { ...current, loading: true, offset } };
  vlens.scheduleRedraw();
  const [resp] = await server.GetOpeningGames({
    opening,
    variation: "",
    color,
    filter,
    limit: 20,
    offset,
  });
  state.openingExplorer = {
    ...state.openingExplorer,
    [key]: {
      games: resp?.games ?? [],
      total: resp?.total ?? 0,
      aggregate: resp?.aggregate ?? null,
      offset,
      loading: false,
    },
  };
  vlens.scheduleRedraw();
}

async function onToggleOpeningGames(
  state: ChessState,
  filter: GameFilter,
  opening: string,
  color: string,
  event: Event
) {
  event.preventDefault();
  const key = `${opening}|${color}`;
  if (state.openingExplorer[key]) {
    const next = { ...state.openingExplorer };
    delete next[key];
    state.openingExplorer = next;
    const nextTrends = { ...state.openingTrends };
    delete nextTrends[key];
    state.openingTrends = nextTrends;
    vlens.scheduleRedraw();
    return;
  }
  await loadOpeningGames(state, filter, opening, color, 0);
  const [trendResp] = await server.GetOpeningTrend({ opening, color, filter });
  state.openingTrends = { ...state.openingTrends, [key]: trendResp?.buckets ?? [] };
  vlens.scheduleRedraw();
}

// Pagination wrapper that uses the composite key to stay within cachePartial's 4-arg limit.
async function onOpeningExplorerPage(state: ChessState, filter: GameFilter, key: string, offset: number, event: Event) {
  event.preventDefault();
  const sep = key.lastIndexOf("|");
  const opening = key.slice(0, sep);
  const color = key.slice(sep + 1);
  await loadOpeningGames(state, filter, opening, color, offset);
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

function formatOpeningEval(r: ColorRecord): preact.ComponentChild {
  if (!r.openingEvalN) return <td style="color:var(--text-muted)">—</td>;
  const avg = r.openingEvalSum / r.openingEvalN;
  const pawns = avg / 100;
  const text = (pawns >= 0 ? "+" : "") + pawns.toFixed(1);
  const cls = avg >= 30 ? "eval-pos" : avg <= -30 ? "eval-neg" : "";
  return <td class={cls}>{text}</td>;
}

function ColorCells({ r }: { r: ColorRecord }) {
  const total = totalColor(r);
  if (total === 0) return <><td>—</td><td>—</td><td>—</td><td>—</td><td style="color:var(--text-muted)">—</td></>;
  return (
    <>
      <td>{r.wins}</td>
      <td>{r.losses}</td>
      <td>{r.draws}</td>
      <td>{winPct(r)}</td>
      {formatOpeningEval(r)}
    </>
  );
}

function OpeningColorSection({
  title,
  entries,
  getColor,
  getVariationColor,
  otherKey,
  state,
  filter,
  color,
}: {
  title: string;
  entries: [string, OpeningRecord][];
  getColor: (rec: OpeningRecord) => ColorRecord;
  getVariationColor: (vr: VariationRecord) => ColorRecord;
  otherKey: string;
  state: ChessState;
  filter: GameFilter;
  color: string;
}) {
  const withGames = entries.filter(([, rec]) => totalColor(getColor(rec)) > 0);
  if (withGames.length === 0) return null;

  const sorted = [...withGames].sort((a, b) => totalColor(getColor(b[1])) - totalColor(getColor(a[1])));
  const grandTotal = sorted.reduce((sum, [, rec]) => sum + totalColor(getColor(rec)), 0);
  const threshold = grandTotal * 0.05;
  const mainEntries = sorted.filter(([, rec]) => totalColor(getColor(rec)) >= threshold);
  const otherEntries = sorted.filter(([, rec]) => totalColor(getColor(rec)) < threshold);

  const otherAgg: ColorRecord = { wins: 0, losses: 0, draws: 0, openingEvalSum: 0, openingEvalN: 0, boardSvg: "" };
  for (const [, rec] of otherEntries) {
    const c = getColor(rec);
    otherAgg.wins += c.wins;
    otherAgg.losses += c.losses;
    otherAgg.draws += c.draws;
    otherAgg.openingEvalSum += c.openingEvalSum ?? 0;
    otherAgg.openingEvalN += c.openingEvalN ?? 0;
  }
  const otherExpanded = !!state.expandedOpenings[otherKey];

  return (
    <div class="stats-section">
      <h3>{title}</h3>
      <table class="stats-table">
        <thead>
          <tr>
            <th></th>
            <th>W</th><th>L</th><th>D</th><th>Win%</th><th>Opening</th>
          </tr>
        </thead>
        <tbody>
          {mainEntries.map(([name, rec]) => {
            const expanded = !!state.expandedOpenings[name];
            const variations = Object.entries(rec.variations ?? {})
              .filter(([, vr]) => totalColor(getVariationColor(vr)) > 0)
              .sort((a, b) => totalColor(getVariationColor(b[1])) - totalColor(getVariationColor(a[1])));
            const boardSvg = getColor(rec).boardSvg;
            const hasDetails = variations.length > 0 || !!boardSvg;
            return (
              <>
                <tr key={name}>
                  <td>
                    {hasDetails ? (
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
                    {" "}
                    <a
                      href="#"
                      class="opening-explorer-btn"
                      onClick={vlens.cachePartial(onToggleOpeningGames, state, filter, name, color)}
                    >
                      {state.openingExplorer[`${name}|${color}`] ? "▲ Games" : "▼ Games"}
                    </a>
                  </td>
                  <ColorCells r={getColor(rec)} />
                </tr>
                {expanded && boardSvg && (
                  <tr key={`${name}/__board__`}>
                    <td colspan={6} class="opening-board-cell">
                      <div class="opening-board-svg" dangerouslySetInnerHTML={{ __html: boardSvg }} />
                    </td>
                  </tr>
                )}
                {expanded &&
                  variations.map(([varName, vr]) => (
                    <tr key={`${name}/${varName}`} class="variation-row">
                      <td style="padding-left: 1.5em">{varName}</td>
                      <ColorCells r={getVariationColor(vr)} />
                    </tr>
                  ))}
                <OpeningGamesPanel opening={name} color={color} state={state} filter={filter} />
              </>
            );
          })}
          {otherEntries.length > 0 && (
            <>
              <tr key={otherKey}>
                <td>
                  <a
                    href="#"
                    class="opening-toggle"
                    onClick={vlens.cachePartial(toggleOpening, state, otherKey)}
                  >
                    {otherExpanded ? "▾" : "▸"} Other ({otherEntries.length} openings)
                  </a>
                </td>
                <ColorCells r={otherAgg} />
              </tr>
              {otherExpanded &&
                otherEntries.map(([name, rec]) => (
                  <tr key={`${otherKey}/${name}`} class="variation-row">
                    <td style="padding-left: 1.5em">{name}</td>
                    <ColorCells r={getColor(rec)} />
                  </tr>
                ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

const TREND_W = 500;
const TREND_H = 120;
const TREND_PAD_LEFT = 36;
const TREND_PAD_RIGHT = 8;
const TREND_PAD_TOP = 8;
const TREND_PAD_BOTTOM = 20;
const TREND_PLOT_W = TREND_W - TREND_PAD_LEFT - TREND_PAD_RIGHT;
const TREND_PLOT_H = TREND_H - TREND_PAD_TOP - TREND_PAD_BOTTOM;

function OpeningTrendChart({ buckets }: { buckets: WinRateBucket[] }) {
  const minTime = buckets[0].periodStart;
  const maxTime = buckets[buckets.length - 1].periodStart;
  const timeSpan = maxTime - minTime || 1;

  function toX(ts: number): number {
    return TREND_PAD_LEFT + ((ts - minTime) / timeSpan) * TREND_PLOT_W;
  }
  function toY(pct: number): number {
    return TREND_PAD_TOP + (1 - pct / 100) * TREND_PLOT_H;
  }
  function formatXLabel(ts: number): string {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }

  const yTicks = [0, 50, 100];

  return (
    <div class="opening-trend-chart">
      <div class="opening-trend-title">Win rate trend</div>
      <svg
        viewBox={`0 0 ${TREND_W} ${TREND_H}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        style="width:100%;max-width:500px;display:block"
      >
        {yTicks.map(tick => {
          const y = toY(tick);
          return (
            <g key={tick}>
              <line x1={TREND_PAD_LEFT} y1={y} x2={TREND_W - TREND_PAD_RIGHT} y2={y} stroke="var(--border-muted)" stroke-width="1" />
              <text x={TREND_PAD_LEFT - 4} y={y + 4} text-anchor="end" font-size="9" fill="var(--text-muted)">{tick}%</text>
            </g>
          );
        })}
        <text x={toX(minTime)} y={TREND_H - 4} text-anchor="start" font-size="9" fill="var(--text-muted)">{formatXLabel(minTime)}</text>
        {maxTime !== minTime && (
          <text x={toX(maxTime)} y={TREND_H - 4} text-anchor="end" font-size="9" fill="var(--text-muted)">{formatXLabel(maxTime)}</text>
        )}
        <polyline
          points={buckets.map(b => {
            const t = b.wins + b.losses + b.draws;
            const pct = t ? (b.wins / t) * 100 : 0;
            return `${toX(b.periodStart).toFixed(1)},${toY(pct).toFixed(1)}`;
          }).join(" ")}
          fill="none"
          stroke={WIN_RATE_COLORS.wins}
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        {buckets.map((b, i) => {
          const t = b.wins + b.losses + b.draws;
          const pct = t ? (b.wins / t) * 100 : 0;
          return (
            <circle
              key={i}
              cx={toX(b.periodStart).toFixed(1)}
              cy={toY(pct).toFixed(1)}
              r="3"
              fill={WIN_RATE_COLORS.wins}
              stroke="var(--bg)"
              stroke-width="1"
            />
          );
        })}
      </svg>
    </div>
  );
}

function OpeningGamesPanel({
  opening,
  color,
  state,
  filter,
}: {
  opening: string;
  color: string;
  state: ChessState;
  filter: GameFilter;
}) {
  const key = `${opening}|${color}`;
  const explorer = state.openingExplorer[key];
  if (!explorer) return null;
  const trendBuckets = state.openingTrends[key] ?? [];

  const { games, total, aggregate, offset, loading } = explorer;
  const showPrev = offset > 0;
  const showNext = offset + 20 < total;

  return (
    <tr key={`${key}/__explorer__`}>
      <td colspan={6} class="opening-explorer-panel">
        {loading && <p class="opening-explorer-loading">Loading…</p>}
        {!loading && aggregate && (
          <div class="opening-explorer-agg">
            <span class="result-win">{aggregate.wins}W</span>{" "}
            <span class="result-loss">{aggregate.losses}L</span>{" "}
            <span class="result-draw">{aggregate.draws}D</span>
            {aggregate.accuracyCount > 0 && (
              <span class="opening-explorer-accuracy"> · avg accuracy {aggregate.avgAccuracy.toFixed(1)}%</span>
            )}
            <span class="opening-explorer-total"> ({total} game{total === 1 ? "" : "s"})</span>
          </div>
        )}
        {!loading && trendBuckets.length > 1 && (
          <OpeningTrendChart buckets={trendBuckets} />
        )}
        {!loading && games.length > 0 && (
          <table class="stats-table games-table opening-explorer-table">
            <thead>
              <tr>
                <th>Date</th><th>Opponent</th><th>Result</th><th>Rating</th><th>Analysis</th>
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
                    <td class={resultClass}>{g.result.charAt(0).toUpperCase() + g.result.slice(1)}</td>
                    <td>{opponentRating}</td>
                    <td>{analysisBadge(g.analysisStatus, 0, 0, g.userColor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {(showPrev || showNext) && (
          <div class="pagination">
            <button
              class="btn btn-secondary btn-sm"
              disabled={!showPrev || loading}
              onClick={vlens.cachePartial(onOpeningExplorerPage, state, filter, key, offset - 20)}
            >← Previous</button>
            <span class="pagination-info">{offset + 1}–{Math.min(offset + 20, total)} of {total}</span>
            <button
              class="btn btn-secondary btn-sm"
              disabled={!showNext || loading}
              onClick={vlens.cachePartial(onOpeningExplorerPage, state, filter, key, offset + 20)}
            >Next →</button>
          </div>
        )}
      </td>
    </tr>
  );
}

function OpeningsSection({
  openingStats,
  state,
  filter,
}: {
  openingStats: GetOpeningStatsResponse | null;
  state: ChessState;
  filter: GameFilter;
}) {
  if (!openingStats) return null;
  const entries = Object.entries(openingStats.byOpening);
  if (entries.length === 0) return null;

  return (
    <>
      <OpeningColorSection
        title="Openings as White"
        entries={entries}
        getColor={(rec) => rec.asWhite}
        getVariationColor={(vr) => vr.asWhite}
        otherKey="__other_white__"
        state={state}
        filter={filter}
        color="white"
      />
      <OpeningColorSection
        title="Openings as Black"
        entries={entries}
        getColor={(rec) => rec.asBlack}
        getVariationColor={(vr) => vr.asBlack}
        otherKey="__other_black__"
        state={state}
        filter={filter}
        color="black"
      />
    </>
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
      <div class="games-section-header">
        <span class="games-count">{data.gamesTotal} game{data.gamesTotal === 1 ? "" : "s"}</span>
        <button class="btn btn-secondary btn-sm" onClick={vlens.cachePartial(onExportPgn, state)}>
          Download PGN
        </button>
      </div>
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

const CHART_W = 600;
const CHART_H = 180;
const PAD_LEFT = 42;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 24;
const PLOT_W = CHART_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = CHART_H - PAD_TOP - PAD_BOTTOM;

const SERIES_COLORS: Record<string, string> = {
  bullet: "#58a6ff",
  blitz: "#d29922",
  rapid: "#3fb950",
  daily: "#8b949e",
};

function RatingChart({ ratingHistory, state }: { ratingHistory: GetRatingHistoryResponse; state: ChessState }) {
  const points = ratingHistory.points;
  if (points.length === 0) {
    return (
      <div class="stats-section">
        <p style="color:var(--text-muted);font-size:13px">No rating data in this period.</p>
      </div>
    );
  }

  const visibleClasses = Object.entries(state.ratingChartSeries).filter(([, on]) => on).map(([tc]) => tc);
  const visiblePoints = points.filter(p => visibleClasses.includes(p.timeClass));

  const minTime = points[0].startTime;
  const maxTime = points[points.length - 1].startTime;
  const timeSpan = maxTime - minTime || 1;

  const visRatings = visiblePoints.map(p => p.rating);
  const allRatings = points.map(p => p.rating);
  const ratingMin = Math.min(...(visRatings.length ? visRatings : allRatings));
  const ratingMax = Math.max(...(visRatings.length ? visRatings : allRatings));
  const ratingSpan = ratingMax - ratingMin || 50;
  const rPad = ratingSpan * 0.05;
  const rMin = ratingMin - rPad;
  const rMax = ratingMax + rPad;
  const rRange = rMax - rMin;

  function toX(ts: number): number {
    return PAD_LEFT + ((ts - minTime) / timeSpan) * PLOT_W;
  }
  function toY(rating: number): number {
    return PAD_TOP + (1 - (rating - rMin) / rRange) * PLOT_H;
  }

  const byClass: Record<string, RatingPoint[]> = {};
  for (const p of visiblePoints) {
    if (!byClass[p.timeClass]) byClass[p.timeClass] = [];
    byClass[p.timeClass].push(p);
  }

  const tickStep = Math.ceil(ratingSpan / 4 / 25) * 25 || 25;
  const firstTick = Math.ceil(rMin / 25) * 25;
  const ticks: number[] = [];
  for (let t = firstTick; t <= rMax; t += tickStep) ticks.push(t);

  function formatXLabel(ts: number): string {
    const d = new Date(ts * 1000);
    if (timeSpan < 8 * 86400) {
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }

  const presentClasses = TIME_CLASS_ORDER.filter(tc => points.some(p => p.timeClass === tc));

  return (
    <div class="rating-chart-section">
      <div class="rating-chart-header">
        <h3 style="margin:0">Rating Over Time</h3>
        <div class="rating-chart-legend">
          {presentClasses.map(tc => (
            <button
              key={tc}
              class={"rating-legend-pill" + (state.ratingChartSeries[tc] ? " active" : "")}
              style={state.ratingChartSeries[tc] ? `border-color:${SERIES_COLORS[tc]};color:${SERIES_COLORS[tc]}` : ""}
              onClick={vlens.cachePartial(onToggleRatingSeries, state, tc)}
            >
              {tc.charAt(0).toUpperCase() + tc.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <svg
        class="rating-chart"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        {ticks.map(tick => {
          const y = toY(tick);
          return (
            <g key={tick}>
              <line x1={PAD_LEFT} y1={y} x2={CHART_W - PAD_RIGHT} y2={y} stroke="var(--border-muted)" stroke-width="1" />
              <text x={PAD_LEFT - 4} y={y + 4} text-anchor="end" font-size="10" fill="var(--text-muted)">{tick}</text>
            </g>
          );
        })}
        <text x={toX(minTime)} y={CHART_H - 4} text-anchor="start" font-size="10" fill="var(--text-muted)">{formatXLabel(minTime)}</text>
        {maxTime !== minTime && (
          <text x={toX(maxTime)} y={CHART_H - 4} text-anchor="end" font-size="10" fill="var(--text-muted)">{formatXLabel(maxTime)}</text>
        )}
        {Object.entries(byClass).map(([tc, pts]) => {
          const polyPoints = pts.map(p => `${toX(p.startTime).toFixed(1)},${toY(p.rating).toFixed(1)}`).join(" ");
          return (
            <polyline
              key={tc}
              points={polyPoints}
              fill="none"
              stroke={SERIES_COLORS[tc] ?? "#8b949e"}
              stroke-width="1.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          );
        })}
        {visiblePoints.map((p, i) => {
          const fill = p.result === "win" ? "var(--win)" : p.result === "loss" ? "var(--loss)" : "var(--draw)";
          return (
            <circle
              key={i}
              cx={toX(p.startTime).toFixed(1)}
              cy={toY(p.rating).toFixed(1)}
              r="3"
              fill={fill}
              stroke="var(--bg)"
              stroke-width="1"
            />
          );
        })}
      </svg>
    </div>
  );
}

const WIN_RATE_COLORS = {
  wins: "#3fb950",
  losses: "#f85149",
  draws: "#8b949e",
};

function WinRateChart({ winRateTrend }: { winRateTrend: GetWinRateTrendResponse }) {
  const buckets = winRateTrend.buckets;
  if (buckets.length === 0) return null;

  const minTime = buckets[0].periodStart;
  const maxTime = buckets[buckets.length - 1].periodStart;
  const timeSpan = maxTime - minTime || 1;

  function toX(ts: number): number {
    return PAD_LEFT + ((ts - minTime) / timeSpan) * PLOT_W;
  }
  function toY(pct: number): number {
    return PAD_TOP + (1 - pct / 100) * PLOT_H;
  }

  function formatXLabel(ts: number): string {
    const d = new Date(ts * 1000);
    if (timeSpan < 8 * 86400) {
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }

  const yTicks = [0, 25, 50, 75, 100];

  type SeriesKey = "wins" | "losses" | "draws";
  const series: { key: SeriesKey; label: string; pct: (b: WinRateBucket) => number }[] = [
    { key: "wins",   label: "Wins",   pct: b => { const t = b.wins + b.losses + b.draws; return t ? (b.wins / t) * 100 : 0; } },
    { key: "losses", label: "Losses", pct: b => { const t = b.wins + b.losses + b.draws; return t ? (b.losses / t) * 100 : 0; } },
    { key: "draws",  label: "Draws",  pct: b => { const t = b.wins + b.losses + b.draws; return t ? (b.draws / t) * 100 : 0; } },
  ];

  return (
    <div class="rating-chart-section">
      <div class="rating-chart-header">
        <h3 style="margin:0">Win Rate Over Time</h3>
        <div class="rating-chart-legend">
          {series.map(s => (
            <span
              key={s.key}
              class="rating-legend-pill active"
              style={`border-color:${WIN_RATE_COLORS[s.key]};color:${WIN_RATE_COLORS[s.key]}`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <svg
        class="rating-chart"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        {yTicks.map(tick => {
          const y = toY(tick);
          return (
            <g key={tick}>
              <line x1={PAD_LEFT} y1={y} x2={CHART_W - PAD_RIGHT} y2={y} stroke="var(--border-muted)" stroke-width="1" />
              <text x={PAD_LEFT - 4} y={y + 4} text-anchor="end" font-size="10" fill="var(--text-muted)">{tick}%</text>
            </g>
          );
        })}
        <text x={toX(minTime)} y={CHART_H - 4} text-anchor="start" font-size="10" fill="var(--text-muted)">{formatXLabel(minTime)}</text>
        {maxTime !== minTime && (
          <text x={toX(maxTime)} y={CHART_H - 4} text-anchor="end" font-size="10" fill="var(--text-muted)">{formatXLabel(maxTime)}</text>
        )}
        {series.map(s => {
          const polyPoints = buckets.map(b => `${toX(b.periodStart).toFixed(1)},${toY(s.pct(b)).toFixed(1)}`).join(" ");
          return (
            <polyline
              key={s.key}
              points={polyPoints}
              fill="none"
              stroke={WIN_RATE_COLORS[s.key]}
              stroke-width="1.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          );
        })}
        {buckets.map((b, i) => {
          const t = b.wins + b.losses + b.draws;
          const winPct = t ? (b.wins / t) * 100 : 0;
          return (
            <circle
              key={i}
              cx={toX(b.periodStart).toFixed(1)}
              cy={toY(winPct).toFixed(1)}
              r="3"
              fill={WIN_RATE_COLORS.wins}
              stroke="var(--bg)"
              stroke-width="1"
            />
          );
        })}
      </svg>
    </div>
  );
}

function AccuracyTrendChart({ accuracyTrend }: { accuracyTrend: GetAccuracyTrendResponse }) {
  const points = accuracyTrend.points;
  if (points.length === 0) return null;

  const minTime = points[0].startTime;
  const maxTime = points[points.length - 1].startTime;
  const timeSpan = maxTime - minTime || 1;

  function toX(ts: number): number {
    return PAD_LEFT + ((ts - minTime) / timeSpan) * PLOT_W;
  }
  function toY(pct: number): number {
    return PAD_TOP + (1 - pct / 100) * PLOT_H;
  }

  function formatXLabel(ts: number): string {
    const d = new Date(ts * 1000);
    if (timeSpan < 8 * 86400) {
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }

  const rollingPolyPoints = points.map(p => `${toX(p.startTime).toFixed(1)},${toY(p.rollingAvg).toFixed(1)}`).join(" ");

  return (
    <div class="rating-chart-section">
      <div class="rating-chart-header">
        <h3 style="margin:0">Accuracy Trend (10-game rolling avg)</h3>
      </div>
      <svg
        class="rating-chart"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        {[0, 25, 50, 75, 100].map(pct => {
          const y = toY(pct);
          return (
            <g key={pct}>
              <line x1={PAD_LEFT} y1={y} x2={CHART_W - PAD_RIGHT} y2={y} stroke="var(--border-muted)" stroke-width="1" />
              <text x={PAD_LEFT - 4} y={y + 4} text-anchor="end" font-size="10" fill="var(--text-muted)">{pct}</text>
            </g>
          );
        })}
        <text x={toX(minTime)} y={CHART_H - 4} text-anchor="start" font-size="10" fill="var(--text-muted)">{formatXLabel(minTime)}</text>
        {maxTime !== minTime && (
          <text x={toX(maxTime)} y={CHART_H - 4} text-anchor="end" font-size="10" fill="var(--text-muted)">{formatXLabel(maxTime)}</text>
        )}
        {points.map((p, i) => {
          const fill = p.result === "win" ? "var(--win)" : p.result === "loss" ? "var(--loss)" : "var(--draw)";
          return (
            <circle
              key={i}
              cx={toX(p.startTime).toFixed(1)}
              cy={toY(p.accuracy).toFixed(1)}
              r="2.5"
              fill={fill}
              opacity="0.5"
              stroke="none"
            />
          );
        })}
        <polyline
          points={rollingPolyPoints}
          fill="none"
          stroke="#58a6ff"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
    </div>
  );
}

function FrequentOpponentsSection({ frequentOpponents }: { frequentOpponents: GetFrequentOpponentsResponse | null }) {
  if (!frequentOpponents || frequentOpponents.opponents.length === 0) {
    return <div class="stats-section"><p style="color:var(--text-muted)">No opponent data yet.</p></div>;
  }
  return (
    <div class="stats-section">
      <h3>Frequent Opponents</h3>
      <table class="stats-table">
        <thead>
          <tr>
            <th>Opponent</th>
            <th>Games</th>
            <th>W</th>
            <th>L</th>
            <th>D</th>
            <th>Win%</th>
            <th>Avg Rating</th>
          </tr>
        </thead>
        <tbody>
          {frequentOpponents.opponents.map((opp: FrequentOpponentRecord) => {
            const total = opp.wins + opp.losses + opp.draws;
            const pct = total > 0 ? Math.round((opp.wins / total) * 100) + "%" : "0%";
            return (
              <tr key={opp.username}>
                <td>{opp.username}</td>
                <td>{total}</td>
                <td>{opp.wins}</td>
                <td>{opp.losses}</td>
                <td>{opp.draws}</td>
                <td>{pct}</td>
                <td>{opp.avgRating > 0 ? opp.avgRating : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StreaksSection({ streaks }: { streaks: GetStreaksResponse | null }) {
  if (!streaks) return null;
  const { currentWinStreak, longestWinStreak, currentDailyStreak, longestDailyStreak } = streaks;
  if (longestWinStreak === 0 && longestDailyStreak === 0) return null;
  return (
    <div class="stats-section streaks-section">
      <h3>Streaks</h3>
      <div class="streaks-grid">
        <div class="streak-card">
          <div class="streak-value">{currentWinStreak}</div>
          <div class="streak-label">Current Win Streak</div>
        </div>
        <div class="streak-card">
          <div class="streak-value">{longestWinStreak}</div>
          <div class="streak-label">Longest Win Streak</div>
        </div>
        <div class="streak-card">
          <div class="streak-value">{currentDailyStreak}</div>
          <div class="streak-label">Current Daily Streak</div>
        </div>
        <div class="streak-card">
          <div class="streak-value">{longestDailyStreak}</div>
          <div class="streak-label">Longest Daily Streak</div>
        </div>
      </div>
    </div>
  );
}

function toggleGameSection(state: ChessState, key: string, event: Event) {
  event.preventDefault();
  state.expandedGameSections = {
    ...state.expandedGameSections,
    [key]: !state.expandedGameSections[key],
  };
  vlens.scheduleRedraw();
}

function GameExtremeRow({ g, evalLabel }: { g: MissedWinGame; evalLabel: string }) {
  const date = new Date(g.startTime * 1000).toLocaleDateString();
  const evalDisplay = g.peakEval >= 10000 ? `+M` : `+${(g.peakEval / 100).toFixed(1)}`;
  return (
    <tr key={g.gameId}>
      <td><a href={"/game/" + g.gameId}>{date}</a></td>
      <td>{g.opponent} ({g.opponentRating})</td>
      <td>{g.userColor}</td>
      <td class={"result-" + g.result}>{g.result}</td>
      <td>{g.opening || "—"}</td>
      <td title={evalLabel}>{evalDisplay}</td>
      <td>{g.peakEvalMove}</td>
    </tr>
  );
}

function GameExtremeSection({ sectionKey, title, subtitle, games, evalLabel, state }: { sectionKey: string; title: string; subtitle: string; games: MissedWinGame[]; evalLabel: string; state: ChessState }) {
  if (!games || games.length === 0) return null;
  const expanded = state.expandedGameSections[sectionKey];
  return (
    <div class="stats-section">
      <h3 class="collapsible-header" onClick={vlens.cachePartial(toggleGameSection, state, sectionKey)}>
        {title} ({games.length}) <span class="collapse-arrow">{expanded ? "▲" : "▼"}</span>
      </h3>
      {expanded && (
        <>
          <p class="section-subtitle">{subtitle}</p>
          <table class="stats-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Opponent</th>
                <th>Color</th>
                <th>Result</th>
                <th>Opening</th>
                <th>Peak Eval</th>
                <th>At Move</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => <GameExtremeRow g={g} evalLabel={evalLabel} />)}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function StatsSection({ stats, ratingHistory, winRateTrend, accuracyTrend, streaks, missedWins, savedGames, state }: { stats: GetGameStatsResponse | null; ratingHistory: GetRatingHistoryResponse | null; winRateTrend: GetWinRateTrendResponse | null; accuracyTrend: GetAccuracyTrendResponse | null; streaks: GetStreaksResponse | null; missedWins: GetMissedWinsResponse | null; savedGames: GetSavedGamesResponse | null; state: ChessState }) {
  const classes = stats ? TIME_CLASS_ORDER.filter((tc) => stats.byClass[tc]) : [];
  return (
    <>
      <StreaksSection streaks={streaks} />
      {ratingHistory && ratingHistory.points?.length > 0 && (
        <RatingChart ratingHistory={ratingHistory} state={state} />
      )}
      {winRateTrend && winRateTrend.buckets?.length > 0 && (
        <WinRateChart winRateTrend={winRateTrend} />
      )}
      {accuracyTrend && accuracyTrend.points?.length > 0 && (
        <AccuracyTrendChart accuracyTrend={accuracyTrend} />
      )}
      {stats && (
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
      )}
      <GameExtremeSection
        sectionKey="missedWins"
        title="Missed Wins"
        subtitle="You had +3 or better but didn't win"
        games={missedWins?.games ?? []}
        evalLabel="Your peak advantage"
        state={state}
      />
      <GameExtremeSection
        sectionKey="savedGames"
        title="Saved Games"
        subtitle="Opponent had +3 or better but you didn't lose"
        games={savedGames?.games ?? []}
        evalLabel="Opponent's peak advantage"
        state={state}
      />
    </>
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
            <button
              class="btn btn-secondary"
              disabled={state.analyzingAll}
              onClick={vlens.cachePartial(onAnalyzeAllGames, state, data)}
            >
              {state.analyzingAll ? "Queueing..." : "Analyze All Games"}
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
              <button
                class={"tab-btn" + (state.activeTab === "opponents" ? " active" : "")}
                onClick={vlens.cachePartial(onSwitchTab, state, data, "opponents")}
              >Opponents</button>
            </div>
            {state.activeTab === "stats" && <StatsSection stats={data.stats} ratingHistory={data.ratingHistory} winRateTrend={data.winRateTrend} accuracyTrend={data.accuracyTrend} streaks={data.streaks} missedWins={data.missedWins} savedGames={data.savedGames} state={state} />}
            {state.activeTab === "openings" && <OpeningsSection openingStats={data.openingStats} state={state} filter={buildFilter(state)} />}
            {state.activeTab === "games" && <RecentGamesSection data={data} state={state} />}
            {state.activeTab === "opponents" && <FrequentOpponentsSection frequentOpponents={data.frequentOpponents} />}
          </>
        )}
      </div>
    </div>
  </div>
);
