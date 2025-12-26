import type { ExpenseCategory, Expense } from './expense.types.ts';

// Query intent types
export type QueryIntent = 'list' | 'sum' | 'count' | 'average' | 'top' | 'comparison';

// Date range types
export interface DateRange {
  type: 'absolute' | 'relative';
  start?: string; // ISO date YYYY-MM-DD
  end?: string; // ISO date YYYY-MM-DD
  relativeUnit?: 'days' | 'weeks' | 'months' | 'years';
  relativeValue?: number;
  description: string; // Human readable, e.g. "od 1 do 15 grudnia"
}

// Category filter with include/exclude (negacje)
export interface CategoryFilter {
  include?: ExpenseCategory[];
  exclude?: ExpenseCategory[]; // dla "bez kategorii X"
}

// Shop filter with include/exclude
export interface ShopFilter {
  include?: string[];
  exclude?: string[]; // dla "oprócz sklepu X"
}

// Amount filter
export interface AmountFilter {
  min?: number; // >= min
  max?: number; // <= max
  exact?: number; // = exact
}

// Aggregation settings
export interface AggregationSettings {
  type: 'sum' | 'count' | 'average' | 'max' | 'min';
  groupBy?: 'category' | 'shop' | 'day' | 'week' | 'month';
  limit?: number; // top N
  orderBy?: 'amount' | 'count' | 'date';
  orderDirection?: 'asc' | 'desc';
}

// Parsed NLP query - output from AI
export interface ParsedNLPQuery {
  intent: QueryIntent;
  dateRange?: DateRange;
  categories?: CategoryFilter;
  shops?: ShopFilter;
  amountFilter?: AmountFilter;
  aggregation?: AggregationSettings;
  confidence: number; // 0-1
  originalQuery: string;
}

// Result item (for aggregated results)
export interface QueryResultItem {
  label: string;
  amount: number;
  count: number;
  percentage?: number;
  avgAmount?: number;
}

// Period info in result
export interface QueryPeriod {
  start: string;
  end: string;
  description: string;
}

// Query result data
export interface QueryResultData {
  items?: QueryResultItem[];
  expenses?: Expense[]; // raw expenses for list intent
  total?: number;
  count?: number;
  average?: number;
  period?: QueryPeriod;
}

// Full query result
export interface NLPQueryResult {
  success: boolean;
  query: ParsedNLPQuery;
  data: QueryResultData;
  meta: {
    executionTimeMs: number;
    sqlGenerated?: string; // debug
  };
}

// Response format
export type ResponseFormat = 'telegram' | 'json' | 'markdown';

// REST API request
export interface QueryAPIRequest {
  query: string;
  user: string;
  format?: ResponseFormat;
}

// REST API response
export interface QueryAPIResponse {
  success: boolean;
  parsedQuery: ParsedNLPQuery;
  result: NLPQueryResult;
  meta: {
    executionTimeMs: number;
  };
}
