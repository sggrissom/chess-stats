import { block } from "vlens/css";

// ── CSS Variables ──────────────────────────────────────────────────────────────

block(`
:root {
  --bg: #0d1117;
  --surface: #161b22;
  --surface-2: #1c2128;
  --border: #30363d;
  --border-muted: #21262d;
  --text: #e6edf3;
  --text-muted: #8b949e;
  --accent: #3fb950;
  --accent-muted: #238636;
  --accent-subtle: rgba(63, 185, 80, 0.1);
  --danger: #f85149;
  --warning: #d29922;
  --info: #58a6ff;
  --win: #3fb950;
  --loss: #f85149;
  --draw: #d29922;
  --radius: 6px;
  --radius-lg: 10px;
  --shadow: 0 1px 3px rgba(0,0,0,0.4);
  --shadow-lg: 0 4px 16px rgba(0,0,0,0.5);
}
`);

// ── Reset & Base ───────────────────────────────────────────────────────────────

block(`
*, *::before, *::after {
  box-sizing: border-box;
}
`);

block(`
html, body {
  height: 100%;
  margin: 0;
}
`);

block(`
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`);

block(`
h1, h2, h3, h4 {
  margin: 0 0 0.5em;
  line-height: 1.2;
  font-weight: 600;
}
`);

block(`
h1 { font-size: 1.75rem; }
`);

block(`
h2 { font-size: 1.25rem; }
`);

block(`
h3 { font-size: 1.1rem; }
`);

block(`
h4 { font-size: 0.95rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
`);

block(`
p { margin: 0 0 0.75em; }
`);

block(`
a { color: var(--accent); text-decoration: none; }
`);

block(`
a:hover { text-decoration: underline; }
`);

// ── Buttons ────────────────────────────────────────────────────────────────────

block(`
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: var(--radius);
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  line-height: 1.5;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
  text-align: center;
  justify-content: center;
}
`);

block(`
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
`);

block(`
.btn-primary {
  background: var(--accent-muted);
  border-color: rgba(63, 185, 80, 0.3);
  color: #fff;
}
`);

block(`
.btn-primary:hover:not(:disabled) {
  background: #2ea043;
  border-color: rgba(63, 185, 80, 0.5);
}
`);

block(`
.btn-secondary {
  background: var(--surface-2);
  border-color: var(--border);
  color: var(--text);
}
`);

block(`
.btn-secondary:hover:not(:disabled) {
  background: #262c36;
  border-color: #8b949e;
}
`);

block(`
.btn-sm {
  padding: 3px 10px;
  font-size: 13px;
}
`);

block(`
.btn-large {
  padding: 10px 24px;
  font-size: 15px;
  width: 100%;
}
`);

block(`
.btn-google {
  background: var(--surface-2);
  border-color: var(--border);
  color: var(--text);
  width: 100%;
  padding: 10px 16px;
  font-size: 15px;
}
`);

block(`
.btn-google:hover:not(:disabled) {
  background: #262c36;
  border-color: #8b949e;
}
`);

// ── Forms ──────────────────────────────────────────────────────────────────────

block(`
.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 14px;
}
`);

block(`
.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
}
`);

block(`
input[type="text"],
input[type="email"],
input[type="password"],
input[type="number"],
select {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 14px;
  padding: 6px 10px;
  width: 100%;
  transition: border-color 0.15s;
  outline: none;
}
`);

block(`
input[type="text"]:focus,
input[type="email"]:focus,
input[type="password"]:focus,
input[type="number"]:focus,
select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-subtle);
}
`);

block(`
input::placeholder { color: var(--text-muted); }
`);

block(`
input:disabled, select:disabled { opacity: 0.5; cursor: not-allowed; }
`);

block(`
select {
  cursor: pointer;
  width: auto;
  padding-right: 28px;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238b949e' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
`);

// ── Messages ───────────────────────────────────────────────────────────────────

block(`
.error-message {
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.3);
  color: #ffa198;
  border-radius: var(--radius);
  padding: 8px 12px;
  font-size: 13px;
  margin-bottom: 12px;
}
`);

block(`
.success-message {
  background: rgba(63, 185, 80, 0.1);
  border: 1px solid rgba(63, 185, 80, 0.3);
  color: #7ee787;
  border-radius: var(--radius);
  padding: 8px 12px;
  font-size: 13px;
  margin-top: 10px;
}
`);

