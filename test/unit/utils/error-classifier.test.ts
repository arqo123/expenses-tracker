/**
 * Tests for error-classifier.ts
 * Testing classifyDatabaseError and classifyError functions
 */
import { describe, test, expect } from 'bun:test';
import {
  classifyDatabaseError,
  classifyError,
} from '../../../src/utils/error-classifier';

describe('classifyDatabaseError', () => {
  describe('unique violation (23505)', () => {
    test('expenses_title_key constraint - retryable', () => {
      const error = {
        code: '23505',
        constraint: 'expenses_title_key',
        detail: 'Key (title)=(exp_123) already exists',
      };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('duplicate_key');
      expect(result.retryable).toBe(true);
      expect(result.userMessage).toContain('generowania ID');
    });

    test('hash constraint - not retryable (real duplicate)', () => {
      const error = {
        code: '23505',
        constraint: 'idx_expenses_hash_unique',
        detail: 'Key (hash)=(50_biedronka_...) already exists',
      };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('duplicate_key');
      expect(result.retryable).toBe(false);
      expect(result.userMessage).toContain('duplikaty');
    });

    test('other hash constraint (contains "hash")', () => {
      const error = {
        code: '23505',
        constraint: 'unique_hash_constraint',
        detail: 'Duplicate hash value',
      };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('duplicate_key');
      expect(result.retryable).toBe(false);
    });

    test('unknown unique constraint - retryable', () => {
      const error = {
        code: '23505',
        constraint: 'some_other_constraint',
        detail: 'Some duplicate',
      };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('duplicate_key');
      expect(result.retryable).toBe(true);
    });
  });

  describe('connection errors (08xxx)', () => {
    const connectionCodes = ['08000', '08003', '08006', '08001'];

    connectionCodes.forEach((code) => {
      test(`code ${code} - connection error`, () => {
        const error = { code, message: 'Connection failed' };

        const result = classifyDatabaseError(error);

        expect(result.type).toBe('connection');
        expect(result.retryable).toBe(true);
        expect(result.userMessage).toContain('połączeniem');
      });
    });
  });

  describe('timeout (57014)', () => {
    test('query canceled', () => {
      const error = { code: '57014', message: 'Query canceled' };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('timeout');
      expect(result.retryable).toBe(true);
      expect(result.userMessage).toContain('za długo');
    });
  });

  describe('deadlock and transaction errors', () => {
    test('deadlock detected (40P01)', () => {
      const error = { code: '40P01', message: 'Deadlock detected' };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('constraint');
      expect(result.retryable).toBe(true);
      expect(result.userMessage).toContain('Konflikt');
    });

    test('serialization failure (40001)', () => {
      const error = { code: '40001', message: 'Serialization failure' };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('constraint');
      expect(result.retryable).toBe(true);
    });
  });

  describe('resource errors (53xxx)', () => {
    test('too many connections (53300)', () => {
      const error = { code: '53300', message: 'Too many connections' };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('connection');
      expect(result.retryable).toBe(true);
      expect(result.userMessage).toContain('przeciążony');
    });

    test('out of memory (53200)', () => {
      const error = { code: '53200', message: 'Out of memory' };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('connection');
      expect(result.retryable).toBe(true);
    });

    test('disk full (53100)', () => {
      const error = { code: '53100', message: 'Disk full' };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('connection');
      expect(result.retryable).toBe(true);
    });
  });

  describe('constraint violations', () => {
    test('foreign key violation (23503)', () => {
      const error = {
        code: '23503',
        detail: 'Key (list_id)=(123) is not present in table "shopping_lists"',
      };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('constraint');
      expect(result.retryable).toBe(false);
      expect(result.userMessage).toContain('spójności');
    });

    test('not null violation (23502)', () => {
      const error = {
        code: '23502',
        detail: 'Null value in column "kwota"',
      };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('validation');
      expect(result.retryable).toBe(false);
      expect(result.userMessage).toContain('wymaganych danych');
    });

    test('check constraint violation (23514)', () => {
      const error = {
        code: '23514',
        detail: 'Check constraint violated',
      };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('validation');
      expect(result.retryable).toBe(false);
      expect(result.userMessage).toContain('Nieprawidłowe');
    });
  });

  describe('system shutdown errors (57xxx)', () => {
    test('admin shutdown (57P01)', () => {
      const error = { code: '57P01', message: 'Admin shutdown' };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('connection');
      expect(result.retryable).toBe(true);
      expect(result.userMessage).toContain('niedostępny');
    });

    test('crash shutdown (57P02)', () => {
      const error = { code: '57P02', message: 'Crash shutdown' };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('connection');
      expect(result.retryable).toBe(true);
    });
  });

  describe('unknown errors', () => {
    test('unknown error code', () => {
      const error = { code: '99999', message: 'Unknown error' };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('unknown');
      expect(result.retryable).toBe(false);
    });

    test('no code at all', () => {
      const error = { message: 'Some error' };

      const result = classifyDatabaseError(error);

      expect(result.type).toBe('unknown');
      expect(result.retryable).toBe(false);
    });

    test('null error throws', () => {
      // classifyDatabaseError doesn't handle null - it will throw
      expect(() => classifyDatabaseError(null)).toThrow();
    });
  });
});

describe('classifyError', () => {
  describe('network/fetch errors', () => {
    test('fetch failed', () => {
      const error = new TypeError('Failed to fetch');

      const result = classifyError(error);

      expect(result.type).toBe('connection');
      expect(result.retryable).toBe(true);
      expect(result.userMessage).toContain('połączeniem');
    });

    test('network error', () => {
      const error = new TypeError('network error');

      const result = classifyError(error);

      expect(result.type).toBe('connection');
      expect(result.retryable).toBe(true);
    });
  });

  describe('timeout errors', () => {
    test('TimeoutError', () => {
      const error = new Error('Operation timed out');
      error.name = 'TimeoutError';

      const result = classifyError(error);

      expect(result.type).toBe('timeout');
      expect(result.retryable).toBe(true);
      expect(result.userMessage).toContain('limit czasu');
    });
  });

  describe('delegates to classifyDatabaseError', () => {
    test('PG error with code', () => {
      const error = { code: '23505', constraint: 'test' };

      const result = classifyError(error);

      expect(result.type).toBe('duplicate_key');
    });

    test('connection error code', () => {
      const error = { code: '08003', message: 'Connection lost' };

      const result = classifyError(error);

      expect(result.type).toBe('connection');
    });
  });

  describe('generic errors', () => {
    test('regular Error', () => {
      const error = new Error('Something went wrong');

      const result = classifyError(error);

      expect(result.type).toBe('unknown');
      expect(result.retryable).toBe(false);
      expect(result.technicalDetail).toContain('Something went wrong');
    });

    test('string error', () => {
      const result = classifyError('Plain string error');

      expect(result.type).toBe('unknown');
      expect(result.technicalDetail).toContain('Plain string error');
    });

    test('undefined error throws', () => {
      // classifyError delegates to classifyDatabaseError which doesn't handle undefined
      expect(() => classifyError(undefined)).toThrow();
    });
  });
});
