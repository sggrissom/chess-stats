import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as server from "../../server";
import { GameFilter } from "../../server";
import { requireAuthInView, ensureAuthInFetch } from "../../lib/authHelpers";
import { FilterState, FilterBar } from "../../lib/filterBar";
import { DashboardLayout } from "../../lib/dashboardLayout";
import { GamesState, GamesData, RecentGamesSection, loadRecentGames } from "../../lib/dashboardComponents";

type Data = GamesData;

type State = FilterState & GamesState;

const useState = vlens.declareHook((): State => ({
  filterTimeClass: "",
  filterTimePeriod: "all",
  filterMinRating: "",
  filterMaxRating: "",
  gamesOffset: 0,
  gamesLoading: false,
  gamesSince: 0,
  gamesUntil: 0,
}));

let _data: Data;
let _state: State;

// Tracks the current games list URL so game.tsx can link back here
export let lastGamesRoute = "/dashboard/games";

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDateSuffix(suffix: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(suffix) ? suffix : "";
}

function todayString(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateToBounds(dateStr: string): [number, number] {
  const since = Math.floor(new Date(dateStr + "T00:00:00").getTime() / 1000);
  return [since, since + 86400];
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function getDateFromRoute(route: string, prefix: string): string {
  const suffix = route.slice(prefix.length + 1);
  return parseDateSuffix(suffix) || todayString();
}

// ── Day navigation ────────────────────────────────────────────────────────────

function onPrevDay(dateStr: string, event: Event) {
  event.preventDefault();
  core.setRoute("/dashboard/games/" + shiftDate(dateStr, -1));
}

function onNextDay(dateStr: string, event: Event) {
  event.preventDefault();
  core.setRoute("/dashboard/games/" + shiftDate(dateStr, 1));
}

function DayNav({ dateStr }: { dateStr: string }) {
  const isToday = dateStr === todayString();
  return (
    <div class="day-nav">
      <a href="#" onClick={vlens.cachePartial(onPrevDay, dateStr)}>← Prev</a>
      <span class="day-nav-label">{formatDisplayDate(dateStr)}</span>
      {!isToday && (
        <a href="#" onClick={vlens.cachePartial(onNextDay, dateStr)}>Next →</a>
      )}
    </div>
  );
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function refetch(_filter: GameFilter) {
  _state.gamesOffset = 0;
  await loadRecentGames(_state, _data);
}

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAuthInFetch())) return rpc.ok<Data>({ recentGames: null, gamesTotal: 0 });
  const [profile] = await server.GetChessProfile({});
  if (!profile?.chesscomUsername) {
    core.setRoute("/dashboard");
    return rpc.ok<Data>({ recentGames: null, gamesTotal: 0 });
  }
  const dateStr = getDateFromRoute(route, prefix);
  const [since, until] = dateToBounds(dateStr);
  const filter: GameFilter = { timeClass: "", minOpponentRating: 0, maxOpponentRating: 0, since, until };
  const [resp] = await server.GetRecentGames({ filter, limit: 50, offset: 0 });
  const data: Data = { recentGames: resp?.games ?? [], gamesTotal: resp?.total ?? 0 };
  _data = data;
  return rpc.ok(data);
}

export function view(route: string, prefix: string, data: Data): preact.ComponentChild {
  const currentAuth = requireAuthInView();
  if (!currentAuth) return null;
  const state = useState();
  _state = state;

  const dateStr = getDateFromRoute(route, prefix);
  const [since, until] = dateToBounds(dateStr);
  state.gamesSince = since;
  state.gamesUntil = until;
  lastGamesRoute = route;

  return (
    <DashboardLayout name={currentAuth.name} route={route}>
      <DayNav dateStr={dateStr} />
      <FilterBar state={state} onRefetch={refetch} hidePeriod />
      <RecentGamesSection data={data} state={state} />
    </DashboardLayout>
  );
}
