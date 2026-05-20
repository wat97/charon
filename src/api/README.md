# Charon API

REST API layer untuk Charon trading bot. Pure JSON, dipisahkan dari dashboard HTML.

## Quick start

```bash
# install deps (sekali)
npm install

# jalankan API server
npm run api

# atau dengan port/host kustom
API_PORT=3030 API_HOST=127.0.0.1 npm run api
```

Default: `http://127.0.0.1:2020`

## Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/positions?mode=cards` | List ringkas semua posisi (default) |
| GET | `/api/v1/positions?mode=full` | Open + closed lengkap |
| GET | `/api/v1/positions/:id` | Detail satu posisi |
| GET | `/api/v1/candidates?limit=200` | List candidate token (max 1000) |
| GET | `/api/v1/strategy` | Strategy aktif saat ini |
| GET | `/api/v1/pnl` | Summary PnL: total closed, win rate, avg pct |
| GET | `/api/v1/stats` | Counter global (positions, candidates, alerts, LLM decisions) |

Response error: `{ "error": "<message>" }` dengan status 4xx/5xx.

## Contoh

```bash
curl -s http://127.0.0.1:2020/api/v1/health
curl -s 'http://127.0.0.1:2020/api/v1/positions?mode=cards' | jq
curl -s http://127.0.0.1:2020/api/v1/pnl | jq
curl -s 'http://127.0.0.1:2020/api/v1/candidates?limit=5' | jq
curl -s http://127.0.0.1:2020/api/v1/strategy | jq
curl -s http://127.0.0.1:2020/api/v1/stats | jq
```

## Arsitektur

```
[Client]
   │  HTTP JSON
   ↓
[Express API] (src/api/index.js)
   │
   ↓
[better-sqlite3] (src/db/connection.js)
   │
   ↓
charon.sqlite
```

API ini **read-only** terhadap DB Charon. Tidak melakukan write ke posisi, alerts, atau strategi.

## CORS

Semua origin diijinkan (`cors()` default). Kalau mau dibatasi, edit `src/api/index.js` dan kasih opsi origin allowlist.

## Auth (TODO)

Saat ini tanpa auth — aman untuk akses lokal/Tailnet only.
Sebelum dibuka publik, tambahkan API key middleware atau JWT auth.

## Service manager (opsional)

Untuk persistent run, bisa pakai `pm2`:

```bash
npm install -g pm2
pm2 start api.js --name charon-api
pm2 save
pm2 startup
```
