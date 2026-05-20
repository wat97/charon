import { db } from '../db/connection.js';

const PNL_TZ = process.env.CHARON_TZ || 'Asia/Jakarta';

function startOfDayMs(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    0, 0, 0
  );
  // figure out tz offset for this date
  const offsetMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  ) - date.getTime();
  return localAsUtc - offsetMs;
}

function rangeWhere(range) {
  const key = String(range || 'all').toLowerCase();
  if (key === 'all') return { clause: '', params: [] };
  const days = ({ '1d': 1, '3d': 3, '1w': 7, '7d': 7, '1m': 30, '30d': 30 })[key];
  if (!days) return { clause: '', params: [] };
  const todayStart = startOfDayMs(new Date(), PNL_TZ);
  const cutoff = todayStart - (days - 1) * 24 * 60 * 60 * 1000;
  return { clause: ' AND closed_at_ms >= ?', params: [cutoff] };
}

export function getPnlSummary(range = 'all') {
  const { clause, params } = rangeWhere(range);
  const rows = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN pnl_percent >= 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN pnl_percent < 0 THEN 1 ELSE 0 END) as losses,
      SUM(pnl_percent) as totalPnlPercent,
      SUM(pnl_sol) as totalPnlSol,
      AVG(pnl_percent) as avgPnlPercent,
      MAX(pnl_percent) as maxPnlPercent,
      MIN(pnl_percent) as minPnlPercent,
      SUM(CASE WHEN pnl_sol > 0 THEN pnl_sol ELSE 0 END) as grossProfitSol,
      SUM(CASE WHEN pnl_sol < 0 THEN pnl_sol ELSE 0 END) as grossLossSol,
      AVG(CASE WHEN pnl_percent >= 0 THEN pnl_percent END) as avgWinPct,
      AVG(CASE WHEN pnl_percent < 0 THEN pnl_percent END) as avgLossPct,
      AVG(CASE WHEN opened_at_ms IS NOT NULL AND closed_at_ms IS NOT NULL THEN closed_at_ms - opened_at_ms END) as avgHoldMs
    FROM dry_run_positions
    WHERE status = 'closed'${clause}
  `).get(...params);
  const total = Number(rows.total) || 0;
  const wins = Number(rows.wins) || 0;
  const losses = Number(rows.losses) || 0;
  const totalPnlPercent = Number(rows.totalPnlPercent) || 0;
  const totalPnlSol = Number(rows.totalPnlSol) || 0;
  const avgPnlPercent = total ? totalPnlPercent / total : 0;
  const maxPnlPercent = Number(rows.maxPnlPercent) || 0;
  const minPnlPercent = Number(rows.minPnlPercent) || 0;
  const grossProfitSol = Number(rows.grossProfitSol) || 0;
  const grossLossSol = Number(rows.grossLossSol) || 0;
  const avgWinPct = Number(rows.avgWinPct) || 0;
  const avgLossPct = Number(rows.avgLossPct) || 0;
  const avgHoldMs = Number(rows.avgHoldMs) || 0;
  return {
    total,
    wins,
    losses,
    totalPnlPercent,
    totalPnlSol,
    avgPnlPercent,
    maxPnlPercent,
    minPnlPercent,
    grossProfitSol,
    grossLossSol,
    avgWinPct,
    avgLossPct,
    avgHoldMs,
    // backward-compatible aliases for older dashboard template code
    total_pnl_percent: totalPnlPercent,
    total_pnl_sol: totalPnlSol,
    avg_pnl_percent: avgPnlPercent,
    best_pnl_percent: maxPnlPercent,
    worst_pnl_percent: minPnlPercent,
    gross_profit_sol: grossProfitSol,
    gross_loss_sol: grossLossSol,
    avg_win_pct: avgWinPct,
    avg_loss_pct: avgLossPct,
    avg_hold_ms: avgHoldMs,
  };
}

export function getClosedSeries(range = 'all') {
  const { clause, params } = rangeWhere(range);
  return db.prepare(`
    SELECT closed_at_ms, opened_at_ms, pnl_percent, pnl_sol
    FROM dry_run_positions
    WHERE status = 'closed'${clause}
    ORDER BY closed_at_ms ASC
  `).all(...params);
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

  const returns = history.map((h) => Number(h.pnl_percent) || 0);
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1 ? returns.reduce((a, r) => a + ((r - mean) ** 2), 0) / (returns.length - 1) : 0;
  const stdDev = Math.sqrt(Math.max(variance, 0));
  const sharpeRatio = stdDev > 0 ? mean / stdDev : 0;

  const holdSamples = history
    .map((h) => (Number(h.closed_at_ms) > 0 && Number(h.opened_at_ms) > 0 ? Number(h.closed_at_ms) - Number(h.opened_at_ms) : 0))
    .filter((v) => Number.isFinite(v) && v > 0);
  const avgHoldMs = holdSamples.length ? holdSamples.reduce((a, b) => a + b, 0) / holdSamples.length : (Number(summary.avgHoldMs) || Number(summary.avg_hold_ms) || 0);

  const sorted = history.map(h => Number(h.pnl_percent) || 0).sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))] || 0;

  return {
    winRate,
    profitFactor,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDD,
    expectancy,
    expectancyPct: expectancy,
    avgWin,
    avgLossAbs,
    avgHoldMs,
    sharpeRatio,
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
