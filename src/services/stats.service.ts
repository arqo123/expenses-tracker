import type { DatabaseService } from './database.service.ts';
import type { Expense, ExpenseCategory, ExpenseOrGroup } from '../types/expense.types.ts';
import { CATEGORY_EMOJI } from '../types/expense.types.ts';

// Period type for queries
export type Period = 'today' | 'yesterday' | 'week' | 'lastweek' | 'month' | 'lastmonth' | 'year' | '30days' | 'all';

// Period date range
export interface DateRange {
  start: string;
  end: string;
  label: string;
}

// Category stats
export interface CategoryStats {
  category: ExpenseCategory;
  emoji: string;
  amount: number;
  count: number;
  percentage: number;
}

// Shop stats
export interface ShopStats {
  shop: string;
  amount: number;
  count: number;
  avgAmount: number;
}

// User stats
export interface UserStats {
  userName: string;
  amount: number;
  count: number;
  percentage: number;
}

// Monthly stats
export interface MonthlyStats {
  month: string;
  label: string;
  amount: number;
  count: number;
}

// Weekday stats
export interface WeekdayStats {
  day: number;
  label: string;
  amount: number;
  count: number;
}

// Summary stats
export interface SummaryStats {
  totalAmount: number;
  totalCount: number;
  avgDaily: number;
  period: DateRange;
}

export class StatsService {
  constructor(private database: DatabaseService) {}

  // ==================== DATE RANGE HELPERS ====================

  getDateRange(period: Period): DateRange {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    switch (period) {
      case 'today':
        return { start: today, end: today, label: 'Dzisiaj' };

      case 'yesterday': {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yd = yesterday.toISOString().slice(0, 10);
        return { start: yd, end: yd, label: 'Wczoraj' };
      }

      case 'week': {
        const dayOfWeek = now.getDay() || 7; // Monday = 1
        const monday = new Date(now);
        monday.setDate(now.getDate() - dayOfWeek + 1);
        return {
          start: monday.toISOString().slice(0, 10),
          end: today,
          label: 'Ten tydzien',
        };
      }

      case 'lastweek': {
        const dayOfWeek = now.getDay() || 7;
        const lastMonday = new Date(now);
        lastMonday.setDate(now.getDate() - dayOfWeek - 6);
        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastMonday.getDate() + 6);
        return {
          start: lastMonday.toISOString().slice(0, 10),
          end: lastSunday.toISOString().slice(0, 10),
          label: 'Zeszly tydzien',
        };
      }

      case 'month': {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
          start: firstDay.toISOString().slice(0, 10),
          end: today,
          label: 'Ten miesiac',
        };
      }

      case 'lastmonth': {
        const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        return {
          start: firstDay.toISOString().slice(0, 10),
          end: lastDay.toISOString().slice(0, 10),
          label: 'Zeszly miesiac',
        };
      }

      case 'year': {
        const firstDay = new Date(now.getFullYear(), 0, 1);
        return {
          start: firstDay.toISOString().slice(0, 10),
          end: today,
          label: 'Ten rok',
        };
      }

      case '30days': {
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        return {
          start: thirtyDaysAgo.toISOString().slice(0, 10),
          end: today,
          label: 'Ostatnie 30 dni',
        };
      }

      case 'all': {
        return {
          start: '2000-01-01',
          end: today,
          label: 'Od poczatku',
        };
      }

