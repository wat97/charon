/**
 * Mobile PnL page — trading-app style with summary tiles + recent trades.
 */
import { esc, fmtNum, fmtPct, fmtAgeSince } from '../format.js';
import { mobileShell } from './shell.js';

export function mobilePnlPage({ getPositionCardsLite }) {
  const all = getPositionCardsLite();
  const closed = all.filter(p => p.status === 'closed');
  const open = all.filter(p => p.status === 'open');

  const totalPnlSol = closed.reduce((s, p) => s + (Number(p.pnl_sol) || 0), 0);
  const winners = closed.filter(p => Number(p.pnl_percent) > 0);
  const losers = closed.filter(p => Number(p.pnl_percent) < 0);
  const winRate = closed.length ? (winners.length / closed.length) * 100 : 0;
  const avgPnl = closed.length
    ? closed.reduce((s, p) => s + (Number(p.pnl_percent) || 0), 0) / closed.length
    : 0;
  const bestTrade = winners.length
    ? winners.reduce((b, p) => Number(p.pnl_percent) > Number(b.pnl_percent) ? p : b)
    : null;
  const worstTrade = losers.length
    ? losers.reduce((w, p) => Number(p.pnl_percent) < Number(w.pnl_percent) ? p : w)
    : null;

  const recent = closed.slice(0, 12);
  const recentRows = recent.map(p => {
    const pnlClass = Number(p.pnl_percent) >= 0 ? 'up' : 'dn';
    return `<div class='mpn-row'>
      <div class='mpn-row-id'>
        <div class='mpn-row-sym'>${esc(p.symbol || 'Unknown')}</div>
        <div class='mpn-row-time'>${esc(fmtAgeSince(p.opened_at_ms))}</div>
      </div>
      <div class='mpn-row-pnl ${pnlClass}'>${esc(fmtPct(p.pnl_percent))}</div>
    </div>`;
  }).join('');

  const statTiles = `
    <div class='m-stat'><div class='m-stat-label'>Trades</div><div class='m-stat-value'>${closed.length}</div></div>
    <div class='m-stat'><div class='m-stat-label'>WR</div><div class='m-stat-value ${winRate >= 50 ? 'up' : 'dn'}'>${winRate.toFixed(0)}%</div></div>
    <div class='m-stat'><div class='m-stat-label'>Open</div><div class='m-stat-value'>${open.length}</div></div>
    <div class='m-stat'><div class='m-stat-label'>Avg</div><div class='m-stat-value ${avgPnl >= 0 ? 'up' : 'dn'}'>${avgPnl.toFixed(1)}%</div></div>
  `;

  const body = `
    <div class='mpn-hero'>
      <div class='mpn-hero-label'>TOTAL PNL</div>
      <div class='mpn-hero-val ${totalPnlSol >= 0 ? 'up' : 'dn'}'>${(totalPnlSol >= 0 ? '+' : '') + totalPnlSol.toFixed(4)} SOL</div>
      <div class='mpn-hero-sub'>${closed.length} trades · ${winners.length}W / ${losers.length}L</div>
    </div>

    <div class='mpn-grid'>
      <div class='mpn-tile'>
        <div class='mpn-tile-label'>Best</div>
        <div class='mpn-tile-val up'>${bestTrade ? fmtPct(bestTrade.pnl_percent) : '-'}</div>
        <div class='mpn-tile-sub'>${bestTrade ? esc(bestTrade.symbol || 'Unknown') : '-'}</div>
      </div>
      <div class='mpn-tile'>
        <div class='mpn-tile-label'>Worst</div>
        <div class='mpn-tile-val dn'>${worstTrade ? fmtPct(worstTrade.pnl_percent) : '-'}</div>
        <div class='mpn-tile-sub'>${worstTrade ? esc(worstTrade.symbol || 'Unknown') : '-'}</div>
      </div>
    </div>

    <h3 class='mpn-h3'>Recent Trades</h3>
    <div class='mpn-list'>${recentRows || `<div class='m-empty'><div class='m-empty-icon'>💰</div>No closed trades yet</div>`}</div>

    <style>
      .mpn-hero {
        background: linear-gradient(135deg, rgba(96,165,250,0.12), rgba(168,85,247,0.08));
        border: 1px solid rgba(96,165,250,0.2);
        border-radius: 16px;
        padding: 18px;
        text-align: center;
        margin-bottom: 12px;
      }
      .mpn-hero-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1.5px;
        color: var(--muted);
      }
      .mpn-hero-val {
        font-size: 32px;
        font-weight: 800;
        margin: 6px 0 4px;
        letter-spacing: -0.02em;
      }
      .mpn-hero-val.up { color: #6ee7b7; }
      .mpn-hero-val.dn { color: #fca5a5; }
      .mpn-hero-sub { font-size: 11px; color: var(--muted); }

      .mpn-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 16px;
      }
      .mpn-tile {
        background: rgba(15,23,42,0.7);
        border: 1px solid rgba(96,165,250,0.12);
        border-radius: 12px;
        padding: 12px;
      }
      .mpn-tile-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.8px;
        color: var(--muted);
        text-transform: uppercase;
      }
      .mpn-tile-val {
        font-size: 20px;
        font-weight: 700;
        margin: 4px 0 2px;
      }
      .mpn-tile-val.up { color: #6ee7b7; }
      .mpn-tile-val.dn { color: #fca5a5; }
      .mpn-tile-sub {
        font-size: 11px;
        color: var(--text);
        opacity: 0.7;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mpn-h3 {
        font-size: 13px;
        font-weight: 700;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 1px;
        margin: 16px 0 10px;
      }
      .mpn-list {
        background: rgba(15,23,42,0.5);
        border: 1px solid rgba(96,165,250,0.1);
        border-radius: 12px;
        overflow: hidden;
      }
      .mpn-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .mpn-row:last-child { border-bottom: none; }
      .mpn-row-id { min-width: 0; flex: 1; }
      .mpn-row-sym { font-size: 13px; font-weight: 700; color: var(--text); }
      .mpn-row-time { font-size: 10px; color: var(--muted); margin-top: 1px; }
      .mpn-row-pnl {
        font-size: 14px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 6px;
      }
      .mpn-row-pnl.up { color: #6ee7b7; background: rgba(34,197,94,0.1); }
      .mpn-row-pnl.dn { color: #fca5a5; background: rgba(239,68,68,0.1); }
    </style>
  `;

  return mobileShell('PnL', body, {
    activePath: '/pnl',
    stats: { tiles: statTiles },
  });
}
