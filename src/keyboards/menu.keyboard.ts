import type { InlineKeyboardMarkup } from '../types/telegram.types.ts';
import { EXPENSE_CATEGORIES, CATEGORY_EMOJI } from '../types/expense.types.ts';
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
    callback_data: section ? `menu:back:${section}` : 'menu:main',
  };
}

// ==================== MAIN MENU ====================
export function mainMenuKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `🛒 ${t('ui.buttons.shoppingList')}`, callback_data: 'list:main' }],
    [{ text: `📅 ${t('ui.buttons.timeReports')}`, callback_data: 'menu:time' }],
    [{ text: `📁 ${t('ui.buttons.categories')}`, callback_data: 'menu:cat' }],
    [{ text: `🏪 ${t('ui.buttons.shops')}`, callback_data: 'menu:shop' }],
    [{ text: `👥 ${t('ui.buttons.comparison')}`, callback_data: 'menu:users' }],
    [{ text: `📈 ${t('ui.buttons.trends')}`, callback_data: 'menu:trends' }],
    [{ text: `🔍 ${t('ui.buttons.search')}`, callback_data: 'menu:search' }],
  ]);
}

// ==================== TIME REPORTS ====================
export function timeMenuKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [
      { text: `📆 ${t('ui.periods.today')}`, callback_data: 'menu:time:today' },
      { text: `📆 ${t('ui.periods.yesterday')}`, callback_data: 'menu:time:yesterday' },
    ],
    [
      { text: `📆 ${t('ui.periods.thisWeek')}`, callback_data: 'menu:time:week' },
      { text: `📆 ${t('ui.periods.lastWeek')}`, callback_data: 'menu:time:lastweek' },
    ],
    [
      { text: `📆 ${t('ui.periods.thisMonth')}`, callback_data: 'menu:time:month' },
      { text: `📆 ${t('ui.periods.lastMonth')}`, callback_data: 'menu:time:lastmonth' },
    ],
    [
      { text: `📆 ${t('ui.periods.thisYear')}`, callback_data: 'menu:time:year' },
      { text: `📆 ${t('ui.periods.last30Days')}`, callback_data: 'menu:time:30days' },
    ],
    [backButton()],
  ]);
}

export function timeDetailsKeyboard(period: string): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `📊 ${t('ui.menu.categoryBreakdown')}`, callback_data: `menu:time:cat:${period}` }],
    [{ text: `🏪 ${t('ui.menu.topShopsInPeriod')}`, callback_data: `menu:time:shop:${period}` }],
    [{ text: `📋 ${t('ui.menu.transactionList')}`, callback_data: `menu:time:list:${period}` }],
    [{ text: `📉 ${t('ui.menu.compareWithPrevious')}`, callback_data: `menu:time:compare:${period}` }],
    [backButton('time')],
  ]);
}

// ==================== CATEGORIES ====================
export function categoryMenuKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `🏆 ${t('ui.menu.top5Categories')}`, callback_data: 'menu:cat:top5' }],
    [{ text: `🏆 ${t('ui.menu.top10Categories')}`, callback_data: 'menu:cat:top10' }],
    [{ text: `📊 ${t('ui.menu.allCategories')}`, callback_data: 'menu:cat:all' }],
    [{ text: `🔎 ${t('ui.menu.selectCategoryDots')}`, callback_data: 'menu:cat:select:0' }],
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
    navRow.push({ text: `⬅️ ${t('ui.buttons.previous')}`, callback_data: `menu:cat:select:${page - 1}` });
  }
  if (start + pageSize < EXPENSE_CATEGORIES.length) {
    navRow.push({ text: `${t('ui.buttons.next')} ➡️`, callback_data: `menu:cat:select:${page + 1}` });
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([backButton('cat')]);

  return buildKeyboard(rows);
}

export function categoryViewKeyboard(category: string, period: string = 'month'): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `📆 ${t('ui.menu.changePeriod')}`, callback_data: `menu:cat:period:${category}` }],
    [{ text: `🏪 ${t('ui.menu.topShopsInCategory')}`, callback_data: `menu:cat:shops:${category}:${period}` }],
    [{ text: `📋 ${t('ui.menu.showTransactions')}`, callback_data: `menu:cat:list:${category}:${period}` }],
    [{ text: `📉 ${t('ui.menu.trendChart')}`, callback_data: `menu:cat:trend:${category}` }],
    [backButton('cat')],
  ]);
}

