/**
 * Test factories for creating mock objects
 */
import type {
  Expense,
  CreateExpenseInput,
  ExpenseCategory,
  CategorizationResult,
  VisionResult,
  BatchCategorizationItem
} from '../../src/types/expense.types';

let expenseCounter = 0;

/**
 * Create a mock Expense object
 */
export function createMockExpense(overrides: Partial<Expense> = {}): Expense {
  expenseCounter++;
  return {
    id: `exp_20240115_${String(expenseCounter).padStart(12, '0')}`,
    data: '2024-01-15',
    kwota: 50.0,
    waluta: 'PLN',
    kategoria: 'Zakupy spozywcze',
    sprzedawca: 'Biedronka',
    user_name: 'TestUser',
    opis: 'Test expense',
    zrodlo: 'telegram_text',
    raw_input: 'biedronka 50',
    status: 'active',
    hash: `50_biedronka_2024-01-15_testuser_${expenseCounter}`,
    created_at: new Date().toISOString(),
    receipt_id: null,
    ...overrides,
  };
}

/**
 * Create a mock CreateExpenseInput
 */
export function createMockExpenseInput(
  overrides: Partial<CreateExpenseInput> = {}
): CreateExpenseInput {
  return {
    amount: 50.0,
    category: 'Zakupy spozywcze' as ExpenseCategory,
    shop: 'Biedronka',
    user: 'TestUser',
    source: 'telegram_text',
    date: '2024-01-15',
    description: 'Test',
    ...overrides,
  };
}

/**
 * Create a mock CategorizationResult
 */
export function createMockCategorizationResult(
  overrides: Partial<CategorizationResult> = {}
): CategorizationResult {
  return {
    shop: 'Biedronka',
    category: 'Zakupy spozywcze',
    amount: 50.0,
    confidence: 0.95,
    ...overrides,
  };
}

/**
 * Create a mock VisionResult (OCR result)
 */
export function createMockVisionResult(
  overrides: Partial<VisionResult> = {}
): VisionResult {
  return {
    image_type: 'receipt',
    source: 'Lidl',
    store_type: 'grocery',
    products: [
      { name: 'Mleko', price: 5.5, category: 'Zakupy spozywcze', confidence: 0.9 },
      { name: 'Chleb', price: 4.0, category: 'Zakupy spozywcze', confidence: 0.9 },
    ],
    total: 9.5,
    ...overrides,
  };
}

/**
 * Create a mock BatchCategorizationItem
 */
export function createMockBatchItem(
  idx: number,
  overrides: Partial<BatchCategorizationItem> = {}
): BatchCategorizationItem {
  return {
    idx,
    shop: 'Biedronka',
    category: 'Zakupy spozywcze',
    amount: 50.0,
    confidence: 0.9,
    ...overrides,
  };
}

/**
 * Create a mock Telegram text message
 */
export function createTelegramTextMessage(
  text: string,
  chatId: number = 123,
  fromName: string = 'TestUser'
) {
  return {
    message_id: Date.now(),
    from: {
      id: chatId,
      is_bot: false,
      first_name: fromName,
    },
    chat: {
      id: chatId,
      type: 'private' as const,
    },
    date: Math.floor(Date.now() / 1000),
    text,
  };
}

/**
 * Create a mock Telegram voice message
 */
export function createTelegramVoiceMessage(
  fileId: string = 'test_file_id',
  chatId: number = 123
) {
  return {
    message_id: Date.now(),
    from: {
      id: chatId,
      is_bot: false,
      first_name: 'TestUser',
    },
    chat: {
      id: chatId,
      type: 'private' as const,
    },
    date: Math.floor(Date.now() / 1000),
    voice: {
      file_id: fileId,
      file_unique_id: `unique_${fileId}`,
      duration: 5,
    },
  };
}

/**
 * Create a mock Telegram callback query
 */
export function createTelegramCallbackQuery(
  data: string,
  messageId: number = 1,
  chatId: number = 123
) {
  return {
    id: `callback_${Date.now()}`,
    from: {
      id: chatId,
      is_bot: false,
      first_name: 'TestUser',
    },
    message: {
      message_id: messageId,
      chat: {
        id: chatId,
        type: 'private' as const,
      },
      date: Math.floor(Date.now() / 1000),
    },
    data,
  };
}

/**
 * Reset the expense counter (useful between test suites)
 */
export function resetFactories(): void {
  expenseCounter = 0;
}
