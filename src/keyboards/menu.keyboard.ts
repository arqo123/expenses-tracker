import type { InlineKeyboardMarkup } from '../types/telegram.types.ts';
import { EXPENSE_CATEGORIES, CATEGORY_EMOJI } from '../types/expense.types.ts';

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
    callback_data: section ? `menu:back:${section}` : 'menu:main',
  };
}

// ==================== MAIN MENU ====================
export function mainMenuKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '📅 Raporty czasowe', callback_data: 'menu:time' }],
    [{ text: '📁 Kategorie', callback_data: 'menu:cat' }],
    [{ text: '🏪 Sklepy', callback_data: 'menu:shop' }],
    [{ text: '👥 Porownanie', callback_data: 'menu:users' }],
    [{ text: '📈 Trendy', callback_data: 'menu:trends' }],
    [{ text: '🔍 Wyszukiwanie', callback_data: 'menu:search' }],
  ]);
}

// ==================== TIME REPORTS ====================
export function timeMenuKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [
      { text: '📆 Dzisiaj', callback_data: 'menu:time:today' },
      { text: '📆 Wczoraj', callback_data: 'menu:time:yesterday' },
    ],
    [
      { text: '📆 Ten tydzien', callback_data: 'menu:time:week' },
      { text: '📆 Zeszly tydzien', callback_data: 'menu:time:lastweek' },
    ],
    [
      { text: '📆 Ten miesiac', callback_data: 'menu:time:month' },
      { text: '📆 Zeszly miesiac', callback_data: 'menu:time:lastmonth' },
    ],
    [
      { text: '📆 Ten rok', callback_data: 'menu:time:year' },
      { text: '📆 Ostatnie 30 dni', callback_data: 'menu:time:30days' },
    ],
    [backButton()],
  ]);
}

export function timeDetailsKeyboard(period: string): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '📊 Podzial na kategorie', callback_data: `menu:time:cat:${period}` }],
    [{ text: '🏪 Top sklepy', callback_data: `menu:time:shop:${period}` }],
    [{ text: '📋 Lista transakcji', callback_data: `menu:time:list:${period}` }],
    [{ text: '📉 Porownaj z poprzednim', callback_data: `menu:time:compare:${period}` }],
    [backButton('time')],
  ]);
}

// ==================== CATEGORIES ====================
export function categoryMenuKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '🏆 Top 5 kategorii', callback_data: 'menu:cat:top5' }],
    [{ text: '🏆 Top 10 kategorii', callback_data: 'menu:cat:top10' }],
    [{ text: '📊 Wszystkie kategorie', callback_data: 'menu:cat:all' }],
    [{ text: '🔎 Wybierz kategorie...', callback_data: 'menu:cat:select:0' }],
    [backButton()],
  ]);
}

export function categorySelectKeyboard(page: number = 0): InlineKeyboardMarkup {
  const pageSize = 8;
  const start = page * pageSize;
  const categories = EXPENSE_CATEGORIES.slice(start, start + pageSize);

  const rows: InlineRow[] = [];

  // 2 categories per row
  for (let i = 0; i < categories.length; i += 2) {
    const row: InlineRow = [];
    for (let j = 0; j < 2 && i + j < categories.length; j++) {
      const cat = categories[i + j];
      if (!cat) continue;
      const emoji = CATEGORY_EMOJI[cat] || '❓';
      row.push({
        text: `${emoji} ${cat.slice(0, 12)}`,
        callback_data: `menu:cat:view:${cat}`,
      });
    }
    rows.push(row);
  }

  // Pagination
  const navRow: InlineRow = [];
  if (page > 0) {
    navRow.push({ text: '⬅️ Poprzednie', callback_data: `menu:cat:select:${page - 1}` });
  }
  if (start + pageSize < EXPENSE_CATEGORIES.length) {
    navRow.push({ text: 'Nastepne ➡️', callback_data: `menu:cat:select:${page + 1}` });
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([backButton('cat')]);

  return buildKeyboard(rows);
}

export function categoryViewKeyboard(category: string, period: string = 'month'): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '📆 Zmien okres', callback_data: `menu:cat:period:${category}` }],
    [{ text: '🏪 Top sklepy w kategorii', callback_data: `menu:cat:shops:${category}:${period}` }],
    [{ text: '📋 Pokaz transakcje', callback_data: `menu:cat:list:${category}:${period}` }],
    [{ text: '📉 Trend (wykres)', callback_data: `menu:cat:trend:${category}` }],
    [backButton('cat')],
  ]);
}

