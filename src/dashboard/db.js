/**
 * Read-only DB query helpers for the dashboard.
 * Each function takes the better-sqlite3 `db` instance as the first argument
 * so the dashboard process owns the connection.
 * Exports: getEnabledStrategy, getPositions, getPositionCardsLite,
 *   getPositionDetailById, getCandidates, getPositionsWsSnapshot,
 *   getCandidatesWsSnapshot.
 */
import { esc, fmtNum, fmtPct, fmtSol, fmtAge, fmtAgeSince, safeJson } from './format.js';

export function getEnabledStrategy(db) {
  const r = db.prepare('SELECT id,name,config_json FROM strategies WHERE enabled=1 LIMIT 1').get();
  return r ? { id: r.id, name: r.name, config: safeJson(r.config_json) } : null;
}

export function getPositions(db) {
  const open = db.prepare("SELECT id,symbol,mint,status,opened_at_ms,size_sol,entry_price,entry_mcap,high_water_mcap,tp_percent,sl_percent,trailing_enabled,trailing_percent,entry_signature,exit_signature,execution_mode,strategy_id FROM dry_run_positions WHERE status='open' ORDER BY opened_at_ms DESC").all();
  const closed = db.prepare("SELECT id,symbol,mint,status,opened_at_ms,closed_at_ms,size_sol,entry_price,entry_mcap,high_water_mcap,exit_price,exit_mcap,exit_reason,tp_percent,sl_percent,trailing_enabled,trailing_percent,pnl_percent,pnl_sol,entry_signature,exit_signature,execution_mode,strategy_id FROM dry_run_positions WHERE status='closed' ORDER BY opened_at_ms DESC").all();
  return { open, closed };
}

export function getPositionCardsLite(db) {
  return db.prepare(`
    SELECT id,symbol,mint,status,opened_at_ms,size_sol,entry_price,entry_mcap,exit_mcap,pnl_percent
    FROM dry_run_positions
    ORDER BY opened_at_ms DESC
  `).all();
}

export function getPositionDetailById(db, id) {
  return db.prepare(`
    SELECT id,symbol,mint,status,opened_at_ms,closed_at_ms,size_sol,entry_price,entry_mcap,high_water_mcap,
           exit_price,exit_mcap,exit_reason,tp_percent,sl_percent,trailing_enabled,trailing_percent,
           pnl_percent,pnl_sol,entry_signature,exit_signature,execution_mode,strategy_id
    FROM dry_run_positions
    WHERE id = ?
    LIMIT 1
  `).get(id);
}

export function getPositionsWsSnapshot(db) {
  const { open, closed } = getPositions(db);
  return { open, closed };
}

export function getCandidates(db, limit = 200) {
  const rows = db.prepare(`
    SELECT id, mint, status, created_at_ms, updated_at_ms, candidate_json, filter_result_json
    FROM candidates
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
  if (!rows.length) return rows;

  // Attach latest decision (verdict, confidence, reason, action) per candidate
  // so the dashboard can show "why still hold/buy/etc".
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const decisions = db.prepare(`
    SELECT trigger_candidate_id AS cid, action, reason, verdict, confidence
    FROM decision_logs
    WHERE trigger_candidate_id IN (${placeholders})
    ORDER BY id DESC
  `).all(...ids);
  const byCid = new Map();
  for (const d of decisions) {
    if (!byCid.has(d.cid)) byCid.set(d.cid, d);
  }
  for (const r of rows) {
    const d = byCid.get(r.id);
    if (d) {
      r.last_action = d.action || null;
      r.last_reason = d.reason || null;
      r.last_verdict = d.verdict || null;
      r.last_confidence = d.confidence != null ? Number(d.confidence) : null;
    } else {
      r.last_action = null;
      r.last_reason = null;
      r.last_verdict = null;
      r.last_confidence = null;
    }
  }
  return rows;
}

export function getCandidatesWsSnapshot(db) {
  return getCandidates(db, 200);
}
