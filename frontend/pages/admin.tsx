import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import { requireAdminInView, ensureAdminInFetch } from "../lib/authHelpers";
import { DashboardLayout } from "../lib/dashboardLayout";
import * as server from "../server";

type Data = {
  ok: boolean;
  performance: server.PerformanceInfoResponse | null;
  users: server.GetRegisteredUsersResponse | null;
};

type UserSortKey = "id" | "name" | "creation" | "lastLogin" | "gameCount" | "lastGameAt";

type UsersState = {
  search: string;
  sortKey: UserSortKey;
  sortDesc: boolean;
};

const useUsersState = vlens.declareHook((): UsersState => ({
  search: "",
  sortKey: "creation",
  sortDesc: true,
}));

function formatMs(ms: number) {
  if (!Number.isFinite(ms)) return "—";
  return `${Math.round(ms).toLocaleString()} ms`;
}

function formatDate(unixSeconds: number) {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleString();
}

function formatRelative(unixSeconds: number) {
  if (!unixSeconds) return "Never";
  const diffMs = Date.now() - unixSeconds * 1000;
  const days = Math.floor(diffMs / 86400000);
  if (days < 0) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function sortUsers(users: server.AdminUserSummary[], state: UsersState) {
  const sorted = [...users];
  sorted.sort((a, b) => {
    let cmp: number;
    if (state.sortKey === "name") {
      cmp = a.name.localeCompare(b.name);
    } else {
      cmp = a[state.sortKey] - b[state.sortKey];
    }
    if (cmp === 0) cmp = a.id - b.id;
    return state.sortDesc ? -cmp : cmp;
  });
  return sorted;
}

function filterUsers(users: server.AdminUserSummary[], search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return users;
  return users.filter(u =>
    u.name.toLowerCase().includes(needle) ||
    u.email.toLowerCase().includes(needle) ||
    u.chesscomUsername.toLowerCase().includes(needle)
  );
}

function onSortClicked(state: UsersState, key: UserSortKey, event: Event) {
  event.preventDefault();
  if (state.sortKey === key) {
    state.sortDesc = !state.sortDesc;
  } else {
    state.sortKey = key;
    state.sortDesc = key !== "name";
  }
  vlens.scheduleRedraw();
}

function SortHeader({ state, sortKey, label }: { state: UsersState; sortKey: UserSortKey; label: string }) {
  const active = state.sortKey === sortKey;
  return (
    <th>
      <button
        class={"users-sort-button" + (active ? " active" : "")}
        onClick={vlens.cachePartial(onSortClicked, state, sortKey)}
      >
        {label}
        {active && <span class="users-sort-arrow">{state.sortDesc ? "▼" : "▲"}</span>}
      </button>
    </th>
  );
}

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAdminInFetch())) return rpc.ok<Data>({ ok: false, performance: null, users: null });
  const [[performance], [users]] = await Promise.all([
    server.GetPerformanceInfo({}),
    server.GetRegisteredUsers({}),
  ]);
  return rpc.ok<Data>({ ok: true, performance: performance ?? null, users: users ?? null });
}

