import type { InlineKeyboardMarkup } from '../types/telegram.types.ts';
import type { ShoppingItem, ShoppingSuggestion, ShopCategory } from '../types/shopping.types.ts';
import { SHOP_CATEGORY_EMOJI } from '../types/shopping.types.ts';
import { t } from '../i18n/index.ts';

type InlineButton = { text: string; callback_data: string };
type InlineRow = InlineButton[];

// Helper to build keyboard
function buildKeyboard(rows: InlineRow[]): InlineKeyboardMarkup {
  return { inline_keyboard: rows };
}

// Back button helper
function backButton(section?: string): InlineButton {
  return {
    text: `⬅️ ${t('ui.buttons.back')}`,
    callback_data: section ? `list:back:${section}` : 'menu:main',
  };
}

// ==================== SHOPPING MAIN MENU ====================
export function shoppingMainKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `📋 ${t('ui.buttons.showList')}`, callback_data: 'list:show' }],
    [{ text: `➕ ${t('ui.buttons.addProduct')}`, callback_data: 'list:add:prompt' }],
    [{ text: `💡 ${t('ui.buttons.suggestions')}`, callback_data: 'list:suggest' }],
    [{ text: `🗑️ ${t('ui.buttons.clearList')}`, callback_data: 'list:clear:confirm' }],
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
    { text: `➕ ${t('ui.buttons.add')}`, callback_data: 'list:add:prompt' },
    { text: `💡 ${t('ui.buttons.suggestions')}`, callback_data: 'list:suggest' },
  ]);
  rows.push([backButton('main')]);

  return buildKeyboard(rows);
}

// Simplified keyboard when list is empty
export function shoppingListEmptyKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `➕ ${t('ui.buttons.addProduct')}`, callback_data: 'list:add:prompt' }],
    [{ text: `💡 ${t('ui.buttons.suggestions')}`, callback_data: 'list:suggest' }],
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
      text: `⬅️ ${t('ui.buttons.previous')}`,
      callback_data: `list:${action}:page:${page - 1}`,
    });
  }
  if (start + pageSize < items.length) {
    navRow.push({
      text: `${t('ui.buttons.next')} ➡️`,
      callback_data: `list:${action}:page:${page + 1}`,
    });
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([{ text: `❌ ${t('ui.buttons.cancel')}`, callback_data: 'list:show' }]);

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
    rows.push([{ text: `➕ ${t('ui.buttons.addAll')}`, callback_data: 'list:add:all' }]);
  }

  rows.push([backButton('main')]);

  return buildKeyboard(rows);
}

// ==================== CONFIRM DIALOGS ====================
export function confirmClearKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [
      { text: `✅ ${t('ui.buttons.yesClear')}`, callback_data: 'list:clear:yes' },
      { text: `❌ ${t('ui.buttons.cancel')}`, callback_data: 'list:main' },
    ],
  ]);
}

export function confirmRemoveKeyboard(itemId: string): InlineKeyboardMarkup {
  return buildKeyboard([
    [
      { text: `✅ ${t('ui.buttons.yesDelete')}`, callback_data: `list:remove:confirm:${itemId}` },
      { text: `❌ ${t('ui.buttons.cancel')}`, callback_data: 'list:show' },
    ],
  ]);
}

// ==================== AFTER ACTION ====================
export function afterAddKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `📋 ${t('ui.buttons.showList')}`, callback_data: 'list:show' }],
    [{ text: `➕ ${t('ui.buttons.addMore')}`, callback_data: 'list:add:prompt' }],
  ]);
}

export function afterCheckKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `✓ ${t('ui.buttons.checkNext')}`, callback_data: 'list:check:select' }],
    [{ text: `📋 ${t('ui.buttons.showList')}`, callback_data: 'list:show' }],
  ]);
}

// ==================== QUICK ACTIONS (for inline with list display) ====================
export function quickActionsKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [
      { text: `✓ ${t('ui.buttons.check')}`, callback_data: 'list:check:select' },
      { text: `➕ ${t('ui.buttons.add')}`, callback_data: 'list:add:prompt' },
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

  rows.push([{ text: `❌ ${t('ui.buttons.cancel')}`, callback_data: 'list:show' }]);

  return buildKeyboard(rows);
}
