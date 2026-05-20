/**
 * Renders the /pnl page (summary tiles, charts, recommendations).
 * Dependency-injected via analytics + format + chart helpers.
 */
export function pnlPage({ range = 'all', fromDate = '', toDate = '', analyticsPnlSummary, analyticsClosedSeries, normalizeDateInput, filterHistoryByRange, getEnabledStrategy, analyticsAdvancedStats, summarizeFromHistory, generateRecommendations, renderShell, buildEquityCurveSvg, buildHistogramSvg, fmtNum, fmtSol, fmtPct, fmtAge, esc }) {
  const rawSummary = analyticsPnlSummary();
  const allHistory = analyticsClosedSeries();
  const normalizedFrom = normalizeDateInput(fromDate) || '';
  const normalizedTo = normalizeDateInput(toDate) || '';
  const hasCustomRange = Boolean(normalizedFrom || normalizedTo);
  const effectiveRange = hasCustomRange ? 'custom' : range;
  const history = filterHistoryByRange(allHistory, range, normalizedFrom, normalizedTo);
  const strategy = getEnabledStrategy();
  const rawAdvanced = analyticsAdvancedStats(history, rawSummary);

  const summary = (effectiveRange === 'all') ? {
    ...rawSummary,
    total_pnl_sol: rawSummary.totalPnlSol,
    avg_pnl_percent: rawSummary.avgPnlPercent,
    best_pnl_percent: rawSummary.maxPnlPercent,
    worst_pnl_percent: rawSummary.minPnlPercent,
    total_pnl_percent: rawSummary.totalPnlPercent,
  } : summarizeFromHistory(history);

  const advanced = rawAdvanced ? {
    ...rawAdvanced,
    expectancyPct: rawAdvanced.expectancyPct ?? rawAdvanced.expectancy,
    maxDrawdownPct: rawAdvanced.maxDrawdownPct ?? rawAdvanced.maxDrawdown,
    avgHoldMs: rawAdvanced.avgHoldMs ?? summary.avg_hold_ms ?? 0,
  } : null;

  const tips = generateRecommendations(summary, advanced, strategy);

  const winRate = summary.total ? (summary.wins / summary.total) * 100 : 0; // safe for filtered range too
  const rangeLabel = hasCustomRange
    ? `${normalizedFrom || '...'} → ${normalizedTo || '...'}`
    : (range === '1d' ? '1D (Today)'
      : range === '3d' ? '3D'
      : range === '1w' ? '1W'
      : range === '1m' ? '1M'
      : 'All time');
  const lastUpdated = history.length ? new Date(Math.max(...history.map((h) => Number(h.closed_at_ms || 0)))).toLocaleString('id-ID') : '-';
  const recoGroups = {
    risk: tips.filter((t) => /drawdown|loss|risk|bleed|negative/i.test(t.text)),
    performance: tips.filter((t) => /profit factor|expectancy|win rate|pnl/i.test(t.text)),
    tuning: tips.filter((t) => !/drawdown|loss|risk|bleed|negative|profit factor|expectancy|win rate|pnl/i.test(t.text)),
  }; if (!recoGroups.tuning.length) recoGroups.tuning = tips;

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
      <div class='tile'><div class='k'>Sharpe</div><div class='v ${advanced && Number(advanced.sharpeRatio) >= 0 ? 'up' : 'dn'}'>${advanced ? fmtNum(advanced.sharpeRatio, 2) : '-'}</div></div>
      <div class='tile'><div class='k'>Expectancy</div><div class='v ${advanced && advanced.expectancyPct >= 0 ? 'up' : 'dn'}'>${advanced ? fmtPct(advanced.expectancyPct) : '-'}</div></div>
      <div class='tile'><div class='k'>Max Drawdown</div><div class='v dn'>${advanced ? fmtNum(advanced.maxDrawdownPct, 1) + '%' : '-'}</div></div>
      <div class='tile'><div class='k'>Avg Hold Time</div><div class='v'>${advanced ? fmtAge(advanced.avgHoldMs) : '-'}</div></div>
    </div>

    <div class='filter-bar'>
      <div class='fb-section'>
        <div class='fb-label'>Quick Range</div>
        <div class='fb-group range-controls'>
          <button class='chip ${!hasCustomRange && range==='all'?'active':''}' data-range='all'>All</button>
          <button class='chip ${!hasCustomRange && range==='1d'?'active':''}' data-range='1d'>1D</button>
          <button class='chip ${!hasCustomRange && range==='3d'?'active':''}' data-range='3d'>3D</button>
          <button class='chip ${!hasCustomRange && range==='1w'?'active':''}' data-range='1w'>1W</button>
          <button class='chip ${!hasCustomRange && range==='1m'?'active':''}' data-range='1m'>1M</button>
        </div>
      </div>
      <div class='fb-divider'></div>
      <div class='fb-section'>
        <div class='fb-label'>Custom Range</div>
        <form class='fb-group date-range-form'>
          <div class='date-field'>
            <input type='date' name='from' value='${esc(normalizedFrom)}' class='date-input' aria-label='From date' />
          </div>
          <span class='fb-arrow'>→</span>
          <div class='date-field'>
            <input type='date' name='to' value='${esc(normalizedTo)}' class='date-input' aria-label='To date' />
          </div>
          <button type='submit' class='chip primary'>Apply</button>
          ${hasCustomRange ? `<button type='button' class='chip ghost' data-clear-dates='1'>Reset</button>` : ''}
        </form>
      </div>
      <div class='fb-status' style='margin-left:auto'>
        <span class='fb-status-label'>Active</span>
        <span class='fb-status-value'>${esc(rangeLabel)}</span>
      </div>
    </div>

    <div class='charts-grid'>
      <div class='chart'>
        ${buildEquityCurveSvg(history, summary)}
      </div>
      <div class='chart'>
        ${buildHistogramSvg(history)}
      </div>
    </div>

    <div class='reco'>
      <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:10px'>
        <h3>Insights and Recommendations</h3>
        <div style='font-size:12px;color:#94a5d4'>Last updated: ${esc(lastUpdated)}</div>
      </div>
      <div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px'>
        ${recoGroups.risk.length ? `<div class='reco-group'><h4 style='margin:0 0 6px;color:#ef4444'>Risk</h4><ul style='margin:0 0 0 16px'>${recoGroups.risk.map((t)=>`<li><span class='tag ${tagClass(t.kind)}'>${tagText(t.kind)}</span>${esc(t.text)}</li>`).join('')}</ul></div>` : ''}
        ${recoGroups.performance.length ? `<div class='reco-group'><h4 style='margin:0 0 6px;color:#22c55e'>Performance</h4><ul style='margin:0 0 0 16px'>${recoGroups.performance.map((t)=>`<li><span class='tag ${tagClass(t.kind)}'>${tagText(t.kind)}</span>${esc(t.text)}</li>`).join('')}</ul></div>` : ''}
        ${recoGroups.tuning.length ? `<div class='reco-group'><h4 style='margin:0 0 6px;color:#f59e0b'>Tuning</h4><ul style='margin:0 0 0 16px'>${recoGroups.tuning.map((t)=>`<li><span class='tag ${tagClass(t.kind)}'>${tagText(t.kind)}</span>${esc(t.text)}</li>`).join('')}</ul></div>` : ''}
      </div>
    </div>
    <style>
      .filter-bar { display:flex; flex-wrap:wrap; align-items:flex-end; gap:12px; margin:16px 0 12px; padding:12px; border-radius:14px; border:1px solid rgba(71,85,105,.45); background:linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.66)); }
      .fb-section { display:flex; flex-direction:column; gap:8px; }
      .fb-label { font-size:11px; letter-spacing:.45px; text-transform:uppercase; color:#93a4c8; font-weight:700; }
      .fb-group { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
      .fb-divider { width:1px; align-self:stretch; background:rgba(71,85,105,.45); margin:0 2px; }
      .fb-arrow { color:#7f93bd; font-size:14px; }
      .fb-status { display:flex; flex-direction:column; gap:4px; min-width:140px; }
      .fb-status-label { font-size:11px; text-transform:uppercase; letter-spacing:.45px; color:#8aa0cc; }
      .fb-status-value { font-size:13px; color:#dbe7ff; font-weight:600; }
      .chip { border:1px solid #24314d; background:rgba(15,23,42,.7); color:#dbe7ff; border-radius:10px; padding:8px 12px; cursor:pointer; font-size:13px; font-weight:600; }
      .chip:hover { border-color:#3b82f6; color:#fff; }
      .chip.active, .chip.primary { background:linear-gradient(180deg, rgba(96,165,250,.2), rgba(59,130,246,.12)); border-color:#3b82f6; color:#fff; box-shadow:0 0 0 1px rgba(96,165,250,.15) inset; }
      .chip.ghost { background:transparent; color:#b8c7e8; }
      .reco-group { background:rgba(15,23,42,0.6);border:1px solid #1e293b;border-radius:12px;padding:12px; }
      .reco-group h4 { font-size:13px;text-transform:uppercase;letter-spacing:.4px; }
      .reco-group ul { margin:0 0 0 16px; }
      .reco-group li { margin-bottom:4px; }
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
    </style>
    <script>
      document.querySelectorAll('.range-controls .chip').forEach((b) => {
        b.addEventListener('click', () => {
          const r = b.getAttribute('data-range');
          const url = new URL(window.location.href);
          url.searchParams.delete('from');
          url.searchParams.delete('to');
          if (r === 'all') url.searchParams.delete('range'); else url.searchParams.set('range', r);
          window.location.href = url.toString();
        });
      });
      const dateForm = document.querySelector('.date-range-form');
      if (dateForm) {
        dateForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const url = new URL(window.location.href);
          const from = dateForm.querySelector('input[name=from]').value;
          const to = dateForm.querySelector('input[name=to]').value;
          url.searchParams.delete('range');
          if (from) url.searchParams.set('from', from); else url.searchParams.delete('from');
          if (to) url.searchParams.set('to', to); else url.searchParams.delete('to');
          if (!from && !to) {
            url.searchParams.delete('from');
            url.searchParams.delete('to');
          }
          window.location.href = url.toString();
        });
      }
      const clearDatesBtn = document.querySelector('[data-clear-dates]');
      if (clearDatesBtn) {
        clearDatesBtn.addEventListener('click', () => {
          const url = new URL(window.location.href);
          url.searchParams.delete('from');
          url.searchParams.delete('to');
          url.searchParams.delete('range');
          window.location.href = url.toString();
        });
      }
    </script>
  `);
}
