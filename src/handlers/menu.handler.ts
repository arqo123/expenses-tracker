import type { Context } from 'hono';
import type { TelegramCallbackQuery, InlineKeyboardMarkup } from '../types/telegram.types.ts';
import { StatsService, type Period } from '../services/stats.service.ts';
import { CATEGORY_EMOJI, type ExpenseCategory } from '../types/expense.types.ts';
import {
  mainMenuKeyboard,
  timeMenuKeyboard,
  timeDetailsKeyboard,
  categoryMenuKeyboard,
  categorySelectKeyboard,
  categoryViewKeyboard,
  shopMenuKeyboard,
  shopViewKeyboard,
  usersMenuKeyboard,
  usersPeriodKeyboard,
  trendsMenuKeyboard,
  searchMenuKeyboard,
  periodSelectKeyboard,
} from '../keyboards/menu.keyboard.ts';
import {
  formatAmount,
  monthlyTrendChart,
  weekdayChart,
  categoryBreakdownChart,
  shopRankingChart,
  userComparisonChart,
  periodComparisonChart,
  transactionList,
  groupedTransactionList,
  dailyAverageDisplay,
} from '../utils/charts.ts';
import type { GroupedExpense } from '../types/expense.types.ts';

export async function menuHandler(
  c: Context,
  callbackQuery: TelegramCallbackQuery
): Promise<Response> {
  const telegram = c.get('telegram');
  const database = c.get('database');
  const stats = new StatsService(database);

  const data = callbackQuery.data || '';
  const chatId = callbackQuery.message?.chat.id;
  const messageId = callbackQuery.message?.message_id;

  if (!chatId || !messageId) {
    await telegram.answerCallbackQuery(callbackQuery.id, 'Blad');
    return c.json({ ok: true });
  }

  try {
    // Answer callback immediately to prevent timeout
    await telegram.answerCallbackQuery(callbackQuery.id).catch(() => {});

    // Parse callback data: "menu:action:param1:param2..."
    const parts = data.split(':');
    const action = parts[1] || 'main';
    const params = parts.slice(2);

    console.log(`[MenuHandler] Action: ${action}, params: ${params.join(':')}`);

    // Route to appropriate handler
    const result = await routeMenuAction(stats, action, params);

    // Edit message with new content (ignore "message not modified" error)
    try {
      await telegram.editMessage(
        chatId,
        messageId,
        result.text,
        'Markdown',
        result.keyboard
      );
    } catch (editError: unknown) {
      const errorMsg = editError instanceof Error ? editError.message : String(editError);
      // Ignore "message is not modified" error - it's harmless
      if (!errorMsg.includes('message is not modified')) {
        throw editError;
      }
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error('[MenuHandler] Error:', error);
    // Try to answer callback if not already answered
    await telegram.answerCallbackQuery(callbackQuery.id, 'Blad').catch(() => {});
    return c.json({ ok: false }, 500);
  }
}

interface MenuResult {
  text: string;
  keyboard: InlineKeyboardMarkup;
}

async function routeMenuAction(
  stats: StatsService,
  action: string,
  params: string[]
): Promise<MenuResult> {
  switch (action) {
    // ==================== MAIN MENU ====================
    case 'main':
      return {
        text: '📊 *STATYSTYKI*\n\nCo chcesz sprawdzic?',
        keyboard: mainMenuKeyboard(),
      };

    case 'back':
      return handleBack(params[0]);

    // ==================== TIME REPORTS ====================
    case 'time':
      if (params.length === 0) {
        return {
          text: '📅 *RAPORTY CZASOWE*\n\nWybierz okres:',
          keyboard: timeMenuKeyboard(),
        };
      }
      return handleTimeAction(stats, params);

    // ==================== CATEGORIES ====================
    case 'cat':
      if (params.length === 0) {
        return {
          text: '📁 *KATEGORIE*\n\nCo chcesz wiedziec?',
          keyboard: categoryMenuKeyboard(),
        };
      }
      return handleCategoryAction(stats, params);

    // ==================== SHOPS ====================
    case 'shop':
      if (params.length === 0) {
        return {
          text: '🏪 *SKLEPY*\n\nCo chcesz wiedziec?',
          keyboard: shopMenuKeyboard(),
        };
      }
      return handleShopAction(stats, params);

    // ==================== USERS ====================
    case 'users':
      if (params.length === 0) {
        return handleUsersDefault(stats);
      }
      return handleUsersAction(stats, params);

    // ==================== TRENDS ====================
    case 'trends':
      if (params.length === 0) {
        return {
          text: '📈 *TRENDY I ANALIZY*\n\nWybierz analize:',
          keyboard: trendsMenuKeyboard(),
        };
      }
      return handleTrendsAction(stats, params);

    // ==================== SEARCH ====================
    case 'search':
      if (params.length === 0) {
        return {
          text: '🔍 *WYSZUKIWANIE*\n\nWybierz filtr:',
          keyboard: searchMenuKeyboard(),
        };
      }
      return handleSearchAction(stats, params);

    default:
      return {
        text: '📊 *STATYSTYKI*\n\nCo chcesz sprawdzic?',
        keyboard: mainMenuKeyboard(),
      };
  }
}

// ==================== BACK HANDLER ====================

function handleBack(section?: string): MenuResult {
  switch (section) {
    case 'time':
      return {
        text: '📅 *RAPORTY CZASOWE*\n\nWybierz okres:',
        keyboard: timeMenuKeyboard(),
      };
    case 'cat':
      return {
        text: '📁 *KATEGORIE*\n\nCo chcesz wiedziec?',
        keyboard: categoryMenuKeyboard(),
      };
    case 'shop':
      return {
        text: '🏪 *SKLEPY*\n\nCo chcesz wiedziec?',
        keyboard: shopMenuKeyboard(),
      };
    case 'users':
      return {
        text: '👥 *POROWNANIE*\n\nWybierz opcje:',
        keyboard: usersMenuKeyboard(),
      };
    case 'trends':
      return {
        text: '📈 *TRENDY I ANALIZY*\n\nWybierz analize:',
        keyboard: trendsMenuKeyboard(),
      };
    case 'search':
      return {
        text: '🔍 *WYSZUKIWANIE*\n\nWybierz filtr:',
        keyboard: searchMenuKeyboard(),
      };
    default:
      return {
        text: '📊 *STATYSTYKI*\n\nCo chcesz sprawdzic?',
        keyboard: mainMenuKeyboard(),
      };
  }
}

// ==================== TIME HANDLERS ====================

async function handleTimeAction(stats: StatsService, params: string[]): Promise<MenuResult> {
  const action = params[0] || '';

  // Period selection
  if (['today', 'yesterday', 'week', 'lastweek', 'month', 'lastmonth', 'year', '30days'].includes(action)) {
    const period = action as Period;
    const summary = await stats.getSummary(period);

    const text = `📅 *Raport za: ${summary.period.label}*

💰 Suma: *${formatAmount(summary.totalAmount)} zl*
📊 Transakcji: ${summary.totalCount}
📈 Srednio/dzien: ${formatAmount(summary.avgDaily)} zl`;

    return {
      text,
      keyboard: timeDetailsKeyboard(period),
    };
  }

  // Category breakdown for period
  if (action === 'cat') {
    const period = (params[1] || 'month') as Period;
    const categories = await stats.getCategoryStats(period, 10);
    const summary = await stats.getSummary(period);

    const chartData = categories.map(c => ({
      emoji: c.emoji,
      category: c.category,
      amount: c.amount,
      percentage: c.percentage,
    }));

    const chart = categoryBreakdownChart(chartData, summary.totalAmount);

    return {
      text: `📊 *Wydatki wg kategorii*\n${summary.period.label}\n\n\`\`\`\n${chart}\n\`\`\``,
      keyboard: timeDetailsKeyboard(period),
    };
  }

  // Top shops for period
  if (action === 'shop') {
    const period = (params[1] || 'month') as Period;
    const shops = await stats.getShopStats(period, 10);
    const range = stats.getDateRange(period);

    const chart = shopRankingChart(shops);

    return {
      text: `🏪 *Top sklepy*\n${range.label}\n\n\`\`\`\n${chart}\n\`\`\``,
      keyboard: timeDetailsKeyboard(period),
    };
  }

  // Transaction list for period
  if (action === 'list') {
    const period = (params[1] || 'month') as Period;
    const transactions = await stats.getTransactionsList(period, undefined, undefined, 15);
    const range = stats.getDateRange(period);

    const listData = transactions.map(t => ({
      date: t.data,
      shop: t.sprzedawca || 'Nieznany',
      amount: t.kwota,
      category: t.kategoria,
      emoji: CATEGORY_EMOJI[t.kategoria] || '❓',
    }));

    const list = transactionList(listData, 15);

    return {
      text: `📋 *Transakcje*\n${range.label}\n\n\`\`\`\n${list}\n\`\`\``,
      keyboard: timeDetailsKeyboard(period),
    };
  }

  // Comparison with previous period
  if (action === 'compare') {
    const period = (params[1] || 'month') as Period;
    const comparison = await stats.getPeriodComparison(period);

    const chart = periodComparisonChart(
      comparison.current.totalAmount,
      comparison.previous.totalAmount,
      comparison.current.period.label,
      comparison.previous.period.label
    );

    return {
      text: `📉 *Porownanie z poprzednim okresem*\n\n\`\`\`\n${chart}\n\`\`\``,
      keyboard: timeDetailsKeyboard(period),
    };
  }

  return {
    text: '📅 *RAPORTY CZASOWE*\n\nWybierz okres:',
    keyboard: timeMenuKeyboard(),
  };
}

// ==================== CATEGORY HANDLERS ====================

async function handleCategoryAction(stats: StatsService, params: string[]): Promise<MenuResult> {
  const action = params[0] || '';

  // Top categories
  if (action === 'top5' || action === 'top10') {
    const limit = action === 'top5' ? 5 : 10;
    const categories = await stats.getCategoryStats('month', limit);
    const summary = await stats.getSummary('month');

    const chartData = categories.map(c => ({
      emoji: c.emoji,
      category: c.category,
      amount: c.amount,
      percentage: c.percentage,
    }));

    const chart = categoryBreakdownChart(chartData, summary.totalAmount);

    return {
      text: `🏆 *Top ${limit} kategorii*\nTen miesiac\n\n\`\`\`\n${chart}\n\`\`\``,
      keyboard: categoryMenuKeyboard(),
    };
  }

  // All categories
  if (action === 'all') {
    const categories = await stats.getCategoryStats('month');
    const summary = await stats.getSummary('month');

    const chartData = categories.map(c => ({
      emoji: c.emoji,
      category: c.category,
      amount: c.amount,
      percentage: c.percentage,
    }));

    const chart = categoryBreakdownChart(chartData, summary.totalAmount);

    return {
      text: `📊 *Wszystkie kategorie*\nTen miesiac\n\n\`\`\`\n${chart}\n\`\`\``,
      keyboard: categoryMenuKeyboard(),
    };
  }

  // Category select (pagination)
  if (action === 'select') {
    const page = parseInt(params[1] || '0', 10);

    return {
      text: '🔎 *Wybierz kategorie:*',
      keyboard: categorySelectKeyboard(page),
    };
  }

  // Category view
  if (action === 'view') {
    const category = params[1] || 'Inne';
    const period = (params[2] || 'month') as Period;
    const details = await stats.getCategoryDetails(category, period);

    const emoji = CATEGORY_EMOJI[category as ExpenseCategory] || '❓';

    let text = `${emoji} *${category.toUpperCase()}*\n`;
    text += `📅 ${details.summary.period.label}\n\n`;
    text += `💰 Wydano: *${formatAmount(details.stats.amount)} zl*\n`;
    text += `📊 Transakcji: ${details.stats.count}\n`;
    text += `📈 Srednio/dzien: ${formatAmount(details.summary.avgDaily)} zl\n`;

    if (details.topShops.length > 0) {
      text += `\n🏪 *Top sklepy:*\n`;
      for (const shop of details.topShops.slice(0, 3)) {
        text += `  • ${shop.shop}: ${formatAmount(shop.amount)} zl (${shop.count}x)\n`;
      }
    }

    return {
      text,
      keyboard: categoryViewKeyboard(category, period),
    };
  }

  // Category period selection
  if (action === 'period') {
    const category = params[1] || 'Inne';
    return {
      text: `📆 *Wybierz okres dla: ${category}*`,
      keyboard: periodSelectKeyboard(`menu:cat:view:${category}`),
    };
  }

  // Category shops
  if (action === 'shops') {
    const category = params[1] || 'Inne';
    const period = (params[2] || 'month') as Period;
    const details = await stats.getCategoryDetails(category, period);

    const chart = shopRankingChart(details.topShops);

    return {
      text: `🏪 *Top sklepy w: ${category}*\n${details.summary.period.label}\n\n\`\`\`\n${chart}\n\`\`\``,
      keyboard: categoryViewKeyboard(category, period),
    };
  }

  // Category transactions list
  if (action === 'list') {
    const category = params[1] || 'Inne';
    const period = (params[2] || 'month') as Period;
    const transactions = await stats.getTransactionsList(period, category, undefined, 15);
    const range = stats.getDateRange(period);

    const listData = transactions.map(t => ({
      date: t.data,
      shop: t.sprzedawca || 'Nieznany',
      amount: t.kwota,
      category: t.kategoria,
      emoji: CATEGORY_EMOJI[t.kategoria] || '❓',
    }));

    const list = transactionList(listData, 15);

    return {
      text: `📋 *Transakcje: ${category}*\n${range.label}\n\n\`\`\`\n${list}\n\`\`\``,
      keyboard: categoryViewKeyboard(category, period),
    };
  }

  // Category trend
  if (action === 'trend') {
    const category = params[1] || 'Inne';
    // Get monthly data for this category
    const now = new Date();
    const monthlyData = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const expenses = await stats.getAllExpenses(
        firstDay.toISOString().slice(0, 10),
        lastDay.toISOString().slice(0, 10),
        category
      );

      const monthNames = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paz', 'Lis', 'Gru'];

      monthlyData.push({
        label: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
        amount: expenses.reduce((sum, e) => sum + e.kwota, 0),
      });
    }

    const chart = monthlyTrendChart(monthlyData);

    return {
      text: `📉 *Trend: ${category}*\nOstatnie 6 miesiecy\n\n\`\`\`\n${chart}\n\`\`\``,
      keyboard: categoryViewKeyboard(category, 'month'),
    };
  }

  return {
    text: '📁 *KATEGORIE*\n\nCo chcesz wiedziec?',
    keyboard: categoryMenuKeyboard(),
  };
}

