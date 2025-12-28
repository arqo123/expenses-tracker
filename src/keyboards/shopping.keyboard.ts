import type { InlineKeyboardMarkup } from '../types/telegram.types.ts';
import type { ShoppingItem, ShoppingSuggestion, ShopCategory } from '../types/shopping.types.ts';
import type { SmartSuggestion, SuggestionFilter } from '../types/suggestion.types.ts';
import { SHOP_CATEGORY_EMOJI, getProductEmoji } from '../types/shopping.types.ts';

type InlineButton = { text: string; callback_data: string };
type InlineRow = InlineButton[];

// Helper to build keyboard
function buildKeyboard(rows: InlineRow[]): InlineKeyboardMarkup {
  return { inline_keyboard: rows };
}

// Back button helper
function backButton(section?: string): InlineButton {
  return {
    text: '⬅️ Powrot',
    callback_data: section ? `list:back:${section}` : 'menu:main',
  };
}

// ==================== SHOPPING MAIN MENU ====================
export function shoppingMainKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '📋 Pokaz liste', callback_data: 'list:show' }],
    [{ text: '➕ Dodaj produkt', callback_data: 'list:add:prompt' }],
    [{ text: '💡 Podpowiedzi', callback_data: 'list:suggest' }],
    [{ text: '🗑️ Wyczysc liste', callback_data: 'list:clear:confirm' }],
    [backButton()],
  ]);
}

// ==================== SHOPPING LIST VIEW WITH DIRECT ITEM BUTTONS ====================
export function shoppingListWithItemButtons(
  groupedItems: Map<ShopCategory, ShoppingItem[]>,
  page: number = 0
): InlineKeyboardMarkup {
  const rows: InlineRow[] = [];
  const pageSize = 8;

  // Flatten items - emoji is now stored in item itself
  const allItems: ShoppingItem[] = [];
  for (const [, items] of groupedItems) {
    for (const item of items) {
      allItems.push(item);
    }
  }

  const totalItems = allItems.length;
  const start = page * pageSize;
  const pageItems = allItems.slice(start, start + pageSize);

  // Create item buttons (2 per row) with product-specific emoji
  for (let i = 0; i < pageItems.length; i += 2) {
    const row: InlineRow = [];
    for (let j = 0; j < 2 && i + j < pageItems.length; j++) {
      const item = pageItems[i + j];
      if (!item) continue;
      const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
      const displayName = item.name.length > 10 ? item.name.slice(0, 10) + '..' : item.name;

      row.push({
        text: `${item.emoji} ${displayName}${qty}`,
        callback_data: `list:check:${item.itemId}`,
      });
    }
    if (row.length > 0) {
      rows.push(row);
    }
  }

  // Pagination if needed
  if (totalItems > pageSize) {
    const navRow: InlineRow = [];
    if (page > 0) {
      navRow.push({
        text: '⬅️',
        callback_data: `list:page:${page - 1}`,
      });
    }
    navRow.push({
      text: `${page + 1}/${Math.ceil(totalItems / pageSize)}`,
      callback_data: 'list:noop',
    });
    if (start + pageSize < totalItems) {
      navRow.push({
        text: '➡️',
        callback_data: `list:page:${page + 1}`,
      });
    }
    rows.push(navRow);
  }

  // Action buttons
  rows.push([
    { text: '➕ Dodaj', callback_data: 'list:add:prompt' },
    { text: '💡 Podpowiedzi', callback_data: 'list:suggest' },
  ]);
  rows.push([backButton('main')]);

  return buildKeyboard(rows);
}

// Simplified keyboard when list is empty
export function shoppingListEmptyKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '➕ Dodaj produkt', callback_data: 'list:add:prompt' }],
    [{ text: '💡 Podpowiedzi', callback_data: 'list:suggest' }],
    [backButton('main')],
  ]);
}