export function view(route: string, prefix: string, data: Data): preact.ComponentChild {
  const currentAuth = requireAdminInView();
  if (!currentAuth) return null;
  const perf = data.performance;
  const users = data.users;
  const usersState = useUsersState();
  // Go emits nil slices as null, so normalise every list before rendering.
  const allUsers = users?.users ?? [];
  const visibleUsers = users?.success ? sortUsers(filterUsers(allUsers, usersState.search), usersState) : [];
  const endpoints = perf?.endpoints ?? [];
  const recentSlowRequests = perf?.recentSlowRequests ?? [];

  return (
    <DashboardLayout name={currentAuth.name} route={route}>
      <div class="chess-section admin-section">
        <div class="chess-section-heading">
          <div>
            <p class="eyebrow">Admin</p>
            <h2>Administration</h2>
          </div>
        </div>
        <p>
          This admin section is restricted to administrator accounts. Currently,
          user ID 1 is treated as the administrator.
        </p>
      </div>

      <div class="chess-section admin-section users-section">
        <div class="chess-section-heading">
          <div>
            <p class="eyebrow">Accounts</p>
            <h2>Registered users</h2>
          </div>
          {users?.success && <span class="game-count-pill">{users.totalUsers.toLocaleString()} users</span>}
        </div>

        {!users?.success ? (
          <p class="error-message">{users?.error || "User information is unavailable."}</p>
        ) : (
          <>
            <div class="performance-summary-grid">
              <div class="performance-card"><span>Total users</span><strong>{users.totalUsers.toLocaleString()}</strong></div>
              <div class="performance-card"><span>New (30 days)</span><strong>{users.newUsersLast30Days.toLocaleString()}</strong></div>
              <div class="performance-card"><span>Active (7 days)</span><strong>{users.activeLast7Days.toLocaleString()}</strong></div>
              <div class="performance-card"><span>Linked chess.com</span><strong>{users.linkedAccounts.toLocaleString()}</strong></div>
              <div class="performance-card"><span>Games stored</span><strong>{users.totalGames.toLocaleString()}</strong></div>
            </div>

            <div class="users-toolbar">
              <input
                type="text"
                class="users-search"
                placeholder="Search name, email, or chess.com username"
                {...vlens.attrsBindInput(vlens.ref(usersState, "search"))}
              />
              <span class="muted-text">
                Showing {visibleUsers.length.toLocaleString()} of {allUsers.length.toLocaleString()}
              </span>
            </div>

            {visibleUsers.length === 0 ? (
              <p class="muted-text">No users match this search.</p>
            ) : (
              <div class="performance-table-wrap">
                <table class="performance-table users-table">
                  <thead>
                    <tr>
                      <SortHeader state={usersState} sortKey="id" label="ID" />
                      <SortHeader state={usersState} sortKey="name" label="User" />
                      <th>Sign-in</th>
                      <th>Chess.com</th>
                      <SortHeader state={usersState} sortKey="gameCount" label="Games" />
                      <SortHeader state={usersState} sortKey="lastGameAt" label="Last game" />
                      <SortHeader state={usersState} sortKey="creation" label="Joined" />
                      <SortHeader state={usersState} sortKey="lastLogin" label="Last login" />
                      <th>Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((u) => (
                      <tr key={u.id}>
                        <td>{u.id}</td>
                        <td>
                          <div class="users-name">
                            {u.name || "—"}
                            {u.isAdmin && <span class="users-badge admin">Admin</span>}
                          </div>
                          <div class="users-email">{u.email}</div>
                        </td>
                        <td>
                          <span class={"users-badge provider-" + u.authProvider}>
                            {u.authProvider === "google" ? "Google" : "Password"}
                          </span>
                        </td>
                        <td>
                          {u.chesscomUsername ? (
                            <a
                              class="users-link"
                              href={`https://www.chess.com/member/${u.chesscomUsername}`}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              {u.chesscomUsername}
                            </a>
                          ) : (
                            <span class="muted-text">Not linked</span>
                          )}
                          {u.followedAccounts > 0 && (
                            <div class="users-email">+{u.followedAccounts} followed</div>
                          )}
                        </td>
                        <td>{u.gameCount.toLocaleString()}</td>
                        <td title={formatDate(u.lastGameAt)}>{formatRelative(u.lastGameAt)}</td>
                        <td title={formatDate(u.creation)}>{formatRelative(u.creation)}</td>
                        <td title={formatDate(u.lastLogin)}>{formatRelative(u.lastLogin)}</td>
                        <td>{u.activeSessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div class="chess-section admin-section performance-section">
        <div class="chess-section-heading">
          <div>
            <p class="eyebrow">Performance</p>
            <h2>Request performance</h2>
          </div>
          {perf?.success && <span class="game-count-pill">Slow ≥ {perf.slowRequestThresholdMs} ms</span>}
        </div>

        {!perf?.success ? (
          <p class="error-message">{perf?.error || "Performance information is unavailable."}</p>
        ) : (
          <>
            <div class="performance-summary-grid">
              <div class="performance-card"><span>Total requests</span><strong>{perf.totalRequests.toLocaleString()}</strong></div>
              <div class="performance-card"><span>Slow requests</span><strong>{perf.slowRequests.toLocaleString()}</strong></div>
              <div class="performance-card"><span>Average</span><strong>{formatMs(perf.averageMs)}</strong></div>
              <div class="performance-card"><span>Worst</span><strong>{formatMs(perf.maxMs)}</strong></div>
              <div class="performance-card"><span>Server errors</span><strong>{perf.errorRequests.toLocaleString()}</strong></div>
            </div>

            <h3>Slowest endpoints</h3>
            <div class="performance-table-wrap">
              <table class="performance-table">
                <thead><tr><th>Endpoint</th><th>Requests</th><th>Slow</th><th>Avg</th><th>Max</th><th>Last</th></tr></thead>
                <tbody>
                  {endpoints.map((ep) => (
                    <tr key={ep.path}>
                      <td>{ep.path}</td><td>{ep.count}</td><td>{ep.slowCount}</td><td>{formatMs(ep.averageMs)}</td><td>{formatMs(ep.maxMs)}</td><td>{formatMs(ep.lastDurationMs)} · {formatDate(ep.lastSeen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Recent slow requests</h3>
            {recentSlowRequests.length === 0 ? <p class="muted-text">No slow requests have been recorded since the server started.</p> : (
              <div class="performance-table-wrap"><table class="performance-table"><thead><tr><th>When</th><th>Request</th><th>Status</th><th>Duration</th></tr></thead><tbody>{recentSlowRequests.map((req) => <tr><td>{formatDate(req.at)}</td><td>{req.method} {req.path}</td><td>{req.status}</td><td>{formatMs(req.durationMs)}</td></tr>)}</tbody></table></div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
