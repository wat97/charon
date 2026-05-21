import http from 'http';
import zlib from 'zlib';
import Database from 'better-sqlite3';
import { WebSocketServer } from 'ws';
import { getPnlSummary as analyticsPnlSummary, getClosedSeries as analyticsClosedSeries, computeAdvancedStats as analyticsAdvancedStats, generateRecommendations as analyticsRecommendations } from './src/analytics/pnlSummary.js';
import { now, esc, fmtNum, fmtPct, fmtSol, fmtAge, fmtAgeSince, safeJson } from './src/dashboard/format.js';
import { normalizeDateInput, getDateRangeBounds, filterHistoryByRange } from './src/dashboard/dateRange.js';
import { buildEquityCurveSvg, buildHistogramSvg } from './src/dashboard/charts.js';
import { candidatesPage as candidatesPageView } from './src/dashboard/candidates.js';
import { positionsPage as positionsPageView } from './src/dashboard/positions.js';
import { pnlPage as pnlPageView } from './src/dashboard/pnl.js';
import { strategyPage as strategyPageView } from './src/dashboard/strategy.js';
import { getEnabledStrategy as getEnabledStrategyDb, getPositions as getPositionsDb, getPositionCardsLite as getPositionCardsLiteDb, getPositionDetailById as getPositionDetailByIdDb } from './src/dashboard/db.js';
import { isMobile } from './src/dashboard/detect.js';
import { mobileCandidatesPage, mobilePositionsPage, mobilePnlPage, mobileStrategyPage } from './src/dashboard/mobile/index.js';
import { desktopCandidatesPage, desktopPositionsPage, desktopPnlPage, desktopStrategyPage } from './src/dashboard/desktop/index.js';

const HOST = process.env.CHARON_DASHBOARD_HOST || '127.0.0.1';
const PORT = Number(process.env.CHARON_DASHBOARD_PORT || 20120);
const DB_PATH = process.env.DB_PATH || './charon.sqlite';
const TROJAN_BOT = process.env.TROJAN_BOT || 'solana_trojanbot';

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

function getEnabledStrategy() { return getEnabledStrategyDb(db); }

function getPositions() { return getPositionsDb(db); }

function getPositionCardsLite() { return getPositionCardsLiteDb(db); }

