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

type State = FilterState & GamesState & { initialized: boolean };

const useState = vlens.declareHook((): State => ({
  filterTimeClass: "",
  filterTimePeriod: "all",
  filterMinRating: "",
  filterMaxRating: "",
  gamesOffset: 0,
  gamesLoading: false,
  gamesSince: 0,
  gamesUntil: 0,
  brilliantOnly: false,
  initialized: false,
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
  const path = route.split("?")[0];
  const suffix = path.slice(prefix.length + 1);
  return parseDateSuffix(suffix) || todayString();
}

// ── Day navigation ────────────────────────────────────────────────────────────

function onPrevDay(dateStr: string, event: Event) {
  event.preventDefault();
  const search = window.location.search || "";
  core.setRoute("/dashboard/games/" + shiftDate(dateStr, -1) + search);
}

function onNextDay(dateStr: string, event: Event) {
  event.preventDefault();
  const search = window.location.search || "";
  core.setRoute("/dashboard/games/" + shiftDate(dateStr, 1) + search);
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
  const params = new URLSearchParams(window.location.search);
  if (_state.filterTimeClass) params.set("tc", _state.filterTimeClass);
  else params.delete("tc");
  if (_state.filterMinRating) params.set("minRating", _state.filterMinRating);
  else params.delete("minRating");
  if (_state.filterMaxRating) params.set("maxRating", _state.filterMaxRating);
  else params.delete("maxRating");
  const newSearch = params.toString();
  const newUrl = window.location.pathname + (newSearch ? "?" + newSearch : "");
  history.replaceState(null, "", newUrl);
  lastGamesRoute = newUrl;
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
  const urlParams = new URLSearchParams(route.split("?")[1] || "");
  const filter: GameFilter = {
    timeClass: urlParams.get("tc") || "",
    minOpponentRating: parseInt(urlParams.get("minRating") || "") || 0,
    maxOpponentRating: parseInt(urlParams.get("maxRating") || "") || 0,
    since,
    until,
  };
  const [resp] = await server.GetRecentGames({ filter, limit: 50, offset: 0, brilliantOnly: false });
  const data: Data = { recentGames: resp?.games ?? [], gamesTotal: resp?.total ?? 0 };
  _data = data;
  return rpc.ok(data);
}

export function view(route: string, prefix: string, data: Data): preact.ComponentChild {
  const currentAuth = requireAuthInView();
  if (!currentAuth) return null;
  const state = useState();
  _state = state;

  if (!state.initialized) {
    state.initialized = true;
    const params = new URLSearchParams(window.location.search);
    state.filterTimeClass = params.get("tc") || "";
    state.filterMinRating = params.get("minRating") || "";
    state.filterMaxRating = params.get("maxRating") || "";
  }

  const dateStr = getDateFromRoute(route, prefix);
  const [since, until] = dateToBounds(dateStr);
  state.gamesSince = since;
  state.gamesUntil = until;
  lastGamesRoute = window.location.pathname + window.location.search;

  return (
    <DashboardLayout name={currentAuth.name} route={route}>
      <DayNav dateStr={dateStr} />
      <FilterBar state={state} onRefetch={refetch} hidePeriod />
      <RecentGamesSection data={data} state={state} />
    </DashboardLayout>
  );
}
