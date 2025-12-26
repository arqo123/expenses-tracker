import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { parseExpenseText } from '../parsers/text.parser.ts';

export async function textHandler(c: Context, message: TelegramMessage): Promise<Response> {
  const aiCategorizer = c.get('aiCategorizer');
  const telegram = c.get('telegram');
  const database = c.get('database');

  const chatId = message.chat.id;
  const text = message.text!.trim();
  const userName = getUserName(chatId, message.from.first_name);

  try {
    // Try simple parsing (optional - AI will do the heavy lifting)
    const parsed = parseExpenseText(text);

    // AI categorization - always run, even if simple parser failed
    console.log(`[TextHandler] Categorizing: "${text}" for ${userName}`);
    const result = await aiCategorizer.categorizeSingle(text);

    // Use AI result or fallback to parsed values (if available)
    const shop = result.shop || parsed?.shop || 'Nieznany';
    const amount = result.amount || parsed?.amount;
    const category = result.category || 'Inne';
    const description = result.description || parsed?.description;

    // Validate we have an amount
    if (!amount || amount <= 0) {
      await telegram.sendError(chatId, 'Nie rozpoznałem kwoty. Podaj kwotę (np. "zabka 15" lub "kawa 6,50 zł")');
      return c.json({ ok: true });
    }

    // Create expense
    const expense = await database.createExpense({
      amount,
      category,
      shop,
      user: userName,
      source: 'telegram_text',
      raw_input: text,
      description,
    });

    // Send confirmation
    await telegram.sendExpenseConfirmation(
      chatId,
      shop,
      amount,
      category,
      result.confidence || 0.8,
      expense.id
    );

    // Audit log
    await database.createAuditLog(
      'CREATE',
      {
        amount,
        category,
        shop,
        confidence: result.confidence,
      },
      userName,
      expense.id
    );

    console.log(`[TextHandler] Created expense ${expense.id}: ${shop} ${amount} -> ${category}`);
    return c.json({ ok: true, expense_id: expense.id });
  } catch (error) {
    console.error('[TextHandler] Error:', error);
    await telegram.sendError(chatId, 'Nie udalo sie przetworzyc wydatku. Sprobuj: sklep kwota');
    return c.json({ ok: false }, 500);
  }
}
