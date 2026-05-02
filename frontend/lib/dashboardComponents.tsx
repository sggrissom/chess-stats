import * as preact from "preact";
import * as vlens from "vlens";
import * as core from "vlens/core";
import * as server from "../server";
import {
  GetGameStatsResponse, GetOpeningStatsResponse, OpeningRecord, ColorRecord, VariationRecord,
  GameFilter, RecentGameItem, GetRatingHistoryResponse, RatingPoint, GetWinRateTrendResponse,
  WinRateBucket, GetAccuracyTrendResponse, GetFrequentOpponentsResponse,
  FrequentOpponentRecord, OpeningGamesAggregate, GetStreaksResponse,
  MissedWinGame, GetMissedWinsResponse, GetSavedGamesResponse,
} from "../server";
import { ANALYSIS_NONE, ANALYSIS_PENDING, ANALYSIS_ANALYZING, ANALYSIS_DONE, ANALYSIS_FAILED } from "./analysisStatus";
import { buildFilter } from "./filterBar";
import type { FilterState } from "./filterBar";

// ─── State / Data interfaces ──────────────────────────────────────────────────

export interface StatsState {
  ratingChartSeries: Record<string, boolean>;
  expandedGameSections: Record<string, boolean>;
}

export interface OpeningsState {
  expandedOpenings: Record<string, boolean>;
  openingExplorer: Record<string, { games: RecentGameItem[]; total: number; aggregate: OpeningGamesAggregate | null; offset: number; loading: boolean }>;
  openingTrends: Record<string, WinRateBucket[]>;
}

export interface GamesState {
  gamesOffset: number;
  gamesLoading: boolean;
}

export interface StatsData {
  stats: GetGameStatsResponse | null;
  ratingHistory: GetRatingHistoryResponse | null;
  winRateTrend: GetWinRateTrendResponse | null;
  accuracyTrend: GetAccuracyTrendResponse | null;
  missedWins: GetMissedWinsResponse | null;
  savedGames: GetSavedGamesResponse | null;
}

