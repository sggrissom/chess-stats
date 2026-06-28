import * as preact from "preact";
import * as rpc from "vlens/rpc";
import { requireAdminInView, ensureAdminInFetch } from "../lib/authHelpers";
import { DashboardLayout } from "../lib/dashboardLayout";
import * as server from "../server";

type Data = {
  ok: boolean;
  performance: server.PerformanceInfoResponse | null;
};

function formatMs(ms: number) {
  if (!Number.isFinite(ms)) return "—";
  return `${Math.round(ms).toLocaleString()} ms`;
}

function formatDate(unixSeconds: number) {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleString();
}

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAdminInFetch())) return rpc.ok<Data>({ ok: false, performance: null });
  const [performance] = await server.GetPerformanceInfo({});
  return rpc.ok<Data>({ ok: true, performance: performance ?? null });
}

export function view(route: string, prefix: string, data: Data): preact.ComponentChild {
  const currentAuth = requireAdminInView();
  if (!currentAuth) return null;
  const perf = data.performance;

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
                  {perf.endpoints.map((ep) => (
                    <tr key={ep.path}>
                      <td>{ep.path}</td><td>{ep.count}</td><td>{ep.slowCount}</td><td>{formatMs(ep.averageMs)}</td><td>{formatMs(ep.maxMs)}</td><td>{formatMs(ep.lastDurationMs)} · {formatDate(ep.lastSeen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Recent slow requests</h3>
            {perf.recentSlowRequests.length === 0 ? <p class="muted-text">No slow requests have been recorded since the server started.</p> : (
              <div class="performance-table-wrap"><table class="performance-table"><thead><tr><th>When</th><th>Request</th><th>Status</th><th>Duration</th></tr></thead><tbody>{perf.recentSlowRequests.map((req) => <tr><td>{formatDate(req.at)}</td><td>{req.method} {req.path}</td><td>{req.status}</td><td>{formatMs(req.durationMs)}</td></tr>)}</tbody></table></div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
