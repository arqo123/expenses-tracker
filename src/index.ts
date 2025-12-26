import { createApp } from './app.ts';
import { getEnv } from './config/env.ts';
import { Cron } from 'croner';

// Load environment
const env = getEnv();

// Create app
const { app, database } = createApp();

// Scheduled jobs
const idempotencyCleanup = new Cron('*/5 * * * *', async () => {
  const deleted = await database.cleanupIdempotency();
  if (deleted > 0) {
    console.log(`[Scheduler] Cleaned up ${deleted} idempotency records`);
  }
});

// Weekly report placeholder (Sunday 21:00 Warsaw time)
const weeklyReport = new Cron('0 21 * * 0', {
  timezone: 'Europe/Warsaw',
}, async () => {
  console.log('[Scheduler] Weekly report job triggered');
  // TODO: Implement weekly report generation
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  idempotencyCleanup.stop();
  weeklyReport.stop();
  await database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  idempotencyCleanup.stop();
  weeklyReport.stop();
  await database.close();
  process.exit(0);
});

// Start server
console.log(`
╔═══════════════════════════════════════════╗
║  Expense Tracker API                      ║
║  Stack: Hono.js + Bun + PostgreSQL        ║
╠═══════════════════════════════════════════╣
║  Endpoints:                               ║
║  - POST /webhook/telegram                 ║
║  - GET  /health                           ║
║  - GET  /expenses?user=Arek&limit=10      ║
║  - POST /test/categorize                  ║
║  - POST /test/parse-csv                   ║
╚═══════════════════════════════════════════╝
`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
