/**
 * Mock DatabaseService for testing
 */
import { mock } from 'bun:test';
import type { DatabaseService } from '../../src/services/database.service';
import type { Expense, CreateExpenseInput, ExpenseCategory } from '../../src/types/expense.types';
import { createMockExpense } from '../helpers/factories';

export interface MockDatabaseServiceOptions {
  expenses?: Expense[];
  shouldFail?: boolean;
  failureError?: Error;
}

/**
 * Create a mock DatabaseService with configurable behavior
 */
export function createMockDatabaseService(
  options: MockDatabaseServiceOptions = {}
): DatabaseService {
  const { expenses = [], shouldFail = false, failureError } = options;

  const fail = () => {
    if (shouldFail) {
      throw failureError || new Error('Database error');
    }
  };

  return {
    // Create single expense
    createExpense: mock((input: CreateExpenseInput) => {
      fail();
      return Promise.resolve(createMockExpense({
        kwota: input.amount,
        kategoria: input.category,
        sprzedawca: input.shop,
        user_name: input.user,
        zrodlo: input.source,
        data: input.date || new Date().toISOString().split('T')[0],
        opis: input.description || '',
      }));
    }),

    // Batch create expenses
    createExpensesBatch: mock((inputs: CreateExpenseInput[]) => {
      fail();
      const created = inputs.map((input, i) =>
        createMockExpense({
          id: `exp_batch_${i}`,
          kwota: input.amount,
          kategoria: input.category,
          sprzedawca: input.shop,
          user_name: input.user,
        })
      );
      return Promise.resolve({ created, duplicates: [] });
    }),

    // Optimized batch create
    createExpensesBatchOptimized: mock((inputs: CreateExpenseInput[]) => {
      fail();
      const created = inputs.map((input, i) =>
        createMockExpense({
          id: `exp_opt_${i}`,
          kwota: input.amount,
          kategoria: input.category,
          sprzedawca: input.shop,
          user_name: input.user,
        })
      );
      return Promise.resolve({ created, duplicates: [] });
    }),

    // Get expense by ID
    getExpenseById: mock((id: string) => {
      fail();
      const found = expenses.find((e) => e.id === id);
      return Promise.resolve(found || null);
    }),

    // Get last expense by user
    getLastExpenseByUser: mock((userName: string) => {
      fail();
      const userExpenses = expenses.filter((e) => e.user_name === userName);
      return Promise.resolve(userExpenses[0] || null);
    }),

    // Get recent expenses
    getRecentExpenses: mock((userName: string, limit: number = 10) => {
      fail();
      const userExpenses = expenses
        .filter((e) => e.user_name === userName)
        .slice(0, limit);
      return Promise.resolve(userExpenses);
    }),

    // Get recent expenses grouped
    getRecentExpensesGrouped: mock((userName: string, limit: number = 10) => {
      fail();
      return Promise.resolve([]);
    }),

    // Get receipt products
    getReceiptProducts: mock((receiptId: string) => {
      fail();
      return Promise.resolve(
        expenses.filter((e) => e.receipt_id === receiptId)
      );
    }),

    // Get recent expenses by source
    getRecentExpensesBySource: mock(
      (userName: string, source: string, limit: number) => {
        fail();
        return Promise.resolve(
          expenses
            .filter((e) => e.user_name === userName && e.zrodlo === source)
            .slice(0, limit)
        );
      }
    ),

    // Check idempotency
    checkIdempotency: mock((messageId: string, chatId: string) => {
      fail();
      return Promise.resolve(true);
    }),

    // Update expense category
    updateExpenseCategory: mock(
      (expenseId: string, newCategory: ExpenseCategory) => {
        fail();
        const expense = expenses.find((e) => e.id === expenseId);
        if (expense) {
          expense.kategoria = newCategory;
          return Promise.resolve(expense);
        }
        return Promise.resolve(null);
      }
    ),

    // Delete expense
    deleteExpense: mock((expenseId: string) => {
      fail();
      return Promise.resolve(true);
    }),

    // Query expenses
    queryExpenses: mock(
      (
        userName: string,
        startDate: string,
        endDate: string,
        category?: string,
        shop?: string
      ) => {
        fail();
        let result = expenses.filter((e) => e.user_name === userName);
        if (category) {
          result = result.filter((e) => e.kategoria === category);
        }
        if (shop) {
          result = result.filter((e) =>
            e.sprzedawca.toLowerCase().includes(shop.toLowerCase())
          );
        }
        return Promise.resolve(result);
      }
    ),

    // Get expenses for weekly report
    getExpensesForWeeklyReport: mock((startDate: string, endDate: string) => {
      fail();
      return Promise.resolve(expenses);
    }),

    // Hash exists
    hashExists: mock((hash: string) => {
      fail();
      return Promise.resolve(expenses.some((e) => e.hash === hash));
    }),

    // Audit log
    createAuditLog: mock(
      (action: string, details: object, userId: string, expenseId?: string) => {
        fail();
        return Promise.resolve();
      }
    ),

    // Cleanup idempotency
    cleanupIdempotency: mock(() => {
      fail();
      return Promise.resolve(0);
    }),

    // Get merchant
    getMerchant: mock((skrot: string) => {
      fail();
      return Promise.resolve(null);
    }),

    // Update merchant category
    updateMerchantCategory: mock((skrot: string, category: string) => {
      fail();
      return Promise.resolve();
    }),

    // Save product learning
    saveProductLearning: mock(
      (
        productName: string,
        correctCategory: ExpenseCategory,
        storeName?: string
      ) => {
        fail();
        return Promise.resolve();
      }
    ),

    // Get product learnings
    getProductLearnings: mock(
      (productNames: string[], storeName?: string) => {
        fail();
        return Promise.resolve(new Map<string, ExpenseCategory>());
      }
    ),

    // Receipt matching methods
    findMatchingManualExpenses: mock(
      (
        userName: string,
        receiptDate: string,
        receiptTotal: number,
        receiptShop: string
      ) => {
        fail();
        return Promise.resolve([]);
      }
    ),

    saveReceiptSession: mock((session: unknown) => {
      fail();
      return Promise.resolve();
    }),

    getReceiptSession: mock((sessionId: string) => {
      fail();
      return Promise.resolve(null);
    }),

    replaceManualWithReceipt: mock(
      (
        oldExpenseId: string,
        newExpenses: CreateExpenseInput[],
        userName: string
      ) => {
        fail();
        return Promise.resolve({
          deletedExpenseId: oldExpenseId,
          created: [],
        });
      }
    ),

    markReceiptSessionProcessed: mock((sessionId: string) => {
      fail();
      return Promise.resolve();
    }),

    cleanupExpiredReceiptSessions: mock(() => {
      fail();
      return Promise.resolve(0);
    }),

    // Suggestion engine methods
    getProductsFromReceipts: mock((limit: number = 50) => {
      fail();
      return Promise.resolve([]);
    }),

    getStoreProducts: mock((storeName: string, limit: number = 20) => {
      fail();
      return Promise.resolve([]);
    }),

    getTopStores: mock((limit: number = 10) => {
      fail();
      return Promise.resolve([]);
    }),

    getCorrelatedProducts: mock(
      (productNames: string[], limit: number = 10) => {
        fail();
        return Promise.resolve([]);
      }
    ),

    updateProductCorrelations: mock((receiptId: string) => {
      fail();
      return Promise.resolve(0);
    }),

    getCorrelationsFromTable: mock(
      (productNames: string[], limit: number = 10) => {
        fail();
        return Promise.resolve([]);
      }
    ),

    // Raw query execution
    executeRawQuery: mock((sql: string, values: (string | number)[]) => {
      fail();
      return Promise.resolve(expenses);
    }),

    executeRawAggregation: mock(
      (sql: string, values: (string | number)[]) => {
        fail();
        return Promise.resolve([]);
      }
    ),

    // Pool and lifecycle
    getPool: mock(() => ({} as unknown)),

    close: mock(() => {
      fail();
      return Promise.resolve();
    }),

    ping: mock(() => {
      fail();
      return Promise.resolve(true);
    }),

    runMigrations: mock(() => {
      fail();
      return Promise.resolve();
    }),
  } as unknown as DatabaseService;
}
