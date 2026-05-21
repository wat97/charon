/**
 * Renders the /candidates page.
 * Dependency-injected via { getCandidates, getEnabledStrategy, renderShell }
 * so the module stays decoupled from dashboard.js internals.
 */
import { esc, fmtNum, fmtAgeSince, safeJson } from './format.js';

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
  if (type === 'rug') {
    if (v <= 20) return 'h-good';
    if (v <= 35) return 'h-warn';
    return 'h-bad';
  }
  if (type === 'ath') {
    if (v >= -40) return 'h-good';
    if (v >= -70) return 'h-warn';
    return 'h-bad';
  }
  return 'h-na';
}

export function candidatesPage({ getCandidates, getEnabledStrategy, renderShell }) {
  const rows = getCandidates(500);
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
    const graduation = cj.graduation || {};
    const trending = cj.trending || {};
    const savedWalletExposure = cj.savedWalletExposure || {};
    const fails = Array.isArray(fj.failures) ? fj.failures : [];
    const sym = token.symbol || token.name || 'Unknown';
    const tokenName = token.name && token.name !== sym ? token.name : null;

    const mcap = metrics.marketCapUsd ?? metrics.market_cap ?? trending.market_cap ?? graduation.marketCap;
    const liq = metrics.liquidityUsd ?? trending.liquidity;
    const vol = metrics.trendingVolumeUsd ?? metrics.volumeUsd ?? trending.volume ?? graduation.volume;
    const swaps = metrics.trendingSwaps ?? metrics.swaps ?? ((Number(trending.buys || 0) + Number(trending.sells || 0)) || null);
    const holderCount = metrics.holderCount ?? trending.holder_count ?? holders.count;

    const top20 = metrics.top20HolderPercent ?? holders.top20Percent ?? graduation.topHoldersPercent;
    const maxHolder = holders.maxHolderPercent;
    const savedWallets = savedWalletExposure.holderCount ?? metrics.savedWalletHolders;
    const rug = metrics.trendingRugRatio ?? metrics.rug_ratio;
    const rugPct = rug != null ? Number(rug) * 100 : null;
    const bundler = metrics.trendingBundlerRate ?? metrics.bundler_rate ?? graduation.sniperCount;
    const bundlerPct = (typeof bundler === 'number' && bundler <= 1) ? bundler * 100 : bundler;
    const ath = chart.distanceFromAthPercent ?? chart.belowRangeHighPercent;

    const activeSources = (() => {
      if (Array.isArray(cj?.signal?.sources) && cj.signal.sources.length) {
        return cj.signal.sources.map(String);
      }
      const names = [];
      if (cj?.signals?.hasFeeClaim) names.push('FEE');
      if (cj?.signals?.hasGraduated) names.push('GRAD');
      if (cj?.signals?.hasTrending) names.push('TREND');
      return names;
    })();
    const sourceCount = activeSources.length;

    const createdAgo = fmtAgeSince(r.created_at_ms);
    const updatedAgo = fmtAgeSince(r.updated_at_ms);
    const mintShort = String(r.mint || '').slice(0, 6) + '…' + String(r.mint || '').slice(-4);

    const statusClass = r.status === 'accepted' ? 'b-open'
      : r.status === 'buy' ? 'b-buy'
      : r.status === 'watch' ? 'b-watch'
      : 'b-closed';

    const top20Class = healthClass(top20, 'top20');
    const rugClass = healthClass(rugPct, 'rug');
    const athClass = healthClass(ath, 'ath');

    const sortMcap = mcap == null ? '' : Number(mcap);
    const sortVol = vol == null ? '' : Number(vol);
    const sortSwaps = swaps == null ? '' : Number(swaps);

    const failsBlock = fails.length
      ? `<div class='cand-fails'>
          <div class='cf-label'>${fails.length} filter ${fails.length === 1 ? 'note' : 'notes'}</div>
          <ul>${fails.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        </div>`
      : '';

    return `<div class='cand-card pos' data-status='${esc(r.status)}'
      data-sort-created='${esc(r.created_at_ms || 0)}'
      data-sort-mcap='${esc(sortMcap)}'
      data-sort-vol='${esc(sortVol)}'
      data-sort-swaps='${esc(sortSwaps)}'
      data-sort-source='${esc(sourceCount)}'
      data-sort-symbol='${esc(sym)}'>
      <div class='cc-head'>
        <div class='cc-id'>
          <div class='cc-sym'>${esc(sym)}</div>
          ${tokenName ? `<div class='cc-name'>${esc(tokenName)}</div>` : ''}
        </div>
        <span class='badge ${statusClass}'>${esc((r.status || 'new').toUpperCase())}</span>
      </div>

      <div class='cc-mcap'>
        <span class='cc-mcap-label'>MCAP</span>
        <span class='cc-mcap-val'>${fmtCompact(mcap)}</span>
      </div>

      ${activeSources.length ? `<div class='cc-sources'>${activeSources.map((s) => `<span class='src-badge src-${esc(String(s).toLowerCase())}'>${esc(s)}</span>`).join('')}<span class='cc-srccount'>${sourceCount}/${minSourceCount || '?'}</span></div>` : ''}

      <div class='cc-grid'>
        <div class='cc-cell'><span class='cc-k'>Liq</span><span class='cc-v'>${fmtCompact(liq)}</span></div>
        <div class='cc-cell'><span class='cc-k'>Vol</span><span class='cc-v'>${fmtCompact(vol)}</span></div>
        <div class='cc-cell'><span class='cc-k'>Holders</span><span class='cc-v'>${fmtCount(holderCount)}</span></div>
        <div class='cc-cell'><span class='cc-k'>Swaps</span><span class='cc-v'>${fmtCount(swaps)}</span></div>
      </div>

      <div class='cc-health'>
        <div class='cc-chip ${top20Class}'>Top20 <b>${top20 == null ? '-' : fmtNum(top20, 0) + '%'}</b></div>
        <div class='cc-chip ${athClass}'>ATH <b>${ath == null ? '-' : fmtNum(ath, 0) + '%'}</b></div>
        ${rugPct != null ? `<div class='cc-chip ${rugClass}'>Rug <b>${fmtNum(rugPct, 0)}%</b></div>` : ''}
        ${maxHolder != null ? `<div class='cc-chip ${healthClass(maxHolder, 'top20')}'>Max <b>${fmtNum(maxHolder, 0)}%</b></div>` : ''}
        ${savedWallets != null && savedWallets > 0 ? `<div class='cc-chip h-good'>Saved <b>${fmtNum(savedWallets, 0)}</b></div>` : ''}
      </div>

      ${failsBlock}

      <div class='cc-foot'>
        <code class='cc-mint'>${esc(mintShort)}</code>
        <span class='cc-age'>${esc(createdAgo)} ago</span>
        <span class='cc-id-num'>#${esc(r.id)}</span>
      </div>
    </div>`;
  }).join('');

  return renderShell('Candidates', `
      <div class='summary'>
        <div class='tile'><div class='k'>Loaded</div><div class='v'>${stats.total || 0}</div></div>
        <div class='tile'><div class='k'>Accepted</div><div class='v up'>${stats.accepted || 0}</div></div>
        <div class='tile'><div class='k'>Buy</div><div class='v up'>${stats.buy || 0}</div></div>
        <div class='tile'><div class='k'>Watch</div><div class='v'>${stats.watch || 0}</div></div>
        <div class='tile'><div class='k'>Filtered</div><div class='v dn'>${stats.filtered || 0}</div></div>
        <div class='tile'><div class='k'>Min Sources</div><div class='v'>${fmtNum(minSourceCount, 0)}</div></div>
      </div>

    <div class='toolbar' style='display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-top:14px'>
      <div class='k'>Latest 500 candidates · 12 per page</div>
      <div style='display:flex;flex-wrap:wrap;align-items:center;gap:10px'>
        <div class='filters'>
          <button class='fbtn active' data-cf='all'>All</button>
          <button class='fbtn' data-cf='accepted'>Accepted</button>
          <button class='fbtn' data-cf='buy'>Buy</button>
          <button class='fbtn' data-cf='watch'>Watch</button>
          <button class='fbtn' data-cf='filtered'>Filtered</button>
        </div>
        <select id='c-sort' class='select-modern' style='background:#0f172a;color:#e6edff;border:1px solid #24314d;border-radius:9px;padding:9px 12px'>
          <option value='created_desc'>Newest</option>
          <option value='created_asc'>Oldest</option>
          <option value='mcap_desc'>MCAP terbesar</option>
          <option value='mcap_asc'>MCAP terkecil</option>
          <option value='vol_desc'>Volume terbesar</option>
          <option value='swaps_desc'>Swap terbanyak</option>
          <option value='source_desc'>Source Count tertinggi</option>
          <option value='symbol_asc'>Symbol A-Z</option>
        </select>
      </div>
    </div>

    <div class='list cand-grid' id='c-list'>${cards || `<div class='empty'>No candidates yet.</div>`}</div>
    <div id='c-pager' style='display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:14px'>
      <button id='c-prev' class='fbtn'>← Prev</button>
      <div class='k' id='c-pageinfo'>Page 1/1</div>
      <button id='c-next' class='fbtn'>Next →</button>
    </div>

    <style>
      .cand-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 12px;
      }
      .cand-card {
        padding: 14px 14px 12px;
        background: linear-gradient(180deg, rgba(15,23,42,0.7), rgba(15,23,42,0.45));
        border: 1px solid rgba(96,165,250,0.12);
        border-radius: 14px;
        transition: border-color 0.15s, transform 0.15s;
      }
      .cand-card:hover { border-color: rgba(96,165,250,0.3); }
      .cand-card[data-status='filtered'] { opacity: 0.78; }

      .cc-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 10px;
      }
      .cc-id { min-width: 0; flex: 1; }
      .cc-sym {
        font-size: 17px;
        font-weight: 700;
        letter-spacing: 0.2px;
        color: #f1f5ff;
        line-height: 1.2;
      }
      .cc-name {
        font-size: 11px;
        color: var(--muted);
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .cc-mcap {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 10px;
        padding: 8px 10px;
        background: rgba(96,165,250,0.07);
        border-radius: 9px;
      }
      .cc-mcap-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1px;
        color: var(--muted);
      }
      .cc-mcap-val {
        font-size: 19px;
        font-weight: 700;
        color: #e6edff;
        margin-left: auto;
      }

      .cc-sources {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        margin-bottom: 10px;
      }
      .cc-srccount {
        margin-left: auto;
        font-size: 10px;
        color: var(--muted);
        font-weight: 600;
      }

      .cc-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px 10px;
        margin-bottom: 10px;
        padding: 8px 10px;
        background: rgba(255,255,255,0.02);
        border-radius: 8px;
      }
      .cc-cell {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-size: 11px;
      }
      .cc-k {
        color: var(--muted);
        font-weight: 500;
      }
      .cc-v {
        color: #e6edff;
        font-weight: 700;
        font-size: 12px;
      }

      .cc-health {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-bottom: 10px;
      }
      .cc-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 7px;
        font-size: 10.5px;
        font-weight: 600;
        border-radius: 6px;
        border: 1px solid transparent;
      }
      .cc-chip b { font-weight: 700; }
      .h-good {
        background: rgba(34,197,94,0.12);
        color: #6ee7b7;
        border-color: rgba(34,197,94,0.25);
      }
      .h-warn {
        background: rgba(245,158,11,0.13);
        color: #fcd34d;
        border-color: rgba(245,158,11,0.3);
      }
      .h-bad {
        background: rgba(239,68,68,0.13);
        color: #fca5a5;
        border-color: rgba(239,68,68,0.3);
      }
      .h-na {
        background: rgba(148,165,212,0.08);
        color: var(--muted);
        border-color: rgba(148,165,212,0.18);
      }

      .cand-fails {
        margin-top: 6px;
        padding: 8px 10px;
        background: rgba(239,68,68,0.06);
        border-left: 2px solid rgba(239,68,68,0.4);
        border-radius: 4px;
      }
      .cf-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.5px;
        color: #fca5a5;
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      .cand-fails ul {
        margin: 0 0 0 14px;
        padding: 0;
      }
      .cand-fails li {
        font-size: 11px;
        color: #cbd5e1;
        margin-bottom: 2px;
        line-height: 1.35;
      }

      .cc-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,0.05);
        font-size: 10.5px;
        color: var(--muted);
      }
      .cc-mint {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        background: rgba(255,255,255,0.04);
        padding: 2px 6px;
        border-radius: 4px;
      }
      .cc-id-num {
        margin-left: auto;
        font-weight: 600;
        opacity: 0.7;
      }

      .src-badge {
        display: inline-block;
        padding: 2px 7px;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.5px;
        border-radius: 5px;
        border: 1px solid transparent;
      }
      .src-fee { background: #13294b; color: #bcd0ff; border-color: #2a4f86; }
      .src-grad { background: #11301f; color: #9bf0c4; border-color: #236b46; }
      .src-trend { background: #3a2510; color: #ffd7a8; border-color: #8a5b2a; }

      .b-buy { background: rgba(34,197,94,0.18); color: #6ee7b7; border: 1px solid rgba(34,197,94,0.4); }
      .b-watch { background: rgba(245,158,11,0.15); color: #fcd34d; border: 1px solid rgba(245,158,11,0.35); }

      @media (max-width: 480px) {
        .cand-grid { grid-template-columns: 1fr; gap: 10px; }
        .cand-card { padding: 12px; }
        .cc-mcap-val { font-size: 17px; }
        .cc-sym { font-size: 16px; }
      }
    </style>

    <script>
      const cAll = Array.from(document.querySelectorAll('#c-list .cand-card'));
      const cListEl = document.getElementById('c-list');
      const cFilters = Array.from(document.querySelectorAll('.fbtn[data-cf]'));
      const cSort = document.getElementById('c-sort');
      const cPrev = document.getElementById('c-prev');
      const cNext = document.getElementById('c-next');
      const cInfo = document.getElementById('c-pageinfo');
      const C_PAGE_SIZE = 12;
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
          const map = { created_desc: 'sortCreated', created_asc: 'sortCreated', mcap_desc: 'sortMcap', mcap_asc: 'sortMcap', vol_desc: 'sortVol', swaps_desc: 'sortSwaps', source_desc: 'sortSource' };
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