// ==================== SHOP HANDLERS ====================

async function handleShopAction(stats: StatsService, params: string[]): Promise<MenuResult> {
  const action = params[0] || '';

  // Top shops
  if (action === 'top5' || action === 'top10' || action === 'top20') {
    const limit = action === 'top5' ? 5 : action === 'top10' ? 10 : 20;
    const shops = await stats.getShopStats('month', limit);

    const chart = shopRankingChart(shops);

    return {
      text: `🏆 *Top ${limit} sklepow*\nTen miesiac\n\n\`\`\`\n${chart}\n\`\`\``,
      keyboard: shopMenuKeyboard(),
    };
  }

  // Shop view
  if (action === 'view') {
    const shop = params[1] || 'Nieznany';
    const details = await stats.getShopDetails(shop, 'month');

    let text = `🏪 *${shop.toUpperCase()}*\n\n`;
    text += `📅 *Ten miesiac:*\n`;
    text += `💰 Wydano: *${formatAmount(details.stats.amount)} zl*\n`;
    text += `📊 Wizyt: ${details.stats.count}\n`;
    text += `💵 Sredni paragon: ${formatAmount(details.stats.avgAmount)} zl\n\n`;
    text += `📅 *Ogolem:*\n`;
    text += `💰 Wydano: ${formatAmount(details.allTimeStats.amount)} zl\n`;
    text += `📊 Wizyt: ${details.allTimeStats.count}`;

    return {
      text,
      keyboard: shopViewKeyboard(shop),
    };
  }

  // Shop transactions
  if (action === 'list') {
    const shop = params[1] || 'Nieznany';
    const transactions = await stats.getTransactionsList('month', undefined, shop, 15);

    const listData = transactions.map(t => ({
      date: t.data,
      shop: t.sprzedawca || 'Nieznany',
      amount: t.kwota,
      category: t.kategoria,
      emoji: CATEGORY_EMOJI[t.kategoria] || '❓',
    }));

    const list = transactionList(listData, 15);

    return {
      text: `📋 *Transakcje: ${shop}*\n\n\`\`\`\n${list}\n\`\`\``,
      keyboard: shopViewKeyboard(shop),
    };
  }

  return {
    text: '🏪 *SKLEPY*\n\nCo chcesz wiedziec?',
    keyboard: shopMenuKeyboard(),
  };
}

