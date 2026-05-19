import { fetchGmgnKline } from '../enrichment/gmgn.js';

export function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;

  const gains = [];
  const losses = [];

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }

  let avgGain = gains.reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.reduce((a, b) => a + b, 0) / period;

  const rsiValues = [];
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
    const rsi = 100 - (100 / (1 + rs));
    rsiValues.push(rsi);
  }

  return rsiValues;
}

export function calculateStochRSI(rsiValues, period = 14) {
  if (rsiValues.length < period) return null;

  const stochK = [];
  const stochD = [];

  for (let i = period - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - period + 1, i + 1);
    const minRsi = Math.min(...slice);
    const maxRsi = Math.max(...slice);
    const currentRsi = rsiValues[i];

    const stoch = maxRsi - minRsi > 0
      ? ((currentRsi - minRsi) / (maxRsi - minRsi)) * 100
      : 50;

    stochK.push(stoch);
  }

  // Simple SMA for D line
  for (let i = 0; i < stochK.length; i++) {
    const slice = stochK.slice(Math.max(0, i - 2), i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    stochD.push(avg);
  }

  return { stochK, stochD };
}

export async function fetchStochRSI(mint, { resolution = '15m', limit = 200, rsiPeriod = 14, stochPeriod = 14 } = {}) {
  const candles = await fetchGmgnKline(mint, { resolution, limit });
  if (!candles || candles.length < rsiPeriod + stochPeriod + 1) return null;

  const closes = candles.map(c => c.close);
  const rsiValues = calculateRSI(closes, rsiPeriod);
  if (!rsiValues) return null;

  const stoch = calculateStochRSI(rsiValues, stochPeriod);
  if (!stoch) return null;

  const lastK = stoch.stochK[stoch.stochK.length - 1];
  const lastD = stoch.stochD[stoch.stochD.length - 1];

  return {
    mint,
    resolution,
    lastClose: closes[closes.length - 1],
    lastRSI: rsiValues[rsiValues.length - 1],
    lastStochK: lastK,
    lastStochD: lastD,
    stochK: stoch.stochK.slice(-10),
    stochD: stoch.stochD.slice(-10),
    isOversold: lastK < 20 || lastD < 20,
    isOverbought: lastK > 80 || lastD > 80,
    isBullishCross: lastK > lastD && stoch.stochK[stoch.stochK.length - 2] <= stoch.stochD[stoch.stochD.length - 2],
    isBearishCross: lastK < lastD && stoch.stochK[stoch.stochK.length - 2] >= stoch.stochD[stoch.stochD.length - 2],
  };
}

/**
 * Optional filter: enforce strategy-level Stoch RSI rules on a candidate.
 * Returns:
 *   { ok: true, data }   — passed (or filter disabled)
 *   { ok: false, reason, data } — rejected
 *   { ok: true, skipped: true, reason } — could not evaluate (graceful pass)
 */
export async function checkStochRsiFilter(mint, strategy = {}) {
  if (!strategy.use_stoch_rsi) return { ok: true, skipped: true, reason: 'filter_disabled' };

  const resolution = strategy.stoch_rsi_resolution || '15m';
  const oversold = Number.isFinite(Number(strategy.stoch_rsi_oversold)) ? Number(strategy.stoch_rsi_oversold) : 20;
  const overbought = Number.isFinite(Number(strategy.stoch_rsi_overbought)) ? Number(strategy.stoch_rsi_overbought) : 80;
  const requireBullishCross = Boolean(strategy.stoch_rsi_require_bullish_cross);
  const rejectOverbought = strategy.stoch_rsi_reject_overbought !== false; // default true
  const requireOversold = Boolean(strategy.stoch_rsi_require_oversold);

  let data = null;
  try {
    data = await fetchStochRSI(mint, { resolution });
  } catch {
    data = null;
  }

  if (!data) {
    // graceful pass: don't kill candidates just because GMGN failed/rate-limited
    return { ok: true, skipped: true, reason: 'no_kline_data' };
  }

  if (rejectOverbought && (data.lastStochK >= overbought || data.lastStochD >= overbought)) {
    return { ok: false, reason: `stoch_rsi overbought K=${data.lastStochK.toFixed(1)} D=${data.lastStochD.toFixed(1)} >= ${overbought}`, data };
  }
  if (requireOversold && !(data.lastStochK <= oversold || data.lastStochD <= oversold)) {
    return { ok: false, reason: `stoch_rsi not oversold (K=${data.lastStochK.toFixed(1)} D=${data.lastStochD.toFixed(1)}, threshold ${oversold})`, data };
  }
  if (requireBullishCross && !data.isBullishCross) {
    return { ok: false, reason: `stoch_rsi no bullish cross (K=${data.lastStochK.toFixed(1)} D=${data.lastStochD.toFixed(1)})`, data };
  }

  return { ok: true, data };
}
