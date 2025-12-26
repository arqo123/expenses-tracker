import type { Context } from 'hono';
import type { TelegramCallbackQuery } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { EXPENSE_CATEGORIES, CATEGORY_EMOJI, type ExpenseCategory } from '../types/expense.types.ts';
import { menuHandler } from './menu.handler.ts';

export async function callbackHandler(
  c: Context,
  callbackQuery: TelegramCallbackQuery
): Promise<Response> {
  const telegram = c.get('telegram');
  const database = c.get('database');

  const data = callbackQuery.data || '';
  const chatId = callbackQuery.message?.chat.id;
  const messageId = callbackQuery.message?.message_id;
  const userName = getUserName(callbackQuery.from.id, callbackQuery.from.first_name);

  try {
    // Parse callback data: "action:param1:param2"
    const parts = data.split(':');
    const action = parts[0];
    const param = parts.slice(1).join(':');

    console.log(`[CallbackHandler] Action: ${action}, param: ${param}, user: ${userName}`);

    switch (action) {
      // Stats menu navigation
      case 'menu': {
        // Check if it's a stats menu callback (menu:action:params)
        // vs category change menu (menu:expenseId)
        if (param.includes(':') || ['main', 'time', 'cat', 'shop', 'users', 'trends', 'search', 'back'].some(a => param.startsWith(a))) {
          // This is a stats menu callback - route to menuHandler
          return menuHandler(c, callbackQuery);
        }
        // Otherwise it's the old category selection menu
        const expenseId = param;

        const keyboard = buildCategoryKeyboard(expenseId);

        if (chatId && messageId) {
          await telegram.sendMessage({
            chat_id: chatId,
            text: 'Wybierz kategorie:',
            reply_markup: keyboard,
          });
        }

        await telegram.answerCallbackQuery(callbackQuery.id);
        return c.json({ ok: true });
      }

      case 'delete': {
        if (param === 'cancel') {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Anulowano');
          if (chatId && messageId) {
            await telegram.deleteMessage(chatId, messageId);
          }
          return c.json({ ok: true });
        }

        // Delete expense
        const deleted = await database.deleteExpense(param);

        if (deleted) {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Usunieto!');
          if (chatId && messageId) {
            await telegram.editMessage(chatId, messageId, '🗑️ Usunieto');
          }

          await database.createAuditLog('DELETE', { expense_id: param }, userName, param);
        } else {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Nie znaleziono wydatku');
        }

        return c.json({ ok: true });
      }

      case 'cat': {
        // Category change: "cat:Restauracje:exp_xxx"
        const [category, expenseId] = param.split(':');

        if (!category || !expenseId) {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Nieprawidlowe dane');
          return c.json({ ok: true });
        }

        const updated = await database.updateExpenseCategory(
          expenseId,
          category as ExpenseCategory
        );

        if (updated) {
          await telegram.answerCallbackQuery(callbackQuery.id, `Zmieniono na ${category}`);
          if (chatId && messageId) {
            const emoji = CATEGORY_EMOJI[category as keyof typeof CATEGORY_EMOJI] || '❓';
            await telegram.editMessage(
              chatId,
              messageId,
              `${emoji} Zmieniono na: ${category}`
            );
          }

          // Save learning for future categorization
          await database.saveProductLearning(
            updated.opis,
            category as ExpenseCategory,
            updated.sprzedawca
          );

          await database.createAuditLog(
            'category_correction',
            { new_category: category, learning_saved: true },
            userName,
            expenseId
          );
        } else {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Blad zmiany kategorii');
        }

        return c.json({ ok: true });
      }

      case 'ocr_list': {
        // List expenses from OCR for editing: "ocr_list:{count}"
        const count = parseInt(param, 10) || 10;

        // Fetch recent telegram_image expenses for this user
        const expenses = await database.getRecentExpensesBySource(
          userName,
          'telegram_image',
          count
        );

        if (expenses.length === 0) {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Nie znaleziono wydatkow');
          return c.json({ ok: true });
        }

        const keyboard = expenses.map(e => [{
          text: `${CATEGORY_EMOJI[e.kategoria] || '❓'} ${e.opis.slice(0, 25)} → zmień`,
          callback_data: `ocr_edit:${e.id}`
        }]);

        keyboard.push([{ text: '✅ Gotowe', callback_data: 'delete:cancel' }]);

        if (chatId && messageId) {
          await telegram.editMessage(
            chatId,
            messageId,
            'Wybierz produkt do edycji kategorii:',
            undefined,
            { inline_keyboard: keyboard }
          );
        }

        await telegram.answerCallbackQuery(callbackQuery.id);
        return c.json({ ok: true });
      }

      case 'ocr_edit': {
        // Show category selection for specific expense: "ocr_edit:exp_xxx"
        const expenseId = param;

        const expense = await database.getExpenseById(expenseId);
        if (!expense) {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Nie znaleziono wydatku');
          return c.json({ ok: true });
        }

        const keyboard = buildCategoryKeyboard(expenseId);

        if (chatId) {
          await telegram.sendMessage({
            chat_id: chatId,
            text: `Wybierz kategorie dla: *${expense.opis}*`,
            parse_mode: 'Markdown',
            reply_markup: keyboard
          });
        }

        await telegram.answerCallbackQuery(callbackQuery.id);
        return c.json({ ok: true });
      }

      default: {
        await telegram.answerCallbackQuery(callbackQuery.id, 'Nieznana akcja');
        return c.json({ ok: true });
      }
    }
  } catch (error) {
    console.error('[CallbackHandler] Error:', error);
    await telegram.answerCallbackQuery(callbackQuery.id, 'Blad');
    return c.json({ ok: false }, 500);
  }
}

function buildCategoryKeyboard(expenseId: string): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  // Build 3-column grid of categories
  const categories = EXPENSE_CATEGORIES.slice(0, 15); // Top 15 categories
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];

  for (let i = 0; i < categories.length; i += 3) {
    const row = categories.slice(i, i + 3).map((cat) => {
      const emoji = CATEGORY_EMOJI[cat] || '❓';
      return {
        text: `${emoji} ${cat.slice(0, 12)}`,
        callback_data: `cat:${cat}:${expenseId}`,
      };
    });
    rows.push(row);
  }

  // Add cancel button
  rows.push([{ text: '❌ Anuluj', callback_data: 'delete:cancel' }]);

  return { inline_keyboard: rows };
}
