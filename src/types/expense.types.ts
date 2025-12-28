// 25 expense categories
export const EXPENSE_CATEGORIES = [
  'Zakupy spozywcze',
  'Restauracje',
  'Delivery',
  'Kawiarnie',
  'Transport',
  'Paliwo',
  'Auto',
  'Dom',
  'Zdrowie',
  'Uroda',
  'Rozrywka',
  'Sport',
  'Hobby',
  'Ubrania',
  'Elektronika',
  'Subskrypcje',
  'Edukacja',
  'Zwierzeta',
  'Dzieci',
  'Prezenty',
  'Inwestycje',
  'Przelewy',
  'Hotele',
  'Oplaty administracyjne',
  'Inne',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type ExpenseSource =
  | 'telegram_text'
  | 'telegram_voice'
  | 'telegram_image'
  | 'telegram_csv'
  | 'manual';

export interface Expense {
  id: string;
  data: string;
  kwota: number;
  waluta: string;
  kategoria: ExpenseCategory;
  sprzedawca: string;
  user_name: string;
  opis: string;
  zrodlo: ExpenseSource;
  raw_input: string;
  status: 'active' | 'deleted';
  hash: string;
  created_at: string;
  receipt_id?: string | null;
}

export interface CreateExpenseInput {
  amount: number;
  category: ExpenseCategory;
  shop: string;
  user: string;
  source: ExpenseSource;
  date?: string;
  description?: string;
  raw_input?: string;
  currency?: string;
  receipt_id?: string;
}

// Grouped receipt for statistics display
export interface GroupedExpense {
  receipt_id: string | null;
  shop: string;
  total_amount: number;
  product_count: number;
  data: string;
  created_at: string;
  user_name: string;
}

export type ExpenseOrGroup = Expense | GroupedExpense;

export function isGroupedExpense(item: ExpenseOrGroup): item is GroupedExpense {
  return 'product_count' in item && (item as GroupedExpense).product_count > 1;
}

export interface CategorizationResult {
  shop: string;
  category: ExpenseCategory;
  amount: number;
  confidence: number;
  description?: string;
  is_bill?: boolean;
  suggested_shop?: string | null;
}

export interface BatchCategorizationItem {
  idx: number;
  shop: string;
  category: ExpenseCategory;
  amount: number;
  confidence: number;
}

export type StoreType = 'grocery' | 'veterinary' | 'pharmacy' | 'restaurant' | 'electronics' | 'clothing' | 'home' | 'pet_store' | 'other';

export interface VisionResult {
  image_type: 'receipt' | 'ecommerce';
  source: string;
  address?: string;  // Store address (when source/name is not visible on receipt)
  store_type?: StoreType;
  products: Array<{
    name: string;
    price: number;
    category: ExpenseCategory;
    confidence: number;
  }>;
  total: number;
  total_discounts?: number;
}

export interface ExpenseQueryResult {
  expenses: Expense[];
  summary: {
    total_amount: number;
    count: number;
    by_category: Record<string, number>;
    by_merchant: Record<string, { count: number; amount: number }>;
  };
  period: {
    start: string;
    end: string;
    description: string;
  };
}

// Category emoji mapping
export const CATEGORY_EMOJI: Record<ExpenseCategory, string> = {
  'Zakupy spozywcze': '🛒',
  'Restauracje': '🍽️',
  'Delivery': '🛵',
  'Kawiarnie': '☕',
  'Transport': '🚗',
  'Paliwo': '⛽',
  'Auto': '🚙',
  'Dom': '🏠',
  'Zdrowie': '💊',
  'Uroda': '💄',
  'Rozrywka': '🎬',
  'Sport': '🏃',
  'Hobby': '🎨',
  'Ubrania': '👕',
  'Elektronika': '💻',
  'Subskrypcje': '📺',
  'Edukacja': '📚',
  'Zwierzeta': '🐕',
  'Dzieci': '👶',
  'Prezenty': '🎁',
  'Inwestycje': '📈',
  'Przelewy': '💸',
  'Hotele': '🏨',
  'Oplaty administracyjne': '📋',
  'Inne': '❓',
};
