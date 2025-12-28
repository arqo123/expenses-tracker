import type { ShopCategory } from './shopping.types.ts';

// Reasons why a product was suggested
export type SuggestionReason =
  | 'frequently_bought'    // Często kupowane (wysokie purchase_count)
  | 'overdue'              // Przeterminowane (minął avg_interval_days)
  | 'store_match'          // Typowe dla wybranego sklepu
  | 'basket_correlation'   // Często kupowane razem z innymi produktami na liście
  | 'recently_bought';     // Ostatnio kupowane (niedawno w historii)

// Source of the suggestion data
export type SuggestionSource = 'shopping_list' | 'receipt' | 'expense';

// Smart suggestion with scoring and context
export interface SmartSuggestion {
  productName: string;
  score: number;                     // 0-100, calculated weight
  source: SuggestionSource;
  reasons: SuggestionReason[];
  lastBought?: string;               // ISO date string
  daysSinceLastPurchase?: number;
  typicalShop?: string;
  avgPrice?: number;
  purchaseCount?: number;
  avgIntervalDays?: number;
  daysOverdue?: number;              // How many days past the average interval
  correlationScore?: number;         // 0-1 for basket correlation
  category?: ShopCategory;
  emoji?: string;
}

// Context for generating suggestions
export interface SuggestionContext {
  currentStore?: string;             // Filter by store (e.g., "Biedronka")
  currentItems?: string[];           // Current items on shopping list (for correlation)
  userName?: string;                 // For personalization
  limit?: number;                    // Max suggestions to return
  filter?: SuggestionFilter;         // Which type of suggestions to show
}

// Filter for different suggestion views
export type SuggestionFilter =
  | 'all'           // Wszystkie (domyślny widok)
  | 'overdue'       // Tylko przeterminowane
  | 'popular'       // Tylko popularne (wysokie purchase_count)
  | 'store'         // Tylko dla wybranego sklepu
  | 'correlated';   // Tylko korelacje z aktualną listą

// Raw data from database before scoring
export interface RawSuggestion {
  productName: string;
  purchaseCount: number;
  avgIntervalDays?: number;
  lastBoughtAt?: string;
  daysSinceLastPurchase?: number;
  typicalShop?: string;
  avgPrice?: number;
  shops?: string[];
  category?: string;
  source: SuggestionSource;
  // Computed during scoring
  isOverdue?: boolean;
  daysOverdue?: number;
  matchesCurrentStore?: boolean;
  correlationScore?: number;
}

// Product from receipt/expense for suggestion mining
export interface ReceiptProduct {
  productName: string;
  purchaseCount: number;
  avgPrice: number;
  lastBoughtAt: string;
  shops: string[];
  category: string;
}

// Product correlation (bought together)
export interface ProductCorrelation {
  productName: string;
  coOccurrences: number;
  correlation: number;               // 0-1
}

// Top stores for store filter keyboard
export interface StoreStats {
  storeName: string;
  productCount: number;
  transactionCount: number;
}
