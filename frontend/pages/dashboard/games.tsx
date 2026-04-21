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
}));

let _data: Data;
let _state: State;

async function refetch(filter: GameFilter) {
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
  const defaultFilter: GameFilter = { timeClass: "", minOpponentRating: 0, maxOpponentRating: 0, since: 0 };
  const [resp] = await server.GetRecentGames({ filter: defaultFilter, limit: 50, offset: 0 });
  const data: Data = { recentGames: resp?.games ?? [], gamesTotal: resp?.total ?? 0 };
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
      <RecentGamesSection data={data} state={state} />
    </DashboardLayout>
  );
}
