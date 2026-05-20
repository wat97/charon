/**
 * Format helpers for dashboard rendering.
 * Exports: now, esc, fmtNum, fmtPct, fmtSol, fmtAge, fmtAgeSince, safeJson.
 */
export const now = () => Date.now();

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const fmtNum = (n, d = 2) => (n == null || Number.isNaN(Number(n)))
  ? '-'
  : Number(n).toLocaleString('en-US', { maximumFractionDigits: d });

export const fmtPct = (n) => (n == null || Number.isNaN(Number(n)))
  ? '-'
  : `${Number(n) > 0 ? '+' : ''}${Number(n).toFixed(2)}%`;

export const fmtSol = (n) => (n == null || Number.isNaN(Number(n)))
  ? '-'
  : `${Number(n) > 0 ? '+' : ''}${Number(n).toFixed(4)} SOL`;

export function fmtAge(ms) {
  if (!ms) return '-';
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function fmtAgeSince(ms) {
  if (!ms) return '-';
  return fmtAge(now() - Number(ms));
}

export function safeJson(s, fallback = {}) {
  try { return JSON.parse(s); } catch { return fallback; }
}