// ==================== USERS HANDLERS ====================

async function handleUsersDefault(stats: StatsService): Promise<MenuResult> {
  const comparison = await stats.getUserComparison('month');

  const chart = userComparisonChart(comparison.users);

  let text = `👥 *POROWNANIE*\n${comparison.period.label}\n\n`;
  text += `\`\`\`\n${chart}\n\`\`\``;

  return {
    text,
    keyboard: usersMenuKeyboard('month'),
  };
}

async function handleUsersAction(stats: StatsService, params: string[]): Promise<MenuResult> {
  const action = params[0] || '';

  // Period selection
  if (action === 'period') {
    return {
      text: '📆 *Wybierz okres:*',
      keyboard: usersPeriodKeyboard(),
    };
  }

  // Show comparison for period
  if (action === 'show') {
    const period = (params[1] || 'month') as Period;
    const comparison = await stats.getUserComparison(period);

    const chart = userComparisonChart(comparison.users);

    let text = `👥 *POROWNANIE*\n${comparison.period.label}\n\n`;
    text += `\`\`\`\n${chart}\n\`\`\``;

    return {
      text,
      keyboard: usersMenuKeyboard(period),
    };
  }

  // Category comparison
  if (action === 'cat') {
    const period = (params[1] || 'month') as Period;
    const comparison = await stats.getUserCategoryComparison(period);

    let text = `👥 *POROWNANIE KATEGORII*\n${comparison.period.label}\n\n`;

    text += `*👤 Arek:*\n`;
    for (const cat of comparison.arek.slice(0, 5)) {
      text += `  ${cat.emoji} ${cat.category}: ${formatAmount(cat.amount)} zl\n`;
    }

    text += `\n*👤 Nastka:*\n`;
    for (const cat of comparison.nastka.slice(0, 5)) {
      text += `  ${cat.emoji} ${cat.category}: ${formatAmount(cat.amount)} zl\n`;
    }

    return {
      text,
      keyboard: usersMenuKeyboard(period),
    };
  }

  // Detailed comparison
  if (action === 'details') {
    const period = (params[1] || 'month') as Period;
    const comparison = await stats.getUserComparison(period);

    let text = `📊 *SZCZEGOLOWE POROWNANIE*\n${comparison.period.label}\n\n`;

    for (const user of comparison.users) {
      text += `*👤 ${user.userName}:*\n`;
      text += `  💰 Wydano: ${formatAmount(user.amount)} zl\n`;
      text += `  📊 Transakcji: ${user.count}\n`;
      text += `  📈 Udzial: ${user.percentage.toFixed(0)}%\n\n`;
    }

    return {
      text,
      keyboard: usersMenuKeyboard(period),
    };
  }

  return handleUsersDefault(stats);
}

