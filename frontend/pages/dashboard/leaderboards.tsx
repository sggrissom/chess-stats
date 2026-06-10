import * as preact from "preact";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as server from "../../server";
import { GetGameLeaderboardsResponse, LeaderboardGame, RecentGameItem } from "../../server";
import { requireAuthInView, ensureAuthInFetch } from "../../lib/authHelpers";
import { DashboardLayout } from "../../lib/dashboardLayout";
import { formatDate, gameDetailRoute } from "../../lib/dashboardComponents";

type Data = {
  leaderboards: GetGameLeaderboardsResponse | null;
};

type LeaderboardDefinition = {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  entries: LeaderboardGame[];
  metric: (entry: LeaderboardGame) => string;
  metricLabel: string;
  accent: string;
};

function opponent(game: RecentGameItem): string {
  return game.userColor === "white" ? game.blackUsername : game.whiteUsername;
}

function opponentRating(game: RecentGameItem): number {
  return game.userColor === "white" ? game.blackRating : game.whiteRating;
}

function resultLabel(result: string): string {
  if (result === "win") return "Won";
  if (result === "loss") return "Lost";
  return "Draw";
}

function openGame(gameId: string) {
  core.setRoute(gameDetailRoute(gameId));
}

function LeaderboardCard({ definition }: { definition: LeaderboardDefinition }) {
  return (
    <section class={"leaderboard-card leaderboard-card-" + definition.accent}>
      <header class="leaderboard-card-header">
        <div>
          <div class="leaderboard-eyebrow">{definition.eyebrow}</div>
          <h2>{definition.title}</h2>
          <p>{definition.description}</p>
        </div>
      </header>

      {definition.entries.length === 0 ? (
        <div class="leaderboard-empty">
          <span class="leaderboard-empty-icon">◇</span>
          <div>
            <strong>No qualifying games yet</strong>
            <p>Analyze more games to start filling this board.</p>
          </div>
        </div>
      ) : (
        <div class="leaderboard-list">
          {definition.entries.map((entry, index) => {
            const game = entry.game;
            return (
              <button class="leaderboard-row" key={game.id} onClick={() => openGame(game.id)}>
                <span class={"leaderboard-rank rank-" + (index + 1)}>{index + 1}</span>
                <span class="leaderboard-game">
                  <span class="leaderboard-opponent">
                    vs {opponent(game)} <span class="leaderboard-rating">({opponentRating(game)})</span>
                  </span>
                  <span class="leaderboard-meta">
                    <span class={"result-" + game.result}>{resultLabel(game.result)}</span>
                    <span>{game.timeClass}</span>
                    <span>{formatDate(game.startTime)}</span>
                  </span>
                  <span class="leaderboard-opening">{game.opening || "Opening unavailable"}</span>
                </span>
                <span class="leaderboard-metric">
                  <strong>{definition.metric(entry)}</strong>
                  <small>{definition.metricLabel}</small>
                </span>
                <span class="leaderboard-arrow">→</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export async function fetch() {
  if (!(await ensureAuthInFetch())) return rpc.ok<Data>({ leaderboards: null });
  const [profile] = await server.GetChessProfile({});
  if (!profile?.chesscomUsername) {
    core.setRoute("/dashboard");
    return rpc.ok<Data>({ leaderboards: null });
  }
  const [leaderboards] = await server.GetGameLeaderboards({});
  return rpc.ok<Data>({ leaderboards: leaderboards ?? null });
}

export function view(route: string, prefix: string, data: Data): preact.ComponentChild {
  const currentAuth = requireAuthInView();
  if (!currentAuth) return null;
  const leaderboards = data.leaderboards;
  const definitions: LeaderboardDefinition[] = leaderboards ? [
    {
      key: "accurate",
      eyebrow: "Precision",
      title: "Most Accurate",
      description: "Your cleanest games according to engine analysis.",
      entries: leaderboards.mostAccurate,
      metric: entry => entry.accuracy.toFixed(1) + "%",
      metricLabel: "accuracy",
      accent: "green",
    },
    {
      key: "brilliant",
      eyebrow: "Creativity",
      title: "Most Brilliant",
      description: "Games where you found the most exceptional moves.",
      entries: leaderboards.mostBrilliant,
      metric: entry => String(entry.brilliantMoves),
      metricLabel: "brilliant " + (leaderboards.mostBrilliant[0]?.brilliantMoves === 1 ? "move" : "moves"),
      accent: "purple",
    },
    {
      key: "quickest",
      eyebrow: "Efficiency",
      title: "Quickest Checkmates",
      description: "Your fastest wins delivered on the board—not by disconnect or abandonment.",
      entries: leaderboards.quickestWins,
      metric: entry => String(entry.moveCount),
      metricLabel: "moves",
      accent: "gold",
    },
    {
      key: "competitive",
      eyebrow: "Tension",
      title: "Most Competitive",
      description: "Games with the largest share of positions within one pawn of equality.",
      entries: leaderboards.mostCompetitive,
      metric: entry => Math.round(entry.competitivePct) + "%",
      metricLabel: "close positions",
      accent: "blue",
    },
  ] : [];

  return (
    <DashboardLayout name={currentAuth.name} route={route}>
      <div class="leaderboards-hero">
        <div>
          <div class="leaderboards-kicker">Your personal hall of fame</div>
          <h1>Game Leaderboards</h1>
          <p>Not just how often you win—these are the games that stand out.</p>
        </div>
        {leaderboards && (
          <div class="leaderboards-sample">
            <strong>{leaderboards.analyzedGames}</strong>
            <span>analyzed games ranked</span>
          </div>
        )}
      </div>

      {leaderboards ? (
        <div class="leaderboards-grid">
          {definitions.map(definition => <LeaderboardCard key={definition.key} definition={definition} />)}
        </div>
      ) : (
        <div class="leaderboard-page-empty">Unable to load your game leaderboards.</div>
      )}

      <div class="leaderboards-footer-note">
        <strong>More boards are coming.</strong>
        <span>Best comeback, biggest upset, wildest game, and opening masterpieces can fit here next.</span>
      </div>
    </DashboardLayout>
  );
}
