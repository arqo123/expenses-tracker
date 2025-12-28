/**
 * Mock AICategorizerService for testing
 */
import { mock } from 'bun:test';
import type { AICategorizerService } from '../../src/services/ai-categorizer.service';
import type {
  CategorizationResult,
  BatchCategorizationItem,
  VisionResult,
} from '../../src/types/expense.types';
import {
  createMockCategorizationResult,
  createMockVisionResult,
  createMockBatchItem,
} from '../helpers/factories';

export interface MockAICategorizerOptions {
  categorizeSingleResult?: CategorizationResult;
  categorizeBatchResult?: BatchCategorizationItem[];
  categorizeImageResult?: VisionResult;
  circuitBreakerState?: 'closed' | 'open' | 'half_open';
  shouldFail?: boolean;
  failureError?: Error;
}

/**
 * Create a mock AICategorizerService
 */
export function createMockAICategorizerService(
  options: MockAICategorizerOptions = {}
): AICategorizerService {
  const {
    categorizeSingleResult = createMockCategorizationResult(),
    categorizeBatchResult = [],
    categorizeImageResult = createMockVisionResult(),
    circuitBreakerState = 'closed',
    shouldFail = false,
    failureError,
  } = options;

  const fail = () => {
    if (shouldFail) {
      throw failureError || new Error('AI service error');
    }
  };

  return {
    categorizeSingle: mock((text: string) => {
      fail();
      return Promise.resolve(categorizeSingleResult);
    }),

    categorizeBatch: mock(
      (transactions: Array<{ idx: number; text: string }>) => {
        fail();
        // If custom result provided, use it; otherwise generate from input
        if (categorizeBatchResult.length > 0) {
          return Promise.resolve(categorizeBatchResult);
        }
        return Promise.resolve(
          transactions.map((t, i) => createMockBatchItem(t.idx))
        );
      }
    ),

    categorizeImage: mock((base64: string, mimeType: string) => {
      fail();
      return Promise.resolve(categorizeImageResult);
    }),

    getCircuitBreakerState: mock(() => ({
      state: circuitBreakerState,
      failureCount: circuitBreakerState === 'open' ? 3 : 0,
      lastOpenedAt: circuitBreakerState === 'open' ? new Date() : null,
      lastSuccessAt:
        circuitBreakerState === 'closed' ? new Date() : null,
    })),
  } as unknown as AICategorizerService;
}

/**
 * Create a mock that simulates circuit breaker behavior
 */
export function createMockAICategorizerWithCircuitBreaker(): AICategorizerService {
  let failureCount = 0;
  let state: 'closed' | 'open' | 'half_open' = 'closed';
  const threshold = 3;

  return {
    categorizeSingle: mock((text: string) => {
      if (state === 'open') {
        throw new Error('Circuit breaker is open');
      }

      // Simulate random failures
      if (Math.random() < 0.3) {
        failureCount++;
        if (failureCount >= threshold) {
          state = 'open';
        }
        throw new Error('AI service temporarily unavailable');
      }

      // Success
      failureCount = 0;
      if (state === 'half_open') {
        state = 'closed';
      }

      return Promise.resolve(createMockCategorizationResult());
    }),

    categorizeBatch: mock(
      (transactions: Array<{ idx: number; text: string }>) => {
        if (state === 'open') {
          throw new Error('Circuit breaker is open');
        }
        return Promise.resolve(
          transactions.map((t) => createMockBatchItem(t.idx))
        );
      }
    ),

    categorizeImage: mock((base64: string, mimeType: string) => {
      if (state === 'open') {
        throw new Error('Circuit breaker is open');
      }
      return Promise.resolve(createMockVisionResult());
    }),

    getCircuitBreakerState: mock(() => ({
      state,
      failureCount,
      lastOpenedAt: state === 'open' ? new Date() : null,
      lastSuccessAt: state === 'closed' ? new Date() : null,
    })),
  } as unknown as AICategorizerService;
}
