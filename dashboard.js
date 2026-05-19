import http from 'http';
import zlib from 'zlib';
import Database from 'better-sqlite3';
import { WebSocketServer } from 'ws';
import { getPnlSummary as analyticsPnlSummary, getClosedSeries as analyticsClosedSeries, computeAdvancedStats as analyticsAdvancedStats, generateRecommendations as analyticsRecommendations } from './src/analytics/pnlSummary.js';

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
  const open = db.prepare("SELECT id,symbol,mint,status,opened_at_ms,size_sol,entry_price,entry_mcap,high_water_mcap,tp_percent,sl_percent,trailing_enabled,trailing_percent,entry_signature,exit_signature,execution_mode,strategy_id FROM dry_run_positions WHERE status='open' ORDER BY opened_at_ms DESC").all();
  const closed = db.prepare("SELECT id,symbol,mint,status,opened_at_ms,closed_at_ms,size_sol,entry_price,entry_mcap,high_water_mcap,exit_price,exit_mcap,exit_reason,tp_percent,sl_percent,trailing_enabled,trailing_percent,pnl_percent,pnl_sol,entry_signature,exit_signature,execution_mode,strategy_id FROM dry_run_positions WHERE status='closed' ORDER BY opened_at_ms DESC").all();
  return { open, closed };
}

function getPositionCardsLite() {
  return db.prepare(`
    SELECT id,symbol,mint,status,opened_at_ms,size_sol,entry_price,entry_mcap,exit_mcap,pnl_percent
    FROM dry_run_positions
    ORDER BY opened_at_ms DESC
  `).all();
}

function getPositionDetailById(id) {
  return db.prepare(`
    SELECT id,symbol,mint,status,opened_at_ms,closed_at_ms,size_sol,entry_price,entry_mcap,high_water_mcap,
           exit_price,exit_mcap,exit_reason,tp_percent,sl_percent,trailing_enabled,trailing_percent,
           pnl_percent,pnl_sol,entry_signature,exit_signature,execution_mode,strategy_id
    FROM dry_run_positions
    WHERE id = ?
    LIMIT 1
  `).get(id);
}

const DEXSCREENER_BASE = 'https://api.dexscreener.com';

async function fetchDexBatchPrices(mints = []) {
  const out = Object.create(null);
  const clean = Array.from(new Set((mints || []).map((m) => String(m || '').trim()).filter(Boolean)));
  if (!clean.length) return out;

  const chunkSize = 30; // keep URL reasonably short
  for (let i = 0; i < clean.length; i += chunkSize) {
    const chunk = clean.slice(i, i + chunkSize);
    const url = `${DEXSCREENER_BASE}/tokens/v1/solana/${encodeURIComponent(chunk.join(','))}`;
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'charon-dashboard/1.0' },
      });
      if (!res.ok) continue;
      const rows = await res.json();
      if (!Array.isArray(rows)) continue;

      for (const row of rows) {
        const tokenAddr = row?.baseToken?.address;
        const priceUsd = Number(row?.priceUsd);
        if (!tokenAddr || !Number.isFinite(priceUsd) || priceUsd <= 0) continue;
        const prev = out[tokenAddr];
        // pick pair with highest liquidity as representative price
        const liq = Number(row?.liquidity?.usd);
        const liqScore = Number.isFinite(liq) ? liq : -1;
        if (!prev || liqScore > prev._liqScore) out[tokenAddr] = { priceUsd, _liqScore: liqScore };
      }
    } catch {
      // best-effort only; dashboard must still render from DB values
    }
  }

  for (const k of Object.keys(out)) out[k] = out[k].priceUsd;
  return out;
}

async function getOpenRealtimeByMint() {
  const rows = db.prepare("SELECT mint,size_sol,entry_price,entry_mcap,opened_at_ms,status FROM dry_run_positions").all();
  const prices = await fetchDexBatchPrices(rows.map((r) => r.mint));
  const byMint = Object.create(null);

  for (const r of rows) {
    const mint = String(r.mint || '').trim();
    if (!mint) continue;
    const price = Number(prices[mint]);
    if (!Number.isFinite(price) || price <= 0) continue;

    const entryPrice = Number(r.entry_price);
    let pnlPct = null;
    if (Number.isFinite(entryPrice) && entryPrice > 0) pnlPct = ((price - entryPrice) / entryPrice) * 100;

    let estMcap = null;
    const entryMcap = Number(r.entry_mcap);
    if (Number.isFinite(entryMcap) && Number.isFinite(entryPrice) && entryPrice > 0) {
      estMcap = entryMcap * (price / entryPrice);
    }

    byMint[mint] = {
      current_price_usd: price,
      realtime_pnl_percent: pnlPct,
      est_current_mcap: estMcap,
      source: 'dexscreener',
    };
  }

  return byMint;
}

function sendJson(res, status, payload, req) {
  const json = JSON.stringify(payload);
  const ae = (req.headers['accept-encoding'] || '').toString();
  if (ae.includes('gzip')) {
    const gz = zlib.gzipSync(json);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Encoding': 'gzip',
      'Cache-Control': 'no-store',
      'Vary': 'Accept-Encoding',
    });
    res.end(gz);
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

function sendHtml(res, status, html, req) {
  const ae = (req.headers['accept-encoding'] || '').toString();
  if (ae.includes('gzip')) {
    const gz = zlib.gzipSync(html);
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Encoding': 'gzip',
      'Cache-Control': 'no-store',
      'Vary': 'Accept-Encoding',
    });
    res.end(gz);
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
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

