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
  const record = data.selected?.record;
  return (
    <DashboardLayout name={currentAuth.name} route={route}>
      <a href="/dashboard/sessions" class="session-back" onClick={backToSessions}>← All sessions</a>
      <div class="session-detail-header">
        <div>
          <h2>{titleCase(timeClass)} session</h2>
          <p>{displayDate(date)}</p>
        </div>
        {record && (
          <div class="session-detail-record">
            <span class="result-win">{record.wins} wins</span>
            <span class="result-loss">{record.losses} losses</span>
            <span class="result-draw">{record.draws} draws</span>
          </div>
        )}
      </div>
      {!data.selected && data.gamesTotal === 0
        ? <div class="stats-section"><p>This session was not found.</p></div>
        : <RecentGamesSection data={gamesData} state={state} />}
    </DashboardLayout>
  );
}
