import { Hono } from 'hono';
import { NLPQueryService } from '../services/nlp-query.service.ts';
import { QueryExecutorService } from '../services/query-executor.service.ts';
import { formatQueryResponse } from '../formatters/query-response.formatter.ts';
import type { QueryAPIRequest, ResponseFormat } from '../types/nlp-query.types.ts';
import { getEnv } from '../config/env.ts';
import { sanitizeError } from '../middleware/security.middleware.ts';

/**
 * Create query routes for REST API
 */
export function createQueryRoutes() {
  const queryRoutes = new Hono();
  const env = getEnv();

  /**
   * POST /api/query
   * Execute a natural language query
   *
   * Body:
   * {
   *   "query": "ile wydałem w grudniu bez elektroniki",
   *   "user": "Arek",
   *   "format": "json" | "markdown" | "telegram" (optional, default: json)
   * }
   */
  queryRoutes.post('/api/query', async (c) => {
    const database = c.get('database');
    const startTime = Date.now();

    try {
      const body = await c.req.json<QueryAPIRequest>();

      // Validate required fields
      if (!body.query || typeof body.query !== 'string') {
        return c.json({ error: 'Missing or invalid "query" field' }, 400);
      }

      if (!body.user || typeof body.user !== 'string') {
        return c.json({ error: 'Missing or invalid "user" field' }, 400);
      }

      // Validate user is allowed
      if (!env.ALLOWED_USERS.includes(body.user)) {
        console.warn(`[QueryAPI] Unauthorized user access attempt: ${body.user}`);
        return c.json({ error: 'Unauthorized user', code: 'UNAUTHORIZED_USER' }, 403);
      }

      // Validate query length to prevent abuse
      if (body.query.length > 500) {
        return c.json({ error: 'Query too long (max 500 characters)' }, 400);
      }

      const format: ResponseFormat = body.format || 'json';

      // Log query (without sensitive details in production)
      if (env.NODE_ENV === 'development') {
        console.log(`[QueryAPI] Query from ${body.user}: "${body.query}"`);
      } else {
        console.log(`[QueryAPI] Query from ${body.user}`);
      }

      // 1. Parse query with AI
      const nlpService = new NLPQueryService();
      const parsedQuery = await nlpService.parseQuery(body.query);

      if (env.NODE_ENV === 'development') {
        console.log('[QueryAPI] Parsed query:', JSON.stringify(parsedQuery, null, 2));
      }

      // 2. Check confidence
      if (parsedQuery.confidence < 0.3) {
        return c.json({
          success: false,
          error: 'Query not understood',
          confidence: parsedQuery.confidence,
          suggestions: [
            'suma w grudniu',
            'top 5 kategorii',
            'wydatki bez elektroniki',
            'ile wydałem od 1 do 15 grudnia',
          ],
          meta: {
            executionTimeMs: Date.now() - startTime,
          },
        });
      }

      // 3. Execute query
      const executor = new QueryExecutorService(database);
      const result = await executor.execute(parsedQuery, body.user);

      // 4. Format response
      if (format === 'json') {
        return c.json({
          success: result.success,
          parsedQuery,
          result: {
            items: result.data.items,
            total: result.data.total,
            count: result.data.count,
            average: result.data.average,
            period: result.data.period,
          },
          meta: {
            executionTimeMs: Date.now() - startTime,
            queryConfidence: parsedQuery.confidence,
          },
        });
      }

      // Markdown or Telegram format
      const formattedResponse = formatQueryResponse(result, format);

      return c.json({
        success: result.success,
        parsedQuery,
        formatted: formattedResponse,
        meta: {
          executionTimeMs: Date.now() - startTime,
          queryConfidence: parsedQuery.confidence,
        },
      });
    } catch (error) {
      // Log error details in development only
      if (env.NODE_ENV === 'development') {
        console.error('[QueryAPI] Error:', error);
      } else {
        console.error('[QueryAPI] Error occurred');
      }

      return c.json(
        {
          success: false,
          error: sanitizeError(error, env.NODE_ENV === 'development'),
          meta: {
            executionTimeMs: Date.now() - startTime,
          },
        },
        500
      );
    }
  });

  /**
   * GET /api/query/health
   * Check NLP query service health
   */
  queryRoutes.get('/api/query/health', async (c) => {
    const nlpService = new NLPQueryService();
    const circuitState = nlpService.getCircuitBreakerState();

    return c.json({
      status: 'ok',
      circuitBreaker: circuitState,
    });
  });

  return queryRoutes;
}