function getPositionDetailById(id) { return getPositionDetailByIdDb(db, id); }

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

    .filter-bar {
      display:flex;
      flex-wrap:wrap;
      align-items:flex-end;
      gap:12px;
      padding:12px;
      border-radius:14px;
      border:1px solid rgba(71,85,105,.45);
      background:linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.66));
    }
    .fb-section { display:flex; flex-direction:column; gap:8px; }
    .fb-label { font-size:11px; letter-spacing:.45px; text-transform:uppercase; color:#93a4c8; font-weight:700; }
    .fb-group { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    .fb-divider { width:1px; align-self:stretch; background:rgba(71,85,105,.45); margin:0 2px; }
    .fb-arrow { color:#7f93bd; font-size:14px; }
    .chip {
      border:1px solid #24314d;
      background:rgba(15,23,42,.7);
      color:#dbe7ff;
      border-radius:10px;
      padding:8px 12px;
      cursor:pointer;
      font-size:13px;
      font-weight:600;
    }
    .chip:hover { border-color:#3b82f6; color:#fff; }
    .chip.active, .chip.primary {
      background:linear-gradient(180deg, rgba(96,165,250,.2), rgba(59,130,246,.12));
      border-color:#3b82f6;
      color:#fff;
      box-shadow:0 0 0 1px rgba(96,165,250,.15) inset;
    }
    .chip.ghost { background:transparent; color:#b8c7e8; }
    .select-modern {
      background:#0f172a;
      color:#e6edff;
      border:1px solid #24314d;
      border-radius:10px;
      padding:9px 12px;
      min-width:160px;
      font-size:13px;
    }
    .date-input {
      background:rgba(15,23,42,0.6);
      border:1px solid #1e293b;
      color:#e2e8f0;
      padding:8px 10px;
      border-radius:10px;
      font-size:13px;
      font-family:inherit;
    }
    .date-input:focus { outline:none;border-color:#3b82f6; }
    .date-input::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor:pointer; }

    .layout {
      display: grid;
      grid-template-columns: 1fr;
      gap: 14px;
      align-items: start;
    }
    .layout .side { display: none; }
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

    .drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.55);
      backdrop-filter: blur(2px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s ease;
      z-index: 70;
    }
    .drawer-backdrop.open { opacity: 1; pointer-events: auto; }

    .side.drawer {
      position: fixed;
      top: 0;
      right: 0;
      width: min(620px, 96vw);
      height: 100dvh;
      min-height: 100dvh;
      border-radius: 0;
      border-left: 1px solid var(--line);
      border-right: 0;
      border-top: 0;
      border-bottom: 0;
      padding: 0;
      z-index: 80;
      overflow: hidden;
      transform: translateX(102%);
      transition: transform .22s ease;
      display: flex;
      flex-direction: column;
    }
    .side.drawer.open { transform: translateX(0); }
    .drawer-head {
      display:flex; align-items:center; justify-content:space-between; gap:10px;
      padding: 14px 16px;
      border-bottom: 1px solid #1e293b;
      background: linear-gradient(180deg, #0f172aee, #0b1224ee);
      position: sticky; top: 0; z-index: 5;
    }
    .drawer-head h3 { margin:0; font-size: 15px; letter-spacing:.2px; }
    .drawer-head .nav-grp { display:flex; gap:6px; align-items:center; }
    .drawer-body { padding: 14px 16px; overflow-y:auto; flex:1; }
    .drawer-section { margin-bottom: 14px; }
    .drawer-section h4 {
      margin: 0 0 8px; font-size: 11px; letter-spacing: .8px; text-transform: uppercase;
      color: #94a5d4;
      border-left: 3px solid #3b82f6; padding-left: 8px;
    }
    .drawer-close {
      appearance:none; border:1px solid #334155; background:#0f172a; color:#cbd5e1;
      border-radius:10px; padding:6px 10px; cursor:pointer; font-size:12px; font-weight:700;
    }
    .drawer-close:hover { border-color:#60a5fa; color:#e0ecff; }
    .drawer-nav-btn {
      appearance:none; border:1px solid #334155; background:#0f172a; color:#cbd5e1;
      border-radius:8px; padding:5px 9px; cursor:pointer; font-size:12px; font-weight:700;
    }
    .drawer-nav-btn:hover:not(:disabled) { border-color:#60a5fa; color:#e0ecff; }
    .drawer-nav-btn:disabled { opacity:.4; cursor:not-allowed; }
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

    /* Mobile-first refinements */
    @media (max-width: 820px) {
      body { padding: 12px; }
      .wrap { max-width: 100%; }
      h1 { font-size: 20px; margin-bottom: 10px; }
      .sub { font-size: 12px; margin-bottom: 10px; }

      .nav {
        gap: 6px;
        padding: 6px;
        margin-bottom: 12px;
        position: sticky;
        top: 0;
        z-index: 40;
        backdrop-filter: blur(10px);
      }
      .pill {
        flex: 1 1 calc(50% - 6px);
        min-width: 0;
        padding: 12px 8px;
        font-size: 12px;
        min-height: 44px;
        border-radius: 8px;
      }
      .pill.active {
        background: #1d2a4d;
        color: #fff;
        font-weight: 600;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      }
      .pill svg { display: none; }

      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .tile { padding: 10px; }
      .v { font-size: 18px; }

      .toolbar { align-items: stretch; flex-direction: column; }
      .filters { width: 100%; flex-wrap: wrap; }
      .fbtn { flex: 1 1 auto; min-height: 36px; }

      .filter-bar { padding: 10px; gap: 10px; }
      .fb-divider { display: none; }
      .fb-section { width: 100%; }
      .fb-group { width: 100%; }
      .chip { min-height: 36px; }
      .select-modern { width: 100%; min-width: 0; }
      .date-field { flex: 1 1 0; min-width: 0; }
      .date-input { width: 100%; }

      .list { grid-template-columns: 1fr; }
      .meta { grid-template-columns: 1fr; }
      .pnl-big { font-size: 22px; }

      #pager, #c-pager { flex-wrap: wrap; }
      #pager .fbtn, #c-pager .fbtn { flex: 1 1 45%; min-height: 36px; }
      #page-info, #c-pageinfo { width: 100%; text-align: center; order: -1; }

      .drawer { width: 100%; max-width: 100%; border-radius: 14px 14px 0 0; }
      .drawer-head {
        padding: 10px 12px;
        position: sticky;
        top: 0;
        z-index: 50;
        background: linear-gradient(180deg, #131d31ee, #10182aee);
        backdrop-filter: blur(3px);
      }
      .drawer-body { padding: 10px 12px 12px; }
      .detail-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 480px) {
      .summary { grid-template-columns: 1fr; }
      .pill { flex-basis: 100%; min-height: 48px; padding: 14px 12px; font-size: 13px; }
      .chip { font-size: 12px; padding: 8px 10px; }
      .fb-arrow { display: none; }
    }
  </style>
</head>
<body>
  <div class='wrap'>
    <h1>Charon Dashboard</h1>
    <div class='sub'>Trading-style read-only view focused on PnL and position flow.</div>
    <div class='nav' id='top-nav'>
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
  return positionsPageView({
    getPositionCardsLite,
    renderShell,
    TROJAN_BOT,
    fmtPct,
    fmtNum,
    esc,
    fmtAgeSince,
  });
}

function summarizeFromHistory(history) {
  const total = history.length;
  const wins = history.filter((h) => Number(h.pnl_percent) >= 0).length;
  const losses = total - wins;
  const totalPnlPercent = history.reduce((a, h) => a + (Number(h.pnl_percent) || 0), 0);
  const totalPnlSol = history.reduce((a, h) => a + (Number(h.pnl_sol) || 0), 0);
  const vals = history.map((h) => Number(h.pnl_percent) || 0);
  const avgPnlPercent = total ? totalPnlPercent / total : 0;
  const maxPnlPercent = vals.length ? Math.max(...vals) : 0;
  const minPnlPercent = vals.length ? Math.min(...vals) : 0;
  const grossProfitSol = history.reduce((a, h) => a + Math.max(0, Number(h.pnl_sol) || 0), 0);
  const grossLossSol = history.reduce((a, h) => a + Math.min(0, Number(h.pnl_sol) || 0), 0);
  const winVals = history.filter((h) => Number(h.pnl_percent) >= 0).map((h) => Number(h.pnl_percent) || 0);
  const lossVals = history.filter((h) => Number(h.pnl_percent) < 0).map((h) => Number(h.pnl_percent) || 0);
  const avgWinPct = winVals.length ? winVals.reduce((a, b) => a + b, 0) / winVals.length : 0;
  const avgLossPct = lossVals.length ? lossVals.reduce((a, b) => a + b, 0) / lossVals.length : 0;
  const hold = history.map((h) => Number(h.closed_at_ms||0)-Number(h.opened_at_ms||0)).filter((v)=>v>0);
  const avgHoldMs = hold.length ? hold.reduce((a,b)=>a+b,0)/hold.length : 0;
  return { total,wins,losses,totalPnlPercent,totalPnlSol,avgPnlPercent,maxPnlPercent,minPnlPercent,grossProfitSol,grossLossSol,avgWinPct,avgLossPct,avgHoldMs,
    total_pnl_percent: totalPnlPercent,total_pnl_sol: totalPnlSol,avg_pnl_percent: avgPnlPercent,best_pnl_percent:maxPnlPercent,worst_pnl_percent:minPnlPercent,gross_profit_sol:grossProfitSol,gross_loss_sol:grossLossSol,avg_win_pct:avgWinPct,avg_loss_pct:avgLossPct,avg_hold_ms:avgHoldMs };
}

function pnlPage(range = 'all', fromDate = '', toDate = '') {
  return pnlPageView({
    range,
    fromDate,
    toDate,
    analyticsPnlSummary,
    analyticsClosedSeries,
    normalizeDateInput,
    filterHistoryByRange,
    getEnabledStrategy,
    analyticsAdvancedStats,
    summarizeFromHistory,
    generateRecommendations: analyticsRecommendations,
    renderShell,
    buildEquityCurveSvg,
    buildHistogramSvg,
    fmtNum,
    fmtSol,
    fmtPct,
    fmtAge,
    esc,
  });
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
  const rows = db.prepare(`
    SELECT id,mint,status,created_at_ms,updated_at_ms,candidate_json,filter_result_json
    FROM candidates
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
  if (!rows.length) return rows;

  // Attach latest decision (verdict, confidence, reason, action) per candidate
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const decisions = db.prepare(`
    SELECT trigger_candidate_id AS cid, action, reason, verdict, confidence
    FROM decision_logs
    WHERE trigger_candidate_id IN (${placeholders})
    ORDER BY id DESC
  `).all(...ids);
  const byCid = new Map();
  for (const d of decisions) {
    if (!byCid.has(d.cid)) byCid.set(d.cid, d);
  }
  for (const r of rows) {
    const d = byCid.get(r.id);
    if (d) {
      r.last_action = d.action || null;
      r.last_reason = d.reason || null;
      r.last_verdict = d.verdict || null;
      r.last_confidence = d.confidence != null ? Number(d.confidence) : null;
    } else {
      r.last_action = null;
      r.last_reason = null;
      r.last_verdict = null;
      r.last_confidence = null;
    }
  }
  return rows;
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
  return candidatesPageView({
    getCandidates,
    getEnabledStrategy,
    renderShell,
  });
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
  return strategyPageView({
    getEnabledStrategy,
    strategySectionRows,
    renderShell,
    esc,
    fmtNum,
    fmtSolRaw,
  });
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

    if (u.pathname === '/pnl') {
      return sendHtml(
        res,
        200,
        pnlPage(
          u.searchParams.get('range') || 'all',
          u.searchParams.get('from') || '',
          u.searchParams.get('to') || '',
        ),
        req,
      );
    }
    if (u.pathname === '/strategy') {
      if (isMobile(req)) return sendHtml(res, 200, mobileStrategyPage({ getEnabledStrategy }), req);
      return sendHtml(res, 200, desktopStrategyPage({ getEnabledStrategy }), req);
    }
    if (u.pathname === '/candidates') {
      if (isMobile(req)) return sendHtml(res, 200, mobileCandidatesPage({ getCandidates, getEnabledStrategy }), req);
      return sendHtml(res, 200, desktopCandidatesPage({ getCandidates, getEnabledStrategy }), req);
    }
    if (u.pathname === '/pnl-mobile' || (u.pathname === '/pnl' && isMobile(req))) {
      return sendHtml(res, 200, mobilePnlPage({ getPositionCardsLite }), req);
    }
    if (u.pathname === '/' || u.pathname === '/positions') {
      if (isMobile(req)) return sendHtml(res, 200, mobilePositionsPage({ getPositionCardsLite, TROJAN_BOT }), req);
      return sendHtml(res, 200, desktopPositionsPage({ getPositionCardsLite, TROJAN_BOT }), req);
    }

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
