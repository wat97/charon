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
      data-sort-opened='${esc(p.opened_at_ms ?? 0)}'
      data-sort-size='${esc(p.size_sol ?? 0)}'>
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

    <div class='m-sort-row'>
      <label class='m-sort-label'>Sort</label>
      <select class='m-sort' id='mp-sort'>
        <option value='newest'>Newest</option>
        <option value='oldest'>Oldest</option>
        <option value='pnl_desc'>PnL% ↓</option>
        <option value='pnl_asc'>PnL% ↑</option>
        <option value='size_desc'>Size ↓</option>
        <option value='size_asc'>Size ↑</option>
      </select>
    </div>

    <div id='mp-list'>${cards || `<div class='m-empty'><div class='m-empty-icon'>📊</div>No positions yet</div>`}</div>
    <div class='m-pager' id='mp-pager'>
      <button class='m-chip' id='mp-prev'>← Prev</button>
      <div class='m-page-info' id='mp-page-info'>Page 1 / 1</div>
      <button class='m-chip' id='mp-next'>Next →</button>
    </div>

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

      .m-pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 10px;
        padding: 4px 0;
      }
      .m-page-info {
        font-size: 11px;
        color: var(--muted);
        text-align: center;
        flex: 1;
      }
      .m-pager .m-chip[disabled] { opacity: 0.4; pointer-events: none; }

      .m-sort-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
      }
      .m-sort-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .m-sort {
        flex: 1;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(96, 165, 250, 0.18);
        color: var(--text);
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 600;
        border-radius: 10px;
        appearance: none;
        -webkit-appearance: none;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a5d4' stroke-width='2'><polyline points='6 9 12 15 18 9'></polyline></svg>");
        background-repeat: no-repeat;
        background-position: right 10px center;
        padding-right: 28px;
      }
    </style>

    <script>
      const pAll = Array.from(document.querySelectorAll('#mp-list .mp-card'));
      const pListEl = document.getElementById('mp-list');
      const pFilters = Array.from(document.querySelectorAll('.m-chip[data-pf]'));
      const pPrevBtn = document.getElementById('mp-prev');
      const pNextBtn = document.getElementById('mp-next');
      const pPageInfo = document.getElementById('mp-page-info');
      const pSortSel = document.getElementById('mp-sort');
      let pFilter = 'all';
      let pSort = 'newest';
      const P_PAGE_SIZE = 10;
      let pPage = 1;

      function pFiltered() {
        return pAll.filter(el => {
          if (pFilter === 'all') return true;
          if (pFilter === 'open') return el.dataset.status === 'open';
          if (pFilter === 'closed') return el.dataset.status === 'closed';
          if (pFilter === 'winners') return Number(el.dataset.sortPnl) > 0;
          if (pFilter === 'losers') return Number(el.dataset.sortPnl) < 0;
          return true;
        });
      }

      function pSorted(items) {
        const arr = items.slice();
        const num = (el, key) => {
          const v = Number(el.dataset[key]);
          return Number.isFinite(v) ? v : 0;
        };
        switch (pSort) {
          case 'oldest': arr.sort((a, b) => num(a, 'sortOpened') - num(b, 'sortOpened')); break;
          case 'pnl_desc': arr.sort((a, b) => num(b, 'sortPnl') - num(a, 'sortPnl')); break;
          case 'pnl_asc': arr.sort((a, b) => num(a, 'sortPnl') - num(b, 'sortPnl')); break;
          case 'size_desc': arr.sort((a, b) => num(b, 'sortSize') - num(a, 'sortSize')); break;
          case 'size_asc': arr.sort((a, b) => num(a, 'sortSize') - num(b, 'sortSize')); break;
          default: arr.sort((a, b) => num(b, 'sortOpened') - num(a, 'sortOpened'));
        }
        return arr;
      }

      function pRender() {
        const filtered = pSorted(pFiltered());
        const totalPages = Math.max(1, Math.ceil(filtered.length / P_PAGE_SIZE));
        if (pPage > totalPages) pPage = totalPages;
        const start = (pPage - 1) * P_PAGE_SIZE;
        const pageItems = filtered.slice(start, start + P_PAGE_SIZE);
        pListEl.innerHTML = pageItems.length
          ? pageItems.map(el => el.outerHTML).join('')
          : '<div class="m-empty"><div class="m-empty-icon">📊</div>No items</div>';
        pPageInfo.textContent = 'Page ' + pPage + ' / ' + totalPages + ' · ' + filtered.length + ' item';
        pPrevBtn.disabled = pPage <= 1;
        pNextBtn.disabled = pPage >= totalPages;
      }

      pFilters.forEach(b => b.addEventListener('click', () => {
        pFilters.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        pFilter = b.dataset.pf;
        pPage = 1;
        pRender();
      }));
      pSortSel.addEventListener('change', () => { pSort = pSortSel.value; pPage = 1; pRender(); });
      pPrevBtn.addEventListener('click', () => { if (pPage > 1) { pPage--; pRender(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
      pNextBtn.addEventListener('click', () => { pPage++; pRender(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      pRender();
    </script>
  `;

  return mobileShell('Positions', body, {
    activePath: '/',
    stats: { tiles: statTiles },
  });
}
