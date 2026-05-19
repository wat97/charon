import http from 'http';
import Database from 'better-sqlite3';

const HOST = process.env.CHARON_DASHBOARD_HOST || '127.0.0.1';
const PORT = Number(process.env.CHARON_DASHBOARD_PORT || 20120);
const DB_PATH = process.env.DB_PATH || './charon.sqlite';
const TROJAN_BOT = process.env.TROJAN_BOT || 'solana_trojanbot';

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

const now = () => Date.now();
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const fmtNum = (n, d = 2) => (n == null || Number.isNaN(Number(n)))
  ? '-'
  : Number(n).toLocaleString('en-US', { maximumFractionDigits: d });

const fmtPct = (n) => (n == null || Number.isNaN(Number(n)))
  ? '-'
  : `${Number(n) > 0 ? '+' : ''}${Number(n).toFixed(2)}%`;

const fmtSol = (n) => (n == null || Number.isNaN(Number(n)))
  ? '-'
  : `${Number(n) > 0 ? '+' : ''}${Number(n).toFixed(4)} SOL`;

function fmtAge(ms) {
  if (!ms) return '-';
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function fmtAgeSince(ms) {
  if (!ms) return '-';
  return fmtAge(now() - Number(ms));
}

function safeJson(s, fallback = {}) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function getEnabledStrategy() {
  const r = db.prepare('SELECT id,name,config_json FROM strategies WHERE enabled=1 LIMIT 1').get();
  return r ? { id: r.id, name: r.name, config: safeJson(r.config_json) } : null;
}

function getPositions() {
  const open = db.prepare("SELECT id,symbol,mint,status,opened_at_ms,size_sol,entry_price,strategy_id FROM dry_run_positions WHERE status='open' ORDER BY opened_at_ms DESC").all();
  const closed = db.prepare("SELECT id,symbol,mint,status,opened_at_ms,closed_at_ms,size_sol,entry_price,exit_price,pnl_percent,pnl_sol,strategy_id FROM dry_run_positions WHERE status='closed' ORDER BY opened_at_ms DESC").all();
  return { open, closed };
}

function getPnlSummary() {
  return db.prepare(`
    SELECT
      COUNT(*) total,
      SUM(CASE WHEN pnl_percent > 0 THEN 1 ELSE 0 END) wins,
      SUM(CASE WHEN pnl_percent <= 0 THEN 1 ELSE 0 END) losses,
      AVG(COALESCE(pnl_percent, 0)) avg_pnl_percent,
      SUM(COALESCE(pnl_sol, 0)) total_pnl_sol,
      MAX(pnl_percent) best_pnl_percent,
      MIN(pnl_percent) worst_pnl_percent,
      SUM(CASE WHEN pnl_sol > 0 THEN pnl_sol ELSE 0 END) gross_profit_sol,
      SUM(CASE WHEN pnl_sol <= 0 THEN pnl_sol ELSE 0 END) gross_loss_sol,
      AVG(CASE WHEN pnl_percent > 0 THEN pnl_percent END) avg_win_pct,
      AVG(CASE WHEN pnl_percent <= 0 THEN pnl_percent END) avg_loss_pct,
      AVG(CASE WHEN closed_at_ms IS NOT NULL AND opened_at_ms IS NOT NULL THEN (closed_at_ms - opened_at_ms) END) avg_hold_ms
    FROM dry_run_positions
    WHERE status='closed'
  `).get();
}

function getClosedSeries() {
  return db.prepare("SELECT closed_at_ms,pnl_percent,pnl_sol FROM dry_run_positions WHERE status='closed' ORDER BY closed_at_ms ASC").all();
}

const TILE_BG = "background: linear-gradient(180deg, #131d31, #10182a);";
const PANEL_BG = "background: linear-gradient(180deg, #131d31, #10182a);";

function renderShell(title, body) {
  return `<!doctype html>
<html>
<head>
  <meta charset='utf-8'/>
  <meta name='viewport' content='width=device-width, initial-scale=1'/>
  <title>${esc(title)}</title>
  <style>
    :root {
      --bg: #070b14;
      --line: #24314d;
      --text: #e6edff;
      --muted: #94a5d4;
      --green: #22c55e;
      --red: #ef4444;
      --blue: #60a5fa;
      --amber: #f59e0b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 22px;
      background:
        radial-gradient(1000px 500px at 80% -20%, #1e3a8a22, transparent 60%),
        radial-gradient(800px 450px at -10% 0%, #0ea5e922, transparent 55%),
        var(--bg);
      color: var(--text);
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    a { color: #bcd0ff; }
    .wrap { max-width: 1360px; margin: 0 auto; }
    h1 { margin: 0 0 14px; font-size: 26px; letter-spacing: .2px; }
    h2 { font-size: 18px; margin: 22px 0 12px; }
    .sub { color: var(--muted); font-size: 13px; margin-bottom: 16px; }

    .nav { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
    .pill {
      color: #bcd0ff; text-decoration: none; font-weight: 600; font-size: 13px;
      padding: 8px 12px; border-radius: 999px;
      ${TILE_BG}
      border: 1px solid var(--line);
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .tile {
      ${TILE_BG}
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
    }
    .k { color: var(--muted); font-size: 12px; }
    .v { font-size: 21px; font-weight: 700; margin-top: 4px; }
    .up { color: var(--green); }
    .dn { color: var(--red); }

    .chart {
      ${TILE_BG}
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 14px;
    }
    .chart-title { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
    .chart svg { width: 100%; height: 160px; display: block; }
    .charts-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    @media (max-width: 980px) { .charts-grid { grid-template-columns: 1fr; } }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .filters { display: flex; gap: 8px; }
    .fbtn {
      border: 1px solid var(--line);
      background: #111a2c;
      color: #c9d8ff;
      font-size: 12px;
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
    }
    .fbtn.active { border-color: #3b82f6; color: #dbeafe; }

    .layout {
      display: grid;
      grid-template-columns: 1.3fr 0.7fr;
      gap: 12px;
      align-items: start;
    }
    @media (max-width: 980px) { .layout { grid-template-columns: 1fr; } }

    .list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(255px, 1fr));
      gap: 10px;
    }

    .pos {
      ${PANEL_BG}
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      cursor: pointer;
      transition: transform .08s ease, border-color .12s ease;
    }
    .pos:hover { transform: translateY(-1px); border-color: #3b82f6; }
    .pos.active { border-color: #60a5fa; box-shadow: 0 0 0 1px #60a5fa33 inset; }

    .pos-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .sym { font-size: 16px; font-weight: 700; letter-spacing: .1px; }
    .badge {
      font-size: 10px; letter-spacing: .5px; font-weight: 800;
      padding: 4px 7px; border-radius: 999px;
    }
    .b-open { background: #10311f; color: #6ee7b7; }
    .b-closed { background: #351417; color: #fca5a5; }

    .pnl-big { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 10px;
      font-size: 12px;
      color: var(--muted);
    }
    .meta b { color: #dbe7ff; font-weight: 600; }

    .ext {
      display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap;
    }
    .ext a {
      text-decoration: none;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: #111a2c;
      color: #cfe1ff;
    }
    .ext a.gmgn { background: linear-gradient(180deg,#1f2937,#0f172a); color:#60f5b3; border-color:#264c3a; }
    .ext a.trojan { background: linear-gradient(180deg,#1f2937,#0f172a); color:#f5b86a; border-color:#4c3a26; }
    .ext a.solscan { color:#a3b8ff; }

    .side {
      position: sticky; top: 16px;
      ${PANEL_BG}
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      min-height: 320px;
    }
    .side h3 { margin: 0 0 10px; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
    .dk { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
    .dv { font-size: 13px; font-weight: 600; word-break: break-word; }
    code {
      background: #0d1424;
      border: 1px solid var(--line);
      padding: 2px 6px;
      border-radius: 6px;
      color: #c7d6ff;
      font-size: 11px;
    }

    .empty {
      border: 1px dashed var(--line);
      border-radius: 12px;
      padding: 18px;
      color: var(--muted);
      text-align: center;
      background: #0f1627;
      grid-column: 1 / -1;
    }

    .strat-list {
      ${TILE_BG}
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      display: grid;
      gap: 10px;
    }

    .reco {
      ${TILE_BG}
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      margin-top: 14px;
    }
    .reco h3 { margin: 0 0 10px; font-size: 16px; }
    .reco li { margin: 6px 0; color: #d8e1ff; }
    .reco .tag {
      display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px;
      border-radius: 999px; margin-right: 8px; vertical-align: middle;
    }
    .tag-good { background:#10311f; color:#6ee7b7; }
    .tag-bad  { background:#351417; color:#fca5a5; }
    .tag-info { background:#13294b; color:#bcd0ff; }
    .tag-warn { background:#3a2a13; color:#fcd58c; }
  </style>
</head>
<body>
  <div class='wrap'>
    <h1>Charon Dashboard</h1>
    <div class='sub'>Trading-style read-only view focused on PnL and position flow.</div>
    <div class='nav'>
      <a class='pill' href='/positions'>Positions</a>
      <a class='pill' href='/pnl'>PnL</a>
      <a class='pill' href='/strategy'>Strategy</a>
    </div>
    ${body}
  </div>
</body>
</html>`;
}

function buildEquityCurveSvg(history) {
  if (history.length < 2) return `<div class='k'>Not enough closed trades yet.</div>`;
  const w = 900, h = 160, pad = 22;
  let cum = 0;
  const series = history.map((x) => {
    cum += Number(x.pnl_sol || 0);
    return { t: x.closed_at_ms, v: cum };
  });
  const max = Math.max(...series.map((s) => s.v), 0.0001);
  const min = Math.min(...series.map((s) => s.v), -0.0001);
  const range = Math.max(Math.abs(max), Math.abs(min), 0.05);
  const points = series.map((s, i) => {
    const x = pad + (i / (series.length - 1)) * (w - pad * 2);
    const y = h / 2 - (s.v / range) * ((h - pad * 2) / 2);
    return `${x},${y}`;
  });
  const path = points.join(' ');
  const zero = h / 2;
  return `<svg viewBox='0 0 ${w} ${h}' preserveAspectRatio='none'>
    <line x1='${pad}' y1='${zero}' x2='${w - pad}' y2='${zero}' stroke='#334155' stroke-dasharray='4 4'/>
    <line x1='${pad}' y1='${pad}' x2='${pad}' y2='${h - pad}' stroke='#24314d'/>
    <path d='M${path}' fill='none' stroke='#60a5fa' stroke-width='2.5' />
    ${points.map((p) => { const [cx, cy] = p.split(','); return `<circle cx='${cx}' cy='${cy}' r='3.5' fill='#60a5fa' stroke='#0b1020' stroke-width='2'/>`; }).join('')}
  </svg>`;
}

function buildHistogramSvg(history) {
  if (history.length < 2) return `<div class='k'>Not enough closed trades yet.</div>`;
  const buckets = [
    { label: '<-50%', min: -Infinity, max: -50, n: 0, color: '#ef4444' },
    { label: '-50..-20%', min: -50, max: -20, n: 0, color: '#f87171' },
    { label: '-20..0%', min: -20, max: 0, n: 0, color: '#fb923c' },
    { label: '0..20%', min: 0, max: 20, n: 0, color: '#a3e635' },
    { label: '20..50%', min: 20, max: 50, n: 0, color: '#22c55e' },
    { label: '>50%', min: 50, max: Infinity, n: 0, color: '#16a34a' },
  ];
  history.forEach((h) => {
    const v = Number(h.pnl_percent || 0);
    for (const b of buckets) { if (v >= b.min && v < b.max) { b.n += 1; break; } }
  });
  const w = 600, h = 160, pad = 24;
  const maxN = Math.max(...buckets.map((b) => b.n), 1);
  const colW = (w - pad * 2) / buckets.length;
  return `<svg viewBox='0 0 ${w} ${h}' preserveAspectRatio='none'>
    ${buckets.map((b, i) => {
      const x = pad + i * colW + 4;
      const bw = colW - 8;
      const bh = ((h - pad * 2) * b.n) / maxN;
      const y = h - pad - bh;
      return `<g>
        <rect x='${x}' y='${y}' width='${bw}' height='${bh}' fill='${b.color}' rx='4'/>
        <text x='${x + bw / 2}' y='${h - 6}' fill='#94a5d4' font-size='10' text-anchor='middle'>${b.label}</text>
        <text x='${x + bw / 2}' y='${y - 4}' fill='#dbe7ff' font-size='10' text-anchor='middle'>${b.n}</text>
      </g>`;
    }).join('')}
    <line x1='${pad}' y1='${h - pad}' x2='${w - pad}' y2='${h - pad}' stroke='#24314d'/>
  </svg>`;
}

function computeAdvancedStats(history, summary) {
  if (!history.length) return null;

  let cum = 0; let peak = 0; let maxDdSol = 0; let maxDdPct = 0;
  history.forEach((h) => {
    cum += Number(h.pnl_sol || 0);
    if (cum > peak) peak = cum;
    const ddSol = peak - cum;
    if (ddSol > maxDdSol) maxDdSol = ddSol;
    if (peak > 0) {
      const ddPct = (ddSol / peak) * 100;
      if (ddPct > maxDdPct) maxDdPct = ddPct;
    }
  });

  const grossProfit = Number(summary.gross_profit_sol || 0);
  const grossLoss = Math.abs(Number(summary.gross_loss_sol || 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

  const avgWinPct = Number(summary.avg_win_pct || 0);
  const avgLossPct = Math.abs(Number(summary.avg_loss_pct || 0));
  const expectancyPct = (
    (Number(summary.wins || 0) / Math.max(1, Number(summary.total || 1))) * avgWinPct
    - (Number(summary.losses || 0) / Math.max(1, Number(summary.total || 1))) * avgLossPct
  );

  const avgHoldMs = Number(summary.avg_hold_ms || 0);

  return {
    profitFactor,
    maxDrawdownSol: maxDdSol,
    maxDrawdownPct: maxDdPct,
    expectancyPct,
    avgHoldMs,
    avgWinPct,
    avgLossPct,
  };
}

function generateRecommendations(summary, advanced, strategy) {
  const tips = [];
  if (!summary || !summary.total) {
    tips.push({ kind: 'info', text: 'No closed trades yet. Loosen filters carefully or wait for stronger signals before tuning anything.' });
    return tips;
  }

  const winRate = summary.total ? (summary.wins / summary.total) * 100 : 0;
  const total = Number(summary.total_pnl_sol || 0);
  const pf = advanced?.profitFactor ?? 0;
  const dd = advanced?.maxDrawdownPct ?? 0;
  const expectancy = advanced?.expectancyPct ?? 0;

  if (winRate < 35) {
    tips.push({ kind: 'bad', text: `Win rate is low (${winRate.toFixed(1)}%). Consider tightening entry filters: raise min_source_count or require stronger price confirmation.` });
  } else if (winRate > 60) {
    tips.push({ kind: 'good', text: `Win rate is healthy (${winRate.toFixed(1)}%). Strategy is selecting good entries — keep current filters.` });
  } else {
    tips.push({ kind: 'info', text: `Win rate is moderate (${winRate.toFixed(1)}%). Focus on payoff ratio rather than entries.` });
  }

  if (pf === Infinity) {
    tips.push({ kind: 'good', text: 'Profit factor is excellent (no losing trades yet). Keep risk per position small to preserve this edge.' });
  } else if (pf >= 1.5) {
    tips.push({ kind: 'good', text: `Profit factor ${pf.toFixed(2)} is solid. Strategy compensates losses with bigger wins.` });
  } else if (pf >= 1) {
    tips.push({ kind: 'warn', text: `Profit factor ${pf.toFixed(2)} is barely above breakeven. Tighten stop loss or extend take profit to widen edge.` });
  } else {
    tips.push({ kind: 'bad', text: `Profit factor ${pf.toFixed(2)} is below 1. Strategy currently bleeds — reduce frequency, raise min market cap or token age limits.` });
  }

  if (dd > 30) {
    tips.push({ kind: 'bad', text: `Max drawdown ${dd.toFixed(1)}% is high. Cut position size or add a daily loss circuit-breaker before going live.` });
  } else if (dd > 0) {
    tips.push({ kind: 'info', text: `Max drawdown ${dd.toFixed(1)}%. Acceptable for sniping; keep an eye on it after live deployment.` });
  }

  if (expectancy <= 0) {
    tips.push({ kind: 'bad', text: `Expectancy per trade is ${expectancy.toFixed(2)}%. Negative or zero edge — do not flip from dry-run to live yet.` });
  } else {
    tips.push({ kind: 'good', text: `Expectancy ${expectancy.toFixed(2)}% per trade. Statistically positive — safe to test with very small live size.` });
  }

  if (total < 0) {
    tips.push({ kind: 'warn', text: 'Total PnL is negative. Pause aggressive presets and run again with stricter filters.' });
  }

  const c = strategy?.config || {};
  if (c.entry_mode === 'wait_for_dip' && winRate < 40) {
    tips.push({ kind: 'info', text: 'Dip-buy mode with low win rate often means the dip is being filled near the top of the move. Try shorter token_age_max_ms or stricter mcap floor.' });
  }
  if ((c.tp_percent || 0) > 0 && (c.sl_percent || 0) > 0 && c.tp_percent < c.sl_percent) {
    tips.push({ kind: 'bad', text: 'Take profit is tighter than stop loss. This setup needs >50% win rate to break even — flip the ratio or expect losses.' });
  }
  if ((c.position_size_sol || 0) > 0.3) {
    tips.push({ kind: 'warn', text: 'Position size is large per entry. Halve it for early live testing once dry-run is validated.' });
  }
  if ((c.max_open_positions || 0) > 6) {
    tips.push({ kind: 'info', text: 'Too many concurrent positions can dilute attention. Cap at 4-6 for clarity in live mode.' });
  }

  tips.push({ kind: 'info', text: 'Run at least 50 closed trades before drawing conclusions — current sample may be too small.' });

  return tips;
}

function positionsPage() {
  const { open, closed } = getPositions();
  const summary = getPnlSummary();
  const history = getClosedSeries();

  const winRate = summary.total ? (summary.wins / summary.total) * 100 : 0;
  const all = [...open, ...closed];

  const cards = all.map((p, i) => {
    const pnlClass = p.pnl_percent == null ? '' : (Number(p.pnl_percent) >= 0 ? 'up' : 'dn');
    const pnlText = p.pnl_percent == null ? 'LIVE' : fmtPct(p.pnl_percent);
    const statusClass = p.status === 'open' ? 'b-open' : 'b-closed';
    const mint = p.mint || '';
    const gmgn = `https://gmgn.ai/sol/token/${esc(mint)}`;
    const trojan = `https://t.me/${esc(TROJAN_BOT)}?start=${esc(mint)}`;
    const solscan = `https://solscan.io/token/${esc(mint)}`;

    return `<div class='pos' data-i='${i}' data-status='${esc(p.status)}'>
      <div class='pos-top'>
        <div class='sym'>${esc(p.symbol || 'Unknown')}</div>
        <span class='badge ${statusClass}'>${esc(String(p.status).toUpperCase())}</span>
      </div>
      <div class='pnl-big ${pnlClass}'>${esc(pnlText)}</div>
      <div class='meta'>
        <div>Size: <b>${fmtNum(p.size_sol, 4)} SOL</b></div>
        <div>Age: <b>${esc(fmtAgeSince(p.opened_at_ms))}</b></div>
        <div>Entry: <b>${fmtNum(p.entry_price, 8)}</b></div>
        <div>ID: <b>#${esc(p.id)}</b></div>
      </div>
      <div class='ext'>
        <a class='gmgn' target='_blank' rel='noopener' href='${gmgn}'>Open GMGN</a>
        <a class='trojan' target='_blank' rel='noopener' href='${trojan}'>Open Trojan</a>
        <a class='solscan' target='_blank' rel='noopener' href='${solscan}'>Solscan</a>
      </div>
    </div>`;
  }).join('');

  const payloadJson = JSON.stringify(all).replace(/</g, '\\u003c');

  return renderShell('Positions', `
    <div class='summary'>
      <div class='tile'><div class='k'>Open Positions</div><div class='v'>${open.length}</div></div>
      <div class='tile'><div class='k'>Closed Positions</div><div class='v'>${closed.length}</div></div>
      <div class='tile'><div class='k'>Total PnL</div><div class='v ${Number(summary.total_pnl_sol) >= 0 ? 'up' : 'dn'}'>${fmtSol(summary.total_pnl_sol)}</div></div>
      <div class='tile'><div class='k'>Win Rate</div><div class='v'>${fmtNum(winRate, 1)}%</div></div>
      <div class='tile'><div class='k'>Average Trade</div><div class='v ${Number(summary.avg_pnl_percent) >= 0 ? 'up' : 'dn'}'>${fmtPct(summary.avg_pnl_percent)}</div></div>
      <div class='tile'><div class='k'>Best / Worst</div><div class='v'><span class='up'>${fmtPct(summary.best_pnl_percent)}</span> <span class='muted'>/</span> <span class='dn'>${fmtPct(summary.worst_pnl_percent)}</span></div></div>
    </div>

    <div class='chart'>
      <div class='chart-title'>Cumulative PnL Trend (closed positions)</div>
      ${buildEquityCurveSvg(history)}
    </div>

    <div class='toolbar'>
      <div class='k'>Click a card to open full transaction detail on the right panel.</div>
      <div class='filters'>
        <button class='fbtn active' data-filter='all'>All</button>
        <button class='fbtn' data-filter='open'>Open</button>
        <button class='fbtn' data-filter='closed'>Closed</button>
      </div>
    </div>

    <div class='layout'>
      <div class='list' id='pos-list'>
        ${cards || `<div class='empty'>No positions yet.</div>`}
      </div>
      <div class='side' id='detail-panel'>
        <h3>Position Detail</h3>
        <div class='k'>Select one card to inspect its full trade detail.</div>
      </div>
    </div>

    <script id='positions-data' type='application/json'>${payloadJson}</script>
    <script>
      const data = JSON.parse(document.getElementById('positions-data').textContent || '[]');
      const panel = document.getElementById('detail-panel');
      const cards = Array.from(document.querySelectorAll('.pos'));
      const buttons = Array.from(document.querySelectorAll('.fbtn'));
      const TROJAN_BOT = ${JSON.stringify(TROJAN_BOT)};

      function safe(v){ return (v === null || v === undefined) ? '-' : String(v); }
      function iso(ms){ try { return ms ? new Date(ms).toISOString() : '-' ; } catch { return '-'; } }
      function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

      function renderDetail(pos){
        const pnlClass = pos.pnl_percent == null ? '' : (Number(pos.pnl_percent) >= 0 ? 'up' : 'dn');
        const pnlText = pos.pnl_percent == null ? 'LIVE / OPEN' : ((Number(pos.pnl_percent) > 0 ? '+' : '') + Number(pos.pnl_percent).toFixed(2) + '%');
        const pnlSolText = pos.pnl_sol == null ? '-' : ((Number(pos.pnl_sol) > 0 ? '+' : '') + Number(pos.pnl_sol).toFixed(4) + ' SOL');
        const statusClass = pos.status === 'open' ? 'b-open' : 'b-closed';
        const mint = pos.mint || '';
        const gmgn = 'https://gmgn.ai/sol/token/' + encodeURIComponent(mint);
        const trojan = 'https://t.me/' + encodeURIComponent(TROJAN_BOT) + '?start=' + encodeURIComponent(mint);
        const solscan = 'https://solscan.io/token/' + encodeURIComponent(mint);

        panel.innerHTML = ''
          + '<h3 style="margin:0 0 10px">' + escHtml(safe(pos.symbol || 'Unknown')) + ' <span class="badge ' + statusClass + '">' + escHtml(safe(String(pos.status).toUpperCase())) + '</span></h3>'
          + '<div class="ext" style="margin-bottom:10px">'
          + '<a class="gmgn" target="_blank" rel="noopener" href="' + gmgn + '">Open GMGN</a>'
          + '<a class="trojan" target="_blank" rel="noopener" href="' + trojan + '">Open Trojan</a>'
          + '<a class="solscan" target="_blank" rel="noopener" href="' + solscan + '">Solscan</a>'
          + '</div>'
          + '<div class="detail-grid">'
          + '<div class="dk">Position ID</div><div class="dv">#' + escHtml(safe(pos.id)) + '</div>'
          + '<div class="dk">Strategy</div><div class="dv">' + escHtml(safe(pos.strategy_id)) + '</div>'
          + '<div class="dk">PnL %</div><div class="dv ' + pnlClass + '">' + escHtml(pnlText) + '</div>'
          + '<div class="dk">PnL SOL</div><div class="dv ' + pnlClass + '">' + escHtml(pnlSolText) + '</div>'
          + '<div class="dk">Size</div><div class="dv">' + escHtml(safe(pos.size_sol)) + ' SOL</div>'
          + '<div class="dk">Entry Price</div><div class="dv">' + escHtml(safe(pos.entry_price)) + '</div>'
          + '<div class="dk">Exit Price</div><div class="dv">' + escHtml(safe(pos.exit_price)) + '</div>'
          + '<div class="dk">Opened At</div><div class="dv">' + escHtml(iso(pos.opened_at_ms)) + '</div>'
          + '<div class="dk">Closed At</div><div class="dv">' + escHtml(iso(pos.closed_at_ms)) + '</div>'
          + '<div class="dk">Mint</div><div class="dv"><code>' + escHtml(safe(pos.mint)) + '</code></div>'
          + '</div>';
      }

      cards.forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target && e.target.tagName === 'A') return;
          cards.forEach((x) => x.classList.remove('active'));
          el.classList.add('active');
          const i = Number(el.dataset.i);
          renderDetail(data[i] || {});
        });
      });

      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          buttons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const f = btn.dataset.filter;
          cards.forEach((el) => {
            const ok = f === 'all' || el.dataset.status === f;
            el.style.display = ok ? '' : 'none';
          });
        });
      });

      if (cards.length) cards[0].click();
    </script>
  `);
}

function pnlPage() {
  const summary = getPnlSummary();
  const history = getClosedSeries();
  const strategy = getEnabledStrategy();
  const advanced = computeAdvancedStats(history, summary);
  const tips = generateRecommendations(summary, advanced, strategy);

  const winRate = summary.total ? (summary.wins / summary.total) * 100 : 0;

  const tagClass = (k) => k === 'good' ? 'tag-good' : (k === 'bad' ? 'tag-bad' : (k === 'warn' ? 'tag-warn' : 'tag-info'));
  const tagText = (k) => k === 'good' ? 'GOOD' : (k === 'bad' ? 'WATCH' : (k === 'warn' ? 'WARN' : 'INFO'));

  return renderShell('PnL', `
    <div class='summary'>
      <div class='tile'><div class='k'>Closed Trades</div><div class='v'>${summary.total || 0}</div></div>
      <div class='tile'><div class='k'>Wins</div><div class='v up'>${summary.wins || 0}</div></div>
      <div class='tile'><div class='k'>Losses</div><div class='v dn'>${summary.losses || 0}</div></div>
      <div class='tile'><div class='k'>Win Rate</div><div class='v'>${fmtNum(winRate, 1)}%</div></div>
      <div class='tile'><div class='k'>Total PnL</div><div class='v ${Number(summary.total_pnl_sol) >= 0 ? 'up' : 'dn'}'>${fmtSol(summary.total_pnl_sol)}</div></div>
      <div class='tile'><div class='k'>Avg PnL</div><div class='v ${Number(summary.avg_pnl_percent) >= 0 ? 'up' : 'dn'}'>${fmtPct(summary.avg_pnl_percent)}</div></div>
      <div class='tile'><div class='k'>Best Trade</div><div class='v up'>${fmtPct(summary.best_pnl_percent)}</div></div>
      <div class='tile'><div class='k'>Worst Trade</div><div class='v dn'>${fmtPct(summary.worst_pnl_percent)}</div></div>
      <div class='tile'><div class='k'>Profit Factor</div><div class='v'>${advanced ? (advanced.profitFactor === Infinity ? '∞' : fmtNum(advanced.profitFactor, 2)) : '-'}</div></div>
      <div class='tile'><div class='k'>Expectancy</div><div class='v ${advanced && advanced.expectancyPct >= 0 ? 'up' : 'dn'}'>${advanced ? fmtPct(advanced.expectancyPct) : '-'}</div></div>
      <div class='tile'><div class='k'>Max Drawdown</div><div class='v dn'>${advanced ? fmtNum(advanced.maxDrawdownPct, 1) + '%' : '-'}</div></div>
      <div class='tile'><div class='k'>Avg Hold Time</div><div class='v'>${advanced ? fmtAge(advanced.avgHoldMs) : '-'}</div></div>
    </div>

    <div class='charts-grid'>
      <div class='chart'>
        <div class='chart-title'>Equity Curve (cumulative SOL)</div>
        ${buildEquityCurveSvg(history)}
      </div>
      <div class='chart'>
        <div class='chart-title'>PnL Distribution (per trade)</div>
        ${buildHistogramSvg(history)}
      </div>
    </div>

    <div class='reco'>
      <h3>Insights and Recommendations</h3>
      <ul>
        ${tips.map((t) => `<li><span class='tag ${tagClass(t.kind)}'>${tagText(t.kind)}</span>${esc(t.text)}</li>`).join('')}
      </ul>
    </div>
  `);
}

function strategySummaryRows(c = {}) {
  return [
    ['Entry Mode', c.entry_mode === 'wait_for_dip' ? 'Wait for dip before entry' : 'Immediate entry when signal qualifies'],
    ['Minimum Source Count', `${c.min_source_count ?? '-'} source(s)`],
    ['Fee Claim Requirement', c.require_fee_claim ? 'Required' : 'Not required'],
    ['Maximum Token Age', c.token_age_max_ms ? `${fmtAge(Number(c.token_age_max_ms))} max` : 'No age limit'],
    ['Market Cap Range', `$${fmtNum(c.min_mcap_usd, 0)} to $${fmtNum(c.max_mcap_usd, 0)}`],
    ['Position Size', `${fmtNum(c.position_size_sol, 4)} SOL per entry`],
    ['Max Open Positions', `${fmtNum(c.max_open_positions, 0)}`],
    ['Take Profit', `${fmtNum(c.tp_percent, 0)}%`],
    ['Stop Loss', `${fmtNum(c.sl_percent, 0)}%`],
    ['LLM', c.use_llm ? `Enabled (min confidence ${fmtNum(c.llm_min_confidence, 0)}%)` : 'Disabled'],
  ];
}

function strategyPage() {
  const s = getEnabledStrategy();
  const rows = strategySummaryRows(s?.config || {});
  return renderShell('Strategy', `
    <div class='summary'>
      <div class='tile'><div class='k'>Strategy ID</div><div class='v'>${esc(s?.id || '-')}</div></div>
      <div class='tile'><div class='k'>Name</div><div class='v'>${esc(s?.name || '-')}</div></div>
    </div>
    <div class='strat-list'>
      ${rows.map(([k, v]) => `<div><div class='k'>${esc(k)}</div><div class='v' style='font-size:15px'>${esc(v)}</div></div>`).join('')}
    </div>
  `);
}

const server = http.createServer((req, res) => {
  try {
    if (req.url === '/pnl') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pnlPage());
      return;
    }
    if (req.url === '/strategy') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(strategyPage());
      return;
    }
    if (req.url === '/' || req.url === '/positions') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(positionsPage());
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Dashboard error: ${err.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[dashboard] Charon dashboard listening on http://${HOST}:${PORT}`);
});
