import { StatsService } from './stats.service.ts';
import type { DatabaseService } from './database.service.ts';
import {
  formatAmount,
  categoryBreakdownChart,
  shopRankingChart,
  userComparisonChart,
  monthlyTrendChart,
} from '../utils/charts.ts';

const MONTH_NAMES = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paz', 'Lis', 'Gru'];
const FULL_MONTH_NAMES = ['Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien'];

export class ReportsService {
  private stats: StatsService;

  constructor(stats: StatsService, _database: DatabaseService) {
    this.stats = stats;
  }

  // ==================== WEEKLY REPORT ====================

  async generateWeeklyReport(): Promise<string> {
    // Get date range for last complete week (Monday-Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay() || 7; // Monday = 1, Sunday = 7

    // Last Sunday
    const lastSunday = new Date(now);
    lastSunday.setDate(now.getDate() - dayOfWeek);

    // Last Monday
    const lastMonday = new Date(lastSunday);
    lastMonday.setDate(lastSunday.getDate() - 6);

    // Format date range for display
    const startDay = lastMonday.getDate();
    const endDay = lastSunday.getDate();
    const startMonth = MONTH_NAMES[lastMonday.getMonth()];
    const endMonth = MONTH_NAMES[lastSunday.getMonth()];
    const dateRange = startMonth === endMonth
      ? `${startDay}-${endDay} ${startMonth}`
      : `${startDay} ${startMonth} - ${endDay} ${endMonth}`;

    // Get statistics
    const summary = await this.stats.getSummary('lastweek');
    const previousComparison = await this.stats.getPeriodComparison('lastweek');
    const categories = await this.stats.getCategoryStats('lastweek', 3);
    const users = await this.stats.getUserComparison('lastweek');

    // Build report
    let report = `📊 *RAPORT TYGODNIOWY*\n`;
    report += `📅 ${dateRange} ${lastSunday.getFullYear()}\n\n`;

    // Summary
    report += `💰 *Suma:* ${formatAmount(summary.totalAmount)} zl\n`;
    report += `📊 Transakcji: ${summary.totalCount}\n`;

    // Comparison with previous week
    const change = previousComparison.change;
    const changePercent = previousComparison.changePercent;
    if (change > 0) {
      report += `📈 vs poprzedni tydz.: *+${changePercent.toFixed(0)}%* (+${formatAmount(change)} zl)\n`;
    } else if (change < 0) {
      report += `📉 vs poprzedni tydz.: *${changePercent.toFixed(0)}%* (${formatAmount(change)} zl)\n`;
    } else {
      report += `➡️ vs poprzedni tydz.: bez zmian\n`;
    }

    // Top 3 categories
    if (categories.length > 0) {
      report += `\n📁 *TOP 3 Kategorie:*\n`;
      report += '```\n';
      report += categoryBreakdownChart(
        categories.map(c => ({
          emoji: c.emoji,
          category: c.category,
          amount: c.amount,
          percentage: c.percentage,
        })),
        summary.totalAmount
      ).split('\n').slice(0, 3).join('\n');
      report += '\n```\n';
    }

    // User comparison
    if (users.users.length > 0) {
      report += `\n👥 *Podzial:*\n`;
      report += '```\n';
      report += userComparisonChart(users.users);
      report += '\n```';
    }

    return report;
  }

  // ==================== MONTHLY REPORT ====================

  async generateMonthlyReport(): Promise<string> {
    // Get last complete month
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const monthName = FULL_MONTH_NAMES[lastMonth.getMonth()];
    const year = lastMonth.getFullYear();

    // Get statistics
    const summary = await this.stats.getSummary('lastmonth');
    const previousComparison = await this.stats.getPeriodComparison('lastmonth');
    const categories = await this.stats.getCategoryStats('lastmonth', 5);
    const shops = await this.stats.getShopStats('lastmonth', 5);
    const users = await this.stats.getUserComparison('lastmonth');
    const dailyAvg = await this.stats.getDailyAverage('lastmonth');

    // Build report
    let report = `📊 *RAPORT MIESIECZNY*\n`;
    report += `📅 ${monthName} ${year}\n\n`;

    // Summary
    report += `💰 *Suma:* ${formatAmount(summary.totalAmount)} zl\n`;
    report += `📊 Transakcji: ${summary.totalCount}\n`;
    report += `📈 Srednio/dzien: ${formatAmount(dailyAvg.avgDaily)} zl\n`;

    // Comparison with previous month
    const change = previousComparison.change;
    const changePercent = previousComparison.changePercent;
    if (change > 0) {
      report += `📈 vs poprzedni mies.: *+${changePercent.toFixed(0)}%* (+${formatAmount(change)} zl)\n`;
    } else if (change < 0) {
      report += `📉 vs poprzedni mies.: *${changePercent.toFixed(0)}%* (${formatAmount(change)} zl)\n`;
    } else {
      report += `➡️ vs poprzedni mies.: bez zmian\n`;
    }

    // Top 5 categories
    if (categories.length > 0) {
      report += `\n📁 *TOP 5 Kategorie:*\n`;
      report += '```\n';
      report += categoryBreakdownChart(
        categories.map(c => ({
          emoji: c.emoji,
          category: c.category,
          amount: c.amount,
          percentage: c.percentage,
        })),
        summary.totalAmount
      ).split('\n').slice(0, 5).join('\n');
      report += '\n```\n';
    }

    // Top 5 shops
    if (shops.length > 0) {
      report += `\n🏪 *TOP 5 Sklepy:*\n`;
      report += '```\n';
      report += shopRankingChart(shops.slice(0, 5));
      report += '\n```\n';
    }

    // User comparison
    if (users.users.length > 0) {
      report += `\n👥 *Podzial:*\n`;
      report += '```\n';
      report += userComparisonChart(users.users);
      report += '\n```';
    }

    return report;
  }

