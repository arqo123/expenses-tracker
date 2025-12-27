import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { extractCorrectionCategory } from '../parsers/text.parser.ts';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types/expense.types.ts';
import { t } from '../i18n/index.ts';

const CORRECTION_WINDOW_MINUTES = 5;

export async function correctionHandler(c: Context, message: TelegramMessage): Promise<Response> {
  const telegram = c.get('telegram');

  const chatId = message.chat.id;
  const text = message.text?.trim() || '';
  const userName = getUserName(chatId, message.from.first_name);

  try {
    // Extract requested category
    const requestedCategory = extractCorrectionCategory(text);

    if (!requestedCategory) {
      await telegram.sendError(
        chatId,
        t('ui.correction.provideCategory')
      );
      return c.json({ ok: true });
    }

    // Find matching category (case-insensitive)
    const matchedCategory = EXPENSE_CATEGORIES.find(
      (cat) => cat.toLowerCase() === requestedCategory.toLowerCase()
    );

    if (!matchedCategory) {
      // Try partial match
      const partialMatch = EXPENSE_CATEGORIES.find(
        (cat) => cat.toLowerCase().includes(requestedCategory.toLowerCase())
      );

      if (!partialMatch) {
        const categoryList = EXPENSE_CATEGORIES.slice(0, 10).join(', ');
        await telegram.sendError(
          chatId,
          t('ui.errors.categoryUnknown', { category: requestedCategory, list: categoryList })
        );
        return c.json({ ok: true });
      }

      // Use partial match
      return await performCorrection(c, userName, chatId, partialMatch);
    }

    return await performCorrection(c, userName, chatId, matchedCategory);
  } catch (error) {
    console.error('[CorrectionHandler] Error:', error);
    await telegram.sendError(chatId, t('ui.errors.categoryChangeFailed'));
    return c.json({ ok: false }, 500);
  }
}

async function performCorrection(
  c: Context,
  userName: string,
  chatId: number,
  newCategory: ExpenseCategory
): Promise<Response> {
  const telegram = c.get('telegram');
  const database = c.get('database');

  // Get last expense
  const lastExpense = await database.getLastExpenseByUser(userName);

  if (!lastExpense) {
    await telegram.sendError(chatId, t('ui.errors.noExpensesToChange'));
    return c.json({ ok: true });
  }

  // Check if within correction window
  const createdAt = new Date(lastExpense.created_at);
  const now = new Date();
  const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);

  if (diffMinutes > CORRECTION_WINDOW_MINUTES) {
    await telegram.sendError(
      chatId,
      t('ui.errors.correctionWindowExpired', { minutes: CORRECTION_WINDOW_MINUTES })
    );
    return c.json({ ok: true });
  }

  const oldCategory = lastExpense.kategoria;

  // Update category
  const updated = await database.updateExpenseCategory(lastExpense.id, newCategory);

  if (!updated) {
    await telegram.sendError(chatId, t('ui.errors.updateFailed'));
    return c.json({ ok: true });
  }

  // Update merchant learning (if 3+ corrections for same shop)
  await database.updateMerchantCategory(lastExpense.sprzedawca, newCategory);

  // Audit log
  await database.createAuditLog(
    'category_correction',
    {
      old_category: oldCategory,
      new_category: newCategory,
      shop: lastExpense.sprzedawca,
      amount: lastExpense.kwota,
    },
    userName,
    lastExpense.id
  );

  // Send confirmation
  await telegram.sendMessage({
    chat_id: chatId,
    text: `✅ ${t('ui.correction.changed', {
      shop: lastExpense.sprzedawca,
      amount: lastExpense.kwota,
      oldCategory: oldCategory,
      newCategory: `*${newCategory}*`,
    })}`,
    parse_mode: 'Markdown',
  });

  console.log(`[CorrectionHandler] Updated ${lastExpense.id}: ${oldCategory} -> ${newCategory}`);
  return c.json({ ok: true });
}
