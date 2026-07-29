import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as server from "../../server";
import { ensureAuthInFetch, requireAuthInView } from "../../lib/authHelpers";
import { DashboardLayout } from "../../lib/dashboardLayout";
import { FilterState } from "../../lib/filterBar";
import { GamesData, GamesState, RecentGamesSection } from "../../lib/dashboardComponents";

type Data = {
  sessions: server.SessionSummary[];
  selected: server.SessionSummary | null;
  recentGames: server.RecentGameItem[] | null;
  gamesTotal: number;
};

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
  brilliantOnly: false,
}));

function routeParts(route: string, prefix: string): [string, string] | null {
  const suffix = route.split("?")[0].slice(prefix.length).replace(/^\//, "");
  if (!suffix) return null;
  const [date, timeClass, ...extra] = suffix.split("/");
  if (extra.length || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-z]+$/.test(timeClass)) return null;
  return [date, timeClass];
}

function dateBounds(date: string): [number, number] {
  const start = new Date(date + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000)];
}

function sessionRoute(session: server.SessionSummary): string {
  return `/dashboard/sessions/${session.date}/${session.timeClass}`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function displayDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function displayTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type OpeningSummary = { name: string; eco: string; games: number; wins: number; losses: number; draws: number };

function sessionOpenings(games: server.RecentGameItem[]): OpeningSummary[] {
  const openings = new Map<string, OpeningSummary>();
  for (const game of games) {
    const name = game.opening || "Unknown opening";
    const key = `${game.openingEco}:${name}`;
    const opening = openings.get(key) ?? { name, eco: game.openingEco, games: 0, wins: 0, losses: 0, draws: 0 };
    opening.games++;
    if (game.result === "win") opening.wins++;
    else if (game.result === "loss") opening.losses++;
    else opening.draws++;
    openings.set(key, opening);
  }
  return [...openings.values()].sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 4);
}

function SessionOverview({ session, games }: { session: server.SessionSummary; games: server.RecentGameItem[] }) {
  const analyzed = games.filter(game => game.analysisStatus === 2);
  const averageAccuracy = analyzed.length
    ? analyzed.reduce((sum, game) => sum + (game.userColor === "white" ? game.whiteAccuracy : game.blackAccuracy), 0) / analyzed.length
    : null;
  const scored = games.filter(game => game.story);
  const averageGameScore = scored.length
    ? Math.round(scored.reduce((sum, game) => sum + (game.story?.score ?? 0), 0) / scored.length)
    : null;
  const whiteGames = games.filter(game => game.userColor === "white");
  const whiteWins = whiteGames.filter(game => game.result === "win").length;
  const blackGames = games.filter(game => game.userColor === "black");
  const blackWins = blackGames.filter(game => game.result === "win").length;
  const opponentRatings = games
    .map(game => game.userColor === "white" ? game.blackRating : game.whiteRating)
    .filter(rating => rating > 0);
  const averageOpponentRating = opponentRatings.length
    ? Math.round(opponentRatings.reduce((sum, rating) => sum + rating, 0) / opponentRatings.length)
    : null;
  const openings = sessionOpenings(games);
  const score = session.gameCount ? Math.round(((session.record.wins + session.record.draws / 2) / session.gameCount) * 100) : 0;
  const winRate = session.gameCount ? Math.round(session.record.wins / session.gameCount * 100) : 0;

  return (
    <>
      <section class="session-hero">
        <div class="session-hero-copy">
          <span class="session-eyebrow">Session review</span>
          <h2>{titleCase(session.timeClass)} on {displayDate(session.date)}</h2>
          <p>{displayTime(session.startedAt)}–{displayTime(session.endedAt)} · A snapshot of your performance and the best places to start reviewing.</p>
        </div>
        <div class="session-score-ring" style={`--session-score: ${score * 3.6}deg`}>
          <strong>{score}%</strong><span>score</span>
        </div>
      </section>

      <div class="session-kpi-grid">
        <div class="session-kpi"><span>Record</span><strong>{session.record.wins}–{session.record.losses}–{session.record.draws}</strong><small>W–L–D across {session.gameCount} games</small></div>
        <div class="session-kpi"><span>Win rate</span><strong>{winRate}%</strong><small>{session.record.wins} win{session.record.wins === 1 ? "" : "s"} across {session.gameCount} games</small></div>
        <div class="session-kpi"><span>Avg. accuracy</span><strong>{averageAccuracy === null ? "—" : `${averageAccuracy.toFixed(1)}%`}</strong><small>{analyzed.length} of {session.gameCount} games analyzed</small></div>
        <div class="session-kpi"><span>Avg. game score</span><strong>{averageGameScore ?? "—"}</strong><small>{scored.length} of {session.gameCount} games scored</small></div>
        <div class="session-kpi"><span>Avg. opponent</span><strong>{averageOpponentRating ?? "—"}</strong><small>{opponentRatings.length ? `Across ${opponentRatings.length} rated matchup${opponentRatings.length === 1 ? "" : "s"}` : "Rating data unavailable"}</small></div>
      </div>

      <div class="session-insights-grid">
        <section class="session-panel">
          <div class="session-panel-heading"><div><span class="session-eyebrow">Repertoire</span><h3>Openings at a glance</h3></div><span class="session-panel-note">Top {openings.length}</span></div>
          {openings.length ? <div class="session-opening-list">{openings.map(opening => (
            <div class="session-opening-row" key={`${opening.eco}-${opening.name}`}>
              <span class="session-eco">{opening.eco || "—"}</span>
              <div><strong>{opening.name}</strong><small>{opening.games} game{opening.games === 1 ? "" : "s"}</small></div>
              <span class="session-opening-record"><b class="result-win">{opening.wins}W</b> <b class="result-loss">{opening.losses}L</b> <b class="result-draw">{opening.draws}D</b></span>
            </div>
          ))}</div> : <p class="muted-text">Opening data will appear after games are imported.</p>}
        </section>
        <section class="session-panel">
          <div class="session-panel-heading"><div><span class="session-eyebrow">Perspective</span><h3>Performance by color</h3></div></div>
          <div class="session-color-stats">
            <div><span class="session-color-icon">♙</span><span><strong>White</strong><small>{whiteGames.length} games · {whiteWins} wins</small></span><b>{whiteGames.length ? Math.round(whiteWins / whiteGames.length * 100) : 0}%</b></div>
            <div><span class="session-color-icon dark">♟</span><span><strong>Black</strong><small>{blackGames.length} games · {blackWins} wins</small></span><b>{blackGames.length ? Math.round(blackWins / blackGames.length * 100) : 0}%</b></div>
          </div>
          <div class="session-review-note"><span>⌁</span><p><strong>Review plan</strong><br />Start with the {session.record.losses} loss{session.record.losses === 1 ? "" : "es"}, then compare repeated openings to find patterns across the session.</p></div>
        </section>
      </div>
      <div class="session-games-heading"><div><span class="session-eyebrow">Game log</span><h3>Review every game</h3></div><p>Select a game for the board, engine analysis, and move-by-move details.</p></div>
    </>
  );
}

