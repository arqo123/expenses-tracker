import type { Context } from 'hono';
import type { TelegramCallbackQuery } from '../types/telegram.types.ts';
import type { SuggestionFilter } from '../types/suggestion.types.ts';
import { ShoppingDatabaseService } from '../services/shopping-database.service.ts';
import { ShoppingAIService } from '../services/shopping-ai.service.ts';
import { SuggestionEngineService } from '../services/suggestion-engine.service.ts';
import {
  shoppingMainKeyboard,
  shoppingListEmptyKeyboard,
  confirmClearKeyboard,
  smartSuggestionsKeyboard,
  storeFilterKeyboard,
} from '../keyboards/shopping.keyboard.ts';
import { showShoppingList, showSmartSuggestions } from './shopping.handler.ts';
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
          const result = await shoppingDb.addItem(productName, 1, userName, category);

          if (result.action === 'duplicate') {
            await telegram.answerCallbackQuery(callbackQuery.id, `${productName} juz jest na liscie`);
          } else {
            await telegram.answerCallbackQuery(callbackQuery.id, `Dodano: ${productName}`);
          }
          await showShoppingList(c, chatId, messageId);
        } else if (param1 === 'all') {
          if (param2 === 'smart') {
            // Add all smart suggestions
            const suggestionEngine = new SuggestionEngineService(database.getPool(), database);
            const currentItems = await shoppingDb.getCurrentItemNames();
            const suggestions = await suggestionEngine.getSmartSuggestions({
              currentItems,
              limit: 8,
            });

            let addedCount = 0;
            let skippedCount = 0;
            for (const sugg of suggestions) {
              const category = await shoppingAI.categorizeProduct(sugg.productName);
              const result = await shoppingDb.addItem(sugg.productName, 1, userName, category);
              if (result.action === 'added') {
                addedCount++;
              } else {
                skippedCount++;
              }
            }

            const msg = skippedCount > 0
              ? `Dodano ${addedCount}, pomieto ${skippedCount} (duplikaty)`
              : `Dodano ${addedCount} produktow`;
            await telegram.answerCallbackQuery(callbackQuery.id, msg);
            await showShoppingList(c, chatId, messageId);
          } else {
            // Add all legacy suggestions
            const suggestions = await shoppingDb.getSuggestions(8);
            let addedCount = 0;
            let skippedCount = 0;

            for (const sugg of suggestions) {
              const category = await shoppingAI.categorizeProduct(sugg.productName);
              const result = await shoppingDb.addItem(sugg.productName, 1, userName, category);
              if (result.action === 'added') {
                addedCount++;
              } else {
                skippedCount++;
              }
            }

            const msg = skippedCount > 0
              ? `Dodano ${addedCount}, pomieto ${skippedCount} (duplikaty)`
              : `Dodano ${addedCount} produktow`;
            await telegram.answerCallbackQuery(callbackQuery.id, msg);
            await showShoppingList(c, chatId, messageId);
          }
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

      // ==================== SUGGESTIONS (legacy) ====================
      case 'suggest': {
        await showSmartSuggestions(c, chatId, messageId);
        await telegram.answerCallbackQuery(callbackQuery.id);
        break;
      }

      // ==================== SMART SUGGESTIONS ====================
      case 'sugg': {
        const suggestionEngine = new SuggestionEngineService(database.getPool(), database);

        if (param1 === 'by_store') {
          // Show store selection keyboard
          const stores = await suggestionEngine.getTopStores(6);
          if (stores.length === 0) {
            await telegram.answerCallbackQuery(
              callbackQuery.id,
              'Brak danych o sklepach. Dodaj paragony!'
            );
            break;
          }

          const msg = '🏪 *WYBIERZ SKLEP*\n\nPokazę produkty typowe dla wybranego sklepu:';
          await telegram.editMessage(chatId, messageId, msg, 'Markdown', storeFilterKeyboard(stores));
          await telegram.answerCallbackQuery(callbackQuery.id);

        } else if (param1 === 'store') {
          // Show suggestions for specific store
          const storeName = decodeURIComponent(param2);
          const currentItems = await shoppingDb.getCurrentItemNames();

          const suggestions = await suggestionEngine.getSmartSuggestions({
            currentStore: storeName,
            currentItems,
            limit: 10,
            filter: 'store',
          });

          let msg = `🏪 *PODPOWIEDZI DLA ${storeName.toUpperCase()}*\n\n`;
          if (suggestions.length === 0) {
            msg += '_Brak produktów dla tego sklepu._';
          } else {
            msg += 'Produkty które zwykle kupujesz w tym sklepie:\n';
            for (const s of suggestions.slice(0, 5)) {
              const emoji = s.emoji || '📦';
              msg += `• ${emoji} ${s.productName}`;
              if (s.purchaseCount && s.purchaseCount > 1) {
                msg += ` _(${s.purchaseCount}x)_`;
              }
              msg += '\n';
            }
          }

          await telegram.editMessage(
            chatId,
            messageId,
            msg,
            'Markdown',
            smartSuggestionsKeyboard(suggestions, 'store')
          );
          await telegram.answerCallbackQuery(callbackQuery.id);

        } else if (param1 === 'popular' || param1 === 'overdue' || param1 === 'correlated' || param1 === 'all') {
          // Show filtered suggestions
          const filter = param1 as SuggestionFilter;
          const currentItems = await shoppingDb.getCurrentItemNames();

          const suggestions = await suggestionEngine.getSmartSuggestions({
            currentItems,
            limit: 10,
            filter,
          });

          let msg = '💡 *INTELIGENTNE PODPOWIEDZI*\n\n';

          if (filter === 'overdue') {
            msg = '⏰ *PRZETERMINOWANE PRODUKTY*\n\n';
            if (suggestions.length === 0) {
              msg += '_Brak przeterminowanych produktów!_';
            } else {
              msg += 'Produkty które dawno nie były kupowane:\n';
              for (const s of suggestions.slice(0, 5)) {
                const emoji = s.emoji || '📦';
                msg += `• ${emoji} ${s.productName}`;
                if (s.daysOverdue) {
                  msg += ` _(opóźnione ${s.daysOverdue} dni)_`;
                }
                msg += '\n';
              }
            }
          } else if (filter === 'popular') {
            msg = '🔥 *POPULARNE PRODUKTY*\n\n';
            if (suggestions.length === 0) {
              msg += '_Brak danych o popularnych produktach._';
            } else {
              msg += 'Najczęściej kupowane produkty:\n';
              for (const s of suggestions.slice(0, 5)) {
                const emoji = s.emoji || '📦';
                msg += `• ${emoji} ${s.productName}`;
                if (s.purchaseCount) {
                  msg += ` _(${s.purchaseCount} zakupów)_`;
                }
                msg += '\n';
              }
            }
          } else if (filter === 'correlated') {
            msg = '🛒 *KUPOWANE RAZEM*\n\n';
            if (currentItems.length === 0) {
              msg += '_Dodaj produkty do listy, aby zobaczyć korelacje._';
            } else if (suggestions.length === 0) {
              msg += '_Brak korelacji dla aktualnej listy._';
            } else {
              msg += `Na podstawie produktów: ${currentItems.slice(0, 3).join(', ')}...\n\n`;
              for (const s of suggestions.slice(0, 5)) {
                const emoji = s.emoji || '📦';
                msg += `• ${emoji} ${s.productName}`;
                if (s.correlationScore && s.correlationScore > 0.5) {
                  msg += ' 🔗';
                }
                msg += '\n';
              }
            }
          } else {
            // 'all' filter
            if (suggestions.length === 0) {
              msg += '_Brak podpowiedzi. Dodaj produkty lub paragony!_';
            } else {
              for (const s of suggestions.slice(0, 5)) {
                const emoji = s.emoji || '📦';
                const indicators: string[] = [];
                if (s.reasons.includes('overdue')) indicators.push('⏰');
                if (s.reasons.includes('frequently_bought')) indicators.push('🔥');
                if (s.reasons.includes('basket_correlation')) indicators.push('🔗');

                msg += `• ${emoji} ${s.productName}`;
                if (indicators.length > 0) {
                  msg += ` ${indicators.join('')}`;
                }
                msg += '\n';
              }
              msg += '\n_⏰=przeterminowane 🔥=popularne 🔗=korelacja_';
            }
          }

          await telegram.editMessage(
            chatId,
            messageId,
            msg,
            'Markdown',
            smartSuggestionsKeyboard(suggestions, filter)
          );
          await telegram.answerCallbackQuery(callbackQuery.id);

        } else {
          await telegram.answerCallbackQuery(callbackQuery.id, 'Nieznana akcja');
        }
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
