import * as preact from "preact";
import * as vlens from "vlens";
import * as rpc from "vlens/rpc";
import * as core from "vlens/core";
import * as auth from "../lib/authCache";
import { requireAuthInView } from "../lib/authHelpers";

type Data = {};

export async function fetch(route: string, prefix: string) {
  return rpc.ok<Data>({});
}

export function view(route: string, prefix: string, data: Data): preact.ComponentChild {
  const currentAuth = requireAuthInView();
  if (!currentAuth) {
    return null;
  }
  return <DashboardPage name={currentAuth.name} />;
}

async function onLogoutClicked() {
  auth.clearAuth();
  core.setRoute("/login");
  vlens.scheduleRedraw();
}

interface DashboardPageProps {
  name: string;
}

const DashboardPage = ({ name }: DashboardPageProps) => (
  <div class="dashboard-page">
    <div class="dashboard-header">
      <h1>Welcome, {name}</h1>
      <button class="btn btn-secondary" onClick={onLogoutClicked}>
        Logout
      </button>
    </div>
    <div class="dashboard-content">
      <p>Your stats are coming soon.</p>
    </div>
  </div>
);
