import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as server from "../server";
import { GetGameDetailResponse, MoveAnalysisItem, RecentGameItem } from "../server";
import { requireAuthInView, ensureAuthInFetch } from "../lib/authHelpers";
import { ANALYSIS_NONE, ANALYSIS_PENDING, ANALYSIS_ANALYZING, ANALYSIS_DONE, ANALYSIS_FAILED } from "../lib/analysisStatus";

type Data = {
  detail: GetGameDetailResponse | null;
};

type GamePageState = {
  pollingActive: boolean;
  pollingTimer: number;
  requestingAnalysis: boolean;
  analysisError: string;
};

const useGamePageState = vlens.declareHook(
  (): GamePageState => ({
    pollingActive: false,
    pollingTimer: 0,
    requestingAnalysis: false,
    analysisError: "",
  })
);

function extractGameId(route: string, prefix: string): string {
  return route.slice(prefix.length + 1);
}

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAuthInFetch())) {
    return rpc.ok<Data>({ detail: null });
  }
  const gameId = extractGameId(route, prefix);
  const [detail] = await server.GetGameDetail({ gameId });
  return rpc.ok<Data>({ detail: detail ?? null });
}

export function view(
  route: string,
  prefix: string,
  data: Data
): preact.ComponentChild {
  const currentAuth = requireAuthInView();
  if (!currentAuth) return null;
  const state = useGamePageState();

  // Start polling when analysis is in progress
  const status = data.detail?.analysisStatus ?? ANALYSIS_NONE;
  if (needsPolling(status) && !state.pollingActive) {
    startPolling(state, data, route, prefix);
  }

  return <GameDetailPage data={data} state={state} route={route} prefix={prefix} />;
}

function needsPolling(status: number): boolean {
  return status === ANALYSIS_PENDING || status === ANALYSIS_ANALYZING;
}

function startPolling(state: GamePageState, data: Data, route: string, prefix: string) {
  state.pollingActive = true;
  const tick = async () => {
    const gameId = extractGameId(route, prefix);
    if (core.getRoute() !== route) {
      state.pollingActive = false;
      state.pollingTimer = 0;
      return;
    }
    const [detail] = await server.GetGameDetail({ gameId });
    if (detail) {
      data.detail = detail;
      vlens.scheduleRedraw();
    }
    if (!detail || !needsPolling(detail.analysisStatus)) {
      state.pollingActive = false;
      state.pollingTimer = 0;
      vlens.scheduleRedraw();
      return;
    }
    state.pollingTimer = window.setTimeout(tick, 3000);
  };
  state.pollingTimer = window.setTimeout(tick, 3000);
}

