/**
 * Renders the / and /positions page (cards, drawer, realtime WS handlers).
 * Dependency-injected via { getPositionCardsLite, renderShell, TROJAN_BOT,
 *   fmtPct, fmtNum, esc, fmtAgeSince }.
 */
export function positionsPage({ getPositionCardsLite, renderShell, TROJAN_BOT, fmtPct, fmtNum, esc, fmtAgeSince }) {
  const all = getPositionCardsLite();

  // Default filter: open only
  const defaultFilter = 'open';

  const cards = all.map((p, i) => {
    const isClosed = p.status === 'closed';
    const pnlClass = p.pnl_percent == null ? '' : (Number(p.pnl_percent) >= 0 ? 'up' : 'dn');
    const pnlText = isClosed ? fmtPct(p.pnl_percent) : 'LIVE';
    const statusClass = p.status === 'open' ? 'b-open' : 'b-closed';

    const compactMeta = `
      <div>Size: <b>${fmtNum(p.size_sol, 4)} SOL</b></div>
      <div>Age: <b>${esc(fmtAgeSince(p.opened_at_ms))}</b></div>
      <div>Entry MCAP: <b>$${fmtNum(p.entry_mcap, 0)}</b></div>
      ${isClosed ? `<div>Exit MCAP: <b>$${fmtNum(p.exit_mcap, 0)}</b></div><div>PnL %: <b class='${pnlClass}'>${fmtPct(p.pnl_percent)}</b></div>` : `<div>Status: <b>Monitoring</b></div>`}
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
      data-opened-date='${esc(new Date(sortOpened || 0).toISOString().slice(0,10))}'
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

    <div class='toolbar' style='display:flex;flex-direction:column;gap:12px'>
      <div class='k'>Click a card to open full transaction detail on the right panel.</div>
      <div class='filter-bar pos-filter-bar'>
        <div class='fb-section'>
          <div class='fb-label'>Status</div>
          <div class='fb-group filters'>
            <button class='chip ${defaultFilter === 'all' ? 'active' : ''}' data-filter='all'>All</button>
            <button class='chip ${defaultFilter === 'open' ? 'active' : ''}' data-filter='open'>Open</button>
            <button class='chip ${defaultFilter === 'closed' ? 'active' : ''}' data-filter='closed'>Closed</button>
          </div>
        </div>
        <div class='fb-divider'></div>
        <div class='fb-section'>
          <div class='fb-label'>Opened Date</div>
          <form id='positions-date-form' class='fb-group'>
            <div class='date-field'><input type='date' id='positions-from' class='date-input' aria-label='Positions from date' /></div>
            <span class='fb-arrow'>→</span>
            <div class='date-field'><input type='date' id='positions-to' class='date-input' aria-label='Positions to date' /></div>
            <button type='submit' class='chip primary'>Apply</button>
            <button type='button' id='positions-date-reset' class='chip ghost'>Reset</button>
          </form>
        </div>
        <div class='fb-divider'></div>
        <div class='fb-section'>
          <div class='fb-label'>Sort</div>
          <select id='sort-select' class='select-modern'>
            <option value='opened_desc'>Newest</option>
            <option value='opened_asc'>Oldest</option>
            <option value='pnl_desc'>PnL tertinggi</option>
            <option value='pnl_asc'>PnL terendah</option>
            <option value='mcap_desc'>MCAP terbesar</option>
            <option value='mcap_asc'>MCAP terkecil</option>
            <option value='symbol_asc'>Symbol A-Z</option>
          </select>
        </div>
        <div class='fb-section'>
          <div class='fb-label'>Quick Filter</div>
          <select id='quick-filter' class='select-modern'>
            <option value='all'>Semua</option>
            <option value='winners'>PnL positif</option>
            <option value='losers'>PnL negatif</option>
            <option value='bigcaps'>MCAP ≥ 100k</option>
            <option value='smallcaps'>MCAP < 100k</option>
          </select>
        </div>
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
    <style>
      #pos-list { grid-template-columns: repeat(3, minmax(240px, 1fr)); }
      @media (max-width: 1200px) { #pos-list { grid-template-columns: repeat(2, minmax(240px, 1fr)); } }
      @media (max-width: 760px) { #pos-list { grid-template-columns: 1fr; } }
    </style>
    <div class='drawer-backdrop' id='drawer-backdrop'></div>
    <div class='side drawer' id='detail-drawer'>
      <div class='drawer-head'>
        <h3>Position Detail</h3>
        <div class='nav-grp'>
          <button class='drawer-nav-btn' id='drawer-prev'>←</button>
          <button class='drawer-nav-btn' id='drawer-next'>→</button>
          <button class='drawer-close' id='drawer-close'>Close</button>
        </div>
      </div>
      <div class='drawer-body' id='drawer-content'>
        <div class='k'>Select one card to inspect its full trade detail.</div>
      </div>
    </div>

    <script>
      const panel = document.getElementById('detail-panel');
      const drawer = document.getElementById('detail-drawer');
      const drawerBackdrop = document.getElementById('drawer-backdrop');
      const drawerContent = document.getElementById('drawer-content');
      const drawerClose = document.getElementById('drawer-close');
      const drawerPrev = document.getElementById('drawer-prev');
      const drawerNext = document.getElementById('drawer-next');
      let cards = Array.from(document.querySelectorAll('.pos'));
      let currentDetailId = null;
      const buttons = Array.from(document.querySelectorAll('.chip[data-filter]'));
      const sortSelect = document.getElementById('sort-select');
      const quickFilter = document.getElementById('quick-filter');
      const positionsDateForm = document.getElementById('positions-date-form');
      const positionsFromInput = document.getElementById('positions-from');
      const positionsToInput = document.getElementById('positions-to');
      const positionsDateReset = document.getElementById('positions-date-reset');
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
      let currentDateFrom = '';
      let currentDateTo = '';

      function safe(v){ return (v === null || v === undefined) ? '-' : String(v); }
      function iso(ms){ try { return ms ? new Date(ms).toISOString() : '-' ; } catch { return '-'; } }
      function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
      function openDrawer(){ if (drawer) drawer.classList.add('open'); if (drawerBackdrop) drawerBackdrop.classList.add('open'); document.body.style.overflow = 'hidden'; }
      function closeDrawer(){ if (drawer) drawer.classList.remove('open'); if (drawerBackdrop) drawerBackdrop.classList.remove('open'); document.body.style.overflow = ''; currentDetailId = null; if (drawerPrev) drawerPrev.disabled = true; if (drawerNext) drawerNext.disabled = true; Array.from(listEl.querySelectorAll('.pos')).forEach((x) => x.classList.remove('active')); }
      function showLoading(){ if (drawerContent) drawerContent.innerHTML = '<div class="k">Loading detail…</div>'; if (panel) panel.innerHTML = '<h3 style="margin:0 0 10px">Position Detail</h3><div class="k">Loading detail…</div>'; }
      function updateDrawerNav(){ if (!currentDetailId) return; const visible = getVisibleCards(); const idx = visible.findIndex(el => el.dataset.id === currentDetailId); if (drawerPrev) drawerPrev.disabled = idx <= 0; if (drawerNext) drawerNext.disabled = idx < 0 || idx >= visible.length - 1; }
      function getVisibleCards(){ return Array.from(listEl.querySelectorAll('.pos')); }
      function openCardDetail(el){ Array.from(listEl.querySelectorAll('.pos')).forEach((x) => x.classList.remove('active')); el.classList.add('active'); currentDetailId = el.dataset.id; showLoading(); updateDrawerNav(); const id = el.dataset.id; loadDetail(id).then(pos => { renderDetail(pos || {}); }).catch(() => { if (drawerContent) drawerContent.innerHTML = '<div class="k">Failed to load detail.</div>'; if (panel) panel.innerHTML = '<h3 style="margin:0 0 10px">Position Detail</h3><div class="k">Failed to load detail.</div>'; openDrawer(); }); }

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
        const compactMeta = "<div>Size: <b>" + fmtNumJs(p.size_sol, 4) + " SOL</b></div>"
          + "<div>Age: <b>" + escHtml(fmtAgeSinceJs(p.opened_at_ms)) + "</b></div>"
          + "<div>Entry MCAP: <b>$" + fmtNumJs(p.entry_mcap, 0) + "</b></div>"
          + (isClosed
              ? ("<div>Exit MCAP: <b>$" + fmtNumJs(p.exit_mcap, 0) + "</b></div><div>PnL %: <b class='" + pnlClass + "'>" + fmtPctJs(p.pnl_percent) + "</b></div>")
              : "<div>Status: <b>Monitoring</b></div>");

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
          + " data-sort-symbol='" + escHtml(sortSymbol) + "'"
          + " data-opened-date='" + escHtml(new Date(sortOpened || 0).toISOString().slice(0,10)) + "'>"
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

      function passDateFilter(el) {
        const opened = String(el.dataset.openedDate || '');
        if (!opened) return true;
        if (currentDateFrom && opened < currentDateFrom) return false;
        if (currentDateTo && opened > currentDateTo) return false;
        return true;
      }

      function getFilteredCards() {
        return cards.filter((el) => {
          if (currentFilter !== 'all' && el.dataset.status !== currentFilter) return false;
          if (!passDateFilter(el)) return false;
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
          el.addEventListener('click', () => openCardDetail(el));
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

        const detailHtml = ''
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
        if (drawerContent) drawerContent.innerHTML = detailHtml;
        if (panel) panel.innerHTML = detailHtml;
        openDrawer();
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
      if (positionsDateForm) {
        positionsDateForm.addEventListener('submit', (e) => {
          e.preventDefault();
          currentDateFrom = positionsFromInput && positionsFromInput.value ? positionsFromInput.value : '';
          currentDateTo = positionsToInput && positionsToInput.value ? positionsToInput.value : '';
          if (currentDateFrom && currentDateTo && currentDateFrom > currentDateTo) {
            const tmp = currentDateFrom;
            currentDateFrom = currentDateTo;
            currentDateTo = tmp;
            if (positionsFromInput) positionsFromInput.value = currentDateFrom;
            if (positionsToInput) positionsToInput.value = currentDateTo;
          }
          currentPage = 1;
          renderPage();
        });
      }
      if (positionsDateReset) {
        positionsDateReset.addEventListener('click', () => {
          currentDateFrom = '';
          currentDateTo = '';
          if (positionsFromInput) positionsFromInput.value = '';
          if (positionsToInput) positionsToInput.value = '';
          currentPage = 1;
          renderPage();
        });
      }
      if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderPage(); } });
      if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; renderPage(); });
      if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
      if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);
      if (drawerPrev) drawerPrev.addEventListener('click', () => { if (!currentDetailId) return; const visible = getVisibleCards(); const idx = visible.findIndex(el => el.dataset.id === currentDetailId); if (idx > 0) openCardDetail(visible[idx - 1]); });
      if (drawerNext) drawerNext.addEventListener('click', () => { if (!currentDetailId) return; const visible = getVisibleCards(); const idx = visible.findIndex(el => el.dataset.id === currentDetailId); if (idx >= 0 && idx < visible.length - 1) openCardDetail(visible[idx + 1]); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

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

