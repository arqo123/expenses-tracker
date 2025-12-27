/**
 * Error classifier for PostgreSQL and application errors
 * Provides user-friendly messages for common error scenarios
 */

export interface ClassifiedError {
  type: 'duplicate_key' | 'connection' | 'timeout' | 'constraint' | 'validation' | 'unknown';
  userMessage: string;
  technicalDetail: string;
  retryable: boolean;
}

interface PostgresError {
  code?: string;
  constraint?: string;
  detail?: string;
  message?: string;
  severity?: string;
}

/**
 * PostgreSQL error codes reference:
 * https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PG_ERROR_CODES = {
  // Class 08 - Connection Exception
  CONNECTION_EXCEPTION: '08000',
  CONNECTION_DOES_NOT_EXIST: '08003',
  CONNECTION_FAILURE: '08006',
  SQLCLIENT_UNABLE_TO_ESTABLISH: '08001',

  // Class 23 - Integrity Constraint Violation
  INTEGRITY_CONSTRAINT: '23000',
  NOT_NULL_VIOLATION: '23502',
  FOREIGN_KEY_VIOLATION: '23503',
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',

  // Class 40 - Transaction Rollback
  TRANSACTION_ROLLBACK: '40000',
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',

  // Class 53 - Insufficient Resources
  INSUFFICIENT_RESOURCES: '53000',
  DISK_FULL: '53100',
  OUT_OF_MEMORY: '53200',
  TOO_MANY_CONNECTIONS: '53300',

  // Class 57 - Operator Intervention
  OPERATOR_INTERVENTION: '57000',
  QUERY_CANCELED: '57014',
  ADMIN_SHUTDOWN: '57P01',
  CRASH_SHUTDOWN: '57P02',

  // Class 58 - System Error
  SYSTEM_ERROR: '58000',
  IO_ERROR: '58030',
} as const;

export function classifyDatabaseError(error: unknown): ClassifiedError {
  const err = error as PostgresError;
  const code = err.code;
  const constraint = err.constraint;
  const detail = err.detail;

  // Unique violation (duplicate key)
  if (code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
    // Check which constraint was violated
    if (constraint === 'expenses_title_key') {
      return {
        type: 'duplicate_key',
        userMessage: 'Wewnętrzny błąd generowania ID. Spróbuj ponownie.',
        technicalDetail: `Duplicate expense ID: ${detail}`,
        retryable: true,
      };
    }
    if (constraint === 'idx_expenses_hash_unique' || constraint?.includes('hash')) {
      return {
        type: 'duplicate_key',
        userMessage: 'Te transakcje już istnieją w bazie (wykryto duplikaty).',
        technicalDetail: `Duplicate hash: ${detail}`,
        retryable: false,
      };
    }
    return {
      type: 'duplicate_key',
      userMessage: 'Niektóre dane już istnieją w bazie. Spróbuj ponownie.',
      technicalDetail: detail || 'Unique constraint violation',
      retryable: true,
    };
  }

  // Connection errors
  if (code?.startsWith('08')) {
    return {
      type: 'connection',
      userMessage: 'Problem z połączeniem do bazy danych. Spróbuj za chwilę.',
      technicalDetail: `Connection error: ${code} - ${err.message}`,
      retryable: true,
    };
  }

  // Timeout / cancellation
  if (code === PG_ERROR_CODES.QUERY_CANCELED) {
    return {
      type: 'timeout',
      userMessage: 'Operacja trwała za długo i została przerwana. Spróbuj z mniejszym plikiem.',
      technicalDetail: 'Query was canceled (timeout)',
      retryable: true,
    };
  }

  // Transaction / deadlock
  if (code === PG_ERROR_CODES.DEADLOCK_DETECTED || code === PG_ERROR_CODES.SERIALIZATION_FAILURE) {
    return {
      type: 'constraint',
      userMessage: 'Konflikt przy zapisie danych. Spróbuj ponownie za chwilę.',
      technicalDetail: `Transaction error: ${code}`,
      retryable: true,
    };
  }

  // Resource errors
  if (code?.startsWith('53')) {
    return {
      type: 'connection',
      userMessage: 'Serwer jest przeciążony. Spróbuj ponownie za kilka minut.',
      technicalDetail: `Resource error: ${code} - ${err.message}`,
      retryable: true,
    };
  }

  // Foreign key violation
  if (code === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    return {
      type: 'constraint',
      userMessage: 'Błąd spójności danych. Skontaktuj się z administratorem.',
      technicalDetail: `Foreign key violation: ${detail}`,
      retryable: false,
    };
  }

  // Not null violation
  if (code === PG_ERROR_CODES.NOT_NULL_VIOLATION) {
    return {
      type: 'validation',
      userMessage: 'Brakuje wymaganych danych w transakcjach. Sprawdź plik CSV.',
      technicalDetail: `Not null violation: ${detail}`,
      retryable: false,
    };
  }

  // Check constraint
  if (code === PG_ERROR_CODES.CHECK_VIOLATION) {
    return {
      type: 'validation',
      userMessage: 'Nieprawidłowe dane w transakcjach. Sprawdź format pliku CSV.',
      technicalDetail: `Check constraint violation: ${detail}`,
      retryable: false,
    };
  }

  // System shutdown
  if (code?.startsWith('57')) {
    return {
      type: 'connection',
      userMessage: 'Serwer jest chwilowo niedostępny. Spróbuj za kilka minut.',
      technicalDetail: `Server shutdown: ${code}`,
      retryable: true,
    };
  }

  // Unknown error
  return {
    type: 'unknown',
    userMessage: 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie lub skontaktuj się z administratorem.',
    technicalDetail: String(error),
    retryable: false,
  };
}

/**
 * Classify general application errors (not just DB)
 */
export function classifyError(error: unknown): ClassifiedError {
  // Check if it's a fetch/network error
  if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network'))) {
    return {
      type: 'connection',
      userMessage: 'Problem z połączeniem sieciowym. Sprawdź internet i spróbuj ponownie.',
      technicalDetail: error.message,
      retryable: true,
    };
  }

  // Check if it's a timeout error
  if (error instanceof Error && error.name === 'TimeoutError') {
    return {
      type: 'timeout',
      userMessage: 'Operacja przekroczyła limit czasu. Spróbuj ponownie.',
      technicalDetail: error.message,
      retryable: true,
    };
  }

  // Try to classify as DB error
  const dbError = classifyDatabaseError(error);
  if (dbError.type !== 'unknown') {
    return dbError;
  }

  // Generic error
  return {
    type: 'unknown',
    userMessage: 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.',
    technicalDetail: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}