// ── Auth Pages ─────────────────────────────────────────────────────────────────

block(`
.login-page,
.create-account-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}
`);

block(`
.auth-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 32px;
  width: 100%;
  max-width: 400px;
  box-shadow: var(--shadow-lg);
}
`);

block(`
.auth-header {
  text-align: center;
  margin-bottom: 24px;
}
`);

block(`
.auth-header h1 {
  font-size: 1.5rem;
  margin-bottom: 4px;
}
`);

block(`
.auth-header p {
  color: var(--text-muted);
  font-size: 14px;
  margin: 0;
}
`);

block(`
.auth-methods {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
`);

block(`
.auth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
}
`);

block(`
.auth-divider::before,
.auth-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border);
}
`);

block(`
.auth-form {
  display: flex;
  flex-direction: column;
}
`);

block(`
.auth-submit {
  margin-top: 6px;
}
`);

block(`
.auth-footer {
  margin-top: 20px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}
`);

block(`
.auth-footer p { margin: 0; }
`);

block(`
.auth-link {
  color: var(--accent);
}
`);

block(`
.auth-link:hover { text-decoration: underline; }
`);

// ── Home Page ──────────────────────────────────────────────────────────────────

block(`
.home-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}
`);

block(`
.home-page h1 { font-size: 2.5rem; margin-bottom: 8px; }
`);

block(`
.home-page p { color: var(--text-muted); font-size: 1.1rem; }
`);

// ── Dashboard Layout ───────────────────────────────────────────────────────────

block(`
.dashboard-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
`);

block(`
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}
`);

block(`
.dashboard-header h1 {
  font-size: 1.15rem;
  margin: 0;
}
`);

block(`
.dashboard-content {
  flex: 1;
  padding: 24px;
  max-width: 1000px;
  width: 100%;
  margin: 0 auto;
}
`);

block(`
.chess-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
}
`);

block(`
.chess-section > h2 {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-muted);
}
`);

block(`
.chess-connected {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
`);

block(`
.chess-connected p { margin: 0; }
`);

block(`
.game-count {
  color: var(--text-muted);
  font-size: 13px;
}
`);

block(`
.chess-username-form {
  max-width: 360px;
}
`);

block(`
.chess-username-form p {
  color: var(--text-muted);
  margin-bottom: 14px;
  font-size: 14px;
}
`);

// ── Filter Bar ─────────────────────────────────────────────────────────────────

block(`
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px 0;
  margin-bottom: 4px;
}
`);

block(`
.filter-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
`);

block(`
.filter-row label {
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
}
`);

block(`
.filter-pill {
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
`);

block(`
.filter-pill:hover {
  border-color: var(--accent);
  color: var(--text);
}
`);

block(`
.filter-pill.active {
  background: var(--accent-subtle);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 500;
}
`);

// ── Tabs ───────────────────────────────────────────────────────────────────────

block(`
.tab-strip {
  display: flex;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}
`);

block(`
.tab-btn {
  padding: 8px 18px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}
`);

block(`
.tab-btn:hover { color: var(--text); }
`);

block(`
.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
`);

// ── Stats Section & Tables ─────────────────────────────────────────────────────

block(`
.stats-section {
  margin-top: 8px;
}
`);

block(`
.stats-section h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}
`);

block(`
.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
`);

block(`
.stats-table th {
  text-align: left;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
`);

block(`
.stats-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-muted);
  color: var(--text);
}
`);

block(`
.stats-table tr:last-child td { border-bottom: none; }
`);

block(`
.stats-table tbody tr:hover td { background: rgba(255,255,255,0.02); }
`);

block(`
.games-table .game-row {
  cursor: pointer;
}
`);

block(`
.games-table .game-row:hover td {
  background: rgba(255,255,255,0.04);
}
`);

block(`
.opening-cell {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 13px;
}
`);

block(`
.opening-toggle {
  color: var(--text);
  text-decoration: none;
  font-size: 13px;
}
`);

block(`
.opening-toggle:hover { color: var(--accent); }
`);

block(`
.variation-row td {
  background: rgba(255,255,255,0.01);
  font-size: 13px;
  color: var(--text-muted);
}
`);

