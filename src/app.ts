import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { timing } from 'hono/timing';

import { webhookHandler } from './handlers/webhook.handler.ts';
import { getEnv, Features } from './config/index.ts';
import { createQueryRoutes } from './routes/query.routes.ts';
import {
  apiKeyAuth,
  rateLimit,
  strictRateLimit,
  securityHeaders,
  auditLog,
  validateInputSize,
  sanitizeError,
  verifyTelegramWebhook,
} from './middleware/security.middleware.ts';

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

  // Get environment for configuration
  const env = getEnv();

  // Security middleware (applied first)
  app.use('*', securityHeaders());
  app.use('*', auditLog());

  // Logging and timing
  app.use('*', logger());
  app.use('*', timing());

  // Configure CORS with allowed origins
  // In development: allow localhost ports; in production: require explicit origins
  const corsOrigins = env.CORS_ORIGINS.length > 0
    ? env.CORS_ORIGINS
    : (env.NODE_ENV === 'development'
        ? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000']
        : []);

  // Only allow credentials with specific origins (not wildcard)
  const allowCredentials = corsOrigins.length > 0 && !corsOrigins.includes('*');

  app.use('*', cors({
    origin: corsOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: allowCredentials,
    maxAge: 86400, // 24 hours
  }));

  // Rate limiting for API endpoints
  app.use('/api/*', rateLimit({ windowMs: 60000, maxRequests: 60 }));
  app.use('/test/*', strictRateLimit());
  app.use('/expenses', rateLimit({ windowMs: 60000, maxRequests: 30 }));

  // Input size validation
  app.use('/api/*', validateInputSize(1024 * 100)); // 100KB for API
  app.use('/test/ocr', validateInputSize(1024 * 1024 * 10)); // 10MB for OCR
  app.use('/test/parse-csv', validateInputSize(1024 * 1024 * 5)); // 5MB for CSV

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

  // Telegram webhook (with signature verification)
  app.post('/webhook/telegram', verifyTelegramWebhook(), webhookHandler);

  // NLP Query API routes (feature-gated)
  if (Features.nlpQuery()) {
    const queryRoutes = createQueryRoutes();
    app.route('/', queryRoutes);
  }

  // Protected endpoints require API key authentication
  app.use('/expenses', apiKeyAuth());
  app.use('/test/*', apiKeyAuth());

  // Debug: list recent expenses (protected)
  app.get('/expenses', async (c) => {
    const db = c.get('database');
    const currentEnv = c.get('env');
    const user = c.req.query('user') || 'Arek';

    // Validate user is allowed
    if (!currentEnv.ALLOWED_USERS.includes(user)) {
      return c.json({ error: 'Unauthorized user' }, 403);
    }

    // Validate and sanitize limit
    const limitParam = c.req.query('limit') || '10';
    const limit = Math.min(Math.max(1, parseInt(limitParam) || 10), 100);

    const expenses = await db.getRecentExpenses(user, limit);
    return c.json({ expenses, count: expenses.length });
  });

  // Debug endpoints (feature-gated or development mode)
  if (Features.debugEndpoints() || env.NODE_ENV === 'development') {
    // Debug: test AI categorization
    app.post('/test/categorize', async (c) => {
      try {
        const body = await c.req.json<{ text: string }>();

        if (!body.text || typeof body.text !== 'string' || body.text.length > 1000) {
          return c.json({ error: 'Invalid or too long text input' }, 400);
        }

        const ai = c.get('aiCategorizer');
        const result = await ai.categorizeSingle(body.text);
        return c.json(result);
      } catch (error) {
        const currentEnv = c.get('env');
        return c.json({
          error: sanitizeError(error, currentEnv.NODE_ENV === 'development')
        }, 500);
      }
    });

    // Debug: test CSV parsing
    app.post('/test/parse-csv', async (c) => {
      try {
        const body = await c.req.text();

        if (!body || body.length > 5 * 1024 * 1024) {
          return c.json({ error: 'Invalid or too large CSV input' }, 400);
        }

        const { parseCSV } = await import('./parsers/csv/index.ts');
        const result = parseCSV(body);
        return c.json(result);
      } catch (error) {
        const currentEnv = c.get('env');
        return c.json({
          error: sanitizeError(error, currentEnv.NODE_ENV === 'development')
        }, 500);
      }
    });

    // Debug: test OCR/Vision
    app.post('/test/ocr', async (c) => {
      try {
        const body = await c.req.json<{ image_base64: string; mime_type?: string }>();

        if (!body.image_base64 || typeof body.image_base64 !== 'string') {
          return c.json({ error: 'Invalid image input' }, 400);
        }

        // Validate base64 length (approx 10MB max)
        if (body.image_base64.length > 14 * 1024 * 1024) {
          return c.json({ error: 'Image too large' }, 413);
        }

        const ai = c.get('aiCategorizer');
        const result = await ai.categorizeImage(
          body.image_base64,
          body.mime_type || 'image/jpeg'
        );
        return c.json(result);
      } catch (error) {
        const currentEnv = c.get('env');
        return c.json({
          error: sanitizeError(error, currentEnv.NODE_ENV === 'development')
        }, 500);
      }
    });
  } else {
    // Debug endpoints disabled
    app.all('/test/*', (c) => {
      return c.json({ error: 'Debug endpoints disabled' }, 404);
    });
  }

  return { app, database, telegram, aiCategorizer, whisper };
}