// ==================== TRENDS HANDLERS ====================

async function handleTrendsAction(stats: StatsService, params: string[]): Promise<MenuResult> {
  const action = params[0] || '';

  // 6-month trend
  if (action === '6m') {
    const monthlyData = await stats.getMonthlyTrend(6);

    const chartData = monthlyData.map(m => ({
      label: m.label,
      amount: m.amount,
    }));

    const chart = monthlyTrendChart(chartData);

    return {
      text: `📉 *TREND WYDATKOW*\nOstatnie 6 miesiecy\n\n\`\`\`\n${chart}\n\`\`\``,
      keyboard: trendsMenuKeyboard(),
    };
  }

  // Month comparison
  if (action === 'months') {
    const monthlyData = await stats.getMonthlyTrend(12);

    const chartData = monthlyData.map(m => ({
      label: m.label,
      amount: m.amount,
    }));

    const chart = monthlyTrendChart(chartData);

    return {
      text: `📊 *POROWNANIE MIESIECY*\nOstatni rok\n\n\`\`\`\n${chart}\n\`\`\``,
      keyboard: trendsMenuKeyboard(),
    };
  }

  // Daily average
  if (action === 'daily') {
    const dailyData = await stats.getDailyAverage('month');

    const display = dailyAverageDisplay(
      dailyData.avgDaily,
      dailyData.daysWithExpenses,
      dailyData.totalDays
    );

    return {
      text: `\`\`\`\n${display}\n\`\`\``,
      keyboard: trendsMenuKeyboard(),
    };
  }

  // Weekday stats
  if (action === 'weekday') {
    const weekdayData = await stats.getWeekdayStats('month');

    const chartData = weekdayData.map(w => ({
      label: w.label,
      amount: w.amount,
    }));

    const chart = weekdayChart(chartData);

    return {
      text: `📆 *KIEDY WYDAJESZ NAJWIECEJ?*\nTen miesiac\n\n\`\`\`\n${chart}\n\`\`\``,
      keyboard: trendsMenuKeyboard(),
    };
  }

  return {
    text: '📈 *TRENDY I ANALIZY*\n\nWybierz analize:',
    keyboard: trendsMenuKeyboard(),
  };
}

