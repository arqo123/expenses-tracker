import type { CreateExpenseInput, Expense, ExpenseSource } from './expense.types';

export interface MatchedExpense {
  id: string;
  kwota: number;
  sprzedawca: string;
  data: string;
  zrodlo: ExpenseSource;
}

export interface PendingReceiptData {
  source: string;
  total: number;
  productCount: number;
  expenseInputs: CreateExpenseInput[];
  categoryGroups: Record<string, Array<{ name: string; price: number }>>;
}

export interface PendingReceipt {
  sessionId: string;
  userName: string;
  chatId: number;
  receiptData: PendingReceiptData;
  matchedExpenses: MatchedExpense[];
  status: 'pending' | 'processed' | 'expired';
  createdAt: string;
  expiresAt: string;
}

export interface ReplaceResult {
  deletedExpenseId: string;
  created: Expense[];
}
