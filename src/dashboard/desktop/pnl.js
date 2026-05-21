/**
 * Desktop PnL page — trading dashboard style.
 */
import { esc, fmtNum, fmtPct, fmtAgeSince } from '../format.js';
import { desktopShell } from './shell.js';

export function desktopPnlPage({ getPositionCardsLite }) {
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

  const recent = closed.slice(0, 20);
  const recentRows = recent.map(p => {
    const pnlClass = Number(p.pnl_percent) >= 0 ? 'up' : 'dn';
    return `<tr>
      <td><b>${esc(p.symbol || 'Unknown')}</b></td>
      <td class='${pnlClass}'>${esc(fmtPct(p.pnl_percent))}</td>
      <td>${fmtNum(p.size_sol, 4)} SOL</td>
      <td class='dpn-time'>${esc(fmtAgeSince(p.opened_at_ms))}</td>
    </tr>`;
  }).join('');

  const statTiles = `
    <div class='ds-stat'><div class='ds-stat-label'>Trades</div><div class='ds-stat-value'>${closed.length}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Win Rate</div><div class='ds-stat-value ${winRate >= 50 ? 'up' : 'dn'}'>${winRate.toFixed(1)}%</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Open</div><div class='ds-stat-value'>${open.length}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Avg PnL</div><div class='ds-stat-value ${avgPnl >= 0 ? 'up' : 'dn'}'>${avgPnl.toFixed(2)}%</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Winners</div><div class='ds-stat-value up'>${winners.length}</div></div>
    <div class='ds-stat'><div class='ds-stat-label'>Losers</div><div class='ds-stat-value dn'>${losers.length}</div></div>
  `;

  const body = `
    <div class='dpn-hero'>
      <div class='dpn-hero-label'>TOTAL PNL</div>
      <div class='dpn-hero-val ${totalPnlSol >= 0 ? 'up' : 'dn'}'>${(totalPnlSol >= 0 ? '+' : '') + totalPnlSol.toFixed(4)} SOL</div>
      <div class='dpn-hero-sub'>${closed.length} closed trades</div>
    </div>

    <div class='dpn-row'>
      <div class='dpn-tile'>
        <div class='dpn-tile-label'>Best Trade</div>
        <div class='dpn-tile-val up'>${bestTrade ? fmtPct(bestTrade.pnl_percent) : '-'}</div>
        <div class='dpn-tile-sub'>${bestTrade ? esc(bestTrade.symbol || 'Unknown') : '-'}</div>
      </div>
      <div class='dpn-tile'>
        <div class='dpn-tile-label'>Worst Trade</div>
        <div class='dpn-tile-val dn'>${worstTrade ? fmtPct(worstTrade.pnl_percent) : '-'}</div>
        <div class='dpn-tile-sub'>${worstTrade ? esc(worstTrade.symbol || 'Unknown') : '-'}</div>
      </div>
      <div class='dpn-tile'>
        <div class='dpn-tile-label'>Profit Factor</div>
        <div class='dpn-tile-val'>${(() => {
          const totalWin = winners.reduce((s, p) => s + Math.abs(Number(p.pnl_sol) || 0), 0);
          const totalLoss = losers.reduce((s, p) => s + Math.abs(Number(p.pnl_sol) || 0), 0);
          if (!totalLoss) return totalWin ? '∞' : '0.00';
          return (totalWin / totalLoss).toFixed(2);
        })()}</div>
        <div class='dpn-tile-sub'>Win/Loss ratio</div>
      </div>
    </div>

    <h3 class='dpn-h3'>Recent Closed Trades</h3>
    <div class='dpn-table-wrap'>
      <table class='dpn-table'>
        <thead><tr><th>Symbol</th><th>PnL %</th><th>Size</th><th>Time</th></tr></thead>
        <tbody>${recentRows || '<tr><td colspan="4" class="dpn-empty">No closed trades yet</td></tr>'}</tbody>
      </table>
    </div>

    <style>
      .dpn-hero {
        background: linear-gradient(135deg, rgba(96,165,250,0.12), rgba(168,85,247,0.08));
        border: 1px solid rgba(96,165,250,0.2);
        border-radius: 16px;
        padding: 24px;
        text-align: center;
        margin-bottom: 16px;
      }
      .dpn-hero-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1.5px;
        color: var(--muted);
      }
      .dpn-hero-val {
        font-size: 42px;
        font-weight: 800;
        margin: 8px 0 4px;
        letter-spacing: -0.02em;
      }
      .dpn-hero-val.up { color: #6ee7b7; }
      .dpn-hero-val.dn { color: #fca5a5; }
      .dpn-hero-sub { font-size: 12px; color: var(--muted); }

      .dpn-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-bottom: 24px;
      }
      .dpn-tile {
        background: rgba(15,23,42,0.7);
        border: 1px solid rgba(96,165,250,0.12);
        border-radius: 12px;
        padding: 14px;
      }
      .dpn-tile-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.8px;
        color: var(--muted);
        text-transform: uppercase;
      }
      .dpn-tile-val {
        font-size: 24px;
        font-weight: 700;
        margin: 6px 0 2px;
      }
      .dpn-tile-val.up { color: #6ee7b7; }
      .dpn-tile-val.dn { color: #fca5a5; }
      .dpn-tile-sub { font-size: 11px; color: var(--text); opacity: 0.6; }

      .dpn-h3 {
        font-size: 13px;
        font-weight: 700;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 1px;
        margin: 16px 0 10px;
      }

      .dpn-table-wrap {
        background: rgba(15,23,42,0.5);
        border: 1px solid rgba(96,165,250,0.1);
        border-radius: 12px;
        overflow: hidden;
      }
      .dpn-table {
        width: 100%;
        border-collapse: collapse;
      }
      .dpn-table thead th {
        text-align: left;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.8px;
        color: var(--muted);
        text-transform: uppercase;
        padding: 12px 14px;
        background: rgba(96,165,250,0.05);
        border-bottom: 1px solid rgba(96,165,250,0.12);
      }
      .dpn-table tbody td {
        padding: 10px 14px;
        font-size: 13px;
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .dpn-table tbody tr:last-child td { border-bottom: none; }
      .dpn-table .up { color: #6ee7b7; font-weight: 700; }
      .dpn-table .dn { color: #fca5a5; font-weight: 700; }
      .dpn-time { color: var(--muted); font-size: 11px; }
      .dpn-empty { text-align: center; color: var(--muted); padding: 30px !important; }
    </style>
  `;

  return desktopShell('PnL', body, {
    activePath: '/pnl',
    stats: { tiles: statTiles },
  });
}
