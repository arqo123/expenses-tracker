import type { DatabaseService } from './database.service.ts';
import type {
  ParsedNLPQuery,
  NLPQueryResult,
  QueryResultItem,
  QueryResultData,
} from '../types/nlp-query.types.ts';
import type { Expense } from '../types/expense.types.ts';
import {
  buildQueryFromNLP,
  buildAggregationSQL,
  resolveDateRange,
} from '../utils/query-builder.ts';

export class QueryExecutorService {
  constructor(private database: DatabaseService) {}

  async execute(parsedQuery: ParsedNLPQuery, userName: string): Promise<NLPQueryResult> {
    const startTime = Date.now();

    try {
      let data: QueryResultData;

      // Choose execution strategy based on intent and aggregation
      if (this.needsAggregation(parsedQuery)) {
        data = await this.executeAggregation(parsedQuery, userName);
      } else {
        data = await this.executeListQuery(parsedQuery, userName);
      }

      // Add period info
      if (parsedQuery.dateRange) {
        const { start, end } = resolveDateRange(parsedQuery.dateRange);
        data.period = {
          start: start || '2020-01-01',
          end: end || new Date().toISOString().split('T')[0]!,
          description: parsedQuery.dateRange.description,
        };
      }

      return {
        success: true,
        query: parsedQuery,
        data,
        meta: {
          executionTimeMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      console.error('[QueryExecutorService] Error:', error);
      return {
        success: false,
        query: parsedQuery,
        data: {},
        meta: {
          executionTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  private needsAggregation(query: ParsedNLPQuery): boolean {
    // Top queries always need aggregation
    if (query.intent === 'top') return true;
    // If groupBy is specified
    if (query.aggregation?.groupBy) return true;
    return false;
  }

  private async executeListQuery(
    parsedQuery: ParsedNLPQuery,
    userName: string
  ): Promise<QueryResultData> {
    const { sql, values } = buildQueryFromNLP(parsedQuery, userName);
    console.log('[QueryExecutorService] SQL:', sql);
    console.log('[QueryExecutorService] Values:', values);

    // Execute raw query
    const expenses = await this.database.executeRawQuery(sql, values);

    // Calculate totals
    const total = expenses.reduce((sum, e) => sum + e.kwota, 0);
    const count = expenses.length;

    // Process based on intent
    switch (parsedQuery.intent) {
      case 'sum':
        return { total, count };

      case 'count':
        return { count, total };

      case 'average':
        return {
          average: count > 0 ? total / count : 0,
          total,
          count,
        };

      case 'list':
      default:
        // Group by category for list view
        const items = this.groupByCategory(expenses);
        return {
          items,
          total,
          count,
          expenses: expenses.slice(0, 50), // Limit raw expenses
        };
    }
  }

  private async executeAggregation(
    parsedQuery: ParsedNLPQuery,
    userName: string
  ): Promise<QueryResultData> {
    const { sql, values } = buildAggregationSQL(parsedQuery, userName);
    console.log('[QueryExecutorService] Aggregation SQL:', sql);
    console.log('[QueryExecutorService] Values:', values);

    // Execute aggregation query
    const rows = await this.database.executeRawAggregation(sql, values);

    // Calculate grand total
    const grandTotal = rows.reduce((sum, r) => sum + r.total_amount, 0);
    const totalCount = rows.reduce((sum, r) => sum + r.transaction_count, 0);

    // Map to result items
    const items: QueryResultItem[] = rows.map((row) => ({
      label: row.label || 'Nieznany',
      amount: row.total_amount,
      count: row.transaction_count,
      percentage: grandTotal > 0 ? (row.total_amount / grandTotal) * 100 : 0,
      avgAmount: row.transaction_count > 0 ? row.total_amount / row.transaction_count : 0,
    }));

    return {
      items,
      total: grandTotal,
      count: totalCount,
    };
  }

  private groupByCategory(expenses: Expense[]): QueryResultItem[] {
    const byCategory = new Map<string, { amount: number; count: number }>();
    let total = 0;

    for (const expense of expenses) {
      const cat = expense.kategoria || 'Inne';
      const existing = byCategory.get(cat) || { amount: 0, count: 0 };
      existing.amount += expense.kwota;
      existing.count += 1;
      byCategory.set(cat, existing);
      total += expense.kwota;
    }

    const items: QueryResultItem[] = [];
    for (const [label, data] of byCategory) {
      items.push({
        label,
        amount: data.amount,
        count: data.count,
        percentage: total > 0 ? (data.amount / total) * 100 : 0,
        avgAmount: data.count > 0 ? data.amount / data.count : 0,
      });
    }

    // Sort by amount descending
    items.sort((a, b) => b.amount - a.amount);

    return items;
  }
}