// ── Result Classes ─────────────────────────────────────────────────────────────

block(`
.result-win { color: var(--win); font-weight: 600; }
`);

block(`
.result-loss { color: var(--loss); font-weight: 600; }
`);

block(`
.result-draw { color: var(--draw); font-weight: 600; }
`);

// ── Badges ─────────────────────────────────────────────────────────────────────

block(`
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
`);

block(`
.badge-none { color: var(--text-muted); }
`);

block(`
.badge-pending {
  background: rgba(210, 153, 34, 0.15);
  color: var(--warning);
  border: 1px solid rgba(210,153,34,0.3);
}
`);

block(`
.badge-analyzing {
  background: rgba(88, 166, 255, 0.15);
  color: var(--info);
  border: 1px solid rgba(88,166,255,0.3);
}
`);

block(`
.badge-done {
  background: rgba(63, 185, 80, 0.15);
  color: var(--win);
  border: 1px solid rgba(63,185,80,0.3);
}
`);

block(`
.badge-failed {
  background: rgba(248, 81, 73, 0.15);
  color: var(--danger);
  border: 1px solid rgba(248,81,73,0.3);
}
`);

block(`
.eval-pos { color: var(--win); }
`);

block(`
.eval-neg { color: var(--danger); }
`);

// ── Games Section Header ───────────────────────────────────────────────────────

block(`
.games-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
`);

block(`
.games-count {
  color: var(--text-muted);
  font-size: 13px;
}
`);

// ── Pagination ─────────────────────────────────────────────────────────────────

block(`
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 0 4px;
}
`);

block(`
.pagination-info {
  color: var(--text-muted);
  font-size: 13px;
}
`);

// ── Game Detail Page ───────────────────────────────────────────────────────────

block(`
.back-link {
  margin-bottom: 16px;
}
`);

block(`
.back-link a {
  color: var(--text-muted);
  font-size: 13px;
}
`);

block(`
.back-link a:hover { color: var(--text); }
`);

block(`
.game-header {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  margin-bottom: 16px;
}
`);

block(`
.game-players {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
`);

block(`
.player {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
}
`);

block(`
.player-user .player-name {
  font-weight: 700;
  color: var(--accent);
}
`);

block(`
.piece { font-size: 18px; }
`);

block(`
.player-name { font-weight: 500; }
`);

block(`
.player-rating { color: var(--text-muted); font-size: 13px; }
`);

block(`
.vs-badge {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
`);

block(`
.game-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
`);

block(`
.result-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
}
`);

block(`
.result-win.result-badge { background: rgba(63,185,80,0.15); border: 1px solid rgba(63,185,80,0.3); }
`);

block(`
.result-loss.result-badge { background: rgba(248,81,73,0.15); border: 1px solid rgba(248,81,73,0.3); }
`);

block(`
.result-draw.result-badge { background: rgba(210,153,34,0.15); border: 1px solid rgba(210,153,34,0.3); }
`);

block(`
.game-time-class,
.game-time-control {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 12px;
  color: var(--text-muted);
  text-transform: capitalize;
}
`);

block(`
.game-opening {
  font-size: 13px;
  color: var(--text-muted);
  font-style: italic;
}
`);

block(`
.game-date {
  font-size: 13px;
  color: var(--text-muted);
  margin-left: auto;
}
`);

// ── Analysis Panel ─────────────────────────────────────────────────────────────

block(`
.analysis-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  margin-bottom: 16px;
}
`);

// ── Accuracy Bars ──────────────────────────────────────────────────────────────

block(`
.accuracy-section {
  margin-bottom: 16px;
}
`);

block(`
.accuracy-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}
`);

block(`
.accuracy-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
`);

block(`
.accuracy-label {
  width: 40px;
  font-size: 13px;
  color: var(--text-muted);
}
`);

block(`
.accuracy-bar-track {
  flex: 1;
  height: 8px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}
`);

block(`
.accuracy-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.4s ease;
}
`);

block(`
.accuracy-value {
  width: 48px;
  text-align: right;
  font-size: 13px;
  font-weight: 600;
}
`);

block(`
.acc-great { background-color: var(--win); color: white; }
`);

block(`
.acc-good { background-color: var(--warning); color: white; }
`);

block(`
.acc-poor { background-color: var(--loss); color: white; }
`);

