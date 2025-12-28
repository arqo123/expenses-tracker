import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import type { ShoppingItem } from '../types/shopping.types.ts';
import { ShoppingDatabaseService } from '../services/shopping-database.service.ts';
import { ShoppingAIService } from '../services/shopping-ai.service.ts';
import { SuggestionEngineService } from '../services/suggestion-engine.service.ts';
import {
  shoppingMainKeyboard,
  shoppingListWithItemButtons,
  shoppingListEmptyKeyboard,
  afterAddKeyboard,
  suggestionsKeyboard,
  smartSuggestionsKeyboard,
} from '../keyboards/shopping.keyboard.ts';
import { SHOP_CATEGORY_EMOJI, CATEGORY_ORDER } from '../types/shopping.types.ts';
import { getUserName } from './webhook.handler.ts';

// Handle adding items to shopping list (from text/voice message)
export async function shoppingAddHandler(
  c: Context,
  message: TelegramMessage,
  items: Array<{ name: string; quantity: number }>
): Promise<Response> {
  const telegram = c.get('telegram');
  const database = c.get('database');
  const chatId = message.chat.id;
  const userName = getUserName(chatId, message.from?.first_name);

  const shoppingDb = new ShoppingDatabaseService(database.getPool());
  const shoppingAI = new ShoppingAIService();

  try {
    const addedItems: ShoppingItem[] = [];

    for (const item of items) {
      // Categorize the product
      const category = await shoppingAI.categorizeProduct(item.name);

      // Add to list
      const added = await shoppingDb.addItem(item.name, item.quantity, userName, category);
      addedItems.push(added);
    }

    // Build confirmation message
    const itemsList = addedItems
      .map((item) => {
        const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
        return `• ${item.name}${qty}`;
      })
      .join('\n');

    const msg = `✅ *Dodano do listy:*\n${itemsList}`;

    await telegram.sendMessage({
      chat_id: chatId,
      text: msg,
      parse_mode: 'Markdown',
      reply_markup: afterAddKeyboard(),
    });

    return c.json({ ok: true });
  } catch (error) {
    console.error('[ShoppingHandler] Error adding items:', error);
    await telegram.sendError(chatId, 'Blad podczas dodawania do listy.');
    return c.json({ ok: false });
  }
}

// Handle /lista or /zakupy command
export async function shoppingCommand(c: Context, message: TelegramMessage): Promise<Response> {
  const telegram = c.get('telegram');
  const database = c.get('database');
  const chatId = message.chat.id;

  const shoppingDb = new ShoppingDatabaseService(database.getPool());

  try {
    const itemCount = await shoppingDb.getItemCount();

    let msg = '🛒 *LISTA ZAKUPOW*\n\n';
    if (itemCount > 0) {
      msg += `📋 ${itemCount} ${getProductWord(itemCount)} do kupienia\n`;
    } else {
      msg += '📋 Lista jest pusta\n';
    }
    msg += '👥 Wspolna lista\n';

    await telegram.sendMessage({
      chat_id: chatId,
      text: msg,
      parse_mode: 'Markdown',
      reply_markup: shoppingMainKeyboard(),
    });

    return c.json({ ok: true });
  } catch (error) {
    console.error('[ShoppingHandler] Error showing menu:', error);
    await telegram.sendError(chatId, 'Blad podczas otwierania listy.');
    return c.json({ ok: false });
  }
}

