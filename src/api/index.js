import express from 'express';
import cors from 'cors';
import { db } from '../db/connection.js';
import {
  getEnabledStrategy,
  getPositions,
  getPositionCardsLite,
  getPositionDetailById,
  getCandidates,
} from '../dashboard/db.js';

const app = express();

app.use(cors());
app.use(express.json());

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'charon-api',
    timestamp: Date.now(),
  });
});

app.get('/api/v1/positions', (req, res) => {
  try {
    const mode = String(req.query.mode || 'cards');

    if (mode === 'full') {
      const data = getPositions(db);
      return res.json({
        mode,
        open: data.open,
        closed: data.closed,
      });
    }

    if (mode === 'cards') {
      const positions = getPositionCardsLite(db);
      return res.json({ mode, positions });
    }

    return jsonError(res, 400, 'Invalid mode. Use mode=cards or mode=full');
  } catch (error) {
    console.error('[api] GET /api/v1/positions', error);
    return jsonError(res, 500, 'Internal server error');
  }
});

app.get('/api/v1/positions/:id', (req, res) => {
  try {
    const id = toInt(req.params.id, NaN);
    if (!Number.isFinite(id)) return jsonError(res, 400, 'Invalid position id');

    const position = getPositionDetailById(db, id);
    if (!position) return jsonError(res, 404, 'Position not found');

    return res.json({ position });
  } catch (error) {
    console.error('[api] GET /api/v1/positions/:id', error);
    return jsonError(res, 500, 'Internal server error');
  }
});

app.get('/api/v1/candidates', (req, res) => {
  try {
    const limit = Math.min(Math.max(toInt(req.query.limit, 200), 1), 1000);
    const rows = db
      .prepare(`
        SELECT id, mint, status, created_at_ms, updated_at_ms, candidate_json, filter_result_json
        FROM candidates
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit);
    return res.json({ limit, count: rows.length, candidates: rows });
  } catch (error) {
    console.error('[api] GET /api/v1/candidates', error);
    return jsonError(res, 500, 'Internal server error');
  }
});

app.get('/api/v1/strategy', (req, res) => {
  try {
    const strategy = getEnabledStrategy(db);
    if (!strategy) return jsonError(res, 404, 'No active strategy found');
    return res.json({ strategy });
  } catch (error) {
    console.error('[api] GET /api/v1/strategy', error);
    return jsonError(res, 500, 'Internal server error');
  }
});

app.get('/api/v1/pnl', (req, res) => {
  try {
    const rows = db
      .prepare(`
        SELECT pnl_percent, pnl_sol
        FROM dry_run_positions
        WHERE status='closed'
      `)
      .all();

    const totalClosed = rows.length;
    const totalPnlSol = rows.reduce((sum, r) => sum + (Number(r.pnl_sol) || 0), 0);
    const avgPnlPercent =
      totalClosed > 0
        ? rows.reduce((sum, r) => sum + (Number(r.pnl_percent) || 0), 0) / totalClosed
        : 0;

    const winners = rows.filter((r) => Number(r.pnl_percent) > 0).length;
    const losers = rows.filter((r) => Number(r.pnl_percent) < 0).length;
    const winRate = totalClosed > 0 ? (winners / totalClosed) * 100 : 0;

    return res.json({
      summary: {
        total_closed: totalClosed,
        total_pnl_sol: totalPnlSol,
        avg_pnl_percent: avgPnlPercent,
        winners,
        losers,
        win_rate_percent: winRate,
      },
    });
  } catch (error) {
    console.error('[api] GET /api/v1/pnl', error);
    return jsonError(res, 500, 'Internal server error');
  }
});

app.get('/api/v1/stats', (req, res) => {
  try {
    const stats = db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM dry_run_positions WHERE status='open') AS open_positions,
          (SELECT COUNT(*) FROM dry_run_positions WHERE status='closed') AS closed_positions,
          (SELECT COUNT(*) FROM candidates) AS total_candidates,
          (SELECT COUNT(*) FROM alerts) AS total_alerts,
          (SELECT COUNT(*) FROM llm_decisions) AS total_llm_decisions,
          (SELECT COALESCE(SUM(pnl_sol),0) FROM dry_run_positions WHERE status='closed') AS total_realized_pnl_sol
      `)
      .get();

    return res.json({ stats });
  } catch (error) {
    console.error('[api] GET /api/v1/stats', error);
    return jsonError(res, 500, 'Internal server error');
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export function startApiServer({ port = 2020, host = '127.0.0.1' } = {}) {
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      console.log(`[api] listening on http://${host}:${port}`);
      resolve(server);
    });
  });
}
