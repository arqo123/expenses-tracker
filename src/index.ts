import { createApp } from './app.ts';
import { getEnv, getDatabaseUrl } from './config/env.ts';
import { DatabaseService } from './services/database.service.ts';
import { Cron } from 'croner';

// Load environment
const env = getEnv();

// Ensure database exists before starting
await DatabaseService.ensureDatabaseExists(getDatabaseUrl());

// Create app
const { app, database } = createApp();

// Run migrations on startup
await database.runMigrations();

// Scheduled jobs
const idempotencyCleanup = new Cron('*/5 * * * *', async () => {
  const deleted = await database.cleanupIdempotency();
  if (deleted > 0) {
    console.log(`[Scheduler] Cleaned up ${deleted} idempotency records`);
  }
});

// Receipt session cleanup (every 15 minutes)
const receiptSessionCleanup = new Cron('*/15 * * * *', async () => {
  try {
    const cleaned = await database.cleanupExpiredReceiptSessions();
    if (cleaned > 0) {
      console.log(`[Scheduler] Cleaned up ${cleaned} expired receipt sessions`);
    }
  } catch (error) {
    console.error('[Scheduler] Error cleaning receipt sessions:', error);
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
  receiptSessionCleanup.stop();
  weeklyReport.stop();
  await database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  idempotencyCleanup.stop();
  receiptSessionCleanup.stop();
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
