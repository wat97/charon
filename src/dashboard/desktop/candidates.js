/**
 * Desktop candidates page — trading dashboard style with multi-column layout.
 */
import { esc, fmtNum, fmtAgeSince, safeJson } from '../format.js';
import { desktopShell } from './shell.js';

function fmtCompact(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const v = Number(n);
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return '$' + (v / 1_000).toFixed(1) + 'k';
  return '$' + Math.round(v);
}

function fmtCount(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const v = Number(n);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'k';
  return String(Math.round(v));
}

function healthClass(value, type) {
  if (value == null) return 'h-na';
  const v = Number(value);
  if (!Number.isFinite(v)) return 'h-na';
  if (type === 'top20') {
    if (v <= 45) return 'h-good';
    if (v <= 60) return 'h-warn';
    return 'h-bad';
  }
  if (type === 'ath') {
    if (v >= -40) return 'h-good';
    if (v >= -70) return 'h-warn';
    return 'h-bad';
  }
  return 'h-na';
}

export function desktopCandidatesPage({ getCandidates, getEnabledStrategy }) {
  const rows = getCandidates(300);
  const strategy = getEnabledStrategy();
  const minSourceCount = Number(strategy?.config?.min_source_count ?? 0) || 0;
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
    const holders = cj.holders || {};
    const chart = cj.chart || {};
    const trending = cj.trending || {};
    const fails = Array.isArray(fj.failures) ? fj.failures : [];
    const sym = token.symbol || token.name || 'Unknown';

    const mcap = metrics.marketCapUsd ?? metrics.market_cap ?? trending.market_cap;
    const liq = metrics.liquidityUsd ?? trending.liquidity;
    const vol = metrics.trendingVolumeUsd ?? metrics.volumeUsd ?? trending.volume;
    const swaps = metrics.trendingSwaps ?? metrics.swaps;
    const top20 = metrics.top20HolderPercent ?? holders.top20Percent;
    const ath = chart.distanceFromAthPercent ?? chart.belowRangeHighPercent;

    const activeSources = (() => {
      const names = [];
      if (cj?.signals?.hasFeeClaim) names.push('FEE');
      if (cj?.signals?.hasGraduated) names.push('GRAD');
      if (cj?.signals?.hasTrending) names.push('TREND');
      return names;
    })();

    const top20Class = healthClass(top20, 'top20');
    const athClass = healthClass(ath, 'ath');

    const statusBadge = r.status === 'buy'
      ? `<span class='dc-badge bg-buy'>BUY</span>`
      : r.status === 'watch' ? `<span class='dc-badge bg-watch'>WATCH</span>`
      : r.status === 'accepted' ? `<span class='dc-badge bg-acc'>ACC</span>`
      : r.status === 'filtered' ? `<span class='dc-badge bg-filt'>FILT</span>`
      : `<span class='dc-badge bg-new'>NEW</span>`;

    const reasonBlock = (r.last_reason && (r.status === 'buy' || r.status === 'watch'))
      ? `<div class='dc-reason'>
          <div class='dc-reason-head'>${esc(r.last_verdict || '')} <span class='dc-reason-conf'>${r.last_confidence != null ? r.last_confidence + '%' : '-'}</span></div>
          <div class='dc-reason-text'>${esc((r.last_reason || '').slice(0, 180))}</div>
        </div>` : '';

    const failsBlock = (fails.length && r.status === 'filtered')
      ? `<div class='dc-fails'>${esc(fails.slice(0, 3).join(' · '))}</div>` : '';

    return `<div class='dc-card' data-status='${esc(r.status)}'
      data-mcap='${mcap == null ? '' : Number(mcap)}'
      data-vol='${vol == null ? '' : Number(vol)}'
      data-created='${r.created_at_ms || 0}'
      data-symbol='${esc(sym)}'>
      <div class='dc-top'>
        <div class='dc-id'>
          <div class='dc-sym'>${esc(sym)}</div>
          <div class='dc-mint'>${esc(String(r.mint || '').slice(0, 6))}…${esc(String(r.mint || '').slice(-4))}</div>
        </div>
        ${statusBadge}
      </div>

      <div class='dc-mcap-row'>
        <span class='dc-mcap-val'>${fmtCompact(mcap)}</span>
        ${activeSources.length ? `<span class='dc-srcs'>${activeSources.map(s => `<span class='dc-src dc-src-${s.toLowerCase()}'>${s}</span>`).join('')}</span>` : ''}
      </div>

      <div class='dc-metrics'>
        <div class='dc-metric'><span class='dc-mk'>Liq</span><span class='dc-mv'>${fmtCompact(liq)}</span></div>
        <div class='dc-metric'><span class='dc-mk'>Vol</span><span class='dc-mv'>${fmtCompact(vol)}</span></div>
        <div class='dc-metric'><span class='dc-mk'>Swaps</span><span class='dc-mv'>${fmtCount(swaps)}</span></div>
        <div class='dc-metric'><span class='dc-mk'>Age</span><span class='dc-mv'>${fmtAgeSince(r.created_at_ms)}</span></div>
      </div>

      <div class='dc-chips'>
        <span class='dc-chip ${top20Class}'>Top20 ${top20 == null ? '-' : fmtNum(top20, 0) + '%'}</span>
        <span class='dc-chip ${athClass}'>ATH ${ath == null ? '-' : fmtNum(ath, 0) + '%'}</span>
        <span class='dc-chip h-na'>MinSrc ${minSourceCount}</span>
      </div>

      ${reasonBlock}
      ${failsBlock}
    </div>`;
  }).join('');

  const statTiles = `
    <div class='ds-stat'><div class='ds-stat-label'>Total</div><div class='ds-stat-value'>${stats.total || 0}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Buy</div><div class='ds-stat-value up'>${stats.buy || 0}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Watch</div><div class='ds-stat-value'>${stats.watch || 0}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Accepted</div><div class='ds-stat-value'>${stats.accepted || 0}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Filtered</div><div class='ds-stat-value dn'>${stats.filtered || 0}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Min Source</div><div class='ds-stat-value'>${minSourceCount}</div></div>
  `;

  const body = `
    <div class='dc-filters'>
      <button class='dc-chip active' data-cf='all'>All</button>
      <button class='dc-chip' data-cf='buy'>Buy</button>
      <button class='dc-chip' data-cf='watch'>Watch</button>
      <button class='dc-chip' data-cf='accepted'>Accepted</button>
      <button class='dc-chip' data-cf='filtered'>Filtered</button>
    </div>

    <div class='d-sort-row'>
      <label class='d-sort-label'>Sort</label>
      <select class='d-sort' id='dc-sort'>
        <option value='newest'>Newest</option>
        <option value='oldest'>Oldest</option>
        <option value='mcap_desc'>MCAP ↓</option>
        <option value='mcap_asc'>MCAP ↑</option>
        <option value='vol_desc'>Volume ↓</option>
        <option value='vol_asc'>Volume ↑</option>
        <option value='symbol_asc'>Symbol A-Z</option>
        <option value='symbol_desc'>Symbol Z-A</option>
      </select>
    </div>

    <div class='dc-grid' id='dc-list'>${cards || `<div class='ds-empty'><div class='ds-empty-icon'>🎯</div>No candidates yet</div>`}</div>
    <div class='d-pager' id='dc-pager'>
      <button class='dc-chip' id='dc-prev'>← Prev</button>
      <div class='d-page-info' id='dc-page-info'>Page 1 / 1</div>
      <button class='dc-chip' id='dc-next'>Next →</button>
    </div>

    <style>
      .dc-filters {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }
      .dc-chip {
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
      .dc-chip:hover { background: rgba(96, 165, 250, 0.08); }
      .dc-chip.active {
        background: rgba(96, 165, 250, 0.18);
        border-color: rgba(96, 165, 250, 0.4);
        color: var(--text);
      }

      .dc-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 12px;
      }

      .dc-card {
        background: linear-gradient(180deg, rgba(15,23,42,0.8), rgba(15,23,42,0.5));
        border: 1px solid rgba(96,165,250,0.12);
        border-radius: 14px;
        padding: 14px;
        transition: transform 0.15s, border-color 0.15s;
      }
      .dc-card:hover { transform: translateY(-2px); border-color: rgba(96,165,250,0.3); }
      .dc-card[data-status='filtered'] { opacity: 0.7; }

      .dc-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 10px;
      }
      .dc-id { min-width: 0; flex: 1; }
      .dc-sym { font-size: 16px; font-weight: 700; color: var(--text); }
      .dc-mint { font-size: 10px; color: var(--muted); margin-top: 2px; font-family: ui-monospace, monospace; }

      .dc-badge {
        flex-shrink: 0;
        padding: 3px 8px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.4px;
        border-radius: 6px;
      }
      .bg-buy { background: rgba(34,197,94,0.18); color: #6ee7b7; border: 1px solid rgba(34,197,94,0.35); }
      .bg-watch { background: rgba(245,158,11,0.18); color: #fcd34d; border: 1px solid rgba(245,158,11,0.35); }
      .bg-acc { background: rgba(96,165,250,0.18); color: #93c5fd; border: 1px solid rgba(96,165,250,0.35); }
      .bg-filt { background: rgba(148,165,212,0.1); color: var(--muted); border: 1px solid rgba(148,165,212,0.25); }
      .bg-new { background: rgba(168,85,247,0.18); color: #d8b4fe; border: 1px solid rgba(168,85,247,0.35); }

      .dc-mcap-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px;
        background: rgba(96,165,250,0.07);
        border-radius: 10px;
        margin-bottom: 8px;
      }
      .dc-mcap-val { font-size: 18px; font-weight: 700; color: var(--text); }
      .dc-srcs { display: flex; gap: 3px; }
      .dc-src {
        display: inline-block;
        padding: 2px 6px;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.3px;
        border-radius: 4px;
      }
      .dc-src-fee { background: #13294b; color: #bcd0ff; }
      .dc-src-grad { background: #11301f; color: #9bf0c4; }
      .dc-src-trend { background: #3a2510; color: #ffd7a8; }

      .dc-metrics {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        margin-bottom: 8px;
      }
      .dc-metric {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        padding: 6px 4px;
        background: rgba(255,255,255,0.02);
        border-radius: 8px;
      }
      .dc-mk { font-size: 9px; font-weight: 600; color: var(--muted); text-transform: uppercase; }
      .dc-mv { font-size: 12px; font-weight: 700; color: var(--text); }

      .dc-chips { display: flex; flex-wrap: wrap; gap: 4px; }
      .dc-chip {
        padding: 3px 7px;
        font-size: 10px;
        font-weight: 600;
        border-radius: 5px;
        border: 1px solid transparent;
      }
      .h-good { background: rgba(34,197,94,0.12); color: #6ee7b7; border-color: rgba(34,197,94,0.25); }
      .h-warn { background: rgba(245,158,11,0.13); color: #fcd34d; border-color: rgba(245,158,11,0.3); }
      .h-bad { background: rgba(239,68,68,0.13); color: #fca5a5; border-color: rgba(239,68,68,0.3); }
      .h-na { background: rgba(148,165,212,0.08); color: var(--muted); border-color: rgba(148,165,212,0.18); }

      .dc-reason {
        margin-top: 8px;
        padding: 8px 10px;
        background: rgba(245,158,11,0.06);
        border-left: 2px solid rgba(245,158,11,0.4);
        border-radius: 6px;
      }
      .dc-reason-head {
        font-size: 10px;
        font-weight: 700;
        color: #fcd34d;
        letter-spacing: 0.4px;
        margin-bottom: 3px;
      }
      .dc-reason-conf {
        background: rgba(245,158,11,0.18);
        padding: 1px 5px;
        border-radius: 4px;
        margin-left: 4px;
      }
      .dc-reason-text {
        font-size: 11px;
        color: var(--text);
        line-height: 1.4;
      }

      .dc-fails {
        margin-top: 6px;
        padding: 6px 8px;
        background: rgba(239,68,68,0.06);
        border-left: 2px solid rgba(239,68,68,0.35);
        border-radius: 6px;
        font-size: 10px;
        color: #fca5a5;
        line-height: 1.4;
      }

      .d-pager {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-top: 16px;
        padding: 8px 0;
      }
      .d-page-info {
        font-size: 12px;
        color: var(--muted);
        text-align: center;
      }
      .d-pager .dc-chip[disabled] { opacity: 0.4; pointer-events: none; }

      .d-sort-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
      }
      .d-sort-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .d-sort {
        flex: 1;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(96, 165, 250, 0.18);
        color: var(--text);
        padding: 9px 12px;
        font-size: 12px;
        font-weight: 600;
        border-radius: 10px;
        appearance: none;
        -webkit-appearance: none;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a5d4' stroke-width='2'><polyline points='6 9 12 15 18 9'></polyline></svg>");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 32px;
      }
    </style>

    <script>
      const cAll = Array.from(document.querySelectorAll('#dc-list .dc-card'));
      const cListEl = document.getElementById('dc-list');
      const cFilters = Array.from(document.querySelectorAll('.dc-chip[data-cf]'));
      const cPrevBtn = document.getElementById('dc-prev');
      const cNextBtn = document.getElementById('dc-next');
      const cPageInfo = document.getElementById('dc-page-info');
      const cSortSel = document.getElementById('dc-sort');
      let cFilter = 'all';
      let cSort = 'newest';
      const C_PAGE_SIZE = 10;
      let cPage = 1;

      function cFiltered() {
        return cAll.filter(el => cFilter === 'all' || el.dataset.status === cFilter);
      }

      function cSorted(items) {
        const arr = items.slice();
        const num = (el, key) => {
          const v = Number(el.dataset[key]);
          return Number.isFinite(v) ? v : 0;
        };
        switch (cSort) {
          case 'oldest': arr.sort((a, b) => num(a, 'created') - num(b, 'created')); break;
          case 'mcap_desc': arr.sort((a, b) => num(b, 'mcap') - num(a, 'mcap')); break;
          case 'mcap_asc': arr.sort((a, b) => num(a, 'mcap') - num(b, 'mcap')); break;
          case 'vol_desc': arr.sort((a, b) => num(b, 'vol') - num(a, 'vol')); break;
          case 'vol_asc': arr.sort((a, b) => num(a, 'vol') - num(b, 'vol')); break;
          case 'symbol_asc': arr.sort((a, b) => (a.dataset.symbol || '').localeCompare(b.dataset.symbol || '')); break;
          case 'symbol_desc': arr.sort((a, b) => (b.dataset.symbol || '').localeCompare(a.dataset.symbol || '')); break;
          default: arr.sort((a, b) => num(b, 'created') - num(a, 'created'));
        }
        return arr;
      }

      function cRender() {
        const filtered = cSorted(cFiltered());
        const totalPages = Math.max(1, Math.ceil(filtered.length / C_PAGE_SIZE));
        if (cPage > totalPages) cPage = totalPages;
        const start = (cPage - 1) * C_PAGE_SIZE;
        const pageItems = filtered.slice(start, start + C_PAGE_SIZE);
        cListEl.innerHTML = pageItems.length
          ? pageItems.map(el => el.outerHTML).join('')
          : '<div class="ds-empty"><div class="ds-empty-icon">🎯</div>No items</div>';
        cPageInfo.textContent = 'Page ' + cPage + ' / ' + totalPages + ' · ' + filtered.length + ' item';
        cPrevBtn.disabled = cPage <= 1;
        cNextBtn.disabled = cPage >= totalPages;
      }

      cFilters.forEach(b => b.addEventListener('click', () => {
        cFilters.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        cFilter = b.dataset.cf;
        cPage = 1;
        cRender();
      }));
      cSortSel.addEventListener('change', () => { cSort = cSortSel.value; cPage = 1; cRender(); });
      cPrevBtn.addEventListener('click', () => { if (cPage > 1) { cPage--; cRender(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
      cNextBtn.addEventListener('click', () => { cPage++; cRender(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      cRender();
    </script>
  `;

  return desktopShell('Candidates', body, {
    activePath: '/candidates',
    stats: { tiles: statTiles },
  });
}
