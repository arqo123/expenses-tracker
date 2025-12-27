import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import type { ShoppingItem } from '../types/shopping.types.ts';
import { ShoppingDatabaseService } from '../services/shopping-database.service.ts';
import { ShoppingAIService } from '../services/shopping-ai.service.ts';
import {
  shoppingMainKeyboard,
  shoppingListWithItemButtons,
  shoppingListEmptyKeyboard,
  afterAddKeyboard,
  suggestionsKeyboard,
} from '../keyboards/shopping.keyboard.ts';
import { SHOP_CATEGORY_EMOJI, CATEGORY_ORDER } from '../types/shopping.types.ts';
import { getUserName } from './webhook.handler.ts';
import { t, tsc, getProductWord } from '../i18n/index.ts';

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

    const msg = `✅ *${t('ui.shopping.addedToList')}*\n${itemsList}`;

    await telegram.sendMessage({
      chat_id: chatId,
      text: msg,
      parse_mode: 'Markdown',
      reply_markup: afterAddKeyboard(),
    });

    return c.json({ ok: true });
  } catch (error) {
    console.error('[ShoppingHandler] Error adding items:', error);
    await telegram.sendError(chatId, t('ui.errors.addToListError'));
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

    let msg = `🛒 *${t('ui.shopping.listTitle')}*\n\n`;
    if (itemCount > 0) {
      msg += `📋 ${t('ui.shopping.productsToBuy', { count: itemCount, word: getProductWord(itemCount) })}\n`;
    } else {
      msg += `📋 ${t('ui.shopping.emptyList')}\n`;
    }
    msg += `👥 ${t('ui.shopping.sharedList')}\n`;

    await telegram.sendMessage({
      chat_id: chatId,
      text: msg,
      parse_mode: 'Markdown',
      reply_markup: shoppingMainKeyboard(),
    });

    return c.json({ ok: true });
  } catch (error) {
    console.error('[ShoppingHandler] Error showing menu:', error);
    await telegram.sendError(chatId, t('ui.errors.openListError'));
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

  let msg = `🛒 *${t('ui.shopping.listTitle')}* (${totalItems})\n\n`;

  if (totalItems === 0) {
    msg += `_${t('ui.shopping.emptyList')}_\n\n`;
    msg += `💡 ${t('ui.shopping.addExamples').split('\n')[0]}`;

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
    const translatedCategory = tsc(category);
    msg += `${categoryEmoji} *${translatedCategory}:*\n`;
    for (const item of items) {
      const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
      msg += `    ∙ ${item.emoji} ${item.name}${qty}\n`;
    }
    msg += '\n';
  }
  msg += `_${t('ui.shopping.clickToCheck')}_`;

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

  let msg = `💡 *${t('ui.shopping.suggestionsTitle')}*\n\n`;

  if (suggestions.length === 0) {
    msg += `_${t('ui.shopping.noSuggestions')}_`;
  } else {
    msg += `${t('ui.shopping.basedOnPurchases')}\n\n`;

    for (const sugg of suggestions.slice(0, 8)) {
      const days = sugg.daysSinceLastPurchase;
      const interval = sugg.avgIntervalDays;

      let hint = '';
      if (days && interval && days > interval) {
        hint = ` _(${t('ui.shopping.daysAgo', { days })}, ${t('ui.shopping.buyEvery', { interval })})_`;
      } else if (days) {
        hint = ` _(${t('ui.shopping.lastPurchase', { days })})_`;
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

