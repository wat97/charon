/**
 * Desktop shell — sidebar + topbar layout.
 * Trading dashboard style: info-dense, multi-column workspace.
 */
export function desktopShell(title, body, opts = {}) {
  const { activePath = '/', stats = {} } = opts;
  const navItems = [
    { path: '/', icon: '📊', label: 'Positions' },
    { path: '/candidates', icon: '🎯', label: 'Candidates' },
    { path: '/pnl', icon: '💰', label: 'PnL' },
    { path: '/strategy', icon: '⚙️', label: 'Strategy' },
  ];

  return `<!doctype html>
<html>
<head>
  <meta charset='utf-8'/>
  <meta name='viewport' content='width=device-width, initial-scale=1'/>
  <title>Charon · ${title}</title>
  <style>
    :root {
      --bg: #070b14;
      --bg-surface: #0f172a;
      --bg-card: #131a2b;
      --line: #24314d;
      --text: #e6edff;
      --muted: #94a5d4;
      --green: #22c55e;
      --red: #ef4444;
      --blue: #60a5fa;
      --amber: #f59e0b;
      --purple: #a855f7;
      --cyan: #06b6d4;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      overflow: hidden;
    }

    /* Layout */
    .ds-layout {
      display: grid;
      grid-template-columns: 240px 1fr;
      grid-template-rows: 64px 1fr;
      height: 100vh;
    }

    /* Sidebar */
    .ds-sidebar {
      grid-column: 1;
      grid-row: 1 / span 2;
      background: rgba(7, 11, 20, 0.95);
      border-right: 1px solid rgba(96, 165, 250, 0.15);
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ds-logo {
      font-size: 18px;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.02em;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ds-logo span { color: var(--blue); }
    .ds-nav {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ds-nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      text-decoration: none;
      color: var(--muted);
      font-weight: 600;
      transition: all 0.15s;
    }
    .ds-nav-item:hover { background: rgba(96, 165, 250, 0.08); color: var(--text); }
    .ds-nav-item.active {
      background: linear-gradient(90deg, rgba(96, 165, 250, 0.15), transparent);
      color: var(--blue);
      border-left: 3px solid var(--blue);
    }
    .ds-nav-icon { font-size: 18px; }
    .ds-nav-label { letter-spacing: 0.2px; }

    /* Topbar */
    .ds-topbar {
      grid-column: 2;
      grid-row: 1;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(96, 165, 250, 0.15);
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .ds-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
    }
    .ds-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.25);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      color: #6ee7b7;
    }
    .ds-status::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    /* Main content */
    .ds-content {
      grid-column: 2;
      grid-row: 2;
      padding: 20px;
      overflow-y: auto;
    }

    /* Stats row */
    .ds-stats {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    .ds-stat {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(96, 165, 250, 0.1);
      border-radius: 12px;
      padding: 12px 14px;
    }
    .ds-stat-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: var(--muted);
      text-transform: uppercase;
    }
    .ds-stat-value {
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
      margin-top: 4px;
    }
    .ds-stat-value.up { color: #6ee7b7; }
    .ds-stat-value.dn { color: #fca5a5; }

    /* Empty state */
    .ds-empty {
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
    }
    .ds-empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.4; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: rgba(96, 165, 250, 0.3);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover { background: rgba(96, 165, 250, 0.5); }
  </style>
</head>
<body>
  <div class='ds-layout'>
    <aside class='ds-sidebar'>
      <div class='ds-logo'>Charon<span>Trading</span></div>
      <nav class='ds-nav'>
        ${navItems.map(item => `<a href='${item.path}' class='ds-nav-item ${item.path === activePath ? 'active' : ''}'>
          <span class='ds-nav-icon'>${item.icon}</span>
          <span class='ds-nav-label'>${item.label}</span>
        </a>`).join('')}
      </nav>
    </aside>

    <header class='ds-topbar'>
      <div class='ds-title'>${title}</div>
      <div class='ds-status'>LIVE</div>
    </header>

    <main class='ds-content'>${body}</main>
  </div>
</body>
</html>`;
}
