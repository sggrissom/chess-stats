import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as server from "../../server";
import { GetFrequentOpponentsResponse, GameFilter } from "../../server";
import { requireAuthInView, ensureAuthInFetch } from "../../lib/authHelpers";
import { FilterState, FilterBar } from "../../lib/filterBar";
import { DashboardLayout } from "../../lib/dashboardLayout";
import { FrequentOpponentsSection } from "../../lib/dashboardComponents";

type Data = {
  frequentOpponents: GetFrequentOpponentsResponse | null;
};

type State = FilterState;

const useState = vlens.declareHook((): State => ({
  filterTimeClass: "",
  filterTimePeriod: "all",
  filterMinRating: "",
  filterMaxRating: "",
}));

let _data: Data;

async function refetch(filter: GameFilter) {
  const [fo] = await server.GetFrequentOpponents(filter);
  _data.frequentOpponents = fo ?? null;
  vlens.scheduleRedraw();
}

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAuthInFetch())) return rpc.ok<Data>({ frequentOpponents: null });
  const [profile] = await server.GetChessProfile({});
  if (!profile?.chesscomUsername) {
    core.setRoute("/dashboard");
    return rpc.ok<Data>({ frequentOpponents: null });
  }
  const defaultFilter: GameFilter = { timeClass: "", minOpponentRating: 0, maxOpponentRating: 0, since: 0 };
  const [fo] = await server.GetFrequentOpponents(defaultFilter);
  const data: Data = { frequentOpponents: fo ?? null };
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
      <FrequentOpponentsSection frequentOpponents={data.frequentOpponents} />
    </DashboardLayout>
  );
}
