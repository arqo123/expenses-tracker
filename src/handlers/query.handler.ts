import type { Context } from 'hono';
import type { TelegramMessage } from '../types/telegram.types.ts';
import { getUserName } from './webhook.handler.ts';
import { CATEGORY_EMOJI } from '../types/expense.types.ts';

interface QueryParams {
  timeRange: 'today' | 'this_week' | 'current_month' | 'last_month' | 'this_year' | 'all';
  category?: string;
  shop?: string;
}

export async function queryHandler(c: Context, message: TelegramMessage): Promise<Response> {
  const telegram = c.get('telegram');
  const database = c.get('database');

  const chatId = message.chat.id;
  const text = message.text?.trim() || '';
  const userName = getUserName(chatId, message.from.first_name);

  try {
    // Parse query parameters
    const params = parseQueryParams(text);
    const { startDate, endDate, description } = getDateRange(params.timeRange);

    console.log(`[QueryHandler] Query for ${userName}: ${text} -> ${description}`);

    // Query expenses
    const expenses = await database.queryExpenses(
      userName,
      startDate,
      endDate,
      params.category,
      params.shop
    );

    if (expenses.length === 0) {
      await telegram.sendMessage({
        chat_id: chatId,
        text: `📊 ${description}\n\nBrak wydatkow w tym okresie.`,
      });
      return c.json({ ok: true });
    }

    // Aggregate by category
    const byCategory: Record<string, { amount: number; count: number }> = {};
    let totalAmount = 0;

    for (const expense of expenses) {
      const cat = expense.kategoria || 'Inne';
      if (!byCategory[cat]) {
        byCategory[cat] = { amount: 0, count: 0 };
      }
      byCategory[cat]!.amount += expense.kwota;
      byCategory[cat]!.count += 1;
      totalAmount += expense.kwota;
    }

    // Sort by amount descending
    const sortedCategories = Object.entries(byCategory)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.amount - a.amount);

    // Format response
    const items = sortedCategories.slice(0, 10).map(cat => {
      const emoji = CATEGORY_EMOJI[cat.name as keyof typeof CATEGORY_EMOJI] || '❓';
      return {
        name: `${emoji} ${cat.name}`,
        amount: cat.amount,
        count: cat.count,
      };
    });

    await telegram.sendQueryResult(chatId, description, totalAmount, items);

    return c.json({ ok: true, total: totalAmount, categories: sortedCategories.length });
  } catch (error) {
    console.error('[QueryHandler] Error:', error);
    await telegram.sendError(chatId, 'Blad przetwarzania zapytania.');
    return c.json({ ok: false }, 500);
  }
}

function parseQueryParams(text: string): QueryParams {
  const lower = text.toLowerCase();

  // Default to current month
  let timeRange: QueryParams['timeRange'] = 'current_month';
  let category: string | undefined;
  let shop: string | undefined;

  // Time range detection
  if (lower.includes('dzis') || lower.includes('dzisiaj')) {
    timeRange = 'today';
  } else if (lower.includes('tydzien') || lower.includes('tygodni')) {
    timeRange = 'this_week';
  } else if (lower.includes('miesiac') || lower.includes('miesiąc')) {
    if (lower.includes('zeszl') || lower.includes('poprzedni')) {
      timeRange = 'last_month';
    } else {
      timeRange = 'current_month';
    }
  } else if (lower.includes('rok') || lower.includes('roku')) {
    timeRange = 'this_year';
  } else if (lower.includes('wszystk') || lower.includes('calkowit')) {
    timeRange = 'all';
  }

  // Category detection (simple keyword matching)
  const categoryKeywords: Record<string, string> = {
    'jedzeni': 'Zakupy spozywcze',
    'zakup': 'Zakupy spozywcze',
    'restaura': 'Restauracje',
    'transport': 'Transport',
    'paliw': 'Paliwo',
    'dom': 'Dom',
    'zdrowi': 'Zdrowie',
    'rozrywk': 'Rozrywka',
    'subskrypcj': 'Subskrypcje',
  };

  for (const [keyword, cat] of Object.entries(categoryKeywords)) {
    if (lower.includes(keyword)) {
      category = cat;
      break;
    }
  }

  // Shop detection (after "w" or "u")
  const shopMatch = lower.match(/(?:w|u|na)\s+(\w+)/);
  if (shopMatch) {
    shop = shopMatch[1];
  }

  return { timeRange, category, shop };
}

function getDateRange(timeRange: QueryParams['timeRange']): {
  startDate: string;
  endDate: string;
  description: string;
} {
  const now = new Date();
  const today = now.toISOString().split('T')[0]!;

  switch (timeRange) {
    case 'today': {
      return {
        startDate: today,
        endDate: today,
        description: 'Wydatki dzisiaj',
      };
    }

    case 'this_week': {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      return {
        startDate: monday.toISOString().split('T')[0]!,
        endDate: today,
        description: 'Wydatki w tym tygodniu',
      };
    }

    case 'current_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startDate: firstDay.toISOString().split('T')[0]!,
        endDate: today,
        description: 'Wydatki w tym miesiacu',
      };
    }

    case 'last_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        startDate: firstDay.toISOString().split('T')[0]!,
        endDate: lastDay.toISOString().split('T')[0]!,
        description: 'Wydatki w zeszlym miesiacu',
      };
    }

    case 'this_year': {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      return {
        startDate: firstDay.toISOString().split('T')[0]!,
        endDate: today,
        description: `Wydatki w ${now.getFullYear()}`,
      };
    }

    case 'all':
    default: {
      return {
        startDate: '2020-01-01',
        endDate: today,
        description: 'Wszystkie wydatki',
      };
    }
  }
}
