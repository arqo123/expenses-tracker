import type { Context } from 'hono';
import type { TelegramCallbackQuery } from '../types/telegram.types.ts';
import { ShoppingDatabaseService } from '../services/shopping-database.service.ts';
import { ShoppingAIService } from '../services/shopping-ai.service.ts';
import {
  shoppingMainKeyboard,
  shoppingListEmptyKeyboard,
  confirmClearKeyboard,
} from '../keyboards/shopping.keyboard.ts';
import { showShoppingList, showSuggestions } from './shopping.handler.ts';
import { getUserName } from './webhook.handler.ts';

export async function shoppingCallbackHandler(
  c: Context,
  callbackQuery: TelegramCallbackQuery
): Promise<Response> {
  const telegram = c.get('telegram');
  const database = c.get('database');

  const chatId = callbackQuery.message?.chat.id;
  const messageId = callbackQuery.message?.message_id;
  const data = callbackQuery.data || '';
  const userName = getUserName(
    chatId || 0,
    callbackQuery.from?.first_name
  );

  if (!chatId || !messageId) {
    await telegram.answerCallbackQuery(callbackQuery.id, 'Blad: brak danych');
    return c.json({ ok: false });
  }

  const shoppingDb = new ShoppingDatabaseService(database.getPool());
  const shoppingAI = new ShoppingAIService();

  // Parse callback data: list:action:params
  const parts = data.split(':');
  const action = parts[1] || '';
  const param1 = parts[2] || '';
  const param2 = parts[3] || '';

  try {
    switch (action) {
      // ==================== MAIN MENU ====================
      case 'main': {
        const itemCount = await shoppingDb.getItemCount();

        let msg = '🛒 *LISTA ZAKUPOW*\n\n';
        if (itemCount > 0) {
          msg += `📋 ${itemCount} ${getProductWord(itemCount)} do kupienia\n`;
        } else {
          msg += '📋 Lista jest pusta\n';
        }
        msg += '👥 Wspolna lista\n';

        await telegram.editMessage(chatId, messageId, msg, 'Markdown', shoppingMainKeyboard());
        await telegram.answerCallbackQuery(callbackQuery.id);
        break;
      }

      // ==================== SHOW LIST ====================
      case 'show': {
        await showShoppingList(c, chatId, messageId);
        await telegram.answerCallbackQuery(callbackQuery.id);
        break;
      }

      // ==================== ADD PRODUCT ====================
      case 'add': {
        if (param1 === 'prompt') {
          // Show instruction to add
          const msg =
            '➕ *DODAJ PRODUKT*\n\n' +
            'Napisz co chcesz dodac, np.:\n' +
            '• _mleko i chleb_\n' +
            '• _ser x3_\n' +
            '• _kupic banany_\n\n' +
            'Mozesz tez nagrac wiadomosc glosowa!';

          await telegram.editMessage(chatId, messageId, msg, 'Markdown', shoppingListEmptyKeyboard());
          await telegram.answerCallbackQuery(callbackQuery.id);
        } else if (param1 === 'sugg') {
          // Add from suggestion
          const productName = decodeURIComponent(param2);
          const category = await shoppingAI.categorizeProduct(productName);
          await shoppingDb.addItem(productName, 1, userName, category);

          await telegram.answerCallbackQuery(callbackQuery.id, `Dodano: ${productName}`);
          await showShoppingList(c, chatId, messageId);
        } else if (param1 === 'all') {
          // Add all suggestions
          const suggestions = await shoppingDb.getSuggestions(8);
          let addedCount = 0;

          for (const sugg of suggestions) {
            const category = await shoppingAI.categorizeProduct(sugg.productName);
            await shoppingDb.addItem(sugg.productName, 1, userName, category);
            addedCount++;
          }

          await telegram.answerCallbackQuery(callbackQuery.id, `Dodano ${addedCount} produktow`);
          await showShoppingList(c, chatId, messageId);
        }
        break;
      }

      // ==================== CHECK (ODHACZ) - Direct item check ====================
      case 'check': {
        // Direct check: list:check:{itemId}
        const itemId = param1;
        const checked = await shoppingDb.checkItem(itemId, userName);

        if (checked) {
          await telegram.answerCallbackQuery(callbackQuery.id, `✓ ${checked.name}`);
          // Refresh the list (stays on same view)
          await showShoppingList(c, chatId, messageId);
        } else {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Produkt nie znaleziony');
        }
        break;
      }

      // ==================== PAGE (pagination) ====================
      case 'page': {
        const page = parseInt(param1, 10) || 0;
        await showShoppingList(c, chatId, messageId, page);
        await telegram.answerCallbackQuery(callbackQuery.id);
        break;
      }

      // ==================== NOOP (for page counter button) ====================
      case 'noop': {
        await telegram.answerCallbackQuery(callbackQuery.id);
        break;
      }

      // ==================== REMOVE ====================
      case 'remove': {
        // Direct remove: list:remove:{itemId}
        const itemId = param1;
        const removed = await shoppingDb.removeItem(itemId);

        if (removed) {
          await telegram.answerCallbackQuery(callbackQuery.id, '🗑️ Usunieto');
        }
        await showShoppingList(c, chatId, messageId);
        break;
      }

      // ==================== SUGGESTIONS ====================
      case 'suggest': {
        await showSuggestions(c, chatId, messageId);
        await telegram.answerCallbackQuery(callbackQuery.id);
        break;
      }

      // ==================== CLEAR LIST ====================
      case 'clear': {
        if (param1 === 'confirm') {
          const itemCount = await shoppingDb.getItemCount();
          if (itemCount === 0) {
            await telegram.answerCallbackQuery(callbackQuery.id, 'Lista jest juz pusta');
            await showShoppingList(c, chatId, messageId);
          } else {
            const msg = `🗑️ *Czy na pewno chcesz wyczyścić listę?*\n\nUsuniesz ${itemCount} ${getProductWord(itemCount)}`;
            await telegram.editMessage(chatId, messageId, msg, 'Markdown', confirmClearKeyboard());
            await telegram.answerCallbackQuery(callbackQuery.id);
          }
        } else if (param1 === 'yes') {
          const count = await shoppingDb.clearAllItems();
          await telegram.answerCallbackQuery(callbackQuery.id, `Wyczyszczono ${count} produktow`);

          const msg = '✅ Lista zostala wyczyszczona!';
          await telegram.editMessage(chatId, messageId, msg, 'Markdown', shoppingMainKeyboard());
        }
        break;
      }

      // ==================== BACK ====================
      case 'back': {
        if (param1 === 'main') {
          // Go back to shopping main menu
          const itemCount = await shoppingDb.getItemCount();

          let msg = '🛒 *LISTA ZAKUPOW*\n\n';
          if (itemCount > 0) {
            msg += `📋 ${itemCount} ${getProductWord(itemCount)} do kupienia\n`;
          } else {
            msg += '📋 Lista jest pusta\n';
          }
          msg += '👥 Wspolna lista\n';

          await telegram.editMessage(chatId, messageId, msg, 'Markdown', shoppingMainKeyboard());
          await telegram.answerCallbackQuery(callbackQuery.id);
        }
        break;
      }

      default: {
        await telegram.answerCallbackQuery(callbackQuery.id, 'Nieznana akcja');
      }
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error('[ShoppingCallback] Error:', error);
    await telegram.answerCallbackQuery(callbackQuery.id, 'Wystapil blad');
    return c.json({ ok: false });
  }
}

// Helper: Polish word forms for "produkt"
function getProductWord(count: number): string {
  if (count === 1) return 'produkt';
  if (count >= 2 && count <= 4) return 'produkty';
  return 'produktow';
}
