import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { mainMenuKeyboard } from '../keyboards/menu.keyboard.ts';
import { t } from '../i18n/index.ts';

// Help message text - built from i18n keys
function getHelpText(): string {
  return `ℹ️ *${t('ui.commands.help.title')}*

📝 *${t('ui.commands.help.howToAdd')}*
• ${t('ui.commands.help.addText')}
• 🎤 ${t('ui.commands.help.addVoice')}
• 📷 ${t('ui.commands.help.addPhoto')}
• 📄 ${t('ui.commands.help.addCsv')}

📊 *${t('ui.commands.help.statsTitle')}*
• ${t('ui.commands.help.statsMenu')}
• ${t('ui.commands.help.statsAsk')}

✏️ *${t('ui.commands.help.correctionTitle')}*
• ${t('ui.commands.help.correctionButton')}
• ${t('ui.commands.help.correctionText')}

💡 *${t('ui.commands.help.examplesTitle')}*
• "${t('ui.commands.help.example1')}"
• "${t('ui.commands.help.example2')}"
• "${t('ui.commands.help.example3')}"
• "${t('ui.commands.help.example4')}"

📋 *${t('ui.commands.help.commandsTitle')}*
• ${t('ui.commands.help.commandMenu')}
• ${t('ui.commands.help.commandHelp')}`;
}

// Menu message text - built from i18n keys
function getMenuText(): string {
  return `📊 *${t('ui.commands.menu.title')}*

${t('ui.commands.menu.whatToCheck')}`;
}

export async function helpCommand(c: Context, message: TelegramMessage): Promise<Response> {
  const telegram = c.get('telegram');
  const chatId = message.chat.id;

  try {
    await telegram.sendMessage({
      chat_id: chatId,
      text: getHelpText(),
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
      text: getMenuText(),
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
