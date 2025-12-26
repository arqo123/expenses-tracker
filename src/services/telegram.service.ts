import { getEnv } from '../config/env.ts';
import type {
  TelegramMessage,
  SendMessageOptions,
  InlineKeyboardMarkup,
} from '../types/telegram.types.ts';
import { CATEGORY_EMOJI, type ExpenseCategory } from '../types/expense.types.ts';

interface TelegramConfig {
  botToken: string;
  baseUrl?: string;
}

export class TelegramService {
  private botToken: string;
  private baseUrl: string;

  constructor(config?: Partial<TelegramConfig>) {
    const env = getEnv();
    this.botToken = config?.botToken || env.TELEGRAM_BOT_TOKEN;
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
    expenseId?: string
  ): Promise<TelegramMessage> {
    const isLowConfidence = confidence < 0.7;
    const emoji = CATEGORY_EMOJI[category] || '❓';
    const amountStr = amount.toFixed(2).replace('.00', '');

    let text = `${emoji} ${shop} ${amountStr} zl → ${category}`;
    if (isLowConfidence) {
      text += '\n_Popraw jesli zle._';
    }

    const replyMarkup: InlineKeyboardMarkup | undefined = expenseId
      ? {
          inline_keyboard: [
            [
              { text: '✏️ Zmien', callback_data: `menu:${expenseId}` },
              { text: '🗑️ Usun', callback_data: `delete:${expenseId}` },
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
    total: number
  ): Promise<TelegramMessage> {
    const text = `📊 Import CSV zakonczony:
✅ Utworzono: ${created}
⏭️ Duplikaty: ${duplicates}
📋 Lacznie: ${total}`;

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
    const amountStr = totalAmount.toFixed(2);
    let text = `📊 ${title}\n\n💰 Razem: *${amountStr} zl*\n\n`;

    items.slice(0, 10).forEach((item, idx) => {
      const prefix = idx === items.length - 1 ? '└──' : '├──';
      const countStr = item.count ? ` (${item.count}x)` : '';
      text += `${prefix} ${item.name}: ${item.amount.toFixed(2)} zl${countStr}\n`;
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
    const url = `${this.baseUrl}/file/bot${this.botToken}/${filePath}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  async setWebhook(url: string): Promise<boolean> {
    return this.callApi<boolean>('setWebhook', { url });
  }

  async getWebhookInfo(): Promise<{ url: string; pending_update_count: number }> {
    return this.callApi<{ url: string; pending_update_count: number }>('getWebhookInfo', {});
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
