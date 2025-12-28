/**
 * Tests for retry.ts
 * Testing withRetry function with exponential backoff
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { withRetry } from '../../../src/utils/retry';

describe('withRetry', () => {
  beforeEach(() => {
    // Suppress console.log during tests
    console.log = () => {};
  });

  describe('successful execution', () => {
    test('zwraca wynik gdy sukces od razu', async () => {
      const fn = mock(() => Promise.resolve('success'));

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('przekazuje wynik funkcji', async () => {
      const fn = mock(() => Promise.resolve({ data: 'test', count: 42 }));

      const result = await withRetry(fn);

      expect(result).toEqual({ data: 'test', count: 42 });
    });
  });

  describe('retry behavior', () => {
    test('ponawia przy bledzie i zwraca sukces', async () => {
      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(new Error('Temporary error'));
        }
        return Promise.resolve('success');
      });

      const result = await withRetry(fn, {
        baseDelayMs: 1,
        maxDelayMs: 10,
        jitterMs: 0,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('ponawia wielokrotnie az do sukcesu', async () => {
      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Temporary error'));
        }
        return Promise.resolve('success after 3 attempts');
      });

      const result = await withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        maxDelayMs: 10,
        jitterMs: 0,
      });

      expect(result).toBe('success after 3 attempts');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('failure after max retries', () => {
    test('wyrzuca blad po maxRetries', async () => {
      const fn = mock(() => Promise.reject(new Error('Persistent error')));

      await expect(
        withRetry(fn, {
          maxRetries: 2,
          baseDelayMs: 1,
          maxDelayMs: 10,
          jitterMs: 0,
        })
      ).rejects.toThrow('Persistent error');

      // 1 initial + 2 retries = 3 calls
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('wyrzuca ostatni blad', async () => {
      let callCount = 0;
      const fn = mock(() => {
        callCount++;
        return Promise.reject(new Error(`Error #${callCount}`));
      });

      await expect(
        withRetry(fn, {
          maxRetries: 2,
          baseDelayMs: 1,
          maxDelayMs: 10,
          jitterMs: 0,
        })
      ).rejects.toThrow('Error #3');
    });
  });

  describe('maxRetries = 0', () => {
    test('nie ponawia przy maxRetries=0', async () => {
      const fn = mock(() => Promise.reject(new Error('Error')));

      await expect(
        withRetry(fn, { maxRetries: 0 })
      ).rejects.toThrow('Error');

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('exponential backoff', () => {
    test('delay rosnie eksponencjalnie', async () => {
      const delays: number[] = [];
      const originalSetTimeout = globalThis.setTimeout;

      // Mock setTimeout to capture delays
      globalThis.setTimeout = ((fn: () => void, ms: number) => {
        delays.push(ms);
        return originalSetTimeout(fn, 1); // Execute quickly for test
      }) as typeof setTimeout;

      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts < 4) {
          return Promise.reject(new Error('Error'));
        }
        return Promise.resolve('success');
      });

      await withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        jitterMs: 0,
      });

      globalThis.setTimeout = originalSetTimeout;

      // Check exponential growth: 100, 200, 400
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(400);
    });

    test('respektuje maxDelayMs', async () => {
      const delays: number[] = [];
      const originalSetTimeout = globalThis.setTimeout;

      globalThis.setTimeout = ((fn: () => void, ms: number) => {
        delays.push(ms);
        return originalSetTimeout(fn, 1);
      }) as typeof setTimeout;

      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts < 5) {
          return Promise.reject(new Error('Error'));
        }
        return Promise.resolve('success');
      });

      await withRetry(fn, {
        maxRetries: 4,
        baseDelayMs: 100,
        maxDelayMs: 250, // Cap at 250
        jitterMs: 0,
      });

      globalThis.setTimeout = originalSetTimeout;

      // 100, 200, 250 (capped), 250 (capped)
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(250); // Should be capped
      expect(delays[3]).toBe(250); // Should be capped
    });
  });

  describe('jitter', () => {
    test('jitter dodaje losowy offset', async () => {
      const delays: number[] = [];
      const originalSetTimeout = globalThis.setTimeout;

      globalThis.setTimeout = ((fn: () => void, ms: number) => {
        delays.push(ms);
        return originalSetTimeout(fn, 1);
      }) as typeof setTimeout;

      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Error'));
        }
        return Promise.resolve('success');
      });

      await withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        jitterMs: 50, // +/- 50ms jitter
      });

      globalThis.setTimeout = originalSetTimeout;

      // First delay should be around 100 (+/- 50)
      expect(delays[0]).toBeGreaterThanOrEqual(50);
      expect(delays[0]).toBeLessThanOrEqual(150);

      // Second delay should be around 200 (+/- 50)
      expect(delays[1]).toBeGreaterThanOrEqual(150);
      expect(delays[1]).toBeLessThanOrEqual(250);
    });

    test('jitter nie daje ujemnego delay', async () => {
      const delays: number[] = [];
      const originalSetTimeout = globalThis.setTimeout;
      const originalRandom = Math.random;

      // Force random to give worst case (-jitter)
      Math.random = () => 0;

      globalThis.setTimeout = ((fn: () => void, ms: number) => {
        delays.push(ms);
        return originalSetTimeout(fn, 1);
      }) as typeof setTimeout;

      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(new Error('Error'));
        }
        return Promise.resolve('success');
      });

      await withRetry(fn, {
        maxRetries: 1,
        baseDelayMs: 10,
        maxDelayMs: 1000,
        jitterMs: 100, // Large jitter relative to delay
      });

      Math.random = originalRandom;
      globalThis.setTimeout = originalSetTimeout;

      // Delay should be at least 0 (clamped via Math.max)
      expect(delays[0]).toBeGreaterThanOrEqual(0);
    });
  });

  describe('default config', () => {
    test('uzywa domyslnej konfiguracji', async () => {
      const fn = mock(() => Promise.resolve('success'));

      const result = await withRetry(fn);

      expect(result).toBe('success');
      // Default should work without explicit config
    });
  });
});
