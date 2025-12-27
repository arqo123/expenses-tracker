// ASCII chart generation utilities
import { t, formatCurrency } from '../i18n/index.ts';

const FULL_BLOCK = '█';
const EMPTY_BLOCK = '░';
const BAR_WIDTH = 10;

// Format amount with thousands separator
export function formatAmount(amount: number): string {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Generate horizontal bar chart
export function horizontalBar(value: number, max: number, width: number = BAR_WIDTH): string {
  if (max <= 0) return EMPTY_BLOCK.repeat(width);

  const filled = Math.round((value / max) * width);
  const empty = width - filled;

  return FULL_BLOCK.repeat(Math.max(0, filled)) + EMPTY_BLOCK.repeat(Math.max(0, empty));
}

// Monthly trend chart
export interface MonthlyData {
  label: string;
  amount: number;
}

export function monthlyTrendChart(data: MonthlyData[]): string {
  if (data.length === 0) return t('ui.charts.noData');

  const maxAmount = Math.max(...data.map(d => d.amount));
  const minAmount = Math.min(...data.map(d => d.amount));
  const avgAmount = data.reduce((sum, d) => sum + d.amount, 0) / data.length;

  let chart = '';

  for (const item of data) {
    const bar = horizontalBar(item.amount, maxAmount);
    const marker = item.amount === maxAmount ? ' (max)' : item.amount === minAmount ? ' (min)' : '';
    chart += `${item.label}: ${bar} ${formatCurrency(item.amount)}${marker}\n`;
  }

  chart += `\n📈 ${t('ui.charts.average')}: ${formatCurrency(avgAmount)}/mies.`;
  chart += `\n📉 Min: ${formatCurrency(minAmount)}`;
  chart += `\n📈 Max: ${formatCurrency(maxAmount)}`;

  return chart;
}

// Weekday chart
export interface WeekdayData {
  label: string;
  amount: number;
}

export function weekdayChart(data: WeekdayData[]): string {
  if (data.length === 0) return t('ui.charts.noData');

  const maxAmount = Math.max(...data.map(d => d.amount));
  let maxDay = '';
  let maxDayAmount = 0;

  let chart = '';

  for (const item of data) {
    const bar = horizontalBar(item.amount, maxAmount);
    const isMax = item.amount === maxAmount;

    if (isMax) {
      maxDay = item.label;
      maxDayAmount = item.amount;
    }

    chart += `${item.label}: ${bar} ${formatCurrency(item.amount)}${isMax ? ' <--' : ''}\n`;
  }

  chart += `\n📊 Najwiecej wydajesz w: ${maxDay} (${formatCurrency(maxDayAmount)})`;

  return chart;
}

// Category breakdown chart
export interface CategoryData {
  emoji: string;
  category: string;
  amount: number;
  percentage: number;
}

export function categoryBreakdownChart(data: CategoryData[], total: number): string {
  if (data.length === 0) return t('ui.charts.noData');

  const maxAmount = Math.max(...data.map(d => d.amount));

  let chart = '';

  for (const item of data) {
    const bar = horizontalBar(item.amount, maxAmount, 8);
    const percentStr = item.percentage.toFixed(0);
    chart += `${item.emoji} ${item.category.slice(0, 12).padEnd(12)}: ${bar} ${formatCurrency(item.amount)} (${percentStr}%)\n`;
  }

  chart += `\n💰 ${t('ui.charts.total')}: ${formatCurrency(total)}`;

  return chart;
}

// Shop ranking chart
export interface ShopData {
  shop: string;
  amount: number;
  count: number;
}

export function shopRankingChart(data: ShopData[]): string {
  if (data.length === 0) return t('ui.charts.noData');

  const maxAmount = Math.max(...data.map(d => d.amount));

  let chart = '';

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!item) continue;
    const rank = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    const bar = horizontalBar(item.amount, maxAmount, 6);
    const shopName = item.shop.slice(0, 15).padEnd(15);
    chart += `${medal} ${shopName}: ${bar} ${formatCurrency(item.amount)} (${item.count}x)\n`;
  }

  return chart;
}

// User comparison chart
export interface UserData {
  userName: string;
  amount: number;
  percentage: number;
}

