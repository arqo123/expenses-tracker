import type { NLPQueryResult, ResponseFormat } from '../types/nlp-query.types.ts';
import { CATEGORY_EMOJI, type ExpenseCategory } from '../types/expense.types.ts';
import { t, formatCurrency } from '../i18n/index.ts';

/**
 * Format query result for different output formats
 */
export function formatQueryResponse(
  result: NLPQueryResult,
  format: ResponseFormat
): string | object {
  if (format === 'json') {
    return result;
  }

  if (!result.success) {
    return format === 'telegram'
      ? t('ui.query.processingFailed')
      : `## ${t('ui.errors.error')}\n${t('ui.query.processingFailed')}`;
  }

  const { data, query } = result;
  const periodDesc = query.dateRange?.description || 'wybrany okres';

  let text = '';

  // Build response based on intent
  switch (query.intent) {
    case 'sum':
      text = formatSumResponse(data, periodDesc, query);
      break;

    case 'count':
      text = formatCountResponse(data, periodDesc, query);
      break;

    case 'average':
      text = formatAverageResponse(data, periodDesc, query);
      break;

    case 'top':
      text = formatTopResponse(data, periodDesc, query);
      break;

    case 'list':
    default:
      text = formatListResponse(data, periodDesc, query);
  }

  // Add exclusion info if present
  if (query.categories?.exclude?.length) {
    text += `\n\n_${t('ui.query.excluded', { items: query.categories.exclude.join(', ') })}_`;
  }

  if (query.shops?.exclude?.length) {
    text += `\n\n_${t('ui.query.withoutShops', { items: query.shops.exclude.join(', ') })}_`;
  }

  if (format === 'telegram') {
    // Convert markdown bold to Telegram-safe format
    return text.replace(/\*\*/g, '*');
  }

  return text;
}

function formatSumResponse(
  data: NLPQueryResult['data'],
  periodDesc: string,
  query: NLPQueryResult['query']
): string {
  let title = t('ui.query.sumTitle');

  // Add category/shop context if filtered
  if (query.categories?.include?.length) {
    title += ` (${query.categories.include.join(', ')})`;
  }
  if (query.shops?.include?.length) {
    title += ` w ${query.shops.include.join(', ')}`;
  }

  let text = `**${title}** - ${periodDesc}\n\n`;
  text += `${t('ui.query.totalLabel')} **${formatCurrency(data.total || 0)}**\n`;
  text += `${t('ui.query.transactionsLabel')} ${data.count || 0}`;

  if (data.count && data.count > 0 && data.total) {
    const avg = data.total / data.count;
    text += `\n${t('ui.query.averageLabel')} ${formatCurrency(avg)}`;
  }

  // Add category breakdown with emojis if available
  if (data.items && data.items.length > 0) {
    text += '\n';
    data.items.slice(0, 5).forEach((item) => {
      const emoji = getEmojiForLabel(item.label, 'category');
      const pct = item.percentage ? ` (${item.percentage.toFixed(0)}%)` : '';
      text += `\n${emoji} ${item.label}: ${formatCurrency(item.amount)}${pct}`;
    });
    if (data.items.length > 5) {
      text += `\n_${t('ui.query.andMore', { count: data.items.length - 5 })}_`;
    }
  }

  return text;
}

function formatCountResponse(
  data: NLPQueryResult['data'],
  periodDesc: string,
  query: NLPQueryResult['query']
): string {
  let title = t('ui.query.countTitle');

  if (query.categories?.include?.length) {
    title += ` (${query.categories.include.join(', ')})`;
  }
  if (query.shops?.include?.length) {
    title += ` w ${query.shops.include.join(', ')}`;
  }

  let text = `**${title}** - ${periodDesc}\n\n`;
  text += `${t('ui.query.transactionsLabel')} **${data.count || 0}**\n`;
  text += `${t('ui.query.totalLabel')} ${formatCurrency(data.total || 0)}`;

  return text;
}