// ==================== SHOPS ====================
export function shopMenuKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '🏆 Top 5 sklepow', callback_data: 'menu:shop:top5' }],
    [{ text: '🏆 Top 10 sklepow', callback_data: 'menu:shop:top10' }],
    [{ text: '🏆 Top 20 sklepow', callback_data: 'menu:shop:top20' }],
    [backButton()],
  ]);
}

export function shopViewKeyboard(shop: string): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '📆 Zmien okres', callback_data: `menu:shop:period:${shop}` }],
    [{ text: '📋 Pokaz transakcje', callback_data: `menu:shop:list:${shop}` }],
    [{ text: '📈 Historia wizyt', callback_data: `menu:shop:history:${shop}` }],
    [backButton('shop')],
  ]);
}

// ==================== USERS COMPARISON ====================
export function usersMenuKeyboard(period: string = 'month'): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '📆 Zmien okres', callback_data: 'menu:users:period' }],
    [{ text: '📁 Porownaj kategorie', callback_data: `menu:users:cat:${period}` }],
    [{ text: '📊 Szczegolowe porownanie', callback_data: `menu:users:details:${period}` }],
    [backButton()],
  ]);
}

export function usersPeriodKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [
      { text: '📆 Dzisiaj', callback_data: 'menu:users:show:today' },
      { text: '📆 Ten tydzien', callback_data: 'menu:users:show:week' },
    ],
    [
      { text: '📆 Ten miesiac', callback_data: 'menu:users:show:month' },
      { text: '📆 Zeszly miesiac', callback_data: 'menu:users:show:lastmonth' },
    ],
    [
      { text: '📆 Ten rok', callback_data: 'menu:users:show:year' },
    ],
    [backButton('users')],
  ]);
}

// ==================== TRENDS ====================
export function trendsMenuKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '📉 Trend wydatkow (6 mies.)', callback_data: 'menu:trends:6m' }],
    [{ text: '📊 Porownanie miesiecy', callback_data: 'menu:trends:months' }],
    [{ text: '🎯 Srednie dzienne', callback_data: 'menu:trends:daily' }],
    [{ text: '📆 Wydatki wg dnia tygodnia', callback_data: 'menu:trends:weekday' }],
    [backButton()],
  ]);
}

// ==================== SEARCH ====================
export function searchMenuKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: '💰 Powyzej 100 zl', callback_data: 'menu:search:above:100' }],
    [{ text: '💰 Powyzej 500 zl', callback_data: 'menu:search:above:500' }],
    [{ text: '📊 Ostatnie 10 wydatkow', callback_data: 'menu:search:last:10' }],
    [{ text: '📊 Ostatnie 20 wydatkow', callback_data: 'menu:search:last:20' }],
    [{ text: '📊 Ostatnie 50 wydatkow', callback_data: 'menu:search:last:50' }],
    [backButton()],
  ]);
}

// ==================== PERIOD SELECTION (reusable) ====================
export function periodSelectKeyboard(returnAction: string): InlineKeyboardMarkup {
  return buildKeyboard([
    [
      { text: '📆 Dzisiaj', callback_data: `${returnAction}:today` },
      { text: '📆 Wczoraj', callback_data: `${returnAction}:yesterday` },
    ],
    [
      { text: '📆 Ten tydzien', callback_data: `${returnAction}:week` },
      { text: '📆 Ten miesiac', callback_data: `${returnAction}:month` },
    ],
    [
      { text: '📆 Zeszly miesiac', callback_data: `${returnAction}:lastmonth` },
      { text: '📆 Ten rok', callback_data: `${returnAction}:year` },
    ],
    [backButton()],
  ]);
}
