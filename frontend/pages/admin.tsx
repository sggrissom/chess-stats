import * as preact from "preact";
import * as rpc from "vlens/rpc";
import { requireAdminInView, ensureAdminInFetch } from "../lib/authHelpers";
import { DashboardLayout } from "../lib/dashboardLayout";

type Data = {
  ok: boolean;
};

export async function fetch(route: string, prefix: string) {
  if (!(await ensureAdminInFetch())) return rpc.ok<Data>({ ok: false });
  return rpc.ok<Data>({ ok: true });
}

export function view(route: string, prefix: string, data: Data): preact.ComponentChild {
  const currentAuth = requireAdminInView();
  if (!currentAuth) return null;

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
    </DashboardLayout>
  );
}