// Show the shopping list with direct item buttons
export async function showShoppingList(
  c: Context,
  chatId: number,
  messageId?: number,
  page: number = 0
): Promise<void> {
  const telegram = c.get('telegram');
  const database = c.get('database');

  const shoppingDb = new ShoppingDatabaseService(database.getPool());

  const groupedItems = await shoppingDb.getItemsGroupedByCategory();
  const totalItems = await shoppingDb.getItemCount();

  // Sort categories by smart routing order
  const sortedGrouped = new Map(
    [...groupedItems.entries()].sort((a, b) => {
      const orderA = CATEGORY_ORDER[a[0]] || 99;
      const orderB = CATEGORY_ORDER[b[0]] || 99;
      return orderA - orderB;
    })
  );

  let msg = `🛒 *LISTA ZAKUPOW* (${totalItems})\n\n`;

  if (totalItems === 0) {
    msg += '_Lista jest pusta_\n\n';
    msg += '💡 Napisz np. "kup mleko i chleb"';

    const keyboard = shoppingListEmptyKeyboard();

    if (messageId) {
      await telegram.editMessage(chatId, messageId, msg, 'Markdown', keyboard);
    } else {
      await telegram.sendMessage({
        chat_id: chatId,
        text: msg,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    }
    return;
  }

  // Show full product list grouped by category
  for (const [category, items] of sortedGrouped) {
    const categoryEmoji = SHOP_CATEGORY_EMOJI[category] || '📦';
    msg += `${categoryEmoji} *${category}:*\n`;
    for (const item of items) {
      const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
      msg += `    ∙ ${item.emoji} ${item.name}${qty}\n`;
    }
    msg += '\n';
  }
  msg += '_Kliknij produkt aby odhaczyc_';

  const keyboard = shoppingListWithItemButtons(sortedGrouped, page);

  if (messageId) {
    await telegram.editMessage(chatId, messageId, msg, 'Markdown', keyboard);
  } else {
    await telegram.sendMessage({
      chat_id: chatId,
      text: msg,
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }
}

// Show suggestions
export async function showSuggestions(
  c: Context,
  chatId: number,
  messageId?: number
): Promise<void> {
  const telegram = c.get('telegram');
  const database = c.get('database');

  const shoppingDb = new ShoppingDatabaseService(database.getPool());

  const overdue = await shoppingDb.getOverdueSuggestions(5);
  const popular = await shoppingDb.getSuggestions(5);

  // Combine and deduplicate
  const suggestions = [...overdue];
  for (const p of popular) {
    if (!suggestions.some((s) => s.productName === p.productName)) {
      suggestions.push(p);
    }
  }

  let msg = '💡 *PODPOWIEDZI*\n\n';

  if (suggestions.length === 0) {
    msg += '_Brak podpowiedzi - zacznij dodawac zakupy, a system nauczy sie Twoich preferencji_';
  } else {
    msg += 'Na podstawie Twoich zakupow:\n\n';

    for (const sugg of suggestions.slice(0, 8)) {
      const days = sugg.daysSinceLastPurchase;
      const interval = sugg.avgIntervalDays;

      let hint = '';
      if (days && interval && days > interval) {
        hint = ` _(${days} dni temu, kupujesz co ~${interval} dni)_`;
      } else if (days) {
        hint = ` _(ostatnio ${days} dni temu)_`;
      }

      msg += `• ${sugg.productName}${hint}\n`;
    }
  }

  const keyboard = suggestionsKeyboard(suggestions.slice(0, 8));

  if (messageId) {
    await telegram.editMessage(chatId, messageId, msg, 'Markdown', keyboard);
  } else {
    await telegram.sendMessage({
      chat_id: chatId,
      text: msg,
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }
}

// Show smart suggestions (new version with filtering and scoring)
export async function showSmartSuggestions(
  c: Context,
  chatId: number,
  messageId?: number
): Promise<void> {
  const telegram = c.get('telegram');
  const database = c.get('database');

  const shoppingDb = new ShoppingDatabaseService(database.getPool());
  const suggestionEngine = new SuggestionEngineService(database.getPool(), database);

  // Get current list items for correlation context
  const currentItems = await shoppingDb.getCurrentItemNames();

  // Get smart suggestions
  const suggestions = await suggestionEngine.getSmartSuggestions({
    currentItems,
    limit: 10,
  });

  let msg = '💡 *INTELIGENTNE PODPOWIEDZI*\n\n';

  if (suggestions.length === 0) {
    msg += '_Brak podpowiedzi._\n\n';
    msg += '💡 Dodaj produkty do listy lub zeskanuj paragon, a system nauczy się Twoich preferencji.';
  } else {
    // Group by reason for nicer display
    const overdue = suggestions.filter((s) => s.reasons.includes('overdue'));
    const popular = suggestions.filter(
      (s) => s.reasons.includes('frequently_bought') && !s.reasons.includes('overdue')
    );
    const correlated = suggestions.filter((s) => s.reasons.includes('basket_correlation'));

    if (overdue.length > 0) {
      msg += '⏰ *Przeterminowane:*\n';
      for (const s of overdue.slice(0, 3)) {
        const emoji = s.emoji || '📦';
        msg += `• ${emoji} ${s.productName}`;
        if (s.daysOverdue) {
          msg += ` _(+${s.daysOverdue} dni)_`;
        }
        msg += '\n';
      }
      msg += '\n';
    }

    if (popular.length > 0) {
      msg += '🔥 *Popularne:*\n';
      for (const s of popular.slice(0, 3)) {
        const emoji = s.emoji || '📦';
        msg += `• ${emoji} ${s.productName}`;
        if (s.purchaseCount && s.purchaseCount > 2) {
          msg += ` _(${s.purchaseCount}x)_`;
        }
        msg += '\n';
      }
      msg += '\n';
    }

    if (correlated.length > 0 && currentItems.length > 0) {
      msg += '🛒 *Na podstawie listy:*\n';
      for (const s of correlated.slice(0, 3)) {
        const emoji = s.emoji || '📦';
        msg += `• ${emoji} ${s.productName}`;
        if (s.correlationScore && s.correlationScore > 0.5) {
          msg += ' 🔗';
        }
        msg += '\n';
      }
      msg += '\n';
    }

    msg += '_Użyj filtrów powyżej dla szczegółowych widoków_';
  }

  const keyboard = smartSuggestionsKeyboard(suggestions, 'all');

  if (messageId) {
    await telegram.editMessage(chatId, messageId, msg, 'Markdown', keyboard);
  } else {
    await telegram.sendMessage({
      chat_id: chatId,
      text: msg,
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }
}

// Helper: Polish word forms for "produkt"
function getProductWord(count: number): string {
  if (count === 1) return 'produkt';
  if (count >= 2 && count <= 4) return 'produkty';
  return 'produktow';
}
