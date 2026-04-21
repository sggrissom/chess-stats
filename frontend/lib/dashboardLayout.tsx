import * as preact from "preact";
import * as vlens from "vlens";
import * as core from "vlens/core";
import * as auth from "./authCache";

const NAV_ITEMS = [
  { label: "Overview", href: "/dashboard" },
  { label: "Stats", href: "/dashboard/stats" },
  { label: "Openings", href: "/dashboard/openings" },
  { label: "Games", href: "/dashboard/games" },
  { label: "Opponents", href: "/dashboard/opponents" },
];

async function onLogoutClicked() {
  await auth.logout();
}

function onNavClick(href: string, event: Event) {
  event.preventDefault();
  core.setRoute(href);
}

export function DashboardLayout({
  name,
  route,
  children,
}: {
  name: string;
  route: string;
  children: preact.ComponentChild;
}) {
  return (
    <div class="dashboard-page">
      <div class="dashboard-header">
        <h1>Chess Stats</h1>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="color:var(--text-muted);font-size:13px">{name}</span>
          <button class="btn btn-secondary btn-sm" onClick={onLogoutClicked}>
            Logout
          </button>
        </div>
      </div>
      <nav class="dashboard-nav">
        {NAV_ITEMS.map(item => {
          const isActive = item.href === "/dashboard"
            ? route === "/dashboard"
            : route.startsWith(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              class={"nav-link" + (isActive ? " active" : "")}
              onClick={vlens.cachePartial(onNavClick, item.href)}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
      <div class="dashboard-content">
        {children}
      </div>
    </div>
  );
}
