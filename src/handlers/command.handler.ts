import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { mainMenuKeyboard } from '../keyboards/menu.keyboard.ts';

// Help message text
const HELP_TEXT = `ℹ️ *EXPENSE TRACKER BOT - POMOC*

📝 *JAK DODAC WYDATEK:*
• Napisz np. "Biedronka 50 zl" lub "kawa 15"
• 🎤 Wyslij nagranie glosowe
• 📷 Wyslij zdjecie paragonu
• 📄 Wyslij plik CSV z banku

📊 *STATYSTYKI:*
• Wpisz /menu aby otworzyc menu statystyk
• Lub napisz np. "ile wydalem w tym miesiacu?"

✏️ *KOREKTA:*
• Po dodaniu wydatku kliknij przycisk kategorii
• Lub napisz "zmien na Restauracje"

💡 *PRZYKLADY:*
• "zabka 23.50 piwko"
• "uber 45 zl"
• "ile wydalem na transport?"
• "pokaz ostatnie wydatki"

📋 *KOMENDY:*
• /menu - menu statystyk
• /help - ta pomoc`;

// Menu message text
const MENU_TEXT = `📊 *STATYSTYKI*

Co chcesz sprawdzic?`;

export async function helpCommand(c: Context, message: TelegramMessage): Promise<Response> {
  const telegram = c.get('telegram');
  const chatId = message.chat.id;

  try {
    await telegram.sendMessage({
      chat_id: chatId,
      text: HELP_TEXT,
      parse_mode: 'Markdown',
    });

    return c.json({ ok: true });
  } catch (error) {
    console.error('[HelpCommand] Error:', error);
    return c.json({ ok: false }, 500);
  }
}

export async function menuCommand(c: Context, message: TelegramMessage): Promise<Response> {
  const telegram = c.get('telegram');
  const chatId = message.chat.id;

  try {
    await telegram.sendMessage({
      chat_id: chatId,
      text: MENU_TEXT,
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard(),
    });

    return c.json({ ok: true });
  } catch (error) {
    console.error('[MenuCommand] Error:', error);
    return c.json({ ok: false }, 500);
  }
}

// Check if text is a command
export function isCommand(text: string): boolean {
  return text.startsWith('/');
}

// Parse command from text
export function parseCommand(text: string): { command: string; args: string } | null {
  if (!isCommand(text)) return null;

  const parts = text.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase() || '';
  const args = parts.slice(1).join(' ');

  if (!command) return null;

  return { command, args };
}
