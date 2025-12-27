/**
 * Setup script for Telegram Bot menu and commands.
 * Run once after deployment: bun src/scripts/setup-bot.ts
 */

import { TelegramService } from '../services/telegram.service.ts';
import type { BotCommand } from '../types/telegram.types.ts';

const BOT_COMMANDS: BotCommand[] = [
  { command: 'menu', description: 'Menu główne' },
  { command: 'lista', description: 'Lista zakupów' },
  { command: 'help', description: 'Pokaż pomoc' },
];

async function setupBot() {
  const telegram = new TelegramService();

  console.log('Setting up Telegram bot...');

  // Set bot commands (dropdown when user types "/")
  console.log('Setting bot commands...');
  await telegram.setMyCommands(BOT_COMMANDS);
  console.log('Bot commands set:', BOT_COMMANDS.map(c => `/${c.command}`).join(', '));

  // Set menu button (shows "Menu" button next to text input)
  console.log('Setting menu button...');
  await telegram.setChatMenuButton();
  console.log('Menu button set to show commands list');

  console.log('\nSetup complete! Users will see:');
  console.log('- Menu button next to text input field');
  console.log('- Command dropdown when typing "/"');
  console.log('\nNote: Users may need to reopen the chat to see changes.');
}

setupBot().catch(console.error);
