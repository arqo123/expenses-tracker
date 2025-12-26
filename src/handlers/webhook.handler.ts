import type { Context } from 'hono';
import type { TelegramUpdate, TelegramMessage } from '../types/telegram.types.ts';
import { textHandler } from './text.handler.ts';
import { voiceHandler } from './voice.handler.ts';
import { imageHandler } from './image.handler.ts';
import { csvHandler } from './csv.handler.ts';
import { nlpQueryHandler } from './nlp-query.handler.ts';
import { correctionHandler } from './correction.handler.ts';
import { callbackHandler } from './callback.handler.ts';
import { helpCommand, menuCommand, isCommand, parseCommand } from './command.handler.ts';
import { isQuery, isCorrection } from '../parsers/text.parser.ts';

// User mapping
export const USER_MAP: Record<string, string> = {
  '6363464900': 'Arek',
  '5983454226': 'Nastka',
};

export function getUserName(chatId: number | string, firstName?: string): string {
  return USER_MAP[chatId.toString()] || firstName || 'Unknown';
}

export async function webhookHandler(c: Context): Promise<Response> {
  const update: TelegramUpdate = await c.req.json();
  const telegram = c.get('telegram');
  const database = c.get('database');

  try {
    // Handle callback queries (inline button clicks)
    if (update.callback_query) {
      return callbackHandler(c, update.callback_query);
    }

    const message = update.message;
    if (!message) {
      return c.json({ ok: true });
    }

    const chatId = message.chat.id;
    const messageId = message.message_id.toString();

    // Idempotency check
    const isNew = await database.checkIdempotency(messageId, chatId.toString());
    if (!isNew) {
      console.log(`[Webhook] Duplicate message ${messageId}, skipping`);
      return c.json({ ok: true });
    }

    // Route by message type
    return await routeMessage(c, message);
  } catch (error) {
    console.error('[Webhook] Error:', error);

    if (update.message?.chat?.id) {
      try {
        await telegram.sendError(
          update.message.chat.id,
          'Wystapil blad. Sprobuj ponownie.'
        );
      } catch {
        // Ignore send error
      }
    }

    return c.json({ ok: false, error: 'Internal error' }, 500);
  }
}

async function routeMessage(c: Context, message: TelegramMessage): Promise<Response> {
  const telegram = c.get('telegram');
  const chatId = message.chat.id;

  // Send processing indicator
  await telegram.sendProcessingIndicator(chatId);

  // Voice message
  if (message.voice) {
    return voiceHandler(c, message);
  }

  // Photo
  if (message.photo && message.photo.length > 0) {
    return imageHandler(c, message);
  }

  // Document (CSV or image)
  if (message.document) {
    const mimeType = message.document.mime_type || '';
    const fileName = message.document.file_name || '';

    if (mimeType === 'text/csv' || fileName.endsWith('.csv')) {
      return csvHandler(c, message);
    }

    if (mimeType.startsWith('image/')) {
      return imageHandler(c, message);
    }

    await telegram.sendError(chatId, 'Nieobslugiwany typ pliku. Wyslij CSV lub zdjecie.');
    return c.json({ ok: true });
  }

  // Text message
  if (message.text) {
    const text = message.text.trim();

    // Check for commands first
    if (isCommand(text)) {
      const cmd = parseCommand(text);
      if (cmd) {
        switch (cmd.command) {
          case 'menu':
            return menuCommand(c, message);
          case 'help':
          case 'start':
            return helpCommand(c, message);
          default:
            // Unknown command - show help
            return helpCommand(c, message);
        }
      }
    }

    // Check for query (use NLP-powered handler)
    if (isQuery(text)) {
      return nlpQueryHandler(c, message);
    }

    // Check for correction
    if (isCorrection(text)) {
      return correctionHandler(c, message);
    }

    // Default: expense text
    return textHandler(c, message);
  }

  // Unknown message type
  await telegram.sendError(chatId, 'Nieobslugiwany typ wiadomosci.');
  return c.json({ ok: true });
}