function formatAverageResponse(
  data: NLPQueryResult['data'],
  periodDesc: string,
  query: NLPQueryResult['query']
): string {
  let title = t('ui.query.averageTitle');

  if (query.categories?.include?.length) {
    title += ` (${query.categories.include.join(', ')})`;
  }
  if (query.shops?.include?.length) {
    title += ` w ${query.shops.include.join(', ')}`;
  }

  let text = `**${title}** - ${periodDesc}\n\n`;
  text += `${t('ui.query.averageLabel')} **${formatCurrency(data.average || 0)}**\n`;
  text += `${t('ui.query.sumLabel')} ${formatCurrency(data.total || 0)} (${data.count || 0} ${t('ui.stats.transactions')})`;

  return text;
}

function formatTopResponse(
  data: NLPQueryResult['data'],
  periodDesc: string,
  query: NLPQueryResult['query']
): string {
  const limit = query.aggregation?.limit || 5;
  const groupBy = query.aggregation?.groupBy || 'category';
  const groupLabel = groupBy === 'category' ? t('ui.stats.topCategories').toLowerCase() : t('ui.stats.topShops').toLowerCase();

  let text = `**Top ${limit} ${groupLabel}** - ${periodDesc}\n\n`;

  if (data.items && data.items.length > 0) {
    text += `${t('ui.query.totalLabel')} **${formatCurrency(data.total || 0)}**\n\n`;

    data.items.forEach((item, idx) => {
      const emoji = getEmojiForLabel(item.label, groupBy);
      const medal = getMedal(idx);
      const pct = item.percentage ? ` (${item.percentage.toFixed(1)}%)` : '';

      text += `${medal} ${emoji} ${item.label}: ${formatCurrency(item.amount)}${pct}\n`;
    });
  } else {
    text += t('ui.stats.noData');
  }

  return text;
}

function formatListResponse(
  data: NLPQueryResult['data'],
  periodDesc: string,
  query: NLPQueryResult['query']
): string {
  let title = t('ui.query.sumTitle').split(' ')[0]; // "Suma" -> just the expense concept

  if (query.categories?.include?.length) {
    title += ` - ${query.categories.include.join(', ')}`;
  }
  if (query.shops?.include?.length) {
    title += ` w ${query.shops.include.join(', ')}`;
  }

  let text = `**${title}** - ${periodDesc}\n\n`;

  if (data.items && data.items.length > 0) {
    text += `${t('ui.query.totalLabel')} **${formatCurrency(data.total || 0)}** (${data.count || 0} ${t('ui.stats.transactions')})\n\n`;

    // Show top 10 categories
    const displayItems = data.items.slice(0, 10);
    displayItems.forEach((item) => {
      const emoji = getEmojiForLabel(item.label, 'category');
      const pct = item.percentage ? ` (${item.percentage.toFixed(1)}%)` : '';
      const countStr = item.count > 1 ? ` x${item.count}` : '';

      text += `${emoji} ${item.label}: ${formatCurrency(item.amount)}${pct}${countStr}\n`;
    });

    if (data.items.length > 10) {
      text += `\n_${t('ui.query.andMore', { count: data.items.length - 10 })}_`;
    }
  } else {
    text += t('ui.stats.noExpenses');
  }

  return text;
}

function getEmojiForLabel(label: string, groupBy: string): string {
  if (groupBy === 'category') {
    return CATEGORY_EMOJI[label as ExpenseCategory] || '';
  }
  // For shops, use a generic shop emoji
  return '';
}

function getMedal(index: number): string {
  switch (index) {
    case 0:
      return '1.';
    case 1:
      return '2.';
    case 2:
      return '3.';
    default:
      return `${index + 1}.`;
  }
}

/**
 * Format a short confirmation message for low-confidence queries
 */
export function formatLowConfidenceMessage(): string {
  return t('ui.query.processingFailed');
}
