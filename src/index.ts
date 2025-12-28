import { createApp } from './app.ts';
import { getEnv, getDatabaseUrl } from './config/env.ts';
import { DatabaseService } from './services/database.service.ts';
import { TelegramService } from './services/telegram.service.ts';
import { StatsService } from './services/stats.service.ts';
import { ReportsService } from './services/reports.service.ts';
import { Cron } from 'croner';

// Load environment
const env = getEnv();

// Ensure database exists before starting
await DatabaseService.ensureDatabaseExists(getDatabaseUrl());

// Create app
const { app, database } = createApp();

// Run migrations on startup
await database.runMigrations();

// User chat IDs for report notifications
const REPORT_CHAT_IDS = ['6363464900', '5983454226']; // Arek, Nastka

// Send scheduled report to all users
async function sendScheduledReport(type: 'week' | 'month' | 'year') {
  const telegram = new TelegramService({ botToken: env.TELEGRAM_BOT_TOKEN });
  const stats = new StatsService(database);
  const reports = new ReportsService(stats, database);

  console.log(`[Scheduler] Generating ${type} report...`);

  try {
    let reportText: string;
    switch (type) {
      case 'week':
        reportText = await reports.generateWeeklyReport();
        break;
      case 'month':
        reportText = await reports.generateMonthlyReport();
        break;
      case 'year':
        reportText = await reports.generateYearlyReport();
        break;
    }

    // Send to all users
    for (const chatId of REPORT_CHAT_IDS) {
      try {
        await telegram.sendMessage({
          chat_id: parseInt(chatId),
          text: reportText,
          parse_mode: 'Markdown',
        });
        console.log(`[Scheduler] ${type} report sent to chat ${chatId}`);
      } catch (error) {
        console.error(`[Scheduler] Failed to send ${type} report to chat ${chatId}:`, error);
      }
    }

    console.log(`[Scheduler] ${type} report completed`);
  } catch (error) {
    console.error(`[Scheduler] Error generating ${type} report:`, error);
  }
}

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

// Weekly report (Sunday 20:00 Warsaw time)
const weeklyReport = new Cron('0 20 * * 0', {
  timezone: 'Europe/Warsaw',
}, async () => {
  console.log('[Scheduler] Weekly report job triggered');
  await sendScheduledReport('week');
});

// Monthly report (last day of month 20:00 Warsaw time)
// Using 'L' pattern supported by croner for last day of month
const monthlyReport = new Cron('0 20 L * *', {
  timezone: 'Europe/Warsaw',
}, async () => {
  console.log('[Scheduler] Monthly report job triggered');
  await sendScheduledReport('month');
});

// Yearly report (December 31st 20:00 Warsaw time)
const yearlyReport = new Cron('0 20 31 12 *', {
  timezone: 'Europe/Warsaw',
}, async () => {
  console.log('[Scheduler] Yearly report job triggered');
  await sendScheduledReport('year');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  idempotencyCleanup.stop();
  receiptSessionCleanup.stop();
  weeklyReport.stop();
  monthlyReport.stop();
  yearlyReport.stop();
  await database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  idempotencyCleanup.stop();
  receiptSessionCleanup.stop();
  weeklyReport.stop();
  monthlyReport.stop();
  yearlyReport.stop();
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
╠═══════════════════════════════════════════╣
║  Scheduled Reports:                       ║
║  - Weekly:  Sundays 20:00                 ║
║  - Monthly: Last day of month 20:00       ║
║  - Yearly:  Dec 31st 20:00                ║
╚═══════════════════════════════════════════╝
`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
