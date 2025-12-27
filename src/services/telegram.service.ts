import { getEnv } from '../config/env.ts';
import type {
  TelegramMessage,
  SendMessageOptions,
  InlineKeyboardMarkup,
  BotCommand,
  MenuButton,
} from '../types/telegram.types.ts';
import { CATEGORY_EMOJI, type ExpenseCategory } from '../types/expense.types.ts';
import { t, formatCurrency, getCommon } from '../i18n/index.ts';

interface CategoryBreakdown {
  count: number;
  amount: number;
}

interface TelegramConfig {
  botToken: string;
  baseUrl?: string;
}

export class TelegramService {
  private botToken: string;
  private baseUrl: string;

  constructor(config?: Partial<TelegramConfig>) {
    const env = getEnv();
    // Use dev token in development mode if available
    const defaultToken = env.NODE_ENV === 'development' && env.TELEGRAM_BOT_TOKEN_DEV
      ? env.TELEGRAM_BOT_TOKEN_DEV
      : env.TELEGRAM_BOT_TOKEN;
    this.botToken = config?.botToken || defaultToken;
    this.baseUrl = config?.baseUrl || 'https://api.telegram.org';
  }

  async sendMessage(options: SendMessageOptions): Promise<TelegramMessage> {
    return this.callApi<TelegramMessage>('sendMessage', options);
  }

  async sendProcessingIndicator(chatId: number): Promise<TelegramMessage> {
    return this.sendMessage({
      chat_id: chatId,
      text: '⏳',
    });
  }

  async sendExpenseConfirmation(
    chatId: number,
    shop: string,
    amount: number,
    category: ExpenseCategory,
    confidence: number,
    expenseId?: string,
    description?: string
  ): Promise<TelegramMessage> {
    const isLowConfidence = confidence < 0.7;
    const emoji = CATEGORY_EMOJI[category] || '❓';
    const formattedAmount = formatCurrency(amount);

    let text: string;
    if (description) {
      // Produkt górą, sklep niżej
      text = `${emoji} ${description} ${formattedAmount} → ${category}\n📍 ${shop}`;
    } else {
      // Fallback: sklep jako główny element
      text = `${emoji} ${shop} ${formattedAmount} → ${category}`;
    }

    if (isLowConfidence) {
      text += `\n_${getCommon().correctIfWrong}_`;
    }

    const replyMarkup: InlineKeyboardMarkup | undefined = expenseId
      ? {
          inline_keyboard: [
            [
              { text: `✏️ ${t('ui.buttons.edit')}`, callback_data: `menu:${expenseId}` },
              { text: `🗑️ ${t('ui.buttons.delete')}`, callback_data: `delete:${expenseId}` },
            ],
          ],
        }
      : undefined;

    return this.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
    });
  }

  async sendBatchSummary(
    chatId: number,
    created: number,
    duplicates: number,
    total: number,
    categoryBreakdown?: Record<string, CategoryBreakdown>,
    skippedInfo?: string
  ): Promise<TelegramMessage> {
    let text = `📊 ${t('ui.csv.importComplete')}
✅ ${created}
⏭️ ${duplicates}
📋 ${total}`;

    // Add skipped info if provided
    if (skippedInfo) {
      text += `\n🚫 ${t('ui.csv.skipped')}: ${skippedInfo}`;
    }

    // Add category breakdown if provided
    if (categoryBreakdown && Object.keys(categoryBreakdown).length > 0) {
      text += `\n\n📁 ${t('ui.csv.categoryBreakdown')}`;

      // Sort by amount descending
      const sorted = Object.entries(categoryBreakdown)
        .sort((a, b) => b[1].amount - a[1].amount);

      for (const [category, data] of sorted) {
        const emoji = CATEGORY_EMOJI[category as ExpenseCategory] || '❓';
        text += `\n${emoji} ${category}: ${data.count} (${formatCurrency(data.amount)})`;
      }
    }

    return this.sendMessage({
      chat_id: chatId,
      text,
    });
  }

  async sendQueryResult(
    chatId: number,
    title: string,
    totalAmount: number,
    items: Array<{ name: string; amount: number; count?: number }>
  ): Promise<TelegramMessage> {
    let text = `📊 ${title}\n\n💰 ${t('ui.stats.total')}: *${formatCurrency(totalAmount)}*\n\n`;

    items.slice(0, 10).forEach((item, idx) => {
      const prefix = idx === items.length - 1 ? '└──' : '├──';
      const countStr = item.count ? ` (${item.count}x)` : '';
      text += `${prefix} ${item.name}: ${formatCurrency(item.amount)}${countStr}\n`;
    });

    return this.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    });
  }

  async sendError(chatId: number, message: string): Promise<TelegramMessage> {
    return this.sendMessage({
      chat_id: chatId,
      text: `❌ ${message}`,
    });
  }

  async editMessage(
    chatId: number,
    messageId: number,
    text: string,
    parseMode?: 'Markdown' | 'HTML',
    replyMarkup?: InlineKeyboardMarkup
  ): Promise<TelegramMessage> {
    return this.callApi<TelegramMessage>('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: parseMode,
      reply_markup: replyMarkup,
    });
  }

  async deleteMessage(chatId: number, messageId: number): Promise<boolean> {
    return this.callApi<boolean>('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string
  ): Promise<boolean> {
    return this.callApi<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
    });
  }

  async getFile(fileId: string): Promise<{ file_path: string }> {
    return this.callApi<{ file_path: string }>('getFile', {
      file_id: fileId,
    });
  }

  async downloadFile(filePath: string): Promise<ArrayBuffer> {
    // Validate file path to prevent path traversal attacks
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path');
    }

    // Prevent path traversal
    if (filePath.includes('..') || filePath.includes('//')) {
      throw new Error('Path traversal detected');
    }

    // Validate file path format (Telegram file paths are alphanumeric with slashes, dots, underscores, hyphens)
    if (!/^[a-zA-Z0-9\/_.-]+$/.test(filePath)) {
      throw new Error('Invalid file path characters');
    }

    const url = `${this.baseUrl}/file/bot${this.botToken}/${filePath}`;

    // Validate final URL is still Telegram domain
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.endsWith('telegram.org')) {
      throw new Error('Invalid download URL');
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Sanitize text for Telegram Markdown to prevent injection
   */
  static sanitizeForMarkdown(text: string): string {
    if (!text) return '';
    return text
      .replace(/[*_`\[\]()~>#+=|{}.!-]/g, '\\$&')
      .slice(0, 4096); // Telegram message limit
  }

  /**
   * Sanitize text for Telegram HTML to prevent injection
   */
  static sanitizeForHTML(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .slice(0, 4096);
  }

  async setWebhook(url: string): Promise<boolean> {
    return this.callApi<boolean>('setWebhook', { url });
  }

  async getWebhookInfo(): Promise<{ url: string; pending_update_count: number }> {
    return this.callApi<{ url: string; pending_update_count: number }>('getWebhookInfo', {});
  }

  async setMyCommands(commands: BotCommand[]): Promise<boolean> {
    return this.callApi<boolean>('setMyCommands', { commands });
  }

  async setChatMenuButton(chatId?: number, menuButton?: MenuButton): Promise<boolean> {
    return this.callApi<boolean>('setChatMenuButton', {
      chat_id: chatId,
      menu_button: menuButton || { type: 'commands' },
    });
  }

  private async callApi<T>(method: string, body: object): Promise<T> {
    const url = `${this.baseUrl}/bot${this.botToken}/${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json() as { ok: boolean; result: T; description?: string };

    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description}`);
    }

    return data.result;
  }
}