async function onRequestAnalysis(state: GamePageState, data: Data, route: string, prefix: string, event: Event) {
  event.preventDefault();
  if (!data.detail) return;
  state.requestingAnalysis = true;
  state.analysisError = "";
  vlens.scheduleRedraw();

  const gameId = extractGameId(route, prefix);
  const [resp] = await server.RequestGameAnalysis({ gameId });

  state.requestingAnalysis = false;
  if (resp?.error) {
    state.analysisError = resp.error;
    vlens.scheduleRedraw();
    return;
  }
  if (resp && data.detail) {
    data.detail.analysisStatus = resp.status;
  }
  vlens.scheduleRedraw();
  if (resp && needsPolling(resp.status)) {
    startPolling(state, data, route, prefix);
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatEval(move: MoveAnalysisItem): string {
  if (move.isMate) return (move.mateIn > 0 ? "M" : "-M") + Math.abs(move.mateIn);
  const pawns = move.evaluation / 100;
  return (pawns >= 0 ? "+" : "") + pawns.toFixed(1);
}

function evalClass(move: MoveAnalysisItem): string {
  if (move.isMate) return move.mateIn > 0 ? "eval-pos" : "eval-neg";
  if (move.evaluation > 50) return "eval-pos";
  if (move.evaluation < -50) return "eval-neg";
  return "eval-neutral";
}

function accuracyClass(acc: number): string {
  if (acc >= 90) return "acc-great";
  if (acc >= 70) return "acc-good";
  return "acc-poor";
}

function GameHeader({ game }: { game: RecentGameItem }) {
  const resultLabel = game.result.charAt(0).toUpperCase() + game.result.slice(1);
  const resultCls = game.result === "win" ? "result-win" : game.result === "loss" ? "result-loss" : "result-draw";
  const userIsWhite = game.userColor === "white";
  return (
    <div class="game-header">
      <div class="game-players">
        <div class={"player" + (userIsWhite ? " player-user" : "")}>
          <span class="piece">♙</span>
          <span class="player-name">{game.whiteUsername}</span>
          <span class="player-rating">({game.whiteRating})</span>
        </div>
        <div class="vs-badge">vs</div>
        <div class={"player" + (!userIsWhite ? " player-user" : "")}>
          <span class="piece">♟</span>
          <span class="player-name">{game.blackUsername}</span>
          <span class="player-rating">({game.blackRating})</span>
        </div>
      </div>
      <div class="game-meta">
        <span class={resultCls + " result-badge"}>{resultLabel}</span>
        <span class="game-time-class">{game.timeClass}</span>
        <span class="game-time-control">{game.timeControl}</span>
        {game.opening && <span class="game-opening">{game.opening}</span>}
        <span class="game-date">{formatDate(game.startTime)}</span>
      </div>
    </div>
  );
}

function AccuracyBars({ white, black }: { white: number; black: number }) {
  return (
    <div class="accuracy-section">
      <h4>Accuracy</h4>
      <div class="accuracy-bars">
        <div class="accuracy-row">
          <span class="accuracy-label">White</span>
          <div class="accuracy-bar-track">
            <div
              class={"accuracy-bar-fill " + accuracyClass(white)}
              style={{ width: white.toFixed(1) + "%" }}
            />
          </div>
          <span class={"accuracy-value " + accuracyClass(white)}>{white.toFixed(1)}%</span>
        </div>
        <div class="accuracy-row">
          <span class="accuracy-label">Black</span>
          <div class="accuracy-bar-track">
            <div
              class={"accuracy-bar-fill " + accuracyClass(black)}
              style={{ width: black.toFixed(1) + "%" }}
            />
          </div>
          <span class={"accuracy-value " + accuracyClass(black)}>{black.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

function EvalGraph({ moves }: { moves: MoveAnalysisItem[] }) {
  const W = 600;
  const H = 120;
  const mid = H / 2;

  function clampEval(m: MoveAnalysisItem): number {
    if (m.isMate) return m.mateIn > 0 ? 1000 : -1000;
    return Math.max(-1000, Math.min(1000, m.evaluation));
  }

  const n = moves.length;
  if (n === 0) return null;

  const pts = moves.map((m, i) => {
    const x = n > 1 ? (i / (n - 1)) * W : W / 2;
    const y = mid - (clampEval(m) / 1000) * mid;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polyPoints = [`0,${mid}`, ...pts, `${W},${mid}`].join(" ");
  const linePoints = pts.join(" ");

  return (
    <div class="eval-graph-section">
      <h4>Evaluation</h4>
      <svg
        class="eval-graph"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id="eg-above">
            <rect x="0" y="0" width={W} height={mid} />
          </clipPath>
          <clipPath id="eg-below">
            <rect x="0" y={mid} width={W} height={mid} />
          </clipPath>
        </defs>
        <polygon points={polyPoints} class="eval-graph-white" clipPath="url(#eg-above)" />
        <polygon points={polyPoints} class="eval-graph-black" clipPath="url(#eg-below)" />
        <line x1="0" y1={mid} x2={W} y2={mid} class="eval-graph-zero" />
        <polyline points={linePoints} class="eval-graph-line" />
      </svg>
    </div>
  );
}

function MoveTable({ moves }: { moves: MoveAnalysisItem[] }) {
  // Group into pairs: white move at even index, black move at odd
  const rows: Array<{ num: number; white?: MoveAnalysisItem; black?: MoveAnalysisItem }> = [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.color === "white") {
      rows.push({ num: m.moveNumber, white: m });
    } else {
      const last = rows[rows.length - 1];
      if (last && last.num === m.moveNumber && !last.black) {
        last.black = m;
      } else {
        rows.push({ num: m.moveNumber, black: m });
      }
    }
  }

  return (
    <div class="move-table-section">
      <h4>Moves</h4>
      <table class="move-table">
        <thead>
          <tr>
            <th>#</th>
            <th>White</th>
            <th>Eval</th>
            <th>Best</th>
            <th>Black</th>
            <th>Eval</th>
            <th>Best</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.num} class="move-row">
              <td class="move-num">{row.num}</td>
              {row.white ? (
                <>
                  <td class={"move-played" + (row.white.movePlayed !== row.white.bestMove ? " inaccuracy" : "")}>
                    {row.white.movePlayed}
                  </td>
                  <td class={"move-eval " + evalClass(row.white)}>{formatEval(row.white)}</td>
                  <td class="move-best">{row.white.movePlayed !== row.white.bestMove ? row.white.bestMove : "—"}</td>
                </>
              ) : (
                <><td /><td /><td /></>
              )}
              {row.black ? (
                <>
                  <td class={"move-played" + (row.black.movePlayed !== row.black.bestMove ? " inaccuracy" : "")}>
                    {row.black.movePlayed}
                  </td>
                  <td class={"move-eval " + evalClass(row.black)}>{formatEval(row.black)}</td>
                  <td class="move-best">{row.black.movePlayed !== row.black.bestMove ? row.black.bestMove : "—"}</td>
                </>
              ) : (
                <><td /><td /><td /></>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalysisPanel({
  data,
  state,
  route,
  prefix,
}: {
  data: Data;
  state: GamePageState;
  route: string;
  prefix: string;
}) {
  const detail = data.detail!;
  const status = detail.analysisStatus;

  if (status === ANALYSIS_NONE) {
    return (
      <div class="analysis-panel">
        {state.analysisError && <p class="error-message">{state.analysisError}</p>}
        <button
          class="btn btn-primary"
          disabled={state.requestingAnalysis}
          onClick={vlens.cachePartial(onRequestAnalysis, state, data, route, prefix)}
        >
          {state.requestingAnalysis ? "Requesting…" : "Analyze with Stockfish"}
        </button>
      </div>
    );
  }

  if (status === ANALYSIS_PENDING || status === ANALYSIS_ANALYZING) {
    const label = status === ANALYSIS_PENDING ? "Analysis queued…" : "Analyzing with Stockfish…";
    return (
      <div class="analysis-panel">
        <span class="badge badge-analyzing">{label}</span>
      </div>
    );
  }

  if (status === ANALYSIS_FAILED) {
    return (
      <div class="analysis-panel">
        <p class="error-message">Analysis failed: {detail.errorMessage || "unknown error"}</p>
        <button
          class="btn btn-secondary"
          disabled={state.requestingAnalysis}
          onClick={vlens.cachePartial(onRequestAnalysis, state, data, route, prefix)}
        >
          {state.requestingAnalysis ? "Requesting…" : "Retry Analysis"}
        </button>
      </div>
    );
  }

  // ANALYSIS_DONE
  return (
    <div class="analysis-panel">
      <AccuracyBars white={detail.whiteAccuracy} black={detail.blackAccuracy} />
      {detail.moves && detail.moves.length > 0 && <EvalGraph moves={detail.moves} />}
      {detail.moves && detail.moves.length > 0 && <MoveTable moves={detail.moves} />}
    </div>
  );
}

function GameDetailPage({
  data,
  state,
  route,
  prefix,
}: {
  data: Data;
  state: GamePageState;
  route: string;
  prefix: string;
}) {
  if (!data.detail) {
    return (
      <div class="dashboard-page">
        <div class="dashboard-content">
          <p><a href="#" onClick={(e) => { e.preventDefault(); core.setRoute("/dashboard"); }}>← Dashboard</a></p>
          <p>Game not found.</p>
        </div>
      </div>
    );
  }

  const { detail } = data;

  return (
    <div class="dashboard-page">
      <div class="dashboard-content">
        <p class="back-link">
          <a href="#" onClick={(e) => { e.preventDefault(); core.setRoute("/dashboard"); }}>← Dashboard</a>
        </p>
        <GameHeader game={detail.game} />
        <AnalysisPanel data={data} state={state} route={route} prefix={prefix} />
        {detail.pgn && (
          <details class="pgn-details">
            <summary>PGN</summary>
            <pre class="pgn-text">{detail.pgn}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
