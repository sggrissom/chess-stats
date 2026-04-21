import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as server from "../../server";
import { GetOpeningStatsResponse, GameFilter } from "../../server";
import { requireAuthInView, ensureAuthInFetch } from "../../lib/authHelpers";
import { FilterState, FilterBar, buildFilter } from "../../lib/filterBar";
import { DashboardLayout } from "../../lib/dashboardLayout";
import { OpeningsSection, OpeningsState } from "../../lib/dashboardComponents";

type Data = {
  openingStats: GetOpeningStatsResponse | null;
};

type State = FilterState & OpeningsState;

const useState = vlens.declareHook((): State => ({
  filterTimeClass: "",
  filterTimePeriod: "all",
  filterMinRating: "",
  filterMaxRating: "",
  expandedOpenings: {},
  openingExplorer: {},
  openingTrends: {},
}));

let _data: Data;

async function refetch(filter: GameFilter) {
  const [os] = await server.GetOpeningStats(filter);
  _data.openingStats = os ?? null;
  vlens.scheduleRedraw();
}

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAuthInFetch())) return rpc.ok<Data>({ openingStats: null });
  const [profile] = await server.GetChessProfile({});
  if (!profile?.chesscomUsername) {
    core.setRoute("/dashboard");
    return rpc.ok<Data>({ openingStats: null });
  }
  const defaultFilter: GameFilter = { timeClass: "", minOpponentRating: 0, maxOpponentRating: 0, since: 0 };
  const [os] = await server.GetOpeningStats(defaultFilter);
  const data: Data = { openingStats: os ?? null };
  _data = data;
  return rpc.ok(data);
}

export function view(route: string, prefix: string, data: Data): preact.ComponentChild {
  const currentAuth = requireAuthInView();
  if (!currentAuth) return null;
  const state = useState();
  return (
    <DashboardLayout name={currentAuth.name} route={route}>
      <FilterBar state={state} onRefetch={refetch} />
      <OpeningsSection openingStats={data.openingStats} state={state} filter={buildFilter(state)} />
    </DashboardLayout>
  );
}