// ==================== ITEM SELECTION (for checking/removing) ====================
export function itemSelectKeyboard(
  items: ShoppingItem[],
  action: 'check' | 'remove',
  page: number = 0
): InlineKeyboardMarkup {
  const pageSize = 8;
  const start = page * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  const rows: InlineRow[] = [];

  // 2 items per row
  for (let i = 0; i < pageItems.length; i += 2) {
    const row: InlineRow = [];
    for (let j = 0; j < 2 && i + j < pageItems.length; j++) {
      const item = pageItems[i + j];
      if (!item) continue;
      const emoji = action === 'check' ? '☐' : '🗑️';
      const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
      const displayName = item.name.length > 12 ? item.name.slice(0, 12) + '...' : item.name;

      row.push({
        text: `${emoji} ${displayName}${qty}`,
        callback_data: `list:${action}:${item.itemId}`,
      });
    }
    rows.push(row);
  }

  // Pagination
  const navRow: InlineRow = [];
  if (page > 0) {
    navRow.push({
      text: '⬅️ Poprzednie',
      callback_data: `list:${action}:page:${page - 1}`,
    });
  }
  if (start + pageSize < items.length) {
    navRow.push({
      text: 'Nastepne ➡️',
      callback_data: `list:${action}:page:${page + 1}`,
    });
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([{ text: '❌ Anuluj', callback_data: 'list:show' }]);

  return buildKeyboard(rows);
}

// ==================== SUGGESTIONS ====================
export function suggestionsKeyboard(suggestions: ShoppingSuggestion[]): InlineKeyboardMarkup {
  const rows: InlineRow[] = [];

  // 2 suggestions per row
  for (let i = 0; i < suggestions.length && i < 8; i += 2) {
    const row: InlineRow = [];
    for (let j = 0; j < 2 && i + j < suggestions.length; j++) {
      const sugg = suggestions[i + j];
      if (!sugg) continue;
      const displayName =
        sugg.productName.length > 12
          ? sugg.productName.slice(0, 12) + '...'
          : sugg.productName;

      row.push({
        text: `➕ ${displayName}`,
        callback_data: `list:add:sugg:${encodeURIComponent(sugg.productName).slice(0, 40)}`,
      });
    }
    rows.push(row);
  }

  if (suggestions.length > 0) {
    rows.push([{ text: '➕ Dodaj wszystkie', callback_data: 'list:add:all' }]);
  }

  rows.push([backButton('main')]);

  return buildKeyboard(rows);
}

// ==================== SMART SUGGESTIONS ====================
export function smartSuggestionsKeyboard(
  suggestions: SmartSuggestion[],
  activeFilter: SuggestionFilter = 'all'
): InlineKeyboardMarkup {
  const rows: InlineRow[] = [];

  // Filter buttons row
  rows.push([
    {
      text: activeFilter === 'popular' ? '🔥 Popularne ✓' : '🔥 Popularne',
      callback_data: 'list:sugg:popular',
    },
    {
      text: activeFilter === 'overdue' ? '⏰ Przeter. ✓' : '⏰ Przeter.',
      callback_data: 'list:sugg:overdue',
    },
  ]);
  rows.push([
    {
      text: activeFilter === 'store' ? '🏪 Wg sklepu ✓' : '🏪 Wg sklepu',
      callback_data: 'list:sugg:by_store',
    },
    {
      text: activeFilter === 'correlated' ? '🛒 Korelacje ✓' : '🛒 Korelacje',
      callback_data: 'list:sugg:correlated',
    },
  ]);

  // Reset filter if active
  if (activeFilter !== 'all') {
    rows.push([{ text: '🔄 Wszystkie', callback_data: 'list:sugg:all' }]);
  }

  // Suggestion buttons (max 8, 2 per row)
  for (let i = 0; i < suggestions.length && i < 8; i += 2) {
    const row: InlineRow = [];
    for (let j = 0; j < 2 && i + j < suggestions.length; j++) {
      const sugg = suggestions[i + j];
      if (!sugg) continue;

      // Build display with indicators
      const emoji = sugg.emoji || getProductEmoji(sugg.productName, sugg.category) || '📦';
      const indicators: string[] = [];
      if (sugg.reasons.includes('overdue')) indicators.push('⏰');
      if (sugg.reasons.includes('frequently_bought') && sugg.purchaseCount && sugg.purchaseCount >= 5) {
        indicators.push('🔥');
      }
      if (sugg.reasons.includes('basket_correlation')) indicators.push('🔗');

      const indicatorStr = indicators.length > 0 ? ' ' + indicators.join('') : '';
      const displayName = sugg.productName.length > 10
        ? sugg.productName.slice(0, 10) + '..'
        : sugg.productName;

      row.push({
        text: `${emoji} ${displayName}${indicatorStr}`,
        callback_data: `list:add:sugg:${encodeURIComponent(sugg.productName).slice(0, 40)}`,
      });
    }
    if (row.length > 0) {
      rows.push(row);
    }
  }

  // Add all button if there are suggestions
  if (suggestions.length > 0) {
    rows.push([{ text: '➕ Dodaj wszystkie', callback_data: 'list:add:all:smart' }]);
  }

  rows.push([backButton('main')]);

  return buildKeyboard(rows);
}

// Store selection for suggestions
export function storeFilterKeyboard(
  stores: Array<{ storeName: string; productCount: number }>
): InlineKeyboardMarkup {
  const rows: InlineRow[] = [];

  // Store buttons (2 per row, max 6 stores)
  for (let i = 0; i < stores.length && i < 6; i += 2) {
    const row: InlineRow = [];
    for (let j = 0; j < 2 && i + j < stores.length; j++) {
      const store = stores[i + j];
      if (!store) continue;
      const displayName = store.storeName.length > 12
        ? store.storeName.slice(0, 12) + '..'
        : store.storeName;

      row.push({
        text: `🏪 ${displayName}`,
        callback_data: `list:sugg:store:${encodeURIComponent(store.storeName).slice(0, 30)}`,
      });
    }
    if (row.length > 0) {
      rows.push(row);
    }
  }

  rows.push([{ text: '🔄 Wszystkie sklepy', callback_data: 'list:sugg:all' }]);
  rows.push([backButton('main')]);

  return buildKeyboard(rows);
}

// ==================== CONFIRM DIALOGS ====================
export function confirmClearKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [
      { text: '✅ Tak, wyczysc', callback_data: 'list:clear:yes' },
      { text: '❌ Anuluj', callback_data: 'list:main' },
    ],
  ]);
}

