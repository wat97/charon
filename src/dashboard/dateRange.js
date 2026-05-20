/**
 * Calendar/timezone-aware date range filters used by PnL and Positions pages.
 * Exports: PNL_TZ, normalizeDateInput, getDateRangeBounds, startOfDayMs,
 *   rangeKeyToDays, filterHistoryByRange.
 */
export const PNL_TZ = process.env.CHARON_TZ || 'Asia/Jakarta';

export function normalizeDateInput(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

export function getDateRangeBounds(fromDate, toDate) {
  const from = normalizeDateInput(fromDate);
  const to = normalizeDateInput(toDate);
  const startMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const endMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
  if (startMs != null && endMs != null && startMs > endMs) {
    return { startMs: endMs, endMs: startMs, fromDate: to, toDate: from };
  }
  return { startMs, endMs, fromDate: from, toDate: to };
}

export function startOfDayMs(date, tz = PNL_TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date)
    .filter((p) => p.type !== 'literal')
    .map((p) => [p.type, p.value]));
  const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0);
  const offsetMs = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  ) - date.getTime();
  return localAsUtc - offsetMs;
}

export function rangeKeyToDays(range) {
  const key = String(range || '').toLowerCase();
  return ({ '1d': 1, '3d': 3, '1w': 7, '7d': 7, '1m': 30, '30d': 30 })[key] || null;
}

export function filterHistoryByRange(history, range = 'all', fromDate = '', toDate = '') {
  if (!Array.isArray(history) || !history.length) return [];
  const hasCustomDate = normalizeDateInput(fromDate) || normalizeDateInput(toDate);
  if (hasCustomDate) {
    const { startMs, endMs } = getDateRangeBounds(fromDate, toDate);
    return history.filter((h) => {
      const closedAt = Number(h.closed_at_ms || 0);
      if (!closedAt) return false;
      if (startMs != null && closedAt < startMs) return false;
      if (endMs != null && closedAt > endMs) return false;
      return true;
    });
  }
  if (!range || range === 'all') return history;
  const days = rangeKeyToDays(range);
  if (!days) return history;
  const todayStart = startOfDayMs(new Date(), PNL_TZ);
  const cutoff = todayStart - (days - 1) * 24 * 60 * 60 * 1000;
  return history.filter((h) => Number(h.closed_at_ms || 0) >= cutoff);
}
