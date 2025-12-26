import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { timing } from 'hono/timing';

import { webhookHandler } from './handlers/webhook.handler.ts';
import { getEnv } from './config/env.ts';
import { createQueryRoutes } from './routes/query.routes.ts';

// Services
import { AICategorizerService } from './services/ai-categorizer.service.ts';
import { TelegramService } from './services/telegram.service.ts';
import { DatabaseService } from './services/database.service.ts';
import { WhisperService } from './services/whisper.service.ts';

// Types for context
declare module 'hono' {
  interface ContextVariableMap {
    aiCategorizer: AICategorizerService;
    telegram: TelegramService;
    database: DatabaseService;
    whisper: WhisperService;
    env: ReturnType<typeof getEnv>;
  }
}

export interface AppDependencies {
  database: DatabaseService;
  telegram: TelegramService;
  aiCategorizer: AICategorizerService;
  whisper: WhisperService;
}

export function createApp(deps?: Partial<AppDependencies>) {
  const app = new Hono();

  // Initialize services (or use provided dependencies)
  const database = deps?.database || new DatabaseService();
  const telegram = deps?.telegram || new TelegramService();
  const aiCategorizer = deps?.aiCategorizer || new AICategorizerService();
  const whisper = deps?.whisper || new WhisperService();

  // Inject services into context
  app.use('*', async (c, next) => {
    c.set('database', database);
    c.set('telegram', telegram);
    c.set('aiCategorizer', aiCategorizer);
    c.set('whisper', whisper);
    c.set('env', getEnv());
    await next();
  });

  // Middleware
  app.use('*', logger());
  app.use('*', timing());
  app.use('*', cors());

  // Health check
  app.get('/health', async (c) => {
    const db = c.get('database');
    const dbOk = await db.ping();
    const cbState = c.get('aiCategorizer').getCircuitBreakerState();

    return c.json({
      status: dbOk ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? 'ok' : 'error',
        ai_circuit_breaker: cbState.state,
      },
    });
  });

  // Telegram webhook
  app.post('/webhook/telegram', webhookHandler);

  // NLP Query API routes
  const queryRoutes = createQueryRoutes();
  app.route('/', queryRoutes);

  // Debug: list recent expenses
  app.get('/expenses', async (c) => {
    const db = c.get('database');
    const user = c.req.query('user') || 'Arek';
    const limit = parseInt(c.req.query('limit') || '10');

    const expenses = await db.getRecentExpenses(user, limit);
    return c.json({ expenses, count: expenses.length });
  });

  // Debug: test AI categorization
  app.post('/test/categorize', async (c) => {
    const body = await c.req.json<{ text: string }>();
    const ai = c.get('aiCategorizer');

    const result = await ai.categorizeSingle(body.text);
    return c.json(result);
  });

  // Debug: test CSV parsing
  app.post('/test/parse-csv', async (c) => {
    const body = await c.req.text();
    const { parseCSV } = await import('./parsers/csv/index.ts');

    const result = parseCSV(body);
    return c.json(result);
  });

  // Debug: test OCR/Vision
  app.post('/test/ocr', async (c) => {
    const body = await c.req.json<{ image_base64: string; mime_type?: string }>();
    const ai = c.get('aiCategorizer');

    const result = await ai.categorizeImage(
      body.image_base64,
      body.mime_type || 'image/jpeg'
    );
    return c.json(result);
  });

  return { app, database, telegram, aiCategorizer, whisper };
}