export function confirmRemoveKeyboard(itemId: string): InlineKeyboardMarkup {
  return buildKeyboard([
    [
      { text: '✅ Tak, usun', callback_data: `list:remove:confirm:${itemId}` },
      { text: '❌ Anuluj', callback_data: 'list:show' },
    ],
  ]);
}

// ==================== AFTER ACTION ====================
export function afterAddKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '📋 Pokaz liste', callback_data: 'list:show' }],
    [{ text: '➕ Dodaj wiecej', callback_data: 'list:add:prompt' }],
  ]);
}

export function afterCheckKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '✓ Odhacz kolejny', callback_data: 'list:check:select' }],
    [{ text: '📋 Pokaz liste', callback_data: 'list:show' }],
  ]);
}

// ==================== QUICK ACTIONS (for inline with list display) ====================
export function quickActionsKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [
      { text: '✓ Odhacz', callback_data: 'list:check:select' },
      { text: '➕ Dodaj', callback_data: 'list:add:prompt' },
    ],
    [backButton('main')],
  ]);
}

// ==================== CATEGORY SELECTION ====================
export function categorySelectKeyboard(productName: string): InlineKeyboardMarkup {
  const categories: ShopCategory[] = [
    'Warzywa i owoce',
    'Pieczywo',
    'Nabial',
    'Mieso i wedliny',
    'Mrozonki',
    'Suche produkty',
    'Napoje',
    'Slodycze',
    'Chemia',
    'Kosmetyki',
    'Dla zwierzat',
    'Inne',
  ];

  const rows: InlineRow[] = [];

  // 2 categories per row
  for (let i = 0; i < categories.length; i += 2) {
    const row: InlineRow = [];
    for (let j = 0; j < 2 && i + j < categories.length; j++) {
      const cat = categories[i + j];
      if (!cat) continue;
      const emoji = SHOP_CATEGORY_EMOJI[cat] || '📦';
      row.push({
        text: `${emoji} ${cat.slice(0, 12)}`,
        callback_data: `list:cat:${encodeURIComponent(cat)}:${encodeURIComponent(productName).slice(0, 20)}`,
      });
    }
    rows.push(row);
  }

  rows.push([{ text: '❌ Anuluj', callback_data: 'list:show' }]);

  return buildKeyboard(rows);
}
