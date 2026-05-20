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
  return db.prepare(`
    SELECT id, mint, symbol, status, created_at_ms, updated_at_ms, candidate_json, filter_result_json
    FROM candidates
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

export function getCandidatesWsSnapshot(db) {
  return getCandidates(db, 200);
}
