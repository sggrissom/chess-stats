import * as preact from "preact";
import * as vlens from "vlens";
import { GameFilter } from "../server";

export interface FilterState {
  filterTimeClass: string;
  filterTimePeriod: string;
  filterMinRating: string;
  filterMaxRating: string;
}

export type OnFilterChange = (filter: GameFilter) => Promise<void>;

export function periodToSince(period: string): number {
  const now = Date.now() / 1000;
  switch (period) {
    case "7d":  return Math.floor(now - 7 * 86400);
    case "30d": return Math.floor(now - 30 * 86400);
    case "90d": return Math.floor(now - 90 * 86400);
    case "1y":  return Math.floor(now - 365 * 86400);
    default:    return 0;
  }
}

export function buildFilter(state: FilterState): GameFilter {
  return {
    timeClass: state.filterTimeClass,
    minOpponentRating: parseInt(state.filterMinRating) || 0,
    maxOpponentRating: parseInt(state.filterMaxRating) || 0,
    since: periodToSince(state.filterTimePeriod),
  };
}

const TIME_CLASS_ORDER = ["bullet", "blitz", "rapid", "daily"];

async function onFilterTimeClass(state: FilterState, onRefetch: OnFilterChange, tc: string, event: Event) {
  event.preventDefault();
  state.filterTimeClass = tc;
  vlens.scheduleRedraw();
  await onRefetch(buildFilter(state));
  vlens.scheduleRedraw();
}

async function onFilterTimePeriod(state: FilterState, onRefetch: OnFilterChange, event: Event) {
  state.filterTimePeriod = (event.target as HTMLSelectElement).value;
  await onRefetch(buildFilter(state));
  vlens.scheduleRedraw();
}

async function onApplyRatingFilter(state: FilterState, onRefetch: OnFilterChange, event: Event) {
  event.preventDefault();
  await onRefetch(buildFilter(state));
  vlens.scheduleRedraw();
}

export function FilterBar({ state, onRefetch }: { state: FilterState; onRefetch: OnFilterChange }) {
  const timeClasses = ["", ...TIME_CLASS_ORDER];
  const timeClassLabels: Record<string, string> = { "": "All", bullet: "Bullet", blitz: "Blitz", rapid: "Rapid", daily: "Daily" };
  return (
    <div class="filter-bar">
      <div class="filter-row">
        {timeClasses.map((tc) => (
          <button
            key={tc}
            class={"filter-pill" + (state.filterTimeClass === tc ? " active" : "")}
            onClick={vlens.cachePartial(onFilterTimeClass, state, onRefetch, tc)}
          >
            {timeClassLabels[tc]}
          </button>
        ))}
      </div>
      <div class="filter-row">
        <select
          value={state.filterTimePeriod}
          onChange={vlens.cachePartial(onFilterTimePeriod, state, onRefetch)}
        >
          <option value="all">All time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="1y">Last year</option>
        </select>
      </div>
      <form class="filter-row" onSubmit={vlens.cachePartial(onApplyRatingFilter, state, onRefetch)}>
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
