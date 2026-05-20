import { startApiServer } from './src/api/index.js';

const PORT = Number(process.env.API_PORT) || 2020;
const HOST = process.env.API_HOST || '127.0.0.1';

startApiServer({ port: PORT, host: HOST }).catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});
