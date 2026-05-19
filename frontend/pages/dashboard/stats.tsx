import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as server from "../../server";
import {
  GetGameStatsResponse, GetRatingHistoryResponse, GetWinRateTrendResponse,
  GetAccuracyTrendResponse, GetStreaksResponse, GetMissedWinsResponse, GetSavedGamesResponse, GameFilter,
} from "../../server";
import { requireAuthInView, ensureAuthInFetch } from "../../lib/authHelpers";
import { FilterState, FilterBar, periodToComparisonRange, periodToComparisonLabel } from "../../lib/filterBar";
import { DashboardLayout } from "../../lib/dashboardLayout";
import { StatsSection, StatsState, fetchStatsData } from "../../lib/dashboardComponents";

type Data = {
  stats: GetGameStatsResponse | null;
  comparisonStats: GetGameStatsResponse | null;
  comparisonLabel: string | null;
  ratingHistory: GetRatingHistoryResponse | null;
  winRateTrend: GetWinRateTrendResponse | null;
  accuracyTrend: GetAccuracyTrendResponse | null;
  streaks: GetStreaksResponse | null;
  missedWins: GetMissedWinsResponse | null;
  savedGames: GetSavedGamesResponse | null;
};

type State = FilterState & StatsState;

const useState = vlens.declareHook((): State => ({
  filterTimeClass: "",
  filterTimePeriod: "all",
  filterMinRating: "",
  filterMaxRating: "",
  ratingChartSeries: { bullet: true, blitz: true, rapid: true, daily: true },
  expandedGameSections: {},
}));

let _data: Data;
let _state: State;

async function refetch(filter: GameFilter) {
  const period = _state?.filterTimePeriod ?? "all";
  const compRange = periodToComparisonRange(period);
  if (compRange) {
    const compFilter: GameFilter = { ...filter, since: compRange.since, until: compRange.until };
    const [, [cs]] = await Promise.all([
      fetchStatsData(filter, _data),
      server.GetGameStats(compFilter),
    ]);
    _data.comparisonStats = cs ?? null;
  } else {
    await fetchStatsData(filter, _data);
    _data.comparisonStats = null;
  }
  _data.comparisonLabel = periodToComparisonLabel(period);
}

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAuthInFetch())) return rpc.ok<Data>({ stats: null, comparisonStats: null, comparisonLabel: null, ratingHistory: null, winRateTrend: null, accuracyTrend: null, streaks: null, missedWins: null, savedGames: null });
  const [profile] = await server.GetChessProfile({});
  if (!profile?.chesscomUsername) {
    core.setRoute("/dashboard");
    return rpc.ok<Data>({ stats: null, comparisonStats: null, comparisonLabel: null, ratingHistory: null, winRateTrend: null, accuracyTrend: null, streaks: null, missedWins: null, savedGames: null });
  }
  const defaultFilter: GameFilter = { timeClass: "", minOpponentRating: 0, maxOpponentRating: 0, since: 0, until: 0 };
  const [[s], [rh], [wrt], [at], [st], [mw], [sg]] = await Promise.all([
    server.GetGameStats(defaultFilter),
    server.GetRatingHistory(defaultFilter),
    server.GetWinRateTrend(defaultFilter),
    server.GetAccuracyTrend(defaultFilter),
    server.GetStreaks({}),
    server.GetMissedWins(defaultFilter),
    server.GetSavedGames(defaultFilter),
  ]);
  const data: Data = {
    stats: s ?? null,
    comparisonStats: null,
    comparisonLabel: null,
    ratingHistory: rh ?? null,
    winRateTrend: wrt ?? null,
    accuracyTrend: at ?? null,
    streaks: st ?? null,
    missedWins: mw ?? null,
    savedGames: sg ?? null,
  };
  _data = data;
  return rpc.ok(data);
}

export function view(route: string, prefix: string, data: Data): preact.ComponentChild {
  const currentAuth = requireAuthInView();
  if (!currentAuth) return null;
  const state = useState();
  _state = state;
  return (
    <DashboardLayout name={currentAuth.name} route={route}>
      <FilterBar state={state} onRefetch={refetch} />
      <StatsSection
        stats={data.stats}
        comparisonStats={data.comparisonStats}
        comparisonLabel={data.comparisonLabel}
        ratingHistory={data.ratingHistory}
        winRateTrend={data.winRateTrend}
        accuracyTrend={data.accuracyTrend}
        streaks={data.streaks}
        missedWins={data.missedWins}
        savedGames={data.savedGames}
        state={state}
      />
    </DashboardLayout>
  );
}
