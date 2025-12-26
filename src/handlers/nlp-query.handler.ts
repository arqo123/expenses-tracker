import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { NLPQueryService } from '../services/nlp-query.service.ts';
import { QueryExecutorService } from '../services/query-executor.service.ts';
import {
  formatQueryResponse,
  formatLowConfidenceMessage,
} from '../formatters/query-response.formatter.ts';

// Singleton for NLP service (reuse circuit breaker state)
let nlpServiceInstance: NLPQueryService | null = null;

function getNLPService(): NLPQueryService {
  if (!nlpServiceInstance) {
    nlpServiceInstance = new NLPQueryService();
  }
  return nlpServiceInstance;
}

/**
 * Handle natural language queries via Telegram
 */
export async function nlpQueryHandler(
  c: Context,
  message: TelegramMessage
): Promise<Response> {
  const telegram = c.get('telegram');
  const database = c.get('database');

  const chatId = message.chat.id;
  const text = message.text?.trim() || '';
  const userName = getUserName(chatId, message.from?.first_name);

  const startTime = Date.now();

  try {
    console.log(`[NLPQueryHandler] Query from ${userName}: "${text}"`);

    // 1. Parse query with AI
    const nlpService = getNLPService();
    const parsedQuery = await nlpService.parseQuery(text);

    console.log('[NLPQueryHandler] Parsed query:', JSON.stringify(parsedQuery, null, 2));
    console.log(`[NLPQueryHandler] Confidence: ${parsedQuery.confidence}`);

    // 2. Check confidence - if too low, ask for clarification
    if (parsedQuery.confidence < 0.5) {
      await telegram.sendMessage({
        chat_id: chatId,
        text: formatLowConfidenceMessage(),
      });

      return c.json({
        ok: true,
        warning: 'low_confidence',
        confidence: parsedQuery.confidence,
        processingTimeMs: Date.now() - startTime,
      });
    }

    // 3. Execute query
    const executor = new QueryExecutorService(database);
    const result = await executor.execute(parsedQuery, userName);

    // 4. Format response for Telegram
    const responseText = formatQueryResponse(result, 'telegram') as string;

    await telegram.sendMessage({
      chat_id: chatId,
      text: responseText,
      parse_mode: 'Markdown',
    });

    // Log to audit
    await database.createAuditLog(
      'NLP_QUERY',
      {
        query: text,
        parsedQuery,
        resultCount: result.data.count || 0,
        total: result.data.total || 0,
      },
      userName
    );

    return c.json({
      ok: true,
      query: parsedQuery,
      resultCount: result.data.count,
      total: result.data.total,
      processingTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error('[NLPQueryHandler] Error:', error);

    await telegram.sendError(chatId, 'Blad przetwarzania zapytania. Sprobuj ponownie.');

    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
      },
      500
    );
  }
}

/**
 * Handle NLP query from voice transcription
 * Called by voiceHandler after Whisper transcription
 */
export async function nlpQueryFromVoice(
  c: Context,
  message: TelegramMessage,
  transcribedText: string
): Promise<Response> {
  // Create a modified message with the transcribed text
  const modifiedMessage: TelegramMessage = {
    ...message,
    text: transcribedText,
  };

  return nlpQueryHandler(c, modifiedMessage);
}
