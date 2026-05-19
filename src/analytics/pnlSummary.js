import { db } from '../db/connection.js';

export function getPnlSummary() {
  const rows = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN pnl_percent >= 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN pnl_percent < 0 THEN 1 ELSE 0 END) as losses,
      SUM(pnl_percent) as totalPnlPercent,
      SUM(pnl_sol) as totalPnlSol,
      AVG(pnl_percent) as avgPnlPercent,
      MAX(pnl_percent) as maxPnlPercent,
      MIN(pnl_percent) as minPnlPercent
    FROM dry_run_positions
    WHERE status = 'closed'
  `).get();
  return {
    total: rows.total || 0,
    wins: rows.wins || 0,
    losses: rows.losses || 0,
    totalPnlPercent: Number(rows.totalPnlPercent) || 0,
    totalPnlSol: Number(rows.totalPnlSol) || 0,
    avgPnlPercent: Number(rows.avgPnlPercent) || 0,
    maxPnlPercent: Number(rows.maxPnlPercent) || 0,
    minPnlPercent: Number(rows.minPnlPercent) || 0,
  };
}

export function getClosedSeries() {
  return db.prepare(`
    SELECT closed_at_ms, pnl_percent, pnl_sol
    FROM dry_run_positions
    WHERE status = 'closed'
    ORDER BY closed_at_ms ASC
  `).all();
}

export function computeAdvancedStats(history, summary) {
  if (!history.length) return null;

  const wins = history.filter(h => Number(h.pnl_percent) >= 0);
  const losses = history.filter(h => Number(h.pnl_percent) < 0);
  const winRate = summary.total ? (summary.wins / summary.total) * 100 : 0;

  const totalWinPnl = wins.reduce((acc, h) => acc + Math.abs(Number(h.pnl_percent) || 0), 0);
  const totalLossPnl = losses.reduce((acc, h) => acc + Math.abs(Number(h.pnl_percent) || 0), 0);
  const profitFactor = totalLossPnl > 0 ? totalWinPnl / totalLossPnl : (totalWinPnl > 0 ? Infinity : 1);

  let peak = 0;
  let maxDD = 0;
  let cumulative = 0;
  for (const h of history) {
    cumulative += Number(h.pnl_percent) || 0;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDD) maxDD = dd;
  }

  const avgWin = wins.length ? wins.reduce((a, h) => a + (Number(h.pnl_percent) || 0), 0) / wins.length : 0;
  const avgLossAbs = losses.length ? Math.abs(losses.reduce((a, h) => a + (Number(h.pnl_percent) || 0), 0) / losses.length) : 0;
  const expectancy = ((winRate / 100) * avgWin) - (((100 - winRate) / 100) * avgLossAbs);

  const sorted = history.map(h => Number(h.pnl_percent) || 0).sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))] || 0;

  return {
    winRate,
    profitFactor,
    maxDrawdown: maxDD,
    expectancy,
    avgWin,
    avgLossAbs,
    p50: percentile(0.50),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}

export function generateRecommendations(summary, advanced) {
  const tips = [];
  if (!summary || !summary.total) {
    tips.push({ kind: 'info', text: 'No closed trades yet. Run more dry-run trades to generate statistics.' });
    return tips;
  }

  if (advanced.profitFactor < 1) {
    tips.push({ kind: 'bad', text: `Profit factor ${advanced.profitFactor.toFixed(2)} is below 1. Strategy currently bleeds.` });
  } else if (advanced.profitFactor < 1.5) {
    tips.push({ kind: 'warn', text: `Profit factor ${advanced.profitFactor.toFixed(2)} is barely above breakeven. Tighten risk controls.` });
  } else if (advanced.profitFactor < 2) {
    tips.push({ kind: 'good', text: `Profit factor ${advanced.profitFactor.toFixed(2)} is solid.` });
  } else {
    tips.push({ kind: 'good', text: `Excellent profit factor of ${advanced.profitFactor.toFixed(2)}.` });
  }

  if (advanced.maxDrawdown > 30) {
    tips.push({ kind: 'bad', text: `Max drawdown ${advanced.maxDrawdown.toFixed(1)}% is high. Consider reducing position size or adding daily loss limit.` });
  } else if (advanced.maxDrawdown > 0) {
    tips.push({ kind: 'info', text: `Max drawdown ${advanced.maxDrawdown.toFixed(1)}%. Acceptable for sniping strategies.` });
  }

  if (advanced.expectancy <= 0) {
    tips.push({ kind: 'bad', text: `Expectancy per trade is ${advanced.expectancy.toFixed(2)}%. Negative or zero edge — do not go live yet.` });
  } else {
    tips.push({ kind: 'good', text: `Expectancy ${advanced.expectancy.toFixed(2)}% per trade. Statistically positive edge.` });
  }

  if (summary.total < 30) {
    tips.push({ kind: 'info', text: `Only ${summary.total} closed trades. Wait for at least 50 trades before drawing conclusions.` });
  }

  return tips;
}