  // ==================== YEARLY REPORT ====================

  async generateYearlyReport(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();

    // Get statistics for current year
    const summary = await this.stats.getSummary('year');
    const categories = await this.stats.getCategoryStats('year', 10);
    const shops = await this.stats.getShopStats('year', 10);
    const users = await this.stats.getUserComparison('year');
    const monthlyTrend = await this.stats.getMonthlyTrend(12);

    // Calculate previous year comparison manually
    const prevYearStart = new Date(year - 1, 0, 1).toISOString().slice(0, 10);
    const prevYearEnd = new Date(year - 1, 11, 31).toISOString().slice(0, 10);
    const prevYearExpenses = await this.stats.getAllExpenses(prevYearStart, prevYearEnd);
    const prevYearTotal = prevYearExpenses.reduce((sum, e) => sum + e.kwota, 0);

    const change = summary.totalAmount - prevYearTotal;
    const changePercent = prevYearTotal > 0 ? (change / prevYearTotal) * 100 : 0;

    // Find record month
    const recordMonth = monthlyTrend.reduce((max, m) =>
      m.amount > max.amount ? m : max,
      monthlyTrend[0] || { label: '-', amount: 0 }
    );

    // Build report
    let report = `📊 *RAPORT ROCZNY*\n`;
    report += `📅 Rok ${year}\n\n`;

    // Summary
    report += `💰 *Suma roczna:* ${formatAmount(summary.totalAmount)} zl\n`;
    report += `📊 Transakcji: ${summary.totalCount}\n`;
    report += `📈 Srednio/mies.: ${formatAmount(summary.totalAmount / 12)} zl\n`;

    // Comparison with previous year
    if (prevYearTotal > 0) {
      if (change > 0) {
        report += `📈 vs ${year - 1}: *+${changePercent.toFixed(0)}%* (+${formatAmount(change)} zl)\n`;
      } else if (change < 0) {
        report += `📉 vs ${year - 1}: *${changePercent.toFixed(0)}%* (${formatAmount(change)} zl)\n`;
      } else {
        report += `➡️ vs ${year - 1}: bez zmian\n`;
      }
    }

    // Record month
    if (recordMonth && recordMonth.amount > 0) {
      report += `\n🏆 *Rekord:* ${recordMonth.label} (${formatAmount(recordMonth.amount)} zl)\n`;
    }

    // Monthly trend
    if (monthlyTrend.length > 0) {
      report += `\n📈 *Trend miesieczny:*\n`;
      report += '```\n';
      report += monthlyTrendChart(monthlyTrend);
      report += '\n```\n';
    }

    // Top 10 categories
    if (categories.length > 0) {
      report += `\n📁 *TOP 10 Kategorie:*\n`;
      report += '```\n';
      const catChart = categoryBreakdownChart(
        categories.map(c => ({
          emoji: c.emoji,
          category: c.category,
          amount: c.amount,
          percentage: c.percentage,
        })),
        summary.totalAmount
      );
      // Take first 10 lines (categories only, not total)
      report += catChart.split('\n').slice(0, 10).join('\n');
      report += '\n```\n';
    }

    // Top 10 shops
    if (shops.length > 0) {
      report += `\n🏪 *TOP 10 Sklepy:*\n`;
      report += '```\n';
      report += shopRankingChart(shops.slice(0, 10));
      report += '\n```\n';
    }

    // User comparison
    if (users.users.length > 0) {
      report += `\n👥 *Podzial roczny:*\n`;
      report += '```\n';
      report += userComparisonChart(users.users);
      report += '\n```';
    }

    return report;
  }
}