// ==================== SHOPS ====================
export function shopMenuKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `🏆 ${t('ui.menu.top5Shops')}`, callback_data: 'menu:shop:top5' }],
    [{ text: `🏆 ${t('ui.menu.top10Shops')}`, callback_data: 'menu:shop:top10' }],
    [{ text: `🏆 ${t('ui.menu.top20Shops')}`, callback_data: 'menu:shop:top20' }],
    [backButton()],
  ]);
}

export function shopViewKeyboard(shop: string): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `📆 ${t('ui.menu.changePeriod')}`, callback_data: `menu:shop:period:${shop}` }],
    [{ text: `📋 ${t('ui.menu.showTransactions')}`, callback_data: `menu:shop:list:${shop}` }],
    [{ text: `📈 ${t('ui.menu.visitHistory')}`, callback_data: `menu:shop:history:${shop}` }],
    [backButton('shop')],
  ]);
}

// ==================== USERS COMPARISON ====================
export function usersMenuKeyboard(period: string = 'month'): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `📆 ${t('ui.menu.changePeriod')}`, callback_data: 'menu:users:period' }],
    [{ text: `📁 ${t('ui.menu.compareCategories')}`, callback_data: `menu:users:cat:${period}` }],
    [{ text: `📊 ${t('ui.menu.detailedComparison')}`, callback_data: `menu:users:details:${period}` }],
    [backButton()],
  ]);
}

export function usersPeriodKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [
      { text: `📆 ${t('ui.periods.today')}`, callback_data: 'menu:users:show:today' },
      { text: `📆 ${t('ui.periods.thisWeek')}`, callback_data: 'menu:users:show:week' },
    ],
    [
      { text: `📆 ${t('ui.periods.thisMonth')}`, callback_data: 'menu:users:show:month' },
      { text: `📆 ${t('ui.periods.lastMonth')}`, callback_data: 'menu:users:show:lastmonth' },
    ],
    [
      { text: `📆 ${t('ui.periods.thisYear')}`, callback_data: 'menu:users:show:year' },
    ],
    [backButton('users')],
  ]);
}

// ==================== TRENDS ====================
export function trendsMenuKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `📉 ${t('ui.menu.expenseTrend6m')}`, callback_data: 'menu:trends:6m' }],
    [{ text: `📊 ${t('ui.menu.compareMonths')}`, callback_data: 'menu:trends:months' }],
    [{ text: `🎯 ${t('ui.menu.dailyAverages')}`, callback_data: 'menu:trends:daily' }],
    [{ text: `📆 ${t('ui.menu.expensesByWeekday')}`, callback_data: 'menu:trends:weekday' }],
    [backButton()],
  ]);
}

// ==================== SEARCH ====================
export function searchMenuKeyboard(): InlineKeyboardMarkup {
  return buildKeyboard([
    [{ text: `💰 ${t('ui.menu.above100')}`, callback_data: 'menu:search:above:100' }],
    [{ text: `💰 ${t('ui.menu.above500')}`, callback_data: 'menu:search:above:500' }],
    [{ text: `📊 ${t('ui.menu.last10Expenses')}`, callback_data: 'menu:search:last:10' }],
    [{ text: `📊 ${t('ui.menu.last20Expenses')}`, callback_data: 'menu:search:last:20' }],
    [{ text: `📊 ${t('ui.menu.last50Expenses')}`, callback_data: 'menu:search:last:50' }],
    [backButton()],
  ]);
}

// ==================== PERIOD SELECTION (reusable) ====================
export function periodSelectKeyboard(returnAction: string): InlineKeyboardMarkup {
  return buildKeyboard([
    [
      { text: `📆 ${t('ui.periods.today')}`, callback_data: `${returnAction}:today` },
      { text: `📆 ${t('ui.periods.yesterday')}`, callback_data: `${returnAction}:yesterday` },
    ],
    [
      { text: `📆 ${t('ui.periods.thisWeek')}`, callback_data: `${returnAction}:week` },
      { text: `📆 ${t('ui.periods.thisMonth')}`, callback_data: `${returnAction}:month` },
    ],
    [
      { text: `📆 ${t('ui.periods.lastMonth')}`, callback_data: `${returnAction}:lastmonth` },
      { text: `📆 ${t('ui.periods.thisYear')}`, callback_data: `${returnAction}:year` },
    ],
    [backButton()],
  ]);
}
