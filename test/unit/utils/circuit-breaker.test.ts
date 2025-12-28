/**
 * Tests for circuit-breaker.ts
 * Testing CircuitBreaker class state transitions and behavior
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { CircuitBreaker } from '../../../src/utils/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 1000 });
  });

  describe('initial state', () => {
    test('startuje jako closed', () => {
      expect(breaker.getState().state).toBe('closed');
    });

    test('failureCount jest 0', () => {
      expect(breaker.getState().failureCount).toBe(0);
    });

    test('lastOpenedAt jest null', () => {
      expect(breaker.getState().lastOpenedAt).toBeNull();
    });

    test('lastSuccessAt jest null', () => {
      expect(breaker.getState().lastSuccessAt).toBeNull();
    });

    test('isAllowed() zwraca true', () => {
      expect(breaker.isAllowed()).toBe(true);
    });
  });

  describe('recording failures', () => {
    test('pojedynczy failure zwieksza licznik', () => {
      breaker.recordFailure();
      expect(breaker.getState().failureCount).toBe(1);
      expect(breaker.getState().state).toBe('closed');
    });

    test('dwa failures - wciaz closed', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState().failureCount).toBe(2);
      expect(breaker.getState().state).toBe('closed');
      expect(breaker.isAllowed()).toBe(true);
    });

    test('threshold failures otwiera circuit', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure(); // 3rd - reaches threshold
      expect(breaker.getState().state).toBe('open');
      expect(breaker.isAllowed()).toBe(false);
    });

    test('wiecej niz threshold failures - wciaz open', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure(); // 4th
      expect(breaker.getState().state).toBe('open');
    });
  });

  describe('recording success', () => {
    test('sukces resetuje failure count', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState().failureCount).toBe(2);

      breaker.recordSuccess();
      expect(breaker.getState().failureCount).toBe(0);
    });

    test('sukces ustawia lastSuccessAt', () => {
      expect(breaker.getState().lastSuccessAt).toBeNull();
      breaker.recordSuccess();
      expect(breaker.getState().lastSuccessAt).not.toBeNull();
    });

    test('sukces nie zmienia stanu jesli closed', () => {
      breaker.recordSuccess();
      expect(breaker.getState().state).toBe('closed');
    });
  });

  describe('state transitions: closed -> open', () => {
    test('przechodzi do open po threshold failures', () => {
      expect(breaker.getState().state).toBe('closed');

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      expect(breaker.getState().state).toBe('open');
    });

    test('lastOpenedAt jest ustawione po otwarciu', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      expect(breaker.getState().lastOpenedAt).not.toBeNull();
    });

    test('isAllowed() zwraca false gdy open', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      expect(breaker.isAllowed()).toBe(false);
    });
  });

  describe('state transitions: open -> half_open', () => {
    test('przechodzi do half_open po cooldown', async () => {
      // Krotki cooldown dla testu
      breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 10 });

      breaker.recordFailure();
      expect(breaker.getState().state).toBe('open');

      // Czekaj na cooldown
      await new Promise((r) => setTimeout(r, 15));

      // Sprawdzenie isAllowed() trigger'uje transition
      expect(breaker.isAllowed()).toBe(true);
      expect(breaker.getState().state).toBe('half_open');
    });

    test('failure count jest zresetowany w half_open', async () => {
      breaker = new CircuitBreaker({ threshold: 2, cooldownMs: 10 });

      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState().failureCount).toBe(2);

      await new Promise((r) => setTimeout(r, 15));
      breaker.isAllowed(); // trigger transition

      expect(breaker.getState().failureCount).toBe(0);
    });
  });

  describe('state transitions: half_open -> closed', () => {
    test('sukces w half_open zamyka circuit', async () => {
      breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 10 });

      breaker.recordFailure();
      expect(breaker.getState().state).toBe('open');

      await new Promise((r) => setTimeout(r, 15));
      breaker.isAllowed(); // half_open

      breaker.recordSuccess();
      expect(breaker.getState().state).toBe('closed');
    });
  });

  describe('state transitions: half_open -> open', () => {
    test('failure w half_open otwiera circuit ponownie', async () => {
      breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 10 });

      breaker.recordFailure();
      await new Promise((r) => setTimeout(r, 15));
      breaker.isAllowed(); // half_open

      breaker.recordFailure();
      expect(breaker.getState().state).toBe('open');
    });
  });

  describe('reset()', () => {
    test('resetuje do closed state', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState().state).toBe('open');

      breaker.reset();
      expect(breaker.getState().state).toBe('closed');
    });

    test('resetuje failure count', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState().failureCount).toBe(2);

      breaker.reset();
      expect(breaker.getState().failureCount).toBe(0);
    });

    test('resetuje lastOpenedAt', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState().lastOpenedAt).not.toBeNull();

      breaker.reset();
      expect(breaker.getState().lastOpenedAt).toBeNull();
    });
  });

  describe('rozne thresholdy', () => {
    test('threshold 1 - natychmiastowe otwarcie', () => {
      breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 1000 });
      breaker.recordFailure();
      expect(breaker.getState().state).toBe('open');
    });

    test('threshold 5 - wiecej failures potrzebnych', () => {
      breaker = new CircuitBreaker({ threshold: 5, cooldownMs: 1000 });

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState().state).toBe('closed');

      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState().state).toBe('open');
    });
  });

  describe('rozne cooldowny', () => {
    test('dlugi cooldown - wciaz open po krotkim czasie', async () => {
      breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 10000 });

      breaker.recordFailure();
      expect(breaker.getState().state).toBe('open');

      await new Promise((r) => setTimeout(r, 10));
      expect(breaker.isAllowed()).toBe(false);
      expect(breaker.getState().state).toBe('open');
    });
  });
});
