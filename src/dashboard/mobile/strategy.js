/**
 * Mobile Strategy page — trading-app style.
 */
import { esc, fmtNum } from '../format.js';
import { mobileShell } from './shell.js';

export function mobileStrategyPage({ getEnabledStrategy }) {
  const strat = getEnabledStrategy();
  const config = strat?.config || {};

  const statTiles = `
    <div class='m-stat'><div class='m-stat-label'>Strategy</div><div class='m-stat-value'>${esc(strat?.name || 'None')}</div></div>
    <div class='m-stat'><div class='m-stat-label'>LLM</div><div class='m-stat-value'>${config.use_llm ? 'ON' : 'OFF'}</div></div>
    <div class='m-stat'><div class='m-stat-label'>Mode</div><div class='m-stat-value'>${config.trading_mode || 'dry_run'}</div></div>
    <div class='m-stat'><div class='m-stat-label'>Conf</div><div class='m-stat-value'>${config.llm_min_confidence || 72}%</div></div>
  `;

  const configRows = [
    { label: 'Min Source Count', value: config.min_source_count ?? 0 },
    { label: 'Max Open Positions', value: config.max_open_positions ?? 3 },
    { label: 'Buy Size (SOL)', value: config.dry_run_buy_sol ?? 0.1 },
    { label: 'Take Profit %', value: config.tp_percent ?? 50 },
    { label: 'Stop Loss %', value: config.sl_percent ?? -25 },
    { label: 'Trailing Enabled', value: config.trailing_enabled ? 'ON' : 'OFF' },
    { label: 'Trailing %', value: config.trailing_percent ?? 10 },
    { label: 'Min MCAP', value: `$${(config.min_market_cap_usd ?? 0).toLocaleString()}` },
    { label: 'Max MCAP', value: `$${(config.max_market_cap_usd ?? 0).toLocaleString()}` },
    { label: 'Min Liq', value: `$${(config.min_liquidity_usd ?? 0).toLocaleString()}` },
    { label: 'Max Top20 %', value: `${config.max_top20_holder_percent ?? 60}%` },
    { label: 'Trending Min Swaps', value: config.trending_min_swaps ?? 125 },
    { label: 'Trending Min Vol', value: `$${(config.trending_min_volume_usd ?? 2000).toLocaleString()}` },
  ];

  const rowsHtml = configRows.map(r => `
    <div class='ms-row'>
      <div class='ms-label'>${esc(r.label)}</div>
      <div class='ms-value'>${esc(String(r.value))}</div>
    </div>
  `).join('');

  const body = `
    <div class='ms-card'>
      <div class='ms-head'>
        <div class='ms-title'>Active Strategy</div>
        <div class='ms-badge'>${esc(strat?.name || 'None')}</div>
      </div>
      <div class='ms-body'>${rowsHtml}</div>
    </div>

    <div class='ms-card'>
      <div class='ms-head'>
        <div class='ms-title'>Filters</div>
      </div>
      <div class='ms-body'>
        <div class='ms-row'>
          <div class='ms-label'>Min Holders</div>
          <div class='ms-value'>${config.min_holder_count ?? 50}</div>
        </div>
        <div class='ms-row'>
          <div class='ms-label'>Max Rug %</div>
          <div class='ms-value'>${(config.max_rug_ratio ?? 0.35) * 100}%</div>
        </div>
        <div class='ms-row'>
          <div class='ms-label'>Max Top Holder</div>
          <div class='ms-value'>${config.max_top_holder_percent ?? 45}%</div>
        </div>
      </div>
    </div>

    <style>
      .ms-card {
        background: rgba(15,23,42,0.7);
        border: 1px solid rgba(96,165,250,0.12);
        border-radius: 16px;
        overflow: hidden;
        margin-bottom: 12px;
      }
      .ms-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        background: rgba(96,165,250,0.05);
        border-bottom: 1px solid rgba(96,165,250,0.1);
      }
      .ms-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--text);
      }
      .ms-badge {
        padding: 4px 10px;
        background: rgba(96,165,250,0.15);
        border: 1px solid rgba(96,165,250,0.3);
        border-radius: 8px;
        font-size: 11px;
        font-weight: 700;
        color: var(--blue);
      }
      .ms-body {
        padding: 8px 14px;
      }
      .ms-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid rgba(255,255,255,0.03);
      }
      .ms-row:last-child { border-bottom: none; }
      .ms-label {
        font-size: 12px;
        color: var(--muted);
      }
      .ms-value {
        font-size: 13px;
        font-weight: 700;
        color: var(--text);
        text-align: right;
      }
    </style>
  `;

  return mobileShell('Strategy', body, {
    activePath: '/strategy',
    stats: { tiles: statTiles },
  });
}