block(`
.accuracy-phases {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 10px;
}
`);

block(`
.accuracy-phase-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
`);

block(`
.accuracy-phase-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
`);

block(`
.accuracy-value-empty {
  color: var(--text-muted);
  font-weight: 400;
}
`);

// ── Move Table ─────────────────────────────────────────────────────────────────

block(`
.move-table-section {
  margin-top: 8px;
}
`);

block(`
.move-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
`);

block(`
.move-table th {
  text-align: left;
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border);
}
`);

block(`
.move-table td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-muted);
}
`);

block(`
.move-table tr:last-child td { border-bottom: none; }
`);

block(`
.move-num { color: var(--text-muted); width: 30px; }
`);

block(`
.move-played { font-weight: 500; }
`);

block(`
.move-blunder { color: #f85149; font-weight: 600; }
`);

block(`
.move-mistake { color: #e07b39; }
`);

block(`
.move-inaccuracy { color: var(--warning); }
`);

block(`
.move-excellent { color: var(--accent); }
`);

block(`
.move-quality-symbol { font-size: 11px; margin-left: 2px; opacity: 0.85; }
`);

block(`
.move-quality-summary {
  margin-top: 8px;
  margin-bottom: 4px;
}
`);

block(`
.quality-table {
  border-collapse: collapse;
  font-size: 13px;
}
`);

block(`
.quality-table th, .quality-table td {
  padding: 4px 16px 4px 0;
  text-align: center;
}
`);

block(`
.quality-table th:first-child, .quality-table td:first-child {
  text-align: left;
  padding-right: 20px;
  color: var(--text-muted);
}
`);

block(`
.quality-color-label { color: var(--text-muted); }
`);

block(`
.quality-blunder-count { color: #f85149; font-weight: 600; }
`);

block(`
.quality-mistake-count { color: #e07b39; }
`);

block(`
.quality-inaccuracy-count { color: var(--warning); }
`);

block(`
.move-best { color: var(--text-muted); font-size: 12px; }
`);

block(`
.eval-pos { color: var(--win); }
`);

block(`
.eval-neg { color: var(--loss); }
`);

block(`
.eval-neutral { color: var(--text-muted); }
`);

// ── Eval Graph ──────────────────────────────────────────────────────────────────

block(`
.eval-graph-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
}
`);

block(`
.eval-graph-section h4 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
`);

block(`
.eval-graph {
  display: block;
  width: 100%;
  height: 120px;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface-2);
}
`);

block(`
.eval-graph-white { fill: rgba(230, 230, 230, 0.82); }
`);

block(`
.eval-graph-black { fill: rgba(20, 20, 20, 0.82); }
`);

block(`
.eval-graph-zero {
  stroke: var(--border);
  stroke-width: 1;
}
`);

block(`
.eval-graph-line {
  fill: none;
  stroke: var(--text-muted);
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}
`);

// ── PGN ────────────────────────────────────────────────────────────────────────

block(`
.pgn-details {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
`);

block(`
.pgn-details summary {
  padding: 12px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  user-select: none;
}
`);

block(`
.pgn-details summary:hover { color: var(--text); }
`);

block(`
.pgn-details[open] summary { border-bottom: 1px solid var(--border); }
`);

block(`
.pgn-text {
  padding: 16px 20px;
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}
`);

block(`
.pgn-details summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
`);

block(`
.pgn-copy-btn {
  font-size: 12px;
  padding: 4px 10px;
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  cursor: pointer;
}
`);

block(`
.pgn-copy-btn:hover { color: var(--text); border-color: var(--accent); }
`);

block(`
.rating-chart-section {
  margin-bottom: 16px;
}
`);

block(`
.rating-chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
`);

block(`
.rating-chart-legend {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
`);

block(`
.rating-legend-pill {
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}
`);

block(`
.rating-legend-pill.active {
  background: rgba(255,255,255,0.05);
  font-weight: 500;
}
`);

block(`
.rating-chart {
  display: block;
  width: 100%;
  height: 180px;
  background: var(--surface-2);
  border-radius: var(--radius);
  overflow: hidden;
}
`);

block(`
.board-svg {
  margin: 1rem 0;
  max-width: 360px;
}
`);

block(`
.board-svg svg {
  display: block;
  width: 100%;
  height: auto;
}
`);
