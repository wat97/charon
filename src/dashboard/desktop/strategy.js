/**
 * Desktop Strategy page — trading dashboard style.
 */
import { esc, fmtNum } from '../format.js';
import { desktopShell } from './shell.js';

export function desktopStrategyPage({ getEnabledStrategy }) {
  const strat = getEnabledStrategy();
  const config = strat?.config || {};

  const statTiles = `
    <div class='ds-stat'><div class='ds-stat-label'>Strategy</div><div class='ds-stat-value'>${esc(strat?.name || 'None')}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>LLM</div><div class='ds-stat-value ${config.use_llm ? 'up' : 'dn'}'>${config.use_llm ? 'ON' : 'OFF'}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Mode</div><div class='ds-stat-value'>${config.trading_mode || 'dry_run'}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Min Conf</div><div class='ds-stat-value'>${config.llm_min_confidence || 72}%</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Min Source</div><div class='ds-stat-value'>${config.min_source_count ?? 0}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Max Positions</div><div class='ds-stat-value'>${config.max_open_positions ?? 3}</div></div>
  `;

  function makeRow(label, value) {
    return `<div class='dst-row'><div class='dst-label'>${esc(label)}</div><div class='dst-value'>${esc(String(value))}</div></div>`;
  }

  const tradeRows = [
    makeRow('Buy Size (SOL)', config.dry_run_buy_sol ?? 0.1),
    makeRow('Take Profit %', `+${config.tp_percent ?? 50}%`),
    makeRow('Stop Loss %', `${config.sl_percent ?? -25}%`),
    makeRow('Trailing', config.trailing_enabled ? `ON (${config.trailing_percent ?? 10}%)` : 'OFF'),
    makeRow('Trade Cooldown (m)', config.trade_cooldown_minutes ?? 0),
  ].join('');

  const filterRows = [
    makeRow('Min MCAP', `$${(config.min_market_cap_usd ?? 0).toLocaleString()}`),
    makeRow('Max MCAP', `$${(config.max_market_cap_usd ?? 0).toLocaleString()}`),
    makeRow('Min Liquidity', `$${(config.min_liquidity_usd ?? 0).toLocaleString()}`),
    makeRow('Min Holders', config.min_holder_count ?? 50),
    makeRow('Max Top20 %', `${config.max_top20_holder_percent ?? 60}%`),
    makeRow('Max Top Holder %', `${config.max_top_holder_percent ?? 45}%`),
    makeRow('Max Rug Ratio', `${(config.max_rug_ratio ?? 0.35) * 100}%`),
  ].join('');

  const trendingRows = [
    makeRow('Min Swaps', config.trending_min_swaps ?? 125),
    makeRow('Min Volume', `$${(config.trending_min_volume_usd ?? 2000).toLocaleString()}`),
    makeRow('Max Age (min)', config.trending_max_age_minutes ?? 60),
  ].join('');

  const llmRows = [
    makeRow('Use LLM', config.use_llm ? 'YES' : 'NO'),
    makeRow('Provider', config.llm_provider || 'openai'),
    makeRow('Model', config.llm_model || 'gpt-5'),
    makeRow('Min Confidence', `${config.llm_min_confidence ?? 72}%`),
    makeRow('Batch Size', config.llm_batch_size ?? 5),
    makeRow('Batch Wait (s)', config.llm_batch_wait_seconds ?? 30),
  ].join('');

  const body = `
    <div class='dst-grid'>
      <div class='dst-card'>
        <div class='dst-head'>
          <div class='dst-title'>Trading Parameters</div>
          <div class='dst-badge'>${esc(strat?.name || 'None')}</div>
        </div>
        <div class='dst-body'>${tradeRows}</div>
      </div>

      <div class='dst-card'>
        <div class='dst-head'>
          <div class='dst-title'>Filters</div>
        </div>
        <div class='dst-body'>${filterRows}</div>
      </div>

      <div class='dst-card'>
        <div class='dst-head'>
          <div class='dst-title'>Trending Rules</div>
        </div>
        <div class='dst-body'>${trendingRows}</div>
      </div>

      <div class='dst-card'>
        <div class='dst-head'>
          <div class='dst-title'>LLM Configuration</div>
        </div>
        <div class='dst-body'>${llmRows}</div>
      </div>
    </div>

    <style>
      .dst-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }
      .dst-card {
        background: rgba(15,23,42,0.7);
        border: 1px solid rgba(96,165,250,0.12);
        border-radius: 14px;
        overflow: hidden;
      }
      .dst-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        background: rgba(96,165,250,0.05);
        border-bottom: 1px solid rgba(96,165,250,0.1);
      }
      .dst-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--text);
      }
      .dst-badge {
        padding: 4px 10px;
        background: rgba(96,165,250,0.15);
        border: 1px solid rgba(96,165,250,0.3);
        border-radius: 8px;
        font-size: 11px;
        font-weight: 700;
        color: var(--blue);
      }
      .dst-body {
        padding: 8px 16px;
      }
      .dst-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid rgba(255,255,255,0.03);
      }
      .dst-row:last-child { border-bottom: none; }
      .dst-label { font-size: 13px; color: var(--muted); }
      .dst-value { font-size: 13px; font-weight: 700; color: var(--text); text-align: right; }
    </style>
  `;

  return desktopShell('Strategy', body, {
    activePath: '/strategy',
    stats: { tiles: statTiles },
  });
}
