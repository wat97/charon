/**
 * Renders the /candidates page.
 * Dependency-injected via { getCandidates, getEnabledStrategy, renderShell }
 * so the module stays decoupled from dashboard.js internals.
 */
import { esc, fmtNum, fmtAgeSince, safeJson } from './format.js';

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
    const fails = Array.isArray(fj.failures) ? fj.failures : [];
    const sym = token.symbol || token.name || 'Unknown';
    const mcap = metrics.marketCapUsd ?? metrics.market_cap;
    const vol = metrics.trendingVolumeUsd ?? metrics.volumeUsd;
    const swaps = metrics.trendingSwaps ?? metrics.swaps;

    const createdAgo = fmtAgeSince(r.created_at_ms);
    const updatedAgo = fmtAgeSince(r.updated_at_ms);
    const tokenName = token.name || sym;
    const legacySourceCount = cj.signal?.sources?.length || cj.signal?.source_count || 0;
    const derivedSignalsCount = (() => {
      const s = cj.signals;
      if (!s || typeof s !== 'object') return 0;
      if (Array.isArray(s.sources)) return s.sources.length;
      const boolFlags = ['hasFeeClaim', 'hasGraduated', 'hasTrending'];
      const fromFlags = boolFlags.reduce((acc, k) => acc + (s[k] ? 1 : 0), 0);
      return fromFlags;
    })();
    const sourceCount = legacySourceCount || derivedSignalsCount || 0;
    const top20 = metrics.top20HolderPercent ?? metrics.top20_holder_percent;
    const savedWallets = metrics.savedWalletHolders ?? metrics.saved_wallet_holders;
    const rug = metrics.trendingRugRatio ?? metrics.rug_ratio;
    const bundler = metrics.trendingBundlerRate ?? metrics.bundler_rate;
    const ath = metrics.athDistancePct ?? metrics.ath_distance_pct;
    const failPreview = fails.length ? fails.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join('') : '<li>No filter failures recorded</li>';

    return `<div class='pos ${r.status === 'accepted' ? 'pos-open' : 'pos-closed'} cand-card' data-status='${esc(r.status)}'
      data-sort-created='${esc(r.created_at_ms || 0)}'
      data-sort-mcap='${esc(mcap == null ? '' : Number(mcap))}'
      data-sort-vol='${esc(vol == null ? '' : Number(vol))}'
      data-sort-swaps='${esc(swaps == null ? '' : Number(swaps))}'
      data-sort-source='${esc(sourceCount == null ? '' : Number(sourceCount))}'
      data-sort-symbol='${esc(sym)}'>
      <div class='pos-top'>
        <div>
          <div class='sym'>${esc(sym)} <span class='k'>#${esc(r.id)}</span></div>
          <div class='k' style='margin-top:3px'>${esc(tokenName)}</div>
        </div>
        <span class='badge ${r.status === 'accepted' ? 'b-open' : 'b-closed'}'>${esc((r.status || 'new').toUpperCase())}</span>
      </div>
      <div class='meta cand-meta'>
        <div>Mint: <b><code>${esc(String(r.mint || '').slice(0, 8))}...${esc(String(r.mint || '').slice(-4))}</code></b></div>
        <div>Created: <b>${esc(createdAgo)} ago</b></div>
        <div>Updated: <b>${esc(updatedAgo)} ago</b></div>
        <div>Min Source Count: <b>${fmtNum(minSourceCount, 0)}</b></div>
        <div>Source Count: <b>${fmtNum(sourceCount, 0)}</b></div>
        <div>MCAP: <b>$${fmtNum(mcap, 0)}</b></div>
        <div>Volume: <b>$${fmtNum(vol, 0)}</b></div>
        <div>Swaps: <b>${fmtNum(swaps, 0)}</b></div>
        <div>Top20: <b>${top20 == null ? '-' : fmtNum(top20, 1) + '%'}</b></div>
        <div>Saved Wallets: <b>${savedWallets == null ? '-' : fmtNum(savedWallets, 0)}</b></div>
        <div>ATH Dist: <b>${ath == null ? '-' : fmtNum(ath, 1) + '%'}</b></div>
        <div>Rug Ratio: <b>${rug == null ? '-' : fmtNum(Number(rug) * 100, 1) + '%'}</b></div>
        <div>Bundler: <b>${bundler == null ? '-' : fmtNum(Number(bundler) * 100, 1) + '%'}</b></div>
      </div>
      <div class='cand-fails'>
        <div class='k' style='margin-bottom:6px'>Filter Notes · ${fails.length} item</div>
        <ul>${failPreview}</ul>
      </div>
    </div>`;
  }).join('');

  return renderShell('Candidates', `
      <div class='summary'>
        <div class='tile'><div class='k'>Rows loaded</div><div class='v'>${stats.total || 0}</div></div>
        <div class='tile'><div class='k'>Filtered</div><div class='v dn'>${stats.filtered || 0}</div></div>
        <div class='tile'><div class='k'>Accepted</div><div class='v up'>${stats.accepted || 0}</div></div>
        <div class='tile'><div class='k'>Watch</div><div class='v'>${stats.watch || 0}</div></div>
        <div class='tile'><div class='k'>Min Source Count</div><div class='v'>${fmtNum(minSourceCount, 0)}</div></div>
      </div>

    <div class='toolbar' style='display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px'>
      <div class='k'>Latest 500 candidates · 10 per page · 2 cards per row</div>
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
          <option value='source_desc'>Source Count tertinggi</option>
          <option value='source_asc'>Source Count terendah</option>
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
    <style>
      #c-list { grid-template-columns: repeat(2, minmax(280px, 1fr)); }
      @media (max-width: 720px) { #c-list { grid-template-columns: 1fr; } }
      .cand-card { padding: 12px; }
      .cand-meta { grid-template-columns: 1fr 1fr; gap: 6px 10px; }
      .cand-meta div { font-size: 11px; }
      .cand-meta div b { font-size: 12px; }
      .cand-fails { margin-top: 10px; }
      .cand-fails ul { margin: 0 0 0 16px; padding: 0; }
      .cand-fails li { font-size: 10px; color: #94a5d4; margin-bottom: 2px; }
    </style>

    <script>
      const cAll = Array.from(document.querySelectorAll('#c-list .pos'));
      const cListEl = document.getElementById('c-list');
      const cFilters = Array.from(document.querySelectorAll('.fbtn[data-cf]'));
      const cSort = document.getElementById('c-sort');
      const cPrev = document.getElementById('c-prev');
      const cNext = document.getElementById('c-next');
      const cInfo = document.getElementById('c-pageinfo');
      const C_PAGE_SIZE = 10;
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
          const map = { created_desc: 'sortCreated', created_asc: 'sortCreated', mcap_desc: 'sortMcap', mcap_asc: 'sortMcap', vol_desc: 'sortVol', swaps_desc: 'sortSwaps', source_desc: 'sortSource', source_asc: 'sortSource' };
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
