import type { Context } from 'hono';
import type { TelegramCallbackQuery } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { EXPENSE_CATEGORIES, CATEGORY_EMOJI, type ExpenseCategory } from '../types/expense.types.ts';
import { menuHandler } from './menu.handler.ts';
import { shoppingCallbackHandler } from './shopping-callback.handler.ts';

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
      // Shopping list callbacks
      case 'list': {
        return shoppingCallbackHandler(c, callbackQuery);
      }

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

      // ===== RECEIPT MATCHING CALLBACKS =====

      case 'rr': {
        // Receipt Replace: "rr:exp_xxx:session123"
        const [expenseId, sessionId] = param.split(':');

        if (!expenseId || !sessionId) {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Nieprawidlowe dane');
          return c.json({ ok: true });
        }

        const session = await database.getReceiptSession(sessionId);
        if (!session || session.status !== 'pending') {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Sesja wygasla');

          // Session expired - add products normally without replacing
          if (session?.receiptData?.expenseInputs) {
            const { created } = await database.createExpensesBatch(session.receiptData.expenseInputs);
            if (chatId && messageId) {
              await telegram.editMessage(
                chatId,
                messageId,
                `⏰ *Sesja wygasla*\n\n` +
                `Produkty z paragonu dodane normalnie:\n` +
                `✅ ${created.length} nowych wydatków\n` +
                `💰 Razem: ${session.receiptData.total.toFixed(2)} zł`,
                'Markdown'
              );
            }
          }
          return c.json({ ok: true });
        }

        // Atomic replace: delete old expense, add new ones from receipt
        const result = await database.replaceManualWithReceipt(
          expenseId,
          session.receiptData.expenseInputs,
          session.userName
        );

        await database.markReceiptSessionProcessed(sessionId);

        // Update message
        if (chatId && messageId) {
          await telegram.editMessage(
            chatId,
            messageId,
            `✅ *Zastąpiono wydatek*\n\n` +
            `• ❌ Usunięto: ${expenseId.slice(0, 20)}...\n` +
            `• ✅ Dodano ${result.created.length} produktów z paragonu\n\n` +
            `💰 Razem: ${session.receiptData.total.toFixed(2)} zł`,
            'Markdown',
            result.created.length > 0
              ? { inline_keyboard: [[{ text: '✏️ Edytuj kategorie', callback_data: `ocr_list:${result.created.length}` }]] }
              : undefined
          );
        }

        await database.createAuditLog(
          'RECEIPT_REPLACE',
          {
            deleted_expense_id: expenseId,
            created_count: result.created.length,
            session_id: sessionId,
            total: session.receiptData.total,
          },
          userName,
          expenseId
        );

        await telegram.answerCallbackQuery(callbackQuery.id, 'Zastąpiono!');
        console.log(`[CallbackHandler] Replaced ${expenseId} with ${result.created.length} products`);
        return c.json({ ok: true });
      }

      case 'rk': {
        // Receipt Keep: "rk:session123" - keep both old expense and add new ones
        const sessionId = param;

        const session = await database.getReceiptSession(sessionId);
        if (!session || session.status !== 'pending') {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Sesja wygasla');
          return c.json({ ok: true });
        }

        // Add receipt products without deleting anything
        const { created, duplicates } = await database.createExpensesBatch(session.receiptData.expenseInputs);

        await database.markReceiptSessionProcessed(sessionId);

        // Update message
        if (chatId && messageId) {
          let text = `✅ *Dodano produkty z paragonu*\n\n`;
          text += `• ${created.length} nowych wydatków\n`;
          if (duplicates.length > 0) {
            text += `• ${duplicates.length} duplikatów pominięto\n`;
          }
          text += `• Poprzedni wydatek zachowany\n\n`;
          text += `💰 Razem: ${session.receiptData.total.toFixed(2)} zł`;

          await telegram.editMessage(
            chatId,
            messageId,
            text,
            'Markdown',
            created.length > 0
              ? { inline_keyboard: [[{ text: '✏️ Edytuj kategorie', callback_data: `ocr_list:${created.length}` }]] }
              : undefined
          );
        }

        await database.createAuditLog(
          'RECEIPT_KEEP',
          {
            kept_expense_ids: session.matchedExpenses.map(m => m.id),
            created_count: created.length,
            duplicate_count: duplicates.length,
            session_id: sessionId,
            total: session.receiptData.total,
          },
          userName
        );

        await telegram.answerCallbackQuery(callbackQuery.id, 'Dodano!');
        console.log(`[CallbackHandler] Added ${created.length} products, kept old expenses`);
        return c.json({ ok: true });
      }

      // ===== RECEIPT EXPAND (VIEW PRODUCTS) =====
      case 'receipt': {
        // Expand receipt details: "receipt:uuid-xxx"
        const receiptId = param;

        if (!receiptId) {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Brak ID paragonu');
          return c.json({ ok: true });
        }

        const products = await database.getReceiptProducts(receiptId);

        if (products.length === 0) {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Nie znaleziono produktow');
          return c.json({ ok: true });
        }

        const total = products.reduce((sum, p) => sum + p.kwota, 0);
        const shop = products[0]?.sprzedawca || 'Nieznany';

        let text = `🧾 *Paragon z ${shop}*\n\n`;

        // Group products by category
        const byCategory: Record<string, typeof products> = {};
        for (const p of products) {
          const cat = p.kategoria;
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(p);
        }

        for (const [category, items] of Object.entries(byCategory)) {
          const emoji = CATEGORY_EMOJI[category as ExpenseCategory] || '❓';
          text += `${emoji} *${category}*:\n`;
          for (const item of items) {
            text += `  • ${item.opis}: ${item.kwota.toFixed(2)} zl\n`;
          }
          text += '\n';
        }

        text += `💰 *Razem: ${total.toFixed(2)} zl*`;

        if (chatId) {
          await telegram.sendMessage({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✏️ Edytuj kategorie', callback_data: `ocr_list:${products.length}` }],
                [{ text: '⬅️ Powrot', callback_data: 'menu:search:last:10' }],
              ]
            }
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