      default:
        return { start: today, end: today, label: 'Dzisiaj' };
    }
  }

  getPreviousPeriod(period: Period): DateRange {
    const current = this.getDateRange(period);
    const startDate = new Date(current.start);
    const endDate = new Date(current.end);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);

    return {
      start: prevStart.toISOString().slice(0, 10),
      end: prevEnd.toISOString().slice(0, 10),
      label: 'Poprzedni okres',
    };
  }

  // ==================== DATA FETCHING ====================

  async getExpenses(period: Period, userName?: string, category?: string): Promise<Expense[]> {
    const range = this.getDateRange(period);

    // Get all users if no specific user
    if (!userName) {
      const allExpenses = await this.getAllExpenses(range.start, range.end, category);
      return allExpenses;
    }

    return this.database.queryExpenses(userName, range.start, range.end, category);
  }

  async getAllExpenses(startDate: string, endDate: string, category?: string): Promise<Expense[]> {
    // Query for both users
    const arekExpenses = await this.database.queryExpenses('Arek', startDate, endDate, category);
    const nastkaExpenses = await this.database.queryExpenses('Nastka', startDate, endDate, category);
    return [...arekExpenses, ...nastkaExpenses];
  }

  // Count unique transactions (group by receipt_id for multi-item receipts)
  private countTransactions(expenses: Expense[]): number {
    const receiptIds = new Set<string>();
    let singleItemCount = 0;

    for (const expense of expenses) {
      if (expense.receipt_id) {
        receiptIds.add(expense.receipt_id);
      } else {
        singleItemCount++;
      }
    }
    return receiptIds.size + singleItemCount;
  }

  // ==================== SUMMARY ====================

  async getSummary(period: Period): Promise<SummaryStats> {
    const range = this.getDateRange(period);
    const expenses = await this.getAllExpenses(range.start, range.end);

    const totalAmount = expenses.reduce((sum, e) => sum + e.kwota, 0);
    const totalCount = this.countTransactions(expenses);

    // Calculate days in period
    const startDate = new Date(range.start);
    const endDate = new Date(range.end);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return {
      totalAmount,
      totalCount,
      avgDaily: days > 0 ? totalAmount / days : 0,
      period: range,
    };
  }

  // ==================== CATEGORIES ====================

  async getCategoryStats(period: Period, limit?: number): Promise<CategoryStats[]> {
    const expenses = await this.getExpenses(period);

    // Group by category (track receipt_ids to count transactions, not items)
    const byCategory = new Map<string, { amount: number; singleCount: number; receiptIds: Set<string> }>();
    let total = 0;

    for (const expense of expenses) {
      const cat = expense.kategoria;
      const existing = byCategory.get(cat) || { amount: 0, singleCount: 0, receiptIds: new Set() };
      existing.amount += expense.kwota;
      if (expense.receipt_id) {
        existing.receiptIds.add(expense.receipt_id);
      } else {
        existing.singleCount += 1;
      }
      byCategory.set(cat, existing);
      total += expense.kwota;
    }

    // Convert to array and sort
    const stats: CategoryStats[] = [];
    for (const [category, data] of byCategory) {
      stats.push({
        category: category as ExpenseCategory,
        emoji: CATEGORY_EMOJI[category as ExpenseCategory] || '❓',
        amount: data.amount,
        count: data.singleCount + data.receiptIds.size,
        percentage: total > 0 ? (data.amount / total) * 100 : 0,
      });
    }

    stats.sort((a, b) => b.amount - a.amount);

    return limit ? stats.slice(0, limit) : stats;
  }

  async getCategoryDetails(category: string, period: Period): Promise<{
    stats: CategoryStats;
    topShops: ShopStats[];
    summary: SummaryStats;
  }> {
    const range = this.getDateRange(period);
    const expenses = await this.getAllExpenses(range.start, range.end, category);

    const totalAmount = expenses.reduce((sum, e) => sum + e.kwota, 0);
    const totalCount = this.countTransactions(expenses);

    // Days in period
    const startDate = new Date(range.start);
    const endDate = new Date(range.end);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Top shops in category (group by receipt_id for transaction count)
    const shopMap = new Map<string, { amount: number; singleCount: number; receiptIds: Set<string> }>();
    for (const expense of expenses) {
      const shop = expense.sprzedawca || 'Nieznany';
      const existing = shopMap.get(shop) || { amount: 0, singleCount: 0, receiptIds: new Set() };
      existing.amount += expense.kwota;
      if (expense.receipt_id) {
        existing.receiptIds.add(expense.receipt_id);
      } else {
        existing.singleCount += 1;
      }
      shopMap.set(shop, existing);
    }

    const topShops: ShopStats[] = [];
    for (const [shop, data] of shopMap) {
      const count = data.singleCount + data.receiptIds.size;
      topShops.push({
        shop,
        amount: data.amount,
        count,
        avgAmount: count > 0 ? data.amount / count : 0,
      });
    }
    topShops.sort((a, b) => b.amount - a.amount);

    return {
      stats: {
        category: category as ExpenseCategory,
        emoji: CATEGORY_EMOJI[category as ExpenseCategory] || '❓',
        amount: totalAmount,
        count: totalCount,
        percentage: 100,
      },
      topShops: topShops.slice(0, 5),
      summary: {
        totalAmount,
        totalCount,
        avgDaily: days > 0 ? totalAmount / days : 0,
        period: range,
      },
    };
  }

  // ==================== SHOPS ====================

  async getShopStats(period: Period, limit: number = 10): Promise<ShopStats[]> {
    const expenses = await this.getExpenses(period);

    // Group by shop (track receipt_ids for transaction count)
    const byShop = new Map<string, { amount: number; singleCount: number; receiptIds: Set<string> }>();

    for (const expense of expenses) {
      const shop = expense.sprzedawca || 'Nieznany';
      const existing = byShop.get(shop) || { amount: 0, singleCount: 0, receiptIds: new Set() };
      existing.amount += expense.kwota;
      if (expense.receipt_id) {
        existing.receiptIds.add(expense.receipt_id);
      } else {
        existing.singleCount += 1;
      }
      byShop.set(shop, existing);
    }

    // Convert to array and sort
    const stats: ShopStats[] = [];
    for (const [shop, data] of byShop) {
      const count = data.singleCount + data.receiptIds.size;
      stats.push({
        shop,
        amount: data.amount,
        count,
        avgAmount: count > 0 ? data.amount / count : 0,
      });
    }

    stats.sort((a, b) => b.amount - a.amount);
    return stats.slice(0, limit);
  }

  async getShopDetails(shop: string, period: Period): Promise<{
    stats: ShopStats;
    allTimeStats: ShopStats;
  }> {
    const range = this.getDateRange(period);
    const periodExpenses = await this.getAllExpenses(range.start, range.end);
    const filteredPeriod = periodExpenses.filter(e =>
      e.sprzedawca?.toLowerCase().includes(shop.toLowerCase())
    );

    // All time stats
    const allTimeRange = this.getDateRange('year');
    const allExpenses = await this.getAllExpenses(allTimeRange.start, allTimeRange.end);
    const filteredAll = allExpenses.filter(e =>
      e.sprzedawca?.toLowerCase().includes(shop.toLowerCase())
    );

    const periodAmount = filteredPeriod.reduce((sum, e) => sum + e.kwota, 0);
    const allAmount = filteredAll.reduce((sum, e) => sum + e.kwota, 0);

    return {
      stats: {
        shop,
        amount: periodAmount,
        count: filteredPeriod.length,
        avgAmount: filteredPeriod.length > 0 ? periodAmount / filteredPeriod.length : 0,
      },
      allTimeStats: {
        shop,
        amount: allAmount,
        count: filteredAll.length,
        avgAmount: filteredAll.length > 0 ? allAmount / filteredAll.length : 0,
      },
    };
  }

  // ==================== USERS COMPARISON ====================

  async getUserComparison(period: Period): Promise<{
    users: UserStats[];
    total: number;
    period: DateRange;
  }> {
    const range = this.getDateRange(period);

    const arekExpenses = await this.database.queryExpenses('Arek', range.start, range.end);
    const nastkaExpenses = await this.database.queryExpenses('Nastka', range.start, range.end);

    const arekTotal = arekExpenses.reduce((sum, e) => sum + e.kwota, 0);
    const nastkaTotal = nastkaExpenses.reduce((sum, e) => sum + e.kwota, 0);
    const total = arekTotal + nastkaTotal;

    return {
      users: [
        {
          userName: 'Arek',
          amount: arekTotal,
          count: this.countTransactions(arekExpenses),
          percentage: total > 0 ? (arekTotal / total) * 100 : 0,
        },
        {
          userName: 'Nastka',
          amount: nastkaTotal,
          count: this.countTransactions(nastkaExpenses),
          percentage: total > 0 ? (nastkaTotal / total) * 100 : 0,
        },
      ],
      total,
      period: range,
    };
  }

  async getUserCategoryComparison(period: Period): Promise<{
    arek: CategoryStats[];
    nastka: CategoryStats[];
    period: DateRange;
  }> {
    const range = this.getDateRange(period);

    const arekExpenses = await this.database.queryExpenses('Arek', range.start, range.end);
    const nastkaExpenses = await this.database.queryExpenses('Nastka', range.start, range.end);

    const getCategoryStats = (expenses: Expense[]): CategoryStats[] => {
      const byCategory = new Map<string, { amount: number; singleCount: number; receiptIds: Set<string> }>();
      let total = 0;

      for (const expense of expenses) {
        const cat = expense.kategoria;
        const existing = byCategory.get(cat) || { amount: 0, singleCount: 0, receiptIds: new Set() };
        existing.amount += expense.kwota;
        if (expense.receipt_id) {
          existing.receiptIds.add(expense.receipt_id);
        } else {
          existing.singleCount += 1;
        }
        byCategory.set(cat, existing);
        total += expense.kwota;
      }

      const stats: CategoryStats[] = [];
      for (const [category, data] of byCategory) {
        stats.push({
          category: category as ExpenseCategory,
          emoji: CATEGORY_EMOJI[category as ExpenseCategory] || '❓',
          amount: data.amount,
          count: data.singleCount + data.receiptIds.size,
          percentage: total > 0 ? (data.amount / total) * 100 : 0,
        });
      }

      stats.sort((a, b) => b.amount - a.amount);
      return stats.slice(0, 5);
    };

    return {
      arek: getCategoryStats(arekExpenses),
      nastka: getCategoryStats(nastkaExpenses),
      period: range,
    };
  }

  // ==================== TRENDS ====================

  async getMonthlyTrend(months: number = 6): Promise<MonthlyStats[]> {
    const now = new Date();
    const stats: MonthlyStats[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const expenses = await this.getAllExpenses(
        firstDay.toISOString().slice(0, 10),
        lastDay.toISOString().slice(0, 10)
      );

      const monthNames = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paz', 'Lis', 'Gru'];

      stats.push({
        month: firstDay.toISOString().slice(0, 10).slice(0, 7),
        label: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
        amount: expenses.reduce((sum, e) => sum + e.kwota, 0),
        count: this.countTransactions(expenses),
      });
    }

    return stats;
  }

  async getWeekdayStats(period: Period = 'month'): Promise<WeekdayStats[]> {
    const expenses = await this.getExpenses(period);
    const weekdays = ['Nie', 'Pon', 'Wto', 'Sro', 'Czw', 'Pia', 'Sob'];

    // Initialize stats for each day (track receipt_ids for transaction count)
    const statsWithReceipts = weekdays.map((label, day) => ({
      day,
      label,
      amount: 0,
      singleCount: 0,
      receiptIds: new Set<string>(),
    }));

    // Aggregate by weekday
    for (const expense of expenses) {
      const date = new Date(expense.data);
      const dayOfWeek = date.getDay();
      const dayStat = statsWithReceipts[dayOfWeek];
      if (dayStat) {
        dayStat.amount += expense.kwota;
        if (expense.receipt_id) {
          dayStat.receiptIds.add(expense.receipt_id);
        } else {
          dayStat.singleCount += 1;
        }
      }
    }

    // Convert to WeekdayStats
    const stats: WeekdayStats[] = statsWithReceipts.map(s => ({
      day: s.day,
      label: s.label,
      amount: s.amount,
      count: s.singleCount + s.receiptIds.size,
    }));

    // Reorder to start from Monday (Monday first, Sunday last)
    const sunday = stats[0];
    const mondayToSaturday = stats.slice(1);
    if (sunday) {
      return [...mondayToSaturday, sunday];
    }
    return mondayToSaturday;
  }

  async getDailyAverage(period: Period): Promise<{
    avgDaily: number;
    period: DateRange;
    daysWithExpenses: number;
    totalDays: number;
  }> {
    const range = this.getDateRange(period);
    const expenses = await this.getExpenses(period);

    const totalAmount = expenses.reduce((sum, e) => sum + e.kwota, 0);

    // Count unique days with expenses
    const uniqueDays = new Set(expenses.map(e => e.data));

    // Total days in period
    const startDate = new Date(range.start);
    const endDate = new Date(range.end);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return {
      avgDaily: totalDays > 0 ? totalAmount / totalDays : 0,
      period: range,
      daysWithExpenses: uniqueDays.size,
      totalDays,
    };
  }

  // ==================== SEARCH ====================

  async getExpensesAbove(amount: number, period: Period = 'month'): Promise<Expense[]> {
    const expenses = await this.getExpenses(period);
    return expenses
      .filter(e => e.kwota >= amount)
      .sort((a, b) => b.kwota - a.kwota);
  }

  async getRecentExpenses(limit: number): Promise<Expense[]> {
    const arek = await this.database.getRecentExpenses('Arek', limit);
    const nastka = await this.database.getRecentExpenses('Nastka', limit);

    return [...arek, ...nastka]
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
      .slice(0, limit);
  }

  // Get recent expenses with receipt grouping for statistics display
  async getRecentExpensesGrouped(limit: number): Promise<ExpenseOrGroup[]> {
    const arek = await this.database.getRecentExpensesGrouped('Arek', limit);
    const nastka = await this.database.getRecentExpensesGrouped('Nastka', limit);

    return [...arek, ...nastka]
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
      .slice(0, limit);
  }

  async getTransactionsList(period: Period, category?: string, shop?: string, limit: number = 20): Promise<Expense[]> {
    const range = this.getDateRange(period);
    let expenses = await this.getAllExpenses(range.start, range.end, category);

    if (shop) {
      expenses = expenses.filter(e =>
        e.sprzedawca?.toLowerCase().includes(shop.toLowerCase())
      );
    }

    return expenses
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
      .slice(0, limit);
  }

  // ==================== COMPARISON ====================

  async getPeriodComparison(period: Period): Promise<{
    current: SummaryStats;
    previous: SummaryStats;
    change: number;
    changePercent: number;
  }> {
    const currentRange = this.getDateRange(period);
    const previousRange = this.getPreviousPeriod(period);

    const currentExpenses = await this.getAllExpenses(currentRange.start, currentRange.end);
    const previousExpenses = await this.getAllExpenses(previousRange.start, previousRange.end);

    const currentTotal = currentExpenses.reduce((sum, e) => sum + e.kwota, 0);
    const previousTotal = previousExpenses.reduce((sum, e) => sum + e.kwota, 0);

    // Calculate days
    const currentDays = Math.ceil(
      (new Date(currentRange.end).getTime() - new Date(currentRange.start).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
    const previousDays = Math.ceil(
      (new Date(previousRange.end).getTime() - new Date(previousRange.start).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    return {
      current: {
        totalAmount: currentTotal,
        totalCount: currentExpenses.length,
        avgDaily: currentDays > 0 ? currentTotal / currentDays : 0,
        period: currentRange,
      },
      previous: {
        totalAmount: previousTotal,
        totalCount: previousExpenses.length,
        avgDaily: previousDays > 0 ? previousTotal / previousDays : 0,
        period: previousRange,
      },
      change: currentTotal - previousTotal,
      changePercent: previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0,
    };
  }
}