export function userComparisonChart(data: UserData[]): string {
  if (data.length === 0) return t('ui.charts.noData');

  const total = data.reduce((sum, d) => sum + d.amount, 0);
  const maxAmount = Math.max(...data.map(d => d.amount));

  let chart = '';

  for (const item of data) {
    const bar = horizontalBar(item.amount, maxAmount, 12);
    const percentStr = item.percentage.toFixed(0);
    chart += `👤 ${item.userName}: ${bar} ${formatCurrency(item.amount)} (${percentStr}%)\n`;
  }

  chart += `\n💰 ${t('ui.charts.total')}: ${formatCurrency(total)}`;

  return chart;
}

// Period comparison chart
export function periodComparisonChart(
  currentAmount: number,
  previousAmount: number,
  currentLabel: string,
  previousLabel: string
): string {
  const maxAmount = Math.max(currentAmount, previousAmount);
  const change = currentAmount - previousAmount;
  const changePercent = previousAmount > 0 ? (change / previousAmount) * 100 : 0;

  const currentBar = horizontalBar(currentAmount, maxAmount, 12);
  const previousBar = horizontalBar(previousAmount, maxAmount, 12);

  let chart = `${previousLabel}: ${previousBar} ${formatCurrency(previousAmount)}\n`;
  chart += `${currentLabel}: ${currentBar} ${formatCurrency(currentAmount)}\n`;
  chart += `\n`;

  if (change > 0) {
    chart += `📈 Wzrost: +${formatCurrency(change)} (+${changePercent.toFixed(0)}%)`;
  } else if (change < 0) {
    chart += `📉 Spadek: ${formatCurrency(change)} (${changePercent.toFixed(0)}%)`;
  } else {
    chart += `➡️ Bez zmian`;
  }

  return chart;
}

// Transaction list formatting
export interface TransactionData {
  date: string;
  shop: string;
  amount: number;
  category: string;
  emoji: string;
}

export function transactionList(data: TransactionData[], limit: number = 10): string {
  if (data.length === 0) return t('ui.stats.noExpenses');

  let list = '';

  for (const item of data.slice(0, limit)) {
    const dateStr = item.date.slice(5); // MM-DD
    const shopStr = item.shop.slice(0, 12).padEnd(12);
    list += `${dateStr} ${item.emoji} ${shopStr} ${formatCurrency(item.amount)}\n`;
  }

  if (data.length > limit) {
    list += `\n${t('ui.query.andMore', { count: data.length - limit })}`;
  }

  return list;
}

// Grouped transaction data for receipts
export interface GroupedTransactionData {
  date: string;
  shop: string;
  amount: number;
  productCount: number;
  receiptId?: string | null;
  emoji?: string;
  category?: string;
}

// Transaction list with receipt grouping support
export function groupedTransactionList(data: (TransactionData | GroupedTransactionData)[], limit: number = 10): string {
  if (data.length === 0) return t('ui.stats.noExpenses');

  let list = '';

  for (const item of data.slice(0, limit)) {
    const dateStr = item.date.slice(5); // MM-DD
    const shopStr = item.shop.slice(0, 12).padEnd(12);

    if ('productCount' in item && item.productCount > 1) {
      // Grouped receipt - show with receipt emoji and product count
      list += `${dateStr} 🧾 ${shopStr} ${formatCurrency(item.amount)} (${item.productCount} prod.)\n`;
    } else {
      // Single expense - show with category emoji
      const emoji = 'emoji' in item ? item.emoji : '❓';
      list += `${dateStr} ${emoji} ${shopStr} ${formatCurrency(item.amount)}\n`;
    }
  }

  if (data.length > limit) {
    list += `\n${t('ui.query.andMore', { count: data.length - limit })}`;
  }

  return list;
}

// Daily average display
export function dailyAverageDisplay(avgDaily: number, daysWithExpenses: number, totalDays: number): string {
  let display = `🎯 ${t('ui.stats.averagePerDay')}\n\n`;
  display += `💰 ${t('ui.stats.averagePerDay')}: ${formatCurrency(avgDaily)}\n`;
  display += `📅 Dni z wydatkami: ${daysWithExpenses}/${totalDays}\n`;
  display += `📊 Aktywnosc: ${((daysWithExpenses / totalDays) * 100).toFixed(0)}%`;

  return display;
}
