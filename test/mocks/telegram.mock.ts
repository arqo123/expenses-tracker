/**
 * Mock TelegramService for testing
 */
import { mock } from 'bun:test';
import type { TelegramService } from '../../src/services/telegram.service';

export interface MockTelegramServiceOptions {
  shouldFail?: boolean;
  failureError?: Error;
}

/**
 * Create a mock TelegramService
 */
export function createMockTelegramService(
  options: MockTelegramServiceOptions = {}
): TelegramService {
  const { shouldFail = false, failureError } = options;

  const fail = () => {
    if (shouldFail) {
      throw failureError || new Error('Telegram API error');
    }
  };

  const createMessageResult = (chatId: number = 123) => ({
    message_id: Date.now(),
    chat: { id: chatId },
    date: Math.floor(Date.now() / 1000),
  });

  return {
    sendMessage: mock((chatId: number, text: string, options?: unknown) => {
      fail();
      return Promise.resolve(createMessageResult(chatId));
    }),

    sendExpenseConfirmation: mock(
      (chatId: number, expense: unknown, options?: unknown) => {
        fail();
        return Promise.resolve(createMessageResult(chatId));
      }
    ),

    sendBatchSummary: mock(
      (
        chatId: number,
        created: number,
        duplicates: number,
        errors: number,
        options?: unknown
      ) => {
        fail();
        return Promise.resolve(createMessageResult(chatId));
      }
    ),

    sendError: mock((chatId: number, error: string, options?: unknown) => {
      fail();
      return Promise.resolve(createMessageResult(chatId));
    }),

    editMessage: mock(
      (chatId: number, messageId: number, text: string, options?: unknown) => {
        fail();
        return Promise.resolve(createMessageResult(chatId));
      }
    ),

    deleteMessage: mock((chatId: number, messageId: number) => {
      fail();
      return Promise.resolve(true);
    }),

    answerCallbackQuery: mock(
      (callbackQueryId: string, text?: string, showAlert?: boolean) => {
        fail();
        return Promise.resolve(true);
      }
    ),

    getFile: mock((fileId: string) => {
      fail();
      return Promise.resolve({
        file_id: fileId,
        file_unique_id: `unique_${fileId}`,
        file_path: `voice/file_${fileId}.ogg`,
      });
    }),

    downloadFile: mock((filePath: string) => {
      fail();
      // Return empty audio buffer
      return Promise.resolve(new ArrayBuffer(100));
    }),

    // Additional methods that might exist
    sendPhoto: mock((chatId: number, photo: unknown, options?: unknown) => {
      fail();
      return Promise.resolve(createMessageResult(chatId));
    }),

    sendDocument: mock(
      (chatId: number, document: unknown, options?: unknown) => {
        fail();
        return Promise.resolve(createMessageResult(chatId));
      }
    ),
  } as unknown as TelegramService;
}

/**
 * Get all calls to a specific mock method
 */
export function getMockCalls(
  mockService: TelegramService,
  methodName: keyof TelegramService
): unknown[][] {
  const method = mockService[methodName] as ReturnType<typeof mock>;
  return method.mock?.calls || [];
}

/**
 * Check if a method was called with specific arguments
 */
export function wasCalledWith(
  mockService: TelegramService,
  methodName: keyof TelegramService,
  ...args: unknown[]
): boolean {
  const calls = getMockCalls(mockService, methodName);
  return calls.some((call) =>
    args.every((arg, i) => JSON.stringify(call[i]) === JSON.stringify(arg))
  );
}
