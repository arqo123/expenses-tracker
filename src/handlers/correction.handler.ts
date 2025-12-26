import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { extractCorrectionCategory } from '../parsers/text.parser.ts';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types/expense.types.ts';

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
        'Podaj kategorie. Np: "zmien na Restauracje"'
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
          `Nieznana kategoria "${requestedCategory}". Dostepne: ${categoryList}...`
        );
        return c.json({ ok: true });
      }

      // Use partial match
      return await performCorrection(c, userName, chatId, partialMatch);
    }

    return await performCorrection(c, userName, chatId, matchedCategory);
  } catch (error) {
    console.error('[CorrectionHandler] Error:', error);
    await telegram.sendError(chatId, 'Blad zmiany kategorii.');
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
    await telegram.sendError(chatId, 'Brak wydatkow do zmiany.');
    return c.json({ ok: true });
  }

  // Check if within correction window
  const createdAt = new Date(lastExpense.created_at);
  const now = new Date();
  const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);

  if (diffMinutes > CORRECTION_WINDOW_MINUTES) {
    await telegram.sendError(
      chatId,
      `Minelo wiecej niz ${CORRECTION_WINDOW_MINUTES} minut. Nie mozna zmienic.`
    );
    return c.json({ ok: true });
  }

  const oldCategory = lastExpense.kategoria;

  // Update category
  const updated = await database.updateExpenseCategory(lastExpense.id, newCategory);

  if (!updated) {
    await telegram.sendError(chatId, 'Nie udalo sie zaktualizowac kategorii.');
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
    text: `✅ Zmieniono: ${lastExpense.sprzedawca} ${lastExpense.kwota} zl
${oldCategory} → *${newCategory}*`,
    parse_mode: 'Markdown',
  });

  console.log(`[CorrectionHandler] Updated ${lastExpense.id}: ${oldCategory} -> ${newCategory}`);
  return c.json({ ok: true });
}
