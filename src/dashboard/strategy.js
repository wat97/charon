/**
 * Renders the /strategy page (summary tiles + grouped config sections).
 * Dependency-injected via { getEnabledStrategy, strategySectionRows,
 *   renderShell, esc, fmtNum, fmtSolRaw }.
 */
export function strategyPage({ getEnabledStrategy, strategySectionRows, renderShell, esc, fmtNum, fmtSolRaw }) {
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
