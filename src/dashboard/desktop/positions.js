/**
 * Desktop positions page — trading dashboard style with sidebar + topbar.
 */
import { esc, fmtNum, fmtPct, fmtAgeSince } from '../format.js';
import { desktopShell } from './shell.js';

function fmtCompact(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const v = Number(n);
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return '$' + (v / 1_000).toFixed(1) + 'k';
  return '$' + Math.round(v);
}

export function desktopPositionsPage({ getPositionCardsLite, TROJAN_BOT }) {
  const all = getPositionCardsLite();
  const open = all.filter(p => p.status === 'open');
  const closed = all.filter(p => p.status === 'closed');

  const totalPnlSol = closed.reduce((s, p) => s + (Number(p.pnl_sol) || 0), 0);
  const winners = closed.filter(p => Number(p.pnl_percent) > 0);
  const winRate = closed.length ? (winners.length / closed.length) * 100 : 0;

  const cards = all.map(p => {
    const isClosed = p.status === 'closed';
    const pnlClass = p.pnl_percent == null ? '' : (Number(p.pnl_percent) >= 0 ? 'up' : 'dn');
    const pnlText = isClosed
      ? `${Number(p.pnl_percent) > 0 ? '+' : ''}${Number(p.pnl_percent).toFixed(2)}%`
      : 'LIVE';

    return `<div class='dp-card' data-id='${esc(p.id)}' data-status='${esc(p.status)}'
      data-sort-pnl='${esc(p.pnl_percent ?? '')}'
      data-sort-opened='${esc(p.opened_at_ms ?? 0)}'>
      <div class='dp-top'>
        <div class='dp-id'>
          <div class='dp-sym'>${esc(p.symbol || 'Unknown')}</div>
          <div class='dp-meta'>${esc(fmtAgeSince(p.opened_at_ms))} · ${fmtNum(p.size_sol, 3)} SOL</div>
        </div>
        <div class='dp-pnl ${pnlClass}'>${esc(pnlText)}</div>
      </div>

      <div class='dp-mcap-row'>
        <div class='dp-mcap'>
          <span class='dp-mk'>Entry</span>
          <span class='dp-mv'>${fmtCompact(p.entry_mcap)}</span>
        </div>
        <span class='dp-arrow'>→</span>
        <div class='dp-mcap'>
          <span class='dp-mk'>${isClosed ? 'Exit' : 'Now'}</span>
          <span class='dp-mv'>${fmtCompact(isClosed ? p.exit_mcap : p.entry_mcap)}</span>
        </div>
        <span class='dp-status ${p.status === 'open' ? 'st-open' : 'st-closed'}'>${esc(String(p.status).toUpperCase())}</span>
      </div>
    </div>`;
  }).join('');

  const statTiles = `
    <div class='ds-stat'><div class='ds-stat-label'>Open</div><div class='ds-stat-value'>${open.length}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Closed</div><div class='ds-stat-value'>${closed.length}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Win Rate</div><div class='ds-stat-value ${winRate >= 50 ? 'up' : 'dn'}'>${winRate.toFixed(0)}%</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Total PnL</div><div class='ds-stat-value ${totalPnlSol >= 0 ? 'up' : 'dn'}'>${(totalPnlSol >= 0 ? '+' : '') + totalPnlSol.toFixed(2)} SOL</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Winners</div><div class='ds-stat-value up'>${winners.length}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Losers</div><div class='ds-stat-value dn'>${closed.length - winners.length}</div></div>
  `;

  const body = `
    <div class='dp-filters'>
      <button class='dp-chip active' data-pf='all'>All</button>
      <button class='dp-chip' data-pf='open'>Open</button>
      <button class='dp-chip' data-pf='closed'>Closed</button>
      <button class='dp-chip' data-pf='winners'>Winners</button>
      <button class='dp-chip' data-pf='losers'>Losers</button>
    </div>

    <div class='dp-grid' id='dp-list'>${cards || `<div class='ds-empty'><div class='ds-empty-icon'>📊</div>No positions yet</div>`}</div>

    <style>
      .dp-filters {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }
      .dp-chip {
        padding: 7px 14px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(96, 165, 250, 0.12);
        border-radius: 8px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
      }
      .dp-chip:hover { background: rgba(96, 165, 250, 0.08); }
      .dp-chip.active {
        background: rgba(96, 165, 250, 0.18);
        border-color: rgba(96, 165, 250, 0.4);
        color: var(--text);
      }

      .dp-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 12px;
      }

      .dp-card {
        background: linear-gradient(180deg, rgba(15,23,42,0.8), rgba(15,23,42,0.5));
        border: 1px solid rgba(96,165,250,0.12);
        border-radius: 14px;
        padding: 14px;
        transition: transform 0.15s, border-color 0.15s;
      }
      .dp-card:hover { transform: translateY(-2px); border-color: rgba(96,165,250,0.3); }

      .dp-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }
      .dp-id { min-width: 0; flex: 1; }
      .dp-sym { font-size: 16px; font-weight: 700; color: var(--text); }
      .dp-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
      .dp-pnl {
        font-size: 18px;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 8px;
        white-space: nowrap;
      }
      .dp-pnl.up { color: #6ee7b7; background: rgba(34,197,94,0.12); }
      .dp-pnl.dn { color: #fca5a5; background: rgba(239,68,68,0.12); }
      .dp-pnl:not(.up):not(.dn) { color: var(--blue); background: rgba(96,165,250,0.12); }

      .dp-mcap-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: rgba(255,255,255,0.02);
        border-radius: 10px;
      }
      .dp-mcap { display: flex; flex-direction: column; gap: 1px; }
      .dp-mk { font-size: 9px; font-weight: 600; color: var(--muted); text-transform: uppercase; }
      .dp-mv { font-size: 13px; font-weight: 700; color: var(--text); }
      .dp-arrow { color: var(--muted); font-size: 16px; }
      .dp-status {
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
      const pAll = Array.from(document.querySelectorAll('#dp-list .dp-card'));
      const pListEl = document.getElementById('dp-list');
      const pFilters = Array.from(document.querySelectorAll('.dp-chip[data-pf]'));
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
          : '<div class="ds-empty"><div class="ds-empty-icon">📊</div>No items</div>';
      }

      pFilters.forEach(b => b.addEventListener('click', () => {
        pFilters.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        pFilter = b.dataset.pf;
        pRender();
      }));
    </script>
  `;

  return desktopShell('Positions', body, {
    activePath: '/',
    stats: { tiles: statTiles },
  });
}
