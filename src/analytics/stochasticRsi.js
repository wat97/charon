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