.nav {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 18px;
      padding: 4px;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(96, 165, 250, 0.15);
      border-radius: 14px;
      box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35);
    }
    .pill {
      position: relative;
      flex: 1;
      min-width: 110px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #8aa1d3;
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: .3px;
      padding: 11px 16px;
      border-radius: 10px;
      text-align: center;
      border: 1px solid transparent;
      background: transparent;
      transition: all .18s ease;
    }
    .pill svg { width: 14px; height: 14px; opacity: .85; }
    .pill:hover {
      color: #e6efff;
      background: rgba(96, 165, 250, 0.08);
    }
    .pill.active {
      color: #ffffff;
      background: linear-gradient(180deg, rgba(96,165,250,0.18), rgba(59,130,246,0.12));
      border-color: rgba(96,165,250,0.3);
      box-shadow: 0 0 0 1px rgba(96,165,250,0.15) inset, 0 6px 16px rgba(59,130,246,0.18);
    }
    .pill.active svg { opacity: 1; }

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
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 10px;
    }

    .pos {
      background: linear-gradient(180deg, #131d31, #10182a);
      border: 1px solid var(--line);
      border-left-width: 3px;
      border-radius: 12px;
      padding: 11px;
      cursor: pointer;
      transition: transform .08s ease, border-color .12s ease, box-shadow .12s ease;
    }
    .pos-open {
      border-color: #1f3b2c;
      border-left-color: #22c55e;
      box-shadow: 0 0 0 1px #14532d22 inset;
    }
    .pos-closed {
      border-color: #3b1f24;
      border-left-color: #ef4444;
      box-shadow: 0 0 0 1px #4b182022 inset;
    }
    .pos:hover { transform: translateY(-1px); }
    .pos-open:hover { border-color: #22c55e; box-shadow: 0 0 0 1px #22c55e44 inset; }
    .pos-closed:hover { border-color: #ef4444; box-shadow: 0 0 0 1px #ef444444 inset; }
    .pos.active { box-shadow: 0 0 0 1px #60a5fa inset, 0 6px 18px #0b122244; }

    .pos-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px; }
    .sym { font-size: 15px; font-weight: 700; letter-spacing: .1px; line-height: 1.2; }
    .badge {
      font-size: 9px; letter-spacing: .6px; font-weight: 700;
      padding: 3px 7px; border-radius: 999px; opacity: .92;
    }
    .b-open { background: #0f2b1d; color: #86efac; border: 1px solid #264c3a; }
    .b-closed { background: #351417; color: #fda4af; border: 1px solid #4c2626; }

    .pnl-big { font-size: 24px; font-weight: 800; line-height: 1; margin: 0 0 10px; letter-spacing: -.02em; }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px 10px;
      font-size: 11px;
      color: var(--muted);
    }
    .meta b { color: #e6eeff; font-weight: 650; font-size: 12px; }

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
      background: linear-gradient(180deg, #131d31ee, #10182aee);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      min-height: 320px;
      box-shadow: 0 8px 24px #05091655;
      backdrop-filter: blur(3px);
    }
    .side h3 { margin: 0 0 10px; font-size: 17px; letter-spacing: .2px; }
    .detail-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 12px;
      border-top: 1px solid #21304a;
      padding-top: 10px;
    }
    .dk { color: #8fa4d9; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; }
    .dv { font-size: 13px; font-weight: 600; word-break: break-word; color:#e5edff; }
    code {
      background: #0b1323;
      border: 1px solid #223252;
      padding: 2px 6px;
      border-radius: 6px;
      color: #c7d6ff;
      font-size: 11px;
    }
    .loading {
      display:inline-block;
      width: 180px;
      height: 10px;
      border-radius: 999px;
      background: linear-gradient(90deg, #1a253a, #2a3c5c, #1a253a);
      background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite;
      margin-top:8px;
    }
    @keyframes shimmer { from{background-position:200% 0;} to{background-position:-200% 0;} }

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
      <a class='pill ${title === 'Positions' ? 'active' : ''}' href='/positions'>Positions</a>
      <a class='pill ${title === 'Candidates' ? 'active' : ''}' href='/candidates'>Candidates</a>
      <a class='pill ${title === 'PnL' ? 'active' : ''}' href='/pnl'>PnL</a>
      <a class='pill ${title === 'Strategy' ? 'active' : ''}' href='/strategy'>Strategy</a>
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
  const all = getPositionCardsLite();

  // Default filter: open only
  const defaultFilter = 'open';

  const cards = all.map((p, i) => {
    const isClosed = p.status === 'closed';
    const pnlClass = p.pnl_percent == null ? '' : (Number(p.pnl_percent) >= 0 ? 'up' : 'dn');
    const pnlText = isClosed ? fmtPct(p.pnl_percent) : 'LIVE';
    const statusClass = p.status === 'open' ? 'b-open' : 'b-closed';

    const compactMeta = isClosed
      ? `
        <div>Size: <b>${fmtNum(p.size_sol, 4)} SOL</b></div>
        <div>Age: <b>${esc(fmtAgeSince(p.opened_at_ms))}</b></div>
        <div>Entry MCAP: <b>$${fmtNum(p.entry_mcap, 0)}</b></div>
        <div>Exit MCAP: <b>$${fmtNum(p.exit_mcap, 0)}</b></div>
        <div>PnL %: <b class='${pnlClass}'>${fmtPct(p.pnl_percent)}</b></div>
      `
      : `
        <div>Size: <b>${fmtNum(p.size_sol, 4)} SOL</b></div>
        <div>Age: <b>${esc(fmtAgeSince(p.opened_at_ms))}</b></div>
        <div>Entry MCAP: <b>$${fmtNum(p.entry_mcap, 0)}</b></div>
      `;

    const hiddenStyle = '';
    const sortPnl = (p.pnl_percent == null) ? '' : Number(p.pnl_percent);
    const sortMcap = isClosed
      ? (p.exit_mcap == null ? (p.entry_mcap == null ? '' : Number(p.entry_mcap)) : Number(p.exit_mcap))
      : (p.entry_mcap == null ? '' : Number(p.entry_mcap));
    const sortOpened = p.opened_at_ms == null ? 0 : Number(p.opened_at_ms);
    const sortSymbol = (p.symbol || '').toString();

    return `<div class='pos ${isClosed ? 'pos-closed' : 'pos-open'}'
      data-id='${esc(p.id)}'
      data-status='${esc(p.status)}'
      data-entry-price='${esc(p.entry_price ?? '')}'
      data-entry-mcap='${esc(p.entry_mcap ?? '')}'
      data-mint='${esc(p.mint ?? '')}'
      data-sort-pnl='${esc(sortPnl)}'
      data-sort-mcap='${esc(sortMcap)}'
      data-sort-opened='${esc(sortOpened)}'
      data-sort-symbol='${esc(sortSymbol)}'
      style='${hiddenStyle}'>
      <div class='pos-top'>
        <div class='sym'>${esc(p.symbol || 'Unknown')}</div>
        <span class='badge ${statusClass}'>${esc(String(p.status).toUpperCase())}</span>
      </div>
      ${isClosed ? `<div class='pnl-big ${pnlClass}'>${esc(pnlText)}</div>` : ''}
      <div class='meta'>${compactMeta}</div>
    </div>`;
  }).join('');

  return renderShell('Positions', `

    <div class='toolbar' style='display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px'>
      <div class='k'>Click a card to open full transaction detail on the right panel.</div>
      <div style='display:flex;flex-wrap:wrap;align-items:center;gap:10px'>
        <div class='filters'>
          <button class='fbtn ${defaultFilter === 'all' ? 'active' : ''}' data-filter='all'>All</button>
          <button class='fbtn ${defaultFilter === 'open' ? 'active' : ''}' data-filter='open'>Open</button>
          <button class='fbtn ${defaultFilter === 'closed' ? 'active' : ''}' data-filter='closed'>Closed</button>
        </div>
        <select id='sort-select' style='background:#0f172a;color:#e6edff;border:1px solid #24314d;border-radius:9px;padding:9px 12px'>
          <option value='opened_desc'>Newest</option>
          <option value='opened_asc'>Oldest</option>
          <option value='pnl_desc'>PnL tertinggi</option>
          <option value='pnl_asc'>PnL terendah</option>
          <option value='mcap_desc'>MCAP terbesar</option>
          <option value='mcap_asc'>MCAP terkecil</option>
          <option value='symbol_asc'>Symbol A-Z</option>
        </select>
        <select id='quick-filter' style='background:#0f172a;color:#e6edff;border:1px solid #24314d;border-radius:9px;padding:9px 12px'>
          <option value='all'>Semua</option>
          <option value='winners'>PnL positif</option>
          <option value='losers'>PnL negatif</option>
          <option value='bigcaps'>MCAP ≥ 100k</option>
          <option value='smallcaps'>MCAP < 100k</option>
        </select>
      </div>
    </div>

    <div class='layout'>
      <div>
        <div class='list' id='pos-list'>
          ${cards || `<div class='empty'>No positions yet.</div>`}
        </div>
        <div id='pager' style='display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px'>
          <button id='prev-page' class='fbtn'>← Prev</button>
          <div class='k' id='page-info'>Page 1/1</div>
          <button id='next-page' class='fbtn'>Next →</button>
        </div>
      </div>
      <div class='side' id='detail-panel'>
        <h3>Position Detail</h3>
        <div class='k'>Select one card to inspect its full trade detail.</div>
      </div>
    </div>

    <script>
      const panel = document.getElementById('detail-panel');
      let cards = Array.from(document.querySelectorAll('.pos'));
      const buttons = Array.from(document.querySelectorAll('.fbtn[data-filter]'));
      const sortSelect = document.getElementById('sort-select');
      const quickFilter = document.getElementById('quick-filter');
      const prevBtn = document.getElementById('prev-page');
      const nextBtn = document.getElementById('next-page');
      const pageInfo = document.getElementById('page-info');
      const listEl = document.getElementById('pos-list');
      const TROJAN_BOT = ${JSON.stringify(TROJAN_BOT)};
      const detailCache = new Map();
      const PAGE_SIZE = 10;
      let currentPage = 1;
      let currentFilter = 'open';
      let currentSort = 'opened_desc';
      let currentQuick = 'all';

      function safe(v){ return (v === null || v === undefined) ? '-' : String(v); }
      function iso(ms){ try { return ms ? new Date(ms).toISOString() : '-' ; } catch { return '-'; } }
      function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
      function showLoading(){ panel.innerHTML = '<h3 style="margin:0 0 10px">Position Detail</h3><div class="k">Loading detail…</div>'; }

      function fmtNumJs(n, d = 2) {
        if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
        return Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
      }

      function fmtPctJs(n) {
        if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
        const v = Number(n);
        return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
      }

      function fmtAgeSinceJs(ms) {
        if (!ms) return '-';
        const diff = Math.max(0, Date.now() - Number(ms));
        const m = Math.floor(diff / 60000);
        if (m < 60) return m + 'm';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h ' + (m % 60) + 'm';
        return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
      }

      function buildCardHtml(p) {
        const isClosed = p.status === 'closed';
        const pnlClass = p.pnl_percent == null ? '' : (Number(p.pnl_percent) >= 0 ? 'up' : 'dn');
        const statusClass = p.status === 'open' ? 'b-open' : 'b-closed';
        const compactMeta = isClosed
          ? "<div>Size: <b>" + fmtNumJs(p.size_sol, 4) + " SOL</b></div>"
            + "<div>Age: <b>" + escHtml(fmtAgeSinceJs(p.opened_at_ms)) + "</b></div>"
            + "<div>Entry MCAP: <b>$" + fmtNumJs(p.entry_mcap, 0) + "</b></div>"
            + "<div>Exit MCAP: <b>$" + fmtNumJs(p.exit_mcap, 0) + "</b></div>"
            + "<div>PnL %: <b class='" + pnlClass + "'>" + fmtPctJs(p.pnl_percent) + "</b></div>"
          : "<div>Size: <b>" + fmtNumJs(p.size_sol, 4) + " SOL</b></div>"
            + "<div>Age: <b>" + escHtml(fmtAgeSinceJs(p.opened_at_ms)) + "</b></div>"
            + "<div>Entry MCAP: <b>$" + fmtNumJs(p.entry_mcap, 0) + "</b></div>";

        const sortPnl = (p.pnl_percent == null) ? '' : Number(p.pnl_percent);
        const sortMcap = isClosed ? (p.exit_mcap == null ? (p.entry_mcap == null ? '' : Number(p.entry_mcap)) : Number(p.exit_mcap)) : (p.entry_mcap == null ? '' : Number(p.entry_mcap));
        const sortOpened = p.opened_at_ms == null ? 0 : Number(p.opened_at_ms);
        const sortSymbol = (p.symbol || '').toString();

        return "<div class='pos " + (isClosed ? 'pos-closed' : 'pos-open') + "'"
          + " data-id='" + escHtml(p.id) + "'"
          + " data-status='" + escHtml(p.status) + "'"
          + " data-entry-price='" + escHtml(p.entry_price ?? '') + "'"
          + " data-entry-mcap='" + escHtml(p.entry_mcap ?? '') + "'"
          + " data-mint='" + escHtml(p.mint ?? '') + "'"
          + " data-sort-pnl='" + escHtml(sortPnl) + "'"
          + " data-sort-mcap='" + escHtml(sortMcap) + "'"
          + " data-sort-opened='" + escHtml(sortOpened) + "'"
          + " data-sort-symbol='" + escHtml(sortSymbol) + "'>"
          + "<div class='pos-top'><div class='sym'>" + escHtml(p.symbol || 'Unknown') + "</div><span class='badge " + statusClass + "'>" + escHtml(String(p.status).toUpperCase()) + "</span></div>"
          + (isClosed ? "<div class='pnl-big " + pnlClass + "'>" + escHtml(fmtPctJs(p.pnl_percent)) + "</div>" : '')
          + "<div class='meta'>" + compactMeta + "</div>"
          + "</div>";
      }

      function applyPositionSnapshot(payload) {
        if (!payload || !Array.isArray(payload.rows)) return;
        cards = payload.rows.map((p) => {
          const wrap = document.createElement('div');
          wrap.innerHTML = buildCardHtml(p);
          return wrap.firstElementChild;
        }).filter(Boolean);
        currentPage = 1;
        renderPage();
      }

      function applyPositionUpdate(payload) {
        if (!payload || !Array.isArray(payload.rows)) return;
        cards = payload.rows.map((p) => {
          const wrap = document.createElement('div');
          wrap.innerHTML = buildCardHtml(p);
          return wrap.firstElementChild;
        }).filter(Boolean);
        renderPage();
      }

      function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;'); }

      function passQuickFilter(el) {
        const pnl = Number(el.dataset.sortPnl);
        const mcap = Number(el.dataset.sortMcap);
        if (currentQuick === 'winners') return Number.isFinite(pnl) && pnl > 0;
        if (currentQuick === 'losers') return Number.isFinite(pnl) && pnl < 0;
        if (currentQuick === 'bigcaps') return Number.isFinite(mcap) && mcap >= 100000;
        if (currentQuick === 'smallcaps') return Number.isFinite(mcap) && mcap < 100000;
        return true;
      }

      function getFilteredCards() {
        return cards.filter((el) => {
          if (currentFilter !== 'all' && el.dataset.status !== currentFilter) return false;
          return passQuickFilter(el);
        });
      }

      function sortCards(items) {
        const arr = items.slice();
        arr.sort((a, b) => {
          const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
          if (currentSort === 'symbol_asc') return String(a.dataset.sortSymbol || '').localeCompare(String(b.dataset.sortSymbol || ''));
          const key = currentSort.startsWith('pnl') ? 'sortPnl' : currentSort.startsWith('mcap') ? 'sortMcap' : 'sortOpened';
          const va = num(a.dataset[key]);
          const vb = num(b.dataset[key]);
          const aa = va == null ? (currentSort.endsWith('_asc') ? Infinity : -Infinity) : va;
          const bb = vb == null ? (currentSort.endsWith('_asc') ? Infinity : -Infinity) : vb;
          return currentSort.endsWith('_asc') ? aa - bb : bb - aa;
        });
        return arr;
      }

      function attachCardClicks(scopeCards) {
        scopeCards.forEach((el) => {
          el.addEventListener('click', async () => {
            Array.from(listEl.querySelectorAll('.pos')).forEach((x) => x.classList.remove('active'));
            el.classList.add('active');
            const id = el.dataset.id;
            showLoading();
            try {
              const pos = await loadDetail(id);
              renderDetail(pos || {});
            } catch {
              panel.innerHTML = '<h3 style="margin:0 0 10px">Position Detail</h3><div class="k">Failed to load detail.</div>';
            }
          });
        });
      }

      function renderPage() {
        const filtered = sortCards(getFilteredCards());
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;
        const start = (currentPage - 1) * PAGE_SIZE;
        const pageCards = filtered.slice(start, start + PAGE_SIZE);
        listEl.innerHTML = pageCards.length ? pageCards.map((el) => el.outerHTML).join('') : '<div class="empty">No positions for this filter.</div>';
        pageInfo.textContent = 'Page ' + currentPage + ' / ' + totalPages + ' · ' + filtered.length + ' item';
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;
        attachCardClicks(Array.from(listEl.querySelectorAll('.pos')));
      }

      async function loadDetail(id){
        if (detailCache.has(id)) return detailCache.get(id);
        const res = await fetch('/api/position?id=' + encodeURIComponent(id), { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load detail');
        const data = await res.json();
        detailCache.set(id, data);
        return data;
      }

      function renderDetail(pos){
        const pnlClass = pos.pnl_percent == null ? '' : (Number(pos.pnl_percent) >= 0 ? 'up' : 'dn');
        const pnlText = pos.pnl_percent == null ? 'LIVE / OPEN' : ((Number(pos.pnl_percent) > 0 ? '+' : '') + Number(pos.pnl_percent).toFixed(2) + '%');
        const pnlSolText = pos.pnl_sol == null ? '-' : ((Number(pos.pnl_sol) > 0 ? '+' : '') + Number(pos.pnl_sol).toFixed(4) + ' SOL');
        const statusClass = pos.status === 'open' ? 'b-open' : 'b-closed';
        const mint = pos.mint || '';
        const gmgn = 'https://gmgn.ai/sol/token/' + encodeURIComponent(mint);
        const trojan = 'https://t.me/' + encodeURIComponent(TROJAN_BOT) + '?start=' + encodeURIComponent(mint);
        const solscan = 'https://solscan.io/token/' + encodeURIComponent(mint);
        const mode = (pos.execution_mode || 'dry_run').toString();
        const isDry = mode.includes('dry');
        const entryTx = isDry ? 'dry_run' : (pos.entry_signature || '-');
        const exitTx = isDry ? 'dry_run' : (pos.exit_signature || '-');
        const entryTxCell = (!isDry && pos.entry_signature)
          ? ('<a target="_blank" rel="noopener" href="https://solscan.io/tx/' + encodeURIComponent(pos.entry_signature) + '"><code>' + escHtml(pos.entry_signature) + '</code></a>')
          : ('<code>' + escHtml(safe(entryTx)) + '</code>');
        const exitTxCell = (!isDry && pos.exit_signature)
          ? ('<a target="_blank" rel="noopener" href="https://solscan.io/tx/' + encodeURIComponent(pos.exit_signature) + '"><code>' + escHtml(pos.exit_signature) + '</code></a>')
          : ('<code>' + escHtml(safe(exitTx)) + '</code>');
        const holdMs = (pos.opened_at_ms && pos.closed_at_ms) ? (Number(pos.closed_at_ms) - Number(pos.opened_at_ms)) : null;
        const holdMin = holdMs == null ? '-' : Math.round(holdMs / 60000) + 'm';

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
          + '<div class="dk">Execution Mode</div><div class="dv">' + escHtml(mode) + '</div>'
          + '<div class="dk">PnL %</div><div class="dv ' + pnlClass + '">' + escHtml(pnlText) + '</div>'
          + '<div class="dk">PnL SOL</div><div class="dv ' + pnlClass + '">' + escHtml(pnlSolText) + '</div>'
          + '<div class="dk">Size</div><div class="dv">' + escHtml(safe(pos.size_sol)) + ' SOL</div>'
          + '<div class="dk">Entry Price</div><div class="dv">' + escHtml(safe(pos.entry_price)) + '</div>'
          + '<div class="dk">Entry MCAP</div><div class="dv">$' + escHtml(safe(pos.entry_mcap == null ? '-' : Number(pos.entry_mcap).toLocaleString('en-US'))) + '</div>'
          + '<div class="dk">Exit Price</div><div class="dv">' + escHtml(safe(pos.exit_price)) + '</div>'
          + '<div class="dk">Exit MCAP</div><div class="dv">$' + escHtml(safe(pos.exit_mcap == null ? '-' : Number(pos.exit_mcap).toLocaleString('en-US'))) + '</div>'
          + '<div class="dk">High-Water MCAP</div><div class="dv">$' + escHtml(safe(pos.high_water_mcap == null ? '-' : Number(pos.high_water_mcap).toLocaleString('en-US'))) + '</div>'
          + '<div class="dk">Stop Loss (SL)</div><div class="dv">' + escHtml(safe(pos.sl_percent == null ? '-' : pos.sl_percent + '%')) + '</div>'
          + '<div class="dk">Take Profit (TP)</div><div class="dv">' + escHtml(safe(pos.tp_percent == null ? '-' : pos.tp_percent + '%')) + '</div>'
          + '<div class="dk">Trailing</div><div class="dv">' + escHtml(safe(pos.trailing_enabled ? ('ON (' + safe(pos.trailing_percent) + '%)') : 'OFF')) + '</div>'
          + '<div class="dk">Exit Reason</div><div class="dv">' + escHtml(safe(pos.exit_reason)) + '</div>'
          + '<div class="dk">Opened At</div><div class="dv">' + escHtml(iso(pos.opened_at_ms)) + '</div>'
          + '<div class="dk">Closed At</div><div class="dv">' + escHtml(iso(pos.closed_at_ms)) + '</div>'
          + '<div class="dk">Hold Duration</div><div class="dv">' + escHtml(holdMin) + '</div>'
          + '<div class="dk">Entry Tx Hash</div><div class="dv">' + entryTxCell + '</div>'
          + '<div class="dk">Exit Tx Hash</div><div class="dv">' + exitTxCell + '</div>'
          + '<div class="dk">Mint</div><div class="dv"><code>' + escHtml(safe(pos.mint)) + '</code></div>'
          + '</div>';
      }

      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          buttons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          currentFilter = btn.dataset.filter;
          currentPage = 1;
          renderPage();
        });
      });

      if (sortSelect) sortSelect.addEventListener('change', () => { currentSort = sortSelect.value; currentPage = 1; renderPage(); });
      if (quickFilter) quickFilter.addEventListener('change', () => { currentQuick = quickFilter.value; currentPage = 1; renderPage(); });
      if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderPage(); } });
      if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; renderPage(); });

      function applyRealtimePayload(payload){
        const byMint = payload && payload.by_mint ? payload.by_mint : {};
        cards.forEach((el) => {
          const mint = el.dataset.mint || '';
          const rt = byMint[mint];
          if (!rt) return;

          const pnl = Number(rt.realtime_pnl_percent);
          const mcap = Number(rt.est_current_mcap);
          const isOpen = el.dataset.status === 'open';

          if (isOpen && Number.isFinite(pnl)) {
            const pnlClass = pnl >= 0 ? 'up' : 'dn';
            const pnlHtml = '<div>PnL %: <b class="' + pnlClass + '">' + (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + '%</b></div>';
            const meta = el.querySelector('.meta');
            if (meta) {
              const existing = meta.querySelector('[data-rt-pnl]');
              if (existing) existing.innerHTML = pnlHtml;
              else {
                const wrap = document.createElement('div');
                wrap.setAttribute('data-rt-pnl', '1');
                wrap.innerHTML = pnlHtml;
                meta.appendChild(wrap);
              }
            }
          }

          if (Number.isFinite(mcap)) {
            const meta = el.querySelector('.meta');
            if (meta) {
              const existing = meta.querySelector('[data-rt-mcap]');
              const mcapText = '<div>Now MCAP: <b>$' + Math.round(mcap).toLocaleString('en-US') + '</b></div>';
              if (existing) existing.innerHTML = mcapText;
              else {
                const wrap = document.createElement('div');
                wrap.setAttribute('data-rt-mcap', '1');
                wrap.innerHTML = mcapText;
                meta.appendChild(wrap);
              }
            }
          }
        });
      }

      async function refreshRealtimePnL(){
        // No-op: realtime prices delivered via WebSocket only.
      }

      function connectRealtimeWs(){
        try {
          const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(proto + '//' + location.host + '/ws');

          ws.onopen = () => {
            try { ws.send(JSON.stringify({ type: 'get_snapshot' })); } catch {}
          };

          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(ev.data || '{}');
              if (msg.type === 'price_snapshot' || msg.type === 'price_update') {
                applyRealtimePayload(msg.payload || {});
                renderPage();
              }
              if (msg.type === 'position_snapshot') {
                applyPositionSnapshot(msg.payload || {});
              }
              if (msg.type === 'position_update') {
                applyPositionUpdate(msg.payload || {});
              }
            } catch {}
          };

          ws.onclose = () => {
            // Fallback polling if WS disconnected
            setTimeout(connectRealtimeWs, 2000);
          };
        } catch {}
      }

      renderPage();
      requestAnimationFrame(() => {
        const first = listEl.querySelector('.pos');
        if (first) first.click();
      });
      connectRealtimeWs();
      setInterval(() => {
        renderPage();
      }, 30000); // periodic re-age labels only

    </script>
  `);
}

function pnlPage() {
  const rawSummary = analyticsPnlSummary();
  const history = analyticsClosedSeries();
  const strategy = getEnabledStrategy();
  const rawAdvanced = analyticsAdvancedStats(history, rawSummary);

  // Backward-compatible shape expected by existing dashboard template/recommendation logic
  const summary = {
    ...rawSummary,
    total_pnl_sol: rawSummary.totalPnlSol,
    avg_pnl_percent: rawSummary.avgPnlPercent,
    best_pnl_percent: rawSummary.maxPnlPercent,
    worst_pnl_percent: rawSummary.minPnlPercent,
    total_pnl_percent: rawSummary.totalPnlPercent,
  };
  const advanced = rawAdvanced ? {
    ...rawAdvanced,
    expectancyPct: rawAdvanced.expectancy,
    maxDrawdownPct: rawAdvanced.maxDrawdown,
    avgHoldMs: 0,
  } : null;

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

function getCandidates(limit = 200) {
  return db.prepare(`
    SELECT id,mint,status,created_at_ms,updated_at_ms,candidate_json,filter_result_json
    FROM candidates
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

function getPositionsWsSnapshot() {
  const rows = getPositionCardsLite();
  const openCount = rows.filter(r => r.status === 'open').length;
  const closedCount = rows.filter(r => r.status === 'closed').length;
  return { open_count: openCount, closed_count: closedCount, total: rows.length, rows };
}

function getCandidatesWsSnapshot() {
  const rows = db.prepare(`SELECT id,mint,status,created_at_ms,updated_at_ms FROM candidates ORDER BY id DESC LIMIT 200`).all();
  const counts = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  return { total: rows.length, counts, rows };
}

function candidatesPage() {
  const rows = getCandidates(500);
  const stats = rows.reduce((acc, r) => {
    acc.total++;
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, { total: 0 });

  const cards = rows.map((r) => {
    const cj = safeJson(r.candidate_json, {});
    const fj = safeJson(r.filter_result_json, {});
    const token = cj.token || {};
    const metrics = cj.metrics || {};
    const fails = Array.isArray(fj.failures) ? fj.failures : [];
    const sym = token.symbol || token.name || 'Unknown';
    const mcap = metrics.marketCapUsd ?? metrics.market_cap;
    const vol = metrics.trendingVolumeUsd ?? metrics.volumeUsd;
    const swaps = metrics.trendingSwaps ?? metrics.swaps;

    return `<div class='pos ${r.status === 'accepted' ? 'pos-open' : 'pos-closed'}' data-status='${esc(r.status)}'
      data-sort-created='${esc(r.created_at_ms || 0)}'
      data-sort-mcap='${esc(mcap == null ? '' : Number(mcap))}'
      data-sort-vol='${esc(vol == null ? '' : Number(vol))}'
      data-sort-swaps='${esc(swaps == null ? '' : Number(swaps))}'
      data-sort-symbol='${esc(sym)}'>
      <div class='pos-top'>
        <div class='sym'>${esc(sym)} <span class='k'>#${esc(r.id)}</span></div>
        <span class='badge ${r.status === 'accepted' ? 'b-open' : 'b-closed'}'>${esc((r.status || 'new').toUpperCase())}</span>
      </div>
      <div class='meta'>
        <div>Mint: <b><code>${esc(String(r.mint || '').slice(0, 8))}...${esc(String(r.mint || '').slice(-4))}</code></b></div>
        <div>Created: <b>${esc(fmtAgeSince(r.created_at_ms))} ago</b></div>
        <div>MCAP: <b>$${fmtNum(mcap, 0)}</b></div>
        <div>Volume: <b>$${fmtNum(vol, 0)}</b></div>
        <div>Swaps: <b>${fmtNum(swaps, 0)}</b></div>
        <div>Failures: <b>${fails.length}</b>${fails.length ? ' · ' + esc(fails.slice(0,2).join(' | ')) : ''}</div>
      </div>
    </div>`;
  }).join('');

  return renderShell('Candidates', `
    <div class='summary'>
      <div class='tile'><div class='k'>Rows loaded</div><div class='v'>${stats.total || 0}</div></div>
      <div class='tile'><div class='k'>Filtered</div><div class='v dn'>${stats.filtered || 0}</div></div>
      <div class='tile'><div class='k'>Accepted</div><div class='v up'>${stats.accepted || 0}</div></div>
      <div class='tile'><div class='k'>Watch</div><div class='v'>${stats.watch || 0}</div></div>
    </div>

    <div class='toolbar' style='display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px'>
      <div class='k'>Latest 500 candidates · 20 per page</div>
      <div style='display:flex;flex-wrap:wrap;align-items:center;gap:10px'>
        <div class='filters'>
          <button class='fbtn active' data-cf='all'>All</button>
          <button class='fbtn' data-cf='accepted'>Accepted</button>
          <button class='fbtn' data-cf='filtered'>Filtered</button>
          <button class='fbtn' data-cf='watch'>Watch</button>
        </div>
        <select id='c-sort' style='background:#0f172a;color:#e6edff;border:1px solid #24314d;border-radius:9px;padding:9px 12px'>
          <option value='created_desc'>Newest</option>
          <option value='created_asc'>Oldest</option>
          <option value='mcap_desc'>MCAP terbesar</option>
          <option value='mcap_asc'>MCAP terkecil</option>
          <option value='vol_desc'>Volume terbesar</option>
          <option value='swaps_desc'>Swap terbanyak</option>
          <option value='symbol_asc'>Symbol A-Z</option>
        </select>
      </div>
    </div>

    <div class='list' id='c-list'>${cards || `<div class='empty'>No candidates yet.</div>`}</div>
    <div id='c-pager' style='display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px'>
      <button id='c-prev' class='fbtn'>← Prev</button>
      <div class='k' id='c-pageinfo'>Page 1/1</div>
      <button id='c-next' class='fbtn'>Next →</button>
    </div>

    <script>
      const cAll = Array.from(document.querySelectorAll('#c-list .pos'));
      const cListEl = document.getElementById('c-list');
      const cFilters = Array.from(document.querySelectorAll('.fbtn[data-cf]'));
      const cSort = document.getElementById('c-sort');
      const cPrev = document.getElementById('c-prev');
      const cNext = document.getElementById('c-next');
      const cInfo = document.getElementById('c-pageinfo');
      const C_PAGE_SIZE = 20;
      let cPage = 1;
      let cFilter = 'all';
      let cSortKey = 'created_desc';

      function cFiltered() {
        return cAll.filter((el) => cFilter === 'all' || el.dataset.status === cFilter);
      }

      function cSorted(items) {
        const arr = items.slice();
        arr.sort((a, b) => {
          if (cSortKey === 'symbol_asc') return String(a.dataset.sortSymbol || '').localeCompare(String(b.dataset.sortSymbol || ''));
          const map = { created_desc: 'sortCreated', created_asc: 'sortCreated', mcap_desc: 'sortMcap', mcap_asc: 'sortMcap', vol_desc: 'sortVol', swaps_desc: 'sortSwaps' };
          const key = map[cSortKey] || 'sortCreated';
          const va = Number(a.dataset[key]);
          const vb = Number(b.dataset[key]);
          const aa = Number.isFinite(va) ? va : (cSortKey.endsWith('_asc') ? Infinity : -Infinity);
          const bb = Number.isFinite(vb) ? vb : (cSortKey.endsWith('_asc') ? Infinity : -Infinity);
          return cSortKey.endsWith('_asc') ? aa - bb : bb - aa;
        });
        return arr;
      }

      function cRender() {
        const items = cSorted(cFiltered());
        const totalPages = Math.max(1, Math.ceil(items.length / C_PAGE_SIZE));
        if (cPage > totalPages) cPage = totalPages;
        const start = (cPage - 1) * C_PAGE_SIZE;
        const slice = items.slice(start, start + C_PAGE_SIZE);
        cListEl.innerHTML = slice.length ? slice.map((el) => el.outerHTML).join('') : '<div class="empty">No candidates for this filter.</div>';
        cInfo.textContent = 'Page ' + cPage + ' / ' + totalPages + ' · ' + items.length + ' item';
        cPrev.disabled = cPage <= 1;
        cNext.disabled = cPage >= totalPages;
      }

      cFilters.forEach((b) => b.addEventListener('click', () => {
        cFilters.forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        cFilter = b.dataset.cf;
        cPage = 1;
        cRender();
      }));
      if (cSort) cSort.addEventListener('change', () => { cSortKey = cSort.value; cPage = 1; cRender(); });
      if (cPrev) cPrev.addEventListener('click', () => { if (cPage > 1) { cPage--; cRender(); } });
      if (cNext) cNext.addEventListener('click', () => { cPage++; cRender(); });

      cRender();
    </script>
  `);
}

function fmtBool(v) { return v ? 'on' : 'off'; }
function fmtPctRaw(v, d = 0) { return v == null ? '-' : `${Number(v).toFixed(d)}%`; }
function fmtRatioPct(v, d = 1) { return v == null ? '-' : `${(Number(v) * 100).toFixed(d)}%`; }
function fmtSolRaw(v, d = 4) { return v == null ? '-' : `${Number(v).toFixed(d)} SOL`; }

function strategySectionRows(c = {}) {
  const sections = [];

  sections.push({
    title: 'Entry Logic',
    rows: [
      ['Entry Mode', c.entry_mode === 'wait_for_dip' ? 'Wait for dip before entry' : 'Immediate entry when signal qualifies'],
      ['Min Source Count', `${c.min_source_count ?? '-'} source(s)`],
      ['Fee Claim Required', fmtBool(c.require_fee_claim)],
      ['Token Age Limit', c.token_age_max_ms ? `${fmtAge(Number(c.token_age_max_ms))} max` : 'No age limit'],
      ['LLM', c.use_llm ? `Enabled (min ${fmtNum(c.llm_min_confidence, 0)}% confidence)` : 'Disabled (rule-based)'],
    ],
  });

  sections.push({
    title: 'Position Sizing',
    rows: [
      ['Position Size', fmtSolRaw(c.position_size_sol)],
      ['Max Open Positions', `${fmtNum(c.max_open_positions, 0)}`],
    ],
  });

  sections.push({
    title: 'Risk Management',
    rows: [
      ['Take Profit', fmtPctRaw(c.tp_percent)],
      ['Stop Loss', fmtPctRaw(c.sl_percent)],
      ['Trailing', c.trailing_enabled ? `${fmtNum(c.trailing_percent, 0)}%` : 'off'],
      ['Partial TP', c.partial_tp ? `${fmtNum(c.partial_tp_sell_percent, 0)}% sell at +${fmtNum(c.partial_tp_at_percent, 0)}%` : 'off'],
      ['Max Hold', c.max_hold_ms > 0 ? fmtAge(Number(c.max_hold_ms)) : 'no limit'],
    ],
  });

  sections.push({
    title: 'Filters · Market Cap & Holders',
    rows: [
      ['Min MCAP', `$${fmtNum(c.min_mcap_usd, 0)}`],
      ['Max MCAP', c.max_mcap_usd > 0 ? `$${fmtNum(c.max_mcap_usd, 0)}` : 'off'],
      ['Min Holders', c.min_holders > 0 ? `${fmtNum(c.min_holders, 0)}` : 'off'],
      ['Max Top20 Holder %', c.max_top20_holder_percent < 100 ? `${fmtNum(c.max_top20_holder_percent, 0)}%` : 'off'],
      ['Min Saved Wallet Holders', c.min_saved_wallet_holders > 0 ? `${fmtNum(c.min_saved_wallet_holders, 0)}` : 'off'],
      ['Max ATH Distance', c.max_ath_distance_pct < 0 ? `${fmtNum(c.max_ath_distance_pct, 0)}%` : 'off'],
    ],
  });

  sections.push({
    title: 'Filters · Fees & Volume',
    rows: [
      ['Min Creator Fee Claim', fmtSolRaw(c.min_fee_claim_sol)],
      ['Min GMGN Trading Fee', fmtSolRaw(c.min_gmgn_total_fee_sol)],
      ['Min Graduated Volume', `$${fmtNum(c.min_graduated_volume_usd, 0)}`],
    ],
  });

  sections.push({
    title: 'Filters · Trending',
    rows: [
      ['Min Trend Volume', `$${fmtNum(c.trending_min_volume_usd, 0)}`],
      ['Min Trend Swaps', `${fmtNum(c.trending_min_swaps, 0)}`],
      ['Max Rug Ratio', fmtRatioPct(c.trending_max_rug_ratio)],
      ['Max Bundler Rate', fmtRatioPct(c.trending_max_bundler_rate)],
    ],
  });

  sections.push({
    title: 'Stochastic RSI (optional)',
    rows: [
      ['Enabled', fmtBool(c.use_stoch_rsi)],
      ['Timeframe', String(c.stoch_rsi_resolution || '15m')],
      ['Overbought (OB)', `${fmtNum(c.stoch_rsi_overbought ?? 80, 0)}`],
      ['Oversold (OS)', `${fmtNum(c.stoch_rsi_oversold ?? 20, 0)}`],
      ['Reject Overbought', fmtBool(c.stoch_rsi_reject_overbought !== false)],
      ['Require Bullish Cross', fmtBool(c.stoch_rsi_require_bullish_cross)],
      ['Require Oversold', fmtBool(c.stoch_rsi_require_oversold)],
    ],
  });

  return sections;
}

function strategyPage() {
  const s = getEnabledStrategy();
  const c = s?.config || {};
  const sections = strategySectionRows(c);

  const summaryTiles = [
    ['Strategy', `${esc(s?.id || '-')} · ${esc(s?.name || '-')}`],
    ['Entry', esc(c.entry_mode || '-')],
    ['Size', esc(fmtSolRaw(c.position_size_sol))],
    ['TP / SL', `${fmtNum(c.tp_percent, 0)}% / ${fmtNum(c.sl_percent, 0)}%`],
    ['Max Pos', `${fmtNum(c.max_open_positions, 0)}`],
    ['LLM', c.use_llm ? `min ${fmtNum(c.llm_min_confidence, 0)}%` : 'off'],
    ['Stoch RSI', c.use_stoch_rsi ? `on · ${esc(c.stoch_rsi_resolution || '15m')}` : 'off'],
  ];

  const tilesHtml = summaryTiles
    .map(([k, v]) => `<div class='tile'><div class='k'>${esc(k)}</div><div class='v' style='font-size:15px'>${v}</div></div>`)
    .join('');

  const sectionsHtml = sections.map((sec) => `
    <div class='strat-section'>
      <h3 class='strat-section-title'>${esc(sec.title)}</h3>
      <div class='strat-grid'>
        ${sec.rows.map(([k, v]) => `<div class='strat-cell'><div class='k'>${esc(k)}</div><div class='v'>${esc(String(v))}</div></div>`).join('')}
      </div>
    </div>
  `).join('');

  return renderShell('Strategy', `
    <div class='summary'>${tilesHtml}</div>
    <style>
      .strat-section { margin-top: 18px; border: 1px solid var(--line); background: rgba(15,23,42,0.55); border-radius: 14px; padding: 14px 16px; }
      .strat-section-title { margin: 0 0 10px; font-size: 14px; letter-spacing: .4px; color: #cbd5e1; text-transform: uppercase; }
      .strat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
      .strat-cell { background: rgba(2,6,23,0.55); border: 1px solid #1f2a44; border-radius: 10px; padding: 10px 12px; }
      .strat-cell .k { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
      .strat-cell .v { color: var(--text); font-size: 14px; font-weight: 600; word-break: break-word; }
    </style>
    ${sectionsHtml}
  `);
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${HOST}:${PORT}`);

    if (u.pathname === '/api/position') {
      const id = u.searchParams.get('id');
      if (!id) return sendJson(res, 400, { error: 'missing id' }, req);
      const row = getPositionDetailById(id);
      if (!row) return sendJson(res, 404, { error: 'not found' }, req);
      return sendJson(res, 200, row, req);
    }

    if (u.pathname === '/pnl') return sendHtml(res, 200, pnlPage(), req);
    if (u.pathname === '/strategy') return sendHtml(res, 200, strategyPage(), req);
    if (u.pathname === '/candidates') return sendHtml(res, 200, candidatesPage(), req);
    if (u.pathname === '/' || u.pathname === '/positions') return sendHtml(res, 200, positionsPage(), req);

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Not Found');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Dashboard error: ${err.message}`);
  }
});

const wss = new WebSocketServer({ noServer: true });
const wsClients = new Set();

function wsBroadcast(type, payload) {
  const msg = JSON.stringify({ type, ts: Date.now(), payload });
  for (const ws of wsClients) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(msg); } catch {}
    }
  }
}

server.on('upgrade', (req, socket, head) => {
  try {
    const u = new URL(req.url, `http://${HOST}:${PORT}`);
    if (u.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } catch {
    socket.destroy();
  }
});

wss.on('connection', async (ws) => {
  wsClients.add(ws);
  try {
    const byMint = await getOpenRealtimeByMint();
    ws.send(JSON.stringify({ type: 'price_snapshot', ts: Date.now(), payload: { by_mint: byMint } }));
    ws.send(JSON.stringify({ type: 'position_snapshot', ts: Date.now(), payload: getPositionsWsSnapshot() }));
    ws.send(JSON.stringify({ type: 'candidates_snapshot', ts: Date.now(), payload: getCandidatesWsSnapshot() }));
  } catch {}

  ws.on('message', async (raw) => {
    let msg = null;
    try { msg = JSON.parse(String(raw || '{}')); } catch { msg = null; }
    if (!msg) return;
    if (msg.type === 'ping') {
      try { ws.send(JSON.stringify({ type: 'pong', ts: Date.now() })); } catch {}
      return;
    }
    if (msg.type === 'get_snapshot') {
      try {
        const byMint = await getOpenRealtimeByMint();
        ws.send(JSON.stringify({ type: 'price_snapshot', ts: Date.now(), payload: { by_mint: byMint } }));
        ws.send(JSON.stringify({ type: 'position_snapshot', ts: Date.now(), payload: getPositionsWsSnapshot() }));
        ws.send(JSON.stringify({ type: 'candidates_snapshot', ts: Date.now(), payload: getCandidatesWsSnapshot() }));
      } catch {}
      return;
    }
  });

  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

setInterval(async () => {
  if (!wsClients.size) return;
  try {
    const byMint = await getOpenRealtimeByMint();
    wsBroadcast('price_update', { by_mint: byMint });
  } catch {}
}, 5000);

setInterval(async () => {
  if (!wsClients.size) return;
  try {
    const pos = getPositionsWsSnapshot();
    wsBroadcast('position_update', pos);
  } catch {}
}, 10000);

setInterval(async () => {
  if (!wsClients.size) return;
  try {
    const cand = getCandidatesWsSnapshot();
    wsBroadcast('candidates_update', cand);
  } catch {}
}, 15000);

server.listen(PORT, HOST, () => {
  console.log(`[dashboard] Charon dashboard listening on http://${HOST}:${PORT}`);
  console.log(`[dashboard] WebSocket endpoint ready at ws://${HOST}:${PORT}/ws`);
});
