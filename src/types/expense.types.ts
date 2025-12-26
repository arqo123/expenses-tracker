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
}

export interface CategorizationResult {
  shop: string;
  category: ExpenseCategory;
  amount: number;
  confidence: number;
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

export interface VisionResult {
  image_type: 'receipt' | 'ecommerce';
  source: string;
  products: Array<{
    name: string;
    price: number;
    category: ExpenseCategory;
    confidence: number;
  }>;
  total: number;
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