export interface GamesData {
  recentGames: RecentGameItem[] | null;
  gamesTotal: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const TIME_CLASS_ORDER = ["bullet", "blitz", "rapid", "daily"];

const SERIES_COLORS: Record<string, string> = {
  bullet: "#58a6ff",
  blitz: "#d29922",
  rapid: "#3fb950",
  daily: "#8b949e",
};

const WIN_RATE_COLORS = {
  wins: "#3fb950",
  losses: "#f85149",
  draws: "#8b949e",
};

// ─── Shared data-fetch helpers ────────────────────────────────────────────────

export async function fetchStatsData(filter: GameFilter, data: StatsData) {
  const [[s], [rh], [wrt], [at], [mw], [sg]] = await Promise.all([
    server.GetGameStats(filter),
    server.GetRatingHistory(filter),
    server.GetWinRateTrend(filter),
    server.GetAccuracyTrend(filter),
    server.GetMissedWins(filter),
    server.GetSavedGames(filter),
  ]);
  data.stats = s ?? null;
  data.ratingHistory = rh ?? null;
  data.winRateTrend = wrt ?? null;
  data.accuracyTrend = at ?? null;
  data.missedWins = mw ?? null;
  data.savedGames = sg ?? null;
}

export async function loadRecentGames(state: FilterState & GamesState, data: GamesData) {
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

// ─── Utilities ────────────────────────────────────────────────────────────────

export function analysisBadge(status: number, whiteAccuracy: number, blackAccuracy: number, userColor: string): preact.ComponentChild {
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

export function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function winPct(r: { wins: number; losses: number; draws: number }): string {
  const total = r.wins + r.losses + r.draws;
  if (total === 0) return "0%";
  return Math.round((r.wins / total) * 100) + "%";
}

function totalColor(r: ColorRecord): number {
  return r.wins + r.losses + r.draws;
}

// ─── Export PGN ───────────────────────────────────────────────────────────────

export async function onExportPgn(state: FilterState, event: Event) {
  event.preventDefault();
  const [resp] = await server.ExportPgn({ filter: buildFilter(state) });
  if (!resp || !resp.pgn) return;
  const blob = new Blob([resp.pgn], { type: "application/x-chess-pgn" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "games.pgn";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function onCopyPgn(state: FilterState, event: Event) {
  event.preventDefault();
  const [resp] = await server.ExportPgn({ filter: buildFilter(state) });
  if (!resp || !resp.pgn) return;
  await navigator.clipboard.writeText(resp.pgn);
}

// ─── Games pagination handlers ────────────────────────────────────────────────

export async function onGamesPagePrev(state: FilterState & GamesState, data: GamesData, event: Event) {
  event.preventDefault();
  if (state.gamesOffset === 0) return;
  state.gamesOffset = Math.max(0, state.gamesOffset - 50);
  await loadRecentGames(state, data);
}

export async function onGamesPageNext(state: FilterState & GamesState, data: GamesData, event: Event) {
  event.preventDefault();
  state.gamesOffset += 50;
  await loadRecentGames(state, data);
}

// ─── Stats section handlers ───────────────────────────────────────────────────

export function onToggleRatingSeries(state: StatsState, tc: string, event: Event) {
  event.preventDefault();
  state.ratingChartSeries = { ...state.ratingChartSeries, [tc]: !state.ratingChartSeries[tc] };
  vlens.scheduleRedraw();
}

function toggleGameSection(state: StatsState, key: string, event: Event) {
  event.preventDefault();
  state.expandedGameSections = { ...state.expandedGameSections, [key]: !state.expandedGameSections[key] };
  vlens.scheduleRedraw();
}

// ─── Opening handlers ─────────────────────────────────────────────────────────

function toggleOpening(state: OpeningsState, name: string, event: Event) {
  event.preventDefault();
  state.expandedOpenings = { ...state.expandedOpenings, [name]: !state.expandedOpenings[name] };
  vlens.scheduleRedraw();
}

async function loadOpeningGames(state: OpeningsState, filter: GameFilter, opening: string, color: string, offset: number) {
  const key = `${opening}|${color}`;
  const current = state.openingExplorer[key] ?? { games: [], total: 0, aggregate: null, offset: 0, loading: false };
  state.openingExplorer = { ...state.openingExplorer, [key]: { ...current, loading: true, offset } };
  vlens.scheduleRedraw();
  const [resp] = await server.GetOpeningGames({ opening, variation: "", color, filter, limit: 20, offset });
  state.openingExplorer = {
    ...state.openingExplorer,
    [key]: { games: resp?.games ?? [], total: resp?.total ?? 0, aggregate: resp?.aggregate ?? null, offset, loading: false },
  };
  vlens.scheduleRedraw();
}

async function onToggleOpeningGames(state: OpeningsState, filter: GameFilter, opening: string, color: string, event: Event) {
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

// cachePartial 4-arg limit: use composite key
async function onOpeningExplorerPage(state: OpeningsState, filter: GameFilter, key: string, offset: number, event: Event) {
  event.preventDefault();
  const sep = key.lastIndexOf("|");
  const opening = key.slice(0, sep);
  const color = key.slice(sep + 1);
  await loadOpeningGames(state, filter, opening, color, offset);
}

// ─── Record ───────────────────────────────────────────────────────────────────

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

// ─── Streaks ──────────────────────────────────────────────────────────────────

export function StreaksSection({ streaks }: { streaks: GetStreaksResponse | null }) {
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

// ─── Charts ───────────────────────────────────────────────────────────────────

const CHART_W = 600;
const CHART_H = 180;
const PAD_LEFT = 42;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 24;
const PLOT_W = CHART_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = CHART_H - PAD_TOP - PAD_BOTTOM;

export function RatingChart({ ratingHistory, state }: { ratingHistory: GetRatingHistoryResponse; state: StatsState }) {
  const points = ratingHistory.points;
  if (points.length === 0) {
    return <div class="stats-section"><p style="color:var(--text-muted);font-size:13px">No rating data in this period.</p></div>;
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

  function toX(ts: number) { return PAD_LEFT + ((ts - minTime) / timeSpan) * PLOT_W; }
  function toY(rating: number) { return PAD_TOP + (1 - (rating - rMin) / rRange) * PLOT_H; }

  const byClass: Record<string, RatingPoint[]> = {};
  for (const p of visiblePoints) {
    if (!byClass[p.timeClass]) byClass[p.timeClass] = [];
    byClass[p.timeClass].push(p);
  }

  const tickStep = Math.ceil(ratingSpan / 4 / 25) * 25 || 25;
  const firstTick = Math.ceil(rMin / 25) * 25;
  const ticks: number[] = [];
  for (let t = firstTick; t <= rMax; t += tickStep) ticks.push(t);

  function formatXLabel(ts: number) {
    const d = new Date(ts * 1000);
    return timeSpan < 8 * 86400
      ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
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
      <svg class="rating-chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
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
        {Object.entries(byClass).map(([tc, pts]) => (
          <polyline
            key={tc}
            points={pts.map(p => `${toX(p.startTime).toFixed(1)},${toY(p.rating).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={SERIES_COLORS[tc] ?? "#8b949e"}
            stroke-width="1.5"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        ))}
        {visiblePoints.map((p, i) => (
          <circle
            key={i}
            cx={toX(p.startTime).toFixed(1)}
            cy={toY(p.rating).toFixed(1)}
            r="3"
            fill={p.result === "win" ? "var(--win)" : p.result === "loss" ? "var(--loss)" : "var(--draw)"}
            stroke="var(--bg)"
            stroke-width="1"
          />
        ))}
      </svg>
    </div>
  );
}

export function WinRateChart({ winRateTrend }: { winRateTrend: GetWinRateTrendResponse }) {
  const buckets = winRateTrend.buckets;
  if (buckets.length === 0) return null;

  const minTime = buckets[0].periodStart;
  const maxTime = buckets[buckets.length - 1].periodStart;
  const timeSpan = maxTime - minTime || 1;

  function toX(ts: number) { return PAD_LEFT + ((ts - minTime) / timeSpan) * PLOT_W; }
  function toY(pct: number) { return PAD_TOP + (1 - pct / 100) * PLOT_H; }

  function formatXLabel(ts: number) {
    const d = new Date(ts * 1000);
    return timeSpan < 8 * 86400
      ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }

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
            <span key={s.key} class="rating-legend-pill active" style={`border-color:${WIN_RATE_COLORS[s.key]};color:${WIN_RATE_COLORS[s.key]}`}>
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <svg class="rating-chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
        {[0, 25, 50, 75, 100].map(tick => {
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
        {series.map(s => (
          <polyline
            key={s.key}
            points={buckets.map(b => `${toX(b.periodStart).toFixed(1)},${toY(s.pct(b)).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={WIN_RATE_COLORS[s.key]}
            stroke-width="1.5"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        ))}
        {buckets.map((b, i) => {
          const t = b.wins + b.losses + b.draws;
          return (
            <circle
              key={i}
              cx={toX(b.periodStart).toFixed(1)}
              cy={toY(t ? (b.wins / t) * 100 : 0).toFixed(1)}
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

export function AccuracyTrendChart({ accuracyTrend }: { accuracyTrend: GetAccuracyTrendResponse }) {
  const points = accuracyTrend.points;
  if (points.length === 0) return null;

  const minTime = points[0].startTime;
  const maxTime = points[points.length - 1].startTime;
  const timeSpan = maxTime - minTime || 1;

  function toX(ts: number) { return PAD_LEFT + ((ts - minTime) / timeSpan) * PLOT_W; }
  function toY(pct: number) { return PAD_TOP + (1 - pct / 100) * PLOT_H; }

  function formatXLabel(ts: number) {
    const d = new Date(ts * 1000);
    return timeSpan < 8 * 86400
      ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }

  return (
    <div class="rating-chart-section">
      <div class="rating-chart-header">
        <h3 style="margin:0">Accuracy Trend (10-game rolling avg)</h3>
      </div>
      <svg class="rating-chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
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
        {points.map((p, i) => (
          <circle
            key={i}
            cx={toX(p.startTime).toFixed(1)}
            cy={toY(p.accuracy).toFixed(1)}
            r="2.5"
            fill={p.result === "win" ? "var(--win)" : p.result === "loss" ? "var(--loss)" : "var(--draw)"}
            opacity="0.5"
            stroke="none"
          />
        ))}
        <polyline
          points={points.map(p => `${toX(p.startTime).toFixed(1)},${toY(p.rollingAvg).toFixed(1)}`).join(" ")}
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

// ─── Game Extreme Section ─────────────────────────────────────────────────────

function GameExtremeRow({ g, evalLabel }: { g: MissedWinGame; evalLabel: string }) {
  const date = new Date(g.startTime * 1000).toLocaleDateString();
  const evalDisplay = g.peakEval >= 10000 ? "+M" : `+${(g.peakEval / 100).toFixed(1)}`;
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

export function GameExtremeSection({ sectionKey, title, subtitle, games, evalLabel, state }: {
  sectionKey: string; title: string; subtitle: string; games: MissedWinGame[]; evalLabel: string; state: StatsState;
}) {
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
                <th>Date</th><th>Opponent</th><th>Color</th><th>Result</th><th>Opening</th><th>Peak Eval</th><th>At Move</th>
              </tr>
            </thead>
            <tbody>
              {games.map(g => <GameExtremeRow g={g} evalLabel={evalLabel} />)}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ─── Stats Section ────────────────────────────────────────────────────────────

export function StatsSection({ stats, ratingHistory, winRateTrend, accuracyTrend, streaks, missedWins, savedGames, state }: {
  stats: GetGameStatsResponse | null;
  ratingHistory: GetRatingHistoryResponse | null;
  winRateTrend: GetWinRateTrendResponse | null;
  accuracyTrend: GetAccuracyTrendResponse | null;
  streaks: GetStreaksResponse | null;
  missedWins: GetMissedWinsResponse | null;
  savedGames: GetSavedGamesResponse | null;
  state: StatsState;
}) {
  const classes = stats ? TIME_CLASS_ORDER.filter(tc => stats.byClass[tc]) : [];
  return (
    <>
      <StreaksSection streaks={streaks} />
      {ratingHistory && ratingHistory.points?.length > 0 && <RatingChart ratingHistory={ratingHistory} state={state} />}
      {winRateTrend && winRateTrend.buckets?.length > 0 && <WinRateChart winRateTrend={winRateTrend} />}
      {accuracyTrend && accuracyTrend.points?.length > 0 && <AccuracyTrendChart accuracyTrend={accuracyTrend} />}
      {stats && (
        <div class="stats-section">
          <h3>Record</h3>
          <table class="stats-table">
            <thead>
              <tr><th></th><th>W</th><th>L</th><th>D</th><th>Win%</th></tr>
            </thead>
            <tbody>
              <RecordRow label="Overall" r={stats.overall} />
              {classes.map(tc => <RecordRow key={tc} label={tc.charAt(0).toUpperCase() + tc.slice(1)} r={stats.byClass[tc]} />)}
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

// ─── Opening components ───────────────────────────────────────────────────────

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

  function toX(ts: number) { return TREND_PAD_LEFT + ((ts - minTime) / timeSpan) * TREND_PLOT_W; }
  function toY(pct: number) { return TREND_PAD_TOP + (1 - pct / 100) * TREND_PLOT_H; }
  function formatXLabel(ts: number) {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }

  return (
    <div class="opening-trend-chart">
      <div class="opening-trend-title">Win rate trend</div>
      <svg viewBox={`0 0 ${TREND_W} ${TREND_H}`} preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:500px;display:block">
        {[0, 50, 100].map(tick => {
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
            return `${toX(b.periodStart).toFixed(1)},${toY(t ? (b.wins / t) * 100 : 0).toFixed(1)}`;
          }).join(" ")}
          fill="none"
          stroke={WIN_RATE_COLORS.wins}
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        {buckets.map((b, i) => {
          const t = b.wins + b.losses + b.draws;
          return (
            <circle
              key={i}
              cx={toX(b.periodStart).toFixed(1)}
              cy={toY(t ? (b.wins / t) * 100 : 0).toFixed(1)}
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

function OpeningGamesPanel({ opening, color, state, filter }: {
  opening: string; color: string; state: OpeningsState; filter: GameFilter;
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
        {!loading && trendBuckets.length > 1 && <OpeningTrendChart buckets={trendBuckets} />}
        {!loading && games.length > 0 && (
          <table class="stats-table games-table opening-explorer-table">
            <thead>
              <tr><th>Date</th><th>Opponent</th><th>Result</th><th>Rating</th><th>Analysis</th></tr>
            </thead>
            <tbody>
              {games.map(g => {
                const opponent = g.userColor === "white" ? g.blackUsername : g.whiteUsername;
                const opponentRating = g.userColor === "white" ? g.blackRating : g.whiteRating;
                const resultClass = g.result === "win" ? "result-win" : g.result === "loss" ? "result-loss" : "result-draw";
                return (
                  <tr key={g.id} class="game-row" onClick={() => core.setRoute("/game/" + g.id)}>
                    <td>{formatDate(g.startTime)}</td>
                    <td>{opponent}</td>
                    <td class={resultClass}>{g.result.charAt(0).toUpperCase() + g.result.slice(1)}</td>
                    <td>{opponentRating}</td>
                    <td>{analysisBadge(g.analysisStatus, g.whiteAccuracy, g.blackAccuracy, g.userColor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {(showPrev || showNext) && (
          <div class="pagination">
            <button class="btn btn-secondary btn-sm" disabled={!showPrev || loading} onClick={vlens.cachePartial(onOpeningExplorerPage, state, filter, key, offset - 20)}>← Previous</button>
            <span class="pagination-info">{offset + 1}–{Math.min(offset + 20, total)} of {total}</span>
            <button class="btn btn-secondary btn-sm" disabled={!showNext || loading} onClick={vlens.cachePartial(onOpeningExplorerPage, state, filter, key, offset + 20)}>Next →</button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function OpeningColorSection({ title, entries, getColor, getVariationColor, otherKey, state, filter, color }: {
  title: string;
  entries: [string, OpeningRecord][];
  getColor: (rec: OpeningRecord) => ColorRecord;
  getVariationColor: (vr: VariationRecord) => ColorRecord;
  otherKey: string;
  state: OpeningsState;
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
          <tr><th></th><th>W</th><th>L</th><th>D</th><th>Win%</th><th>Opening</th></tr>
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
                      <a href="#" class="opening-toggle" onClick={vlens.cachePartial(toggleOpening, state, name)}>
                        {expanded ? "▾" : "▸"} {name}
                      </a>
                    ) : name}
                    {" "}
                    <a href="#" class="opening-explorer-btn" onClick={vlens.cachePartial(onToggleOpeningGames, state, filter, name, color)}>
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
                {expanded && variations.map(([varName, vr]) => (
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
                  <a href="#" class="opening-toggle" onClick={vlens.cachePartial(toggleOpening, state, otherKey)}>
                    {otherExpanded ? "▾" : "▸"} Other ({otherEntries.length} openings)
                  </a>
                </td>
                <ColorCells r={otherAgg} />
              </tr>
              {otherExpanded && otherEntries.map(([name, rec]) => (
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

export function OpeningsSection({ openingStats, state, filter }: {
  openingStats: GetOpeningStatsResponse | null;
  state: OpeningsState;
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
        getColor={rec => rec.asWhite}
        getVariationColor={vr => vr.asWhite}
        otherKey="__other_white__"
        state={state}
        filter={filter}
        color="white"
      />
      <OpeningColorSection
        title="Openings as Black"
        entries={entries}
        getColor={rec => rec.asBlack}
        getVariationColor={vr => vr.asBlack}
        otherKey="__other_black__"
        state={state}
        filter={filter}
        color="black"
      />
    </>
  );
}

// ─── Recent Games Section ─────────────────────────────────────────────────────

export function RecentGamesSection({ data, state }: {
  data: GamesData;
  state: FilterState & GamesState;
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
        <button class="btn btn-secondary btn-sm" onClick={vlens.cachePartial(onCopyPgn, state)}>
          Copy PGN
        </button>
        <button class="btn btn-secondary btn-sm" onClick={vlens.cachePartial(onExportPgn, state)}>
          Download PGN
        </button>
      </div>
      <table class="stats-table games-table">
        <thead>
          <tr>
            <th>Date</th><th>Opponent</th><th>Color</th><th>Result</th><th>Opening</th><th>Rating</th><th>Analysis</th>
          </tr>
        </thead>
        <tbody>
          {games.map(g => {
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
                <td>{analysisBadge(g.analysisStatus, g.whiteAccuracy, g.blackAccuracy, g.userColor)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(showPrev || showNext) && (
        <div class="pagination">
          <button class="btn btn-secondary btn-sm" disabled={!showPrev || state.gamesLoading} onClick={vlens.cachePartial(onGamesPagePrev, state, data)}>← Previous</button>
          <span class="pagination-info">{state.gamesOffset + 1}–{Math.min(state.gamesOffset + 50, data.gamesTotal)} of {data.gamesTotal}</span>
          <button class="btn btn-secondary btn-sm" disabled={!showNext || state.gamesLoading} onClick={vlens.cachePartial(onGamesPageNext, state, data)}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ─── Frequent Opponents Section ───────────────────────────────────────────────

export function FrequentOpponentsSection({ frequentOpponents }: { frequentOpponents: GetFrequentOpponentsResponse | null }) {
  if (!frequentOpponents || frequentOpponents.opponents.length === 0) {
    return <div class="stats-section"><p style="color:var(--text-muted)">No opponent data yet.</p></div>;
  }
  return (
    <div class="stats-section">
      <h3>Frequent Opponents</h3>
      <table class="stats-table">
        <thead>
          <tr><th>Opponent</th><th>Games</th><th>W</th><th>L</th><th>D</th><th>Win%</th><th>Avg Rating</th></tr>
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
