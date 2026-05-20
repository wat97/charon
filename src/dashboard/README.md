# Dashboard Modules

Folder ini menampung modul reusable untuk `dashboard.js`.

## Struktur

- `format.js`
  - Helper format/render aman (`esc`, `fmtNum`, `fmtPct`, `fmtSol`, `fmtAge`, dsb).

- `dateRange.js`
  - Logic filter tanggal/range berbasis kalender + timezone (`CHARON_TZ`, default `Asia/Jakarta`).

- `charts.js`
  - Builder SVG inline untuk chart PnL (`buildEquityCurveSvg`, `buildHistogramSvg`).

- `db.js`
  - Query helper read-only. Semua fungsi menerima instance `db` sebagai argumen pertama.

- `positions.js`
  - Renderer halaman `/` dan `/positions`.

- `candidates.js`
  - Renderer halaman `/candidates`.

- `pnl.js`
  - Renderer halaman `/pnl`.

- `strategy.js`
  - Renderer halaman `/strategy`.

## Pattern yang dipakai

Semua page module memakai **dependency injection** lewat object `deps`.
Contoh dari `dashboard.js`:

```js
return pnlPageView({
  range,
  fromDate,
  toDate,
  analyticsPnlSummary,
  analyticsClosedSeries,
  normalizeDateInput,
  filterHistoryByRange,
  getEnabledStrategy,
  analyticsAdvancedStats,
  summarizeFromHistory,
  generateRecommendations: analyticsRecommendations,
  renderShell,
  buildEquityCurveSvg,
  buildHistogramSvg,
  fmtNum,
  fmtSol,
  fmtPct,
  fmtAge,
  esc,
});
```

Tujuan pattern ini:
- mengurangi coupling ke `dashboard.js`
- memudahkan refactor bertahap
- menghindari duplicate code
- lebih mudah ditest/mock

## Smoke test lokal

Dashboard endpoint smoke test:

```bash
bash scripts/dashboard_smoke.sh
```

Default target: `http://127.0.0.1:20120`