// ==================== SEARCH HANDLERS ====================

async function handleSearchAction(stats: StatsService, params: string[]): Promise<MenuResult> {
  const action = params[0] || '';

  // Above amount
  if (action === 'above') {
    const amount = parseFloat(params[1] || '100');
    const expenses = await stats.getExpensesAbove(amount, 'month');

    const listData = expenses.slice(0, 20).map(t => ({
      date: t.data,
      shop: t.sprzedawca || 'Nieznany',
      amount: t.kwota,
      category: t.kategoria,
      emoji: CATEGORY_EMOJI[t.kategoria] || '❓',
    }));

    const list = transactionList(listData, 20);

    return {
      text: `💰 *Wydatki powyzej ${amount} zl*\nTen miesiac (${expenses.length} znalezionych)\n\n\`\`\`\n${list}\n\`\`\``,
      keyboard: searchMenuKeyboard(),
    };
  }

  // Last N expenses (with receipt grouping)
  if (action === 'last') {
    const limit = parseInt(params[1] || '10', 10);
    const expenses = await stats.getRecentExpensesGrouped(limit);

    const listData = expenses.map(t => {
      // All items from getRecentExpensesGrouped are GroupedExpense
      const grouped = t as GroupedExpense;
      if (grouped.product_count > 1) {
        // Grouped receipt
        return {
          date: grouped.data,
          shop: grouped.shop || 'Nieznany',
          amount: grouped.total_amount,
          productCount: grouped.product_count,
          receiptId: grouped.receipt_id,
        };
      } else {
        // Single expense
        return {
          date: grouped.data,
          shop: grouped.shop || 'Nieznany',
          amount: grouped.total_amount,
          productCount: 1,
          emoji: '❓',
        };
      }
    });

    const list = groupedTransactionList(listData, limit);

    // Build keyboard with expand buttons for receipts
    const receiptButtons = expenses
      .map(e => e as GroupedExpense)
      .filter(g => g.product_count > 1 && g.receipt_id)
      .slice(0, 5) // Max 5 expand buttons
      .map(grouped => [{
        text: `📋 ${grouped.shop.slice(0, 15)} (${grouped.product_count} prod.)`,
        callback_data: `receipt:${grouped.receipt_id}`,
      }]);

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        ...receiptButtons,
        ...searchMenuKeyboard().inline_keyboard,
      ],
    };

    return {
      text: `📊 *Ostatnie ${limit} wydatkow*\n\n\`\`\`\n${list}\n\`\`\``,
      keyboard,
    };
  }

  return {
    text: '🔍 *WYSZUKIWANIE*\n\nWybierz filtr:',
    keyboard: searchMenuKeyboard(),
  };
}
