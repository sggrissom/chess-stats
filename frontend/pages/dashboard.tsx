import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as auth from "../lib/authCache";
import * as server from "../server";
import { GetGameStatsResponse, GetOpeningStatsResponse, OpeningRecord, ColorRecord } from "../server";
import { requireAuthInView, ensureAuthInFetch } from "../lib/authHelpers";

type Data = {
  chesscomUsername: string;
  gameCount: number;
  stats: GetGameStatsResponse | null;
  openingStats: GetOpeningStatsResponse | null;
};

type ChessState = {
  usernameInput: string;
  saving: boolean;
  syncing: boolean;
  statusMessage: string;
  isError: boolean;
  expandedOpenings: Record<string, boolean>;
};

const useChessState = vlens.declareHook(
  (): ChessState => ({
    usernameInput: "",
    saving: false,
    syncing: false,
    statusMessage: "",
    isError: false,
    expandedOpenings: {},
  })
);

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAuthInFetch())) {
    return rpc.ok<Data>({ chesscomUsername: "", gameCount: 0, stats: null, openingStats: null });
  }
  const [profile] = await server.GetChessProfile({});
  const username = profile?.chesscomUsername ?? "";
  let stats: GetGameStatsResponse | null = null;
  let openingStats: GetOpeningStatsResponse | null = null;
  if (username) {
    const [[s], [os]] = await Promise.all([
      server.GetGameStats({}),
      server.GetOpeningStats({ timeClass: "" }),
    ]);
    stats = s ?? null;
    openingStats = os ?? null;
  }
  return rpc.ok<Data>({
    chesscomUsername: username,
    gameCount: profile?.gameCount ?? 0,
    stats,
    openingStats,
  });
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
    const [[s], [os]] = await Promise.all([
      server.GetGameStats({}),
      server.GetOpeningStats({ timeClass: "" }),
    ]);
    data.stats = s ?? null;
    data.openingStats = os ?? null;
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
          {entries.map(([name, rec]) => {
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
        </tbody>
      </table>
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
        <StatsSection stats={data.stats} />
        <OpeningsSection openingStats={data.openingStats} state={state} />
      </div>
    </div>
  </div>
);
