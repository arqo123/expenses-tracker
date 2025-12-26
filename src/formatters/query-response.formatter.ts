import type { NLPQueryResult, ResponseFormat, QueryResultItem } from '../types/nlp-query.types.ts';
import { CATEGORY_EMOJI, type ExpenseCategory } from '../types/expense.types.ts';

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
      ? 'Nie udalo sie przetworzyc zapytania. Sprobuj ponownie.'
      : '## Blad\nNie udalo sie przetworzyc zapytania.';
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
    text += `\n\n_Wykluczono: ${query.categories.exclude.join(', ')}_`;
  }

  if (query.shops?.exclude?.length) {
    text += `\n\n_Bez sklepow: ${query.shops.exclude.join(', ')}_`;
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
  let title = 'Suma wydatkow';

  // Add category/shop context if filtered
  if (query.categories?.include?.length) {
    title += ` (${query.categories.include.join(', ')})`;
  }
  if (query.shops?.include?.length) {
    title += ` w ${query.shops.include.join(', ')}`;
  }

  let text = `**${title}** - ${periodDesc}\n\n`;
  text += `Lacznie: **${formatAmount(data.total || 0)}**\n`;
  text += `Transakcji: ${data.count || 0}`;

  if (data.count && data.count > 0 && data.total) {
    const avg = data.total / data.count;
    text += `\nSrednia: ${formatAmount(avg)}`;
  }

  return text;
}

function formatCountResponse(
  data: NLPQueryResult['data'],
  periodDesc: string,
  query: NLPQueryResult['query']
): string {
  let title = 'Liczba wydatkow';

  if (query.categories?.include?.length) {
    title += ` (${query.categories.include.join(', ')})`;
  }
  if (query.shops?.include?.length) {
    title += ` w ${query.shops.include.join(', ')}`;
  }

  let text = `**${title}** - ${periodDesc}\n\n`;
  text += `Transakcji: **${data.count || 0}**\n`;
  text += `Laczna kwota: ${formatAmount(data.total || 0)}`;

  return text;
}

function formatAverageResponse(
  data: NLPQueryResult['data'],
  periodDesc: string,
  query: NLPQueryResult['query']
): string {
  let title = 'Srednia wydatkow';

  if (query.categories?.include?.length) {
    title += ` (${query.categories.include.join(', ')})`;
  }
  if (query.shops?.include?.length) {
    title += ` w ${query.shops.include.join(', ')}`;
  }

  let text = `**${title}** - ${periodDesc}\n\n`;
  text += `Srednia: **${formatAmount(data.average || 0)}**\n`;
  text += `Suma: ${formatAmount(data.total || 0)} (${data.count || 0} transakcji)`;

  return text;
}

function formatTopResponse(
  data: NLPQueryResult['data'],
  periodDesc: string,
  query: NLPQueryResult['query']
): string {
  const limit = query.aggregation?.limit || 5;
  const groupBy = query.aggregation?.groupBy || 'category';
  const groupLabel = groupBy === 'category' ? 'kategorie' : 'sklepy';

  let text = `**Top ${limit} ${groupLabel}** - ${periodDesc}\n\n`;

  if (data.items && data.items.length > 0) {
    text += `Lacznie: **${formatAmount(data.total || 0)}**\n\n`;

    data.items.forEach((item, idx) => {
      const emoji = getEmojiForLabel(item.label, groupBy);
      const medal = getMedal(idx);
      const pct = item.percentage ? ` (${item.percentage.toFixed(1)}%)` : '';

      text += `${medal} ${emoji} ${item.label}: ${formatAmount(item.amount)}${pct}\n`;
    });
  } else {
    text += 'Brak danych w wybranym okresie.';
  }

  return text;
}

function formatListResponse(
  data: NLPQueryResult['data'],
  periodDesc: string,
  query: NLPQueryResult['query']
): string {
  let title = 'Wydatki';

  if (query.categories?.include?.length) {
    title += ` - ${query.categories.include.join(', ')}`;
  }
  if (query.shops?.include?.length) {
    title += ` w ${query.shops.include.join(', ')}`;
  }

  let text = `**${title}** - ${periodDesc}\n\n`;

  if (data.items && data.items.length > 0) {
    text += `Lacznie: **${formatAmount(data.total || 0)}** (${data.count || 0} transakcji)\n\n`;

    // Show top 10 categories
    const displayItems = data.items.slice(0, 10);
    displayItems.forEach((item) => {
      const emoji = getEmojiForLabel(item.label, 'category');
      const pct = item.percentage ? ` (${item.percentage.toFixed(1)}%)` : '';
      const countStr = item.count > 1 ? ` x${item.count}` : '';

      text += `${emoji} ${item.label}: ${formatAmount(item.amount)}${pct}${countStr}\n`;
    });

    if (data.items.length > 10) {
      text += `\n_...i ${data.items.length - 10} wiecej_`;
    }
  } else {
    text += 'Brak wydatkow w wybranym okresie.';
  }

  return text;
}

function formatAmount(amount: number): string {
  const formatted = amount.toFixed(2).replace('.00', '');
  return `${formatted} zl`;
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
  return `Nie jestem pewien co masz na mysli. Sprobuj bardziej precyzyjnie, np.:
- "suma w grudniu"
- "top 5 kategorii"
- "wydatki bez elektroniki"
- "ile wydalem od 1 do 15 grudnia"`;
}
