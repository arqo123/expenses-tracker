import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { textHandler } from './text.handler.ts';
import { nlpQueryHandler } from './nlp-query.handler.ts';
import { correctionHandler } from './correction.handler.ts';
import { isQuery, isCorrection } from '../parsers/text.parser.ts';
import { shoppingAddHandler } from './shopping.handler.ts';
import { ShoppingAIService } from '../services/shopping-ai.service.ts';

const MAX_VOICE_DURATION = 60; // seconds
const MAX_VOICE_SIZE = 1024 * 1024; // 1 MB

export async function voiceHandler(c: Context, message: TelegramMessage): Promise<Response> {
  const telegram = c.get('telegram');
  const whisper = c.get('whisper');

  const chatId = message.chat.id;
  const voice = message.voice!;
  const userName = getUserName(chatId, message.from.first_name);

  try {
    // Validate voice message
    if (voice.duration > MAX_VOICE_DURATION) {
      await telegram.sendError(chatId, `Wiadomosc glosowa za dluga (max ${MAX_VOICE_DURATION}s)`);
      return c.json({ ok: true });
    }

    if (voice.file_size && voice.file_size > MAX_VOICE_SIZE) {
      await telegram.sendError(chatId, 'Plik za duzy (max 1 MB)');
      return c.json({ ok: true });
    }

    // Download voice file
    console.log(`[VoiceHandler] Processing voice message for ${userName}`);
    const fileInfo = await telegram.getFile(voice.file_id);
    const audioBuffer = await telegram.downloadFile(fileInfo.file_path);

    // Transcribe with Whisper
    const transcription = await whisper.transcribe(audioBuffer, voice.mime_type || 'audio/ogg');

    if (!transcription || transcription.trim().length === 0) {
      await telegram.sendError(chatId, 'Nie udalo sie rozpoznac mowy. Sprobuj ponownie.');
      return c.json({ ok: true });
    }

    // Normalize Polish text
    const normalizedText = whisper.normalizePolishText(transcription);
    console.log(`[VoiceHandler] Transcription: "${transcription}" -> "${normalizedText}"`);

    // Show transcription to user
    await telegram.sendMessage({
      chat_id: chatId,
      text: `🎤 _${normalizedText}_`,
      parse_mode: 'Markdown',
    });

    // Create a modified message with the transcribed text
    const textMessage: TelegramMessage = {
      ...message,
      text: normalizedText,
      voice: undefined,
    };

    // Route based on intent (using same logic as text messages)
    if (isQuery(normalizedText)) {
      return nlpQueryHandler(c, textMessage);
    }

    if (isCorrection(normalizedText)) {
      return correctionHandler(c, textMessage);
    }

    // Check for shopping list intent
    try {
      const shoppingAI = new ShoppingAIService();
      const intent = await shoppingAI.detectIntent(normalizedText);

      if (intent.type === 'add_to_list') {
        return shoppingAddHandler(c, textMessage, intent.items);
      }
    } catch (error) {
      console.error('[VoiceHandler] Shopping intent detection failed:', error);
    }

    // Default: treat as expense
    return textHandler(c, textMessage);
  } catch (error) {
    console.error('[VoiceHandler] Error:', error);
    await telegram.sendError(chatId, 'Blad przetwarzania wiadomosci glosowej.');
    return c.json({ ok: false }, 500);
  }
}
