/**
 * Mobile shell — bottom nav + sticky header.
 * Trading-app style: dark theme, big tap targets, thumb-friendly nav.
 */
export function mobileShell(title, body, opts = {}) {
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
  <meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'/>
  <meta name='theme-color' content='#070b14'/>
  <meta name='apple-mobile-web-app-capable' content='yes'/>
  <meta name='apple-mobile-web-app-status-bar-style' content='black-translucent'/>
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
      --safe-top: env(safe-area-inset-top, 0px);
      --safe-bottom: env(safe-area-inset-bottom, 0px);
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body { margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      min-height: 100vh;
      padding-bottom: calc(72px + var(--safe-bottom));
      overscroll-behavior-y: contain;
      -webkit-font-smoothing: antialiased;
    }

    /* Sticky header */
    .m-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(7, 11, 20, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(96, 165, 250, 0.1);
      padding: calc(var(--safe-top) + 12px) 16px 12px;
    }
    .m-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .m-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.01em;
    }
    .m-status {
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
    .m-status::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Top stats row (sub-header) */
    .m-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-top: 10px;
    }
    .m-stat {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(96, 165, 250, 0.08);
      border-radius: 10px;
      padding: 8px 6px;
      text-align: center;
    }
    .m-stat-label {
      font-size: 9px;
      font-weight: 600;
      color: var(--muted);
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .m-stat-value {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      margin-top: 2px;
    }
    .m-stat-value.up { color: #6ee7b7; }
    .m-stat-value.dn { color: #fca5a5; }

    /* Main content */
    .m-content {
      padding: 16px;
      padding-bottom: 0;
    }

    /* Bottom nav */
    .m-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 100;
      background: rgba(7, 11, 20, 0.92);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-top: 1px solid rgba(96, 165, 250, 0.15);
      padding: 8px 8px calc(8px + var(--safe-bottom));
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
    }
    .m-nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 8px 4px;
      min-height: 56px;
      border-radius: 12px;
      text-decoration: none;
      color: var(--muted);
      font-size: 10px;
      font-weight: 600;
      transition: all 0.15s;
    }
    .m-nav-item:active {
      transform: scale(0.95);
      background: rgba(96, 165, 250, 0.1);
    }
    .m-nav-item.active {
      color: var(--blue);
      background: linear-gradient(180deg, rgba(96, 165, 250, 0.15), rgba(96, 165, 250, 0.05));
    }
    .m-nav-icon {
      font-size: 20px;
      line-height: 1;
    }
    .m-nav-label {
      font-size: 10px;
      letter-spacing: 0.2px;
    }

    /* Common card style */
    .m-card {
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.45));
      border: 1px solid rgba(96, 165, 250, 0.12);
      border-radius: 16px;
      padding: 14px;
      margin-bottom: 10px;
    }

    /* Filter chip row */
    .m-filters {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding: 4px 0 12px;
      margin: 0 -16px;
      padding-left: 16px;
      padding-right: 16px;
      scrollbar-width: none;
    }
    .m-filters::-webkit-scrollbar { display: none; }
    .m-chip {
      flex-shrink: 0;
      padding: 7px 14px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(96, 165, 250, 0.12);
      border-radius: 999px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .m-chip.active {
      background: rgba(96, 165, 250, 0.18);
      border-color: rgba(96, 165, 250, 0.4);
      color: var(--text);
    }
    .m-chip:active { transform: scale(0.96); }

    /* Empty state */
    .m-empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--muted);
      font-size: 13px;
    }
    .m-empty-icon {
      font-size: 40px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    /* Hide horizontal scrollbars */
    body { overflow-x: hidden; }
  </style>
</head>
<body>
  <header class='m-header'>
    <div class='m-header-row'>
      <div class='m-title'>${title}</div>
      <div class='m-status'>LIVE</div>
    </div>
    ${stats.tiles ? `<div class='m-stats'>${stats.tiles}</div>` : ''}
  </header>

  <main class='m-content'>${body}</main>

  <nav class='m-nav'>
    ${navItems.map(item => `<a href='${item.path}' class='m-nav-item ${item.path === activePath ? 'active' : ''}'>
      <div class='m-nav-icon'>${item.icon}</div>
      <div class='m-nav-label'>${item.label}</div>
    </a>`).join('')}
  </nav>
</body>
</html>`;
}
