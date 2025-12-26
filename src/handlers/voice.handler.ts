import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { textHandler } from './text.handler.ts';
import { queryHandler } from './query.handler.ts';

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

    // Detect intent
    const intent = whisper.detectIntent(normalizedText);

    // Create a modified message with the transcribed text
    const textMessage: TelegramMessage = {
      ...message,
      text: normalizedText,
      voice: undefined,
    };

    // Route based on intent
    if (intent === 'query') {
      return queryHandler(c, textMessage);
    }

    // Default: treat as expense
    return textHandler(c, textMessage);
  } catch (error) {
    console.error('[VoiceHandler] Error:', error);
    await telegram.sendError(chatId, 'Blad przetwarzania wiadomosci glosowej.');
    return c.json({ ok: false }, 500);
  }
}