function openSession(route: string, event: Event) {
  event.preventDefault();
  core.setRoute(route);
}

function backToSessions(event: Event) {
  event.preventDefault();
  core.setRoute("/dashboard/sessions");
}

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAuthInFetch())) return rpc.ok<Data>({ sessions: [], selected: null, recentGames: null, gamesTotal: 0 });
  const [sessionsResponse] = await server.GetSessions({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  });
  const sessions = sessionsResponse?.sessions ?? [];
  const parts = routeParts(route, prefix);
  if (!parts) return rpc.ok<Data>({ sessions, selected: null, recentGames: null, gamesTotal: 0 });

  const [date, timeClass] = parts;
  const [since, until] = dateBounds(date);
  const [gamesResponse] = await server.GetRecentGames({
    filter: { timeClass, minOpponentRating: 0, maxOpponentRating: 0, since, until },
    limit: 50,
    offset: 0,
    brilliantOnly: false,
  });
  return rpc.ok<Data>({
    sessions,
    selected: sessions.find(session => session.date === date && session.timeClass === timeClass) ?? null,
    recentGames: gamesResponse?.games ?? [],
    gamesTotal: gamesResponse?.total ?? 0,
  });
}

export function view(route: string, prefix: string, data: Data): preact.ComponentChild {
  const currentAuth = requireAuthInView();
  if (!currentAuth) return null;
  const state = useState();
  const parts = routeParts(route, prefix);

  if (!parts) {
    return (
      <DashboardLayout name={currentAuth.name} route={route}>
        <div class="sessions-header">
          <div>
            <h2>Sessions</h2>
            <p>Games played on the same day with the same time class are grouped automatically.</p>
          </div>
        </div>
        {data.sessions.length === 0 ? (
          <div class="stats-section"><p>No sessions found.</p></div>
        ) : (
          <div class="session-list">
            {data.sessions.map(session => (
              <a
                href={sessionRoute(session)}
                class="session-card"
                onClick={vlens.cachePartial(openSession, sessionRoute(session))}
              >
                <div class="session-card-main">
                  <strong>{displayDate(session.date)}</strong>
                  <span class="session-time-class">{titleCase(session.timeClass)}</span>
                </div>
                <div class="session-card-record">
                  <span class="result-win">{session.record.wins}W</span>
                  <span class="result-loss">{session.record.losses}L</span>
                  <span class="result-draw">{session.record.draws}D</span>
                </div>
                <div class="session-card-meta">
                  {session.gameCount} game{session.gameCount === 1 ? "" : "s"} · {displayTime(session.startedAt)}–{displayTime(session.endedAt)}
                </div>
                <span class="session-card-arrow">→</span>
              </a>
            ))}
          </div>
        )}
      </DashboardLayout>
    );
  }

  const [date, timeClass] = parts;
  const [since, until] = dateBounds(date);
  state.filterTimeClass = timeClass;
  state.gamesSince = since;
  state.gamesUntil = until;
  const gamesData: GamesData = data;
  return (
    <DashboardLayout name={currentAuth.name} route={route}>
      <a href="/dashboard/sessions" class="session-back" onClick={backToSessions}>← All sessions</a>
      {!data.selected && data.gamesTotal === 0
        ? <div class="stats-section"><p>This session was not found.</p></div>
        : <>{data.selected && <SessionOverview session={data.selected} games={data.recentGames ?? []} />}<RecentGamesSection data={gamesData} state={state} /></>}
    </DashboardLayout>
  );
}
