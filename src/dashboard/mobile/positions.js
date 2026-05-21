/**
 * Mobile positions page — trading-app style.
 */
import { esc, fmtNum, fmtPct, fmtAgeSince } from '../format.js';
import { mobileShell } from './shell.js';

function fmtCompact(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const v = Number(n);
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return '$' + (v / 1_000).toFixed(1) + 'k';
  return '$' + Math.round(v);
}

export function mobilePositionsPage({ getPositionCardsLite, TROJAN_BOT }) {
  const all = getPositionCardsLite();
  const open = all.filter(p => p.status === 'open');
  const closed = all.filter(p => p.status === 'closed');

  const totalPnlSol = closed.reduce((s, p) => s + (Number(p.pnl_sol) || 0), 0);
  const winners = closed.filter(p => Number(p.pnl_percent) > 0).length;
  const winRate = closed.length ? Math.round((winners / closed.length) * 100) : 0;

  const cards = all.map(p => {
    const isClosed = p.status === 'closed';
    const pnlClass = p.pnl_percent == null ? '' : (Number(p.pnl_percent) >= 0 ? 'up' : 'dn');
    const pnlText = isClosed
      ? `${Number(p.pnl_percent) > 0 ? '+' : ''}${Number(p.pnl_percent).toFixed(2)}%`
      : 'LIVE';

    return `<a href='/?id=${esc(p.id)}' class='mp-card' data-status='${esc(p.status)}'
      data-sort-pnl='${esc(p.pnl_percent ?? '')}'
      data-sort-opened='${esc(p.opened_at_ms ?? 0)}'>
      <div class='mp-row'>
        <div class='mp-id'>
          <div class='mp-sym'>${esc(p.symbol || 'Unknown')}</div>
          <div class='mp-meta'>${esc(fmtAgeSince(p.opened_at_ms))} · ${fmtNum(p.size_sol, 3)} SOL</div>
        </div>
        <div class='mp-pnl ${pnlClass}'>${esc(pnlText)}</div>
      </div>

      <div class='mp-mcap-row'>
        <div class='mp-mcap'>
          <span class='mp-mk'>Entry</span>
          <span class='mp-mv'>${fmtCompact(p.entry_mcap)}</span>
        </div>
        <span class='mp-arrow'>→</span>
        <div class='mp-mcap'>
          <span class='mp-mk'>${isClosed ? 'Exit' : 'Now'}</span>
          <span class='mp-mv'>${fmtCompact(isClosed ? p.exit_mcap : p.entry_mcap)}</span>
        </div>
        <span class='mp-status ${p.status === 'open' ? 'st-open' : 'st-closed'}'>${esc(String(p.status).toUpperCase())}</span>
      </div>
    </a>`;
  }).join('');

  const statTiles = `
    <div class='m-stat'><div class='m-stat-label'>Open</div><div class='m-stat-value'>${open.length}</div></div>
    <div class='m-stat'><div class='m-stat-label'>Closed</div><div class='m-stat-value'>${closed.length}</div></div>
    <div class='m-stat'><div class='m-stat-label'>WR</div><div class='m-stat-value ${winRate >= 50 ? 'up' : 'dn'}'>${winRate}%</div></div>
    <div class='m-stat'><div class='m-stat-label'>PnL</div><div class='m-stat-value ${totalPnlSol >= 0 ? 'up' : 'dn'}'>${(totalPnlSol >= 0 ? '+' : '') + totalPnlSol.toFixed(2)}</div></div>
  `;

  const body = `
    <div class='m-filters'>
      <button class='m-chip active' data-pf='all'>All</button>
      <button class='m-chip' data-pf='open'>Open</button>
      <button class='m-chip' data-pf='closed'>Closed</button>
      <button class='m-chip' data-pf='winners'>Winners</button>
      <button class='m-chip' data-pf='losers'>Losers</button>
    </div>

    <div id='mp-list'>${cards || `<div class='m-empty'><div class='m-empty-icon'>📊</div>No positions yet</div>`}</div>

    <style>
      .mp-card {
        display: block;
        text-decoration: none;
        color: inherit;
        background: linear-gradient(180deg, rgba(15,23,42,0.8), rgba(15,23,42,0.5));
        border: 1px solid rgba(96,165,250,0.12);
        border-radius: 14px;
        padding: 12px;
        margin-bottom: 8px;
        transition: transform 0.15s, border-color 0.15s;
      }
      .mp-card:active { transform: scale(0.98); border-color: rgba(96,165,250,0.3); }

      .mp-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }
      .mp-id { min-width: 0; flex: 1; }
      .mp-sym { font-size: 16px; font-weight: 700; color: var(--text); }
      .mp-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
      .mp-pnl {
        font-size: 18px;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 8px;
        white-space: nowrap;
      }
      .mp-pnl.up { color: #6ee7b7; background: rgba(34,197,94,0.12); }
      .mp-pnl.dn { color: #fca5a5; background: rgba(239,68,68,0.12); }
      .mp-pnl:not(.up):not(.dn) { color: var(--blue); background: rgba(96,165,250,0.12); }

      .mp-mcap-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: rgba(255,255,255,0.02);
        border-radius: 10px;
      }
      .mp-mcap { display: flex; flex-direction: column; gap: 1px; }
      .mp-mk { font-size: 9px; font-weight: 600; color: var(--muted); text-transform: uppercase; }
      .mp-mv { font-size: 13px; font-weight: 700; color: var(--text); }
      .mp-arrow { color: var(--muted); font-size: 16px; }
      .mp-status {
        margin-left: auto;
        padding: 3px 8px;
        font-size: 10px;
        font-weight: 700;
        border-radius: 5px;
      }
      .st-open { background: rgba(34,197,94,0.12); color: #6ee7b7; }
      .st-closed { background: rgba(148,165,212,0.1); color: var(--muted); }
    </style>

    <script>
      const pAll = Array.from(document.querySelectorAll('#mp-list .mp-card'));
      const pListEl = document.getElementById('mp-list');
      const pFilters = Array.from(document.querySelectorAll('.m-chip[data-pf]'));
      let pFilter = 'all';

      function pRender() {
        const items = pAll.filter(el => {
          if (pFilter === 'all') return true;
          if (pFilter === 'open') return el.dataset.status === 'open';
          if (pFilter === 'closed') return el.dataset.status === 'closed';
          if (pFilter === 'winners') return Number(el.dataset.sortPnl) > 0;
          if (pFilter === 'losers') return Number(el.dataset.sortPnl) < 0;
          return true;
        });
        pListEl.innerHTML = items.length
          ? items.map(el => el.outerHTML).join('')
          : '<div class="m-empty"><div class="m-empty-icon">📊</div>No items</div>';
      }

      pFilters.forEach(b => b.addEventListener('click', () => {
        pFilters.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        pFilter = b.dataset.pf;
        pRender();
      }));
    </script>
  `;

  return mobileShell('Positions', body, {
    activePath: '/',
    stats: { tiles: statTiles },
  });
}
