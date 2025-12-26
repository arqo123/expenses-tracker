import pg from 'pg';
import type { Expense, CreateExpenseInput, ExpenseCategory } from '../types/expense.types.ts';
import { getDatabaseUrl } from '../config/env.ts';
import { withRetry } from '../utils/retry.ts';

const { Pool } = pg;

export class DatabaseService {
  private pool: pg.Pool;

  constructor(connectionString?: string) {
    this.pool = new Pool({
      connectionString: connectionString || getDatabaseUrl(),
      max: 20,
      idleTimeoutMillis: 30000,
    });
  }

  // Create single expense
  async createExpense(expense: CreateExpenseInput): Promise<Expense> {
    const id = this.generateExpenseId();
    const hash = this.generateHash(expense);
    const now = new Date().toISOString();

    return withRetry(async () => {
      const query = `
        INSERT INTO expenses (
          title, data, kwota, waluta, kategoria, sprzedawca,
          user_name, opis, zrodlo, raw_input, status, hash, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;

      const values = [
        id,
        expense.date || now.split('T')[0],
        expense.amount,
        expense.currency || 'PLN',
        expense.category,
        expense.shop,
        expense.user,
        expense.description || '',
        expense.source,
        expense.raw_input || '',
        'active',
        hash,
        now,
      ];

      const result = await this.pool.query(query, values);
      return this.mapToExpense(result.rows[0]);
    });
  }

  // Batch create expenses with deduplication
  async createExpensesBatch(expenses: CreateExpenseInput[]): Promise<{
    created: Expense[];
    duplicates: string[];
  }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get existing hashes
      const existingHashes = await this.getExistingHashes(client);

      const created: Expense[] = [];
      const duplicates: string[] = [];

      for (const expense of expenses) {
        const hash = this.generateHash(expense);

        if (existingHashes.has(hash)) {
          duplicates.push(hash);
          continue;
        }

        const id = this.generateExpenseId();
        const now = new Date().toISOString();

        const query = `
          INSERT INTO expenses (
            title, data, kwota, waluta, kategoria, sprzedawca,
            user_name, opis, zrodlo, raw_input, status, hash, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *
        `;

        const values = [
          id,
          expense.date || now.split('T')[0],
          expense.amount,
          expense.currency || 'PLN',
          expense.category,
          expense.shop,
          expense.user,
          expense.description || '',
          expense.source,
          expense.raw_input || '',
          'active',
          hash,
          now,
        ];

        const result = await client.query(query, values);
        created.push(this.mapToExpense(result.rows[0]));
        existingHashes.add(hash);
      }

      await client.query('COMMIT');
      return { created, duplicates };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Check if hash exists
  async hashExists(hash: string): Promise<boolean> {
    const query = 'SELECT 1 FROM expenses WHERE hash = $1 LIMIT 1';
    const result = await this.pool.query(query, [hash]);
    return result.rows.length > 0;
  }

  // Get user's last expense (for correction)
  async getLastExpenseByUser(userName: string): Promise<Expense | null> {
    const query = `
      SELECT * FROM expenses
      WHERE user_name = $1 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const result = await this.pool.query(query, [userName]);
    return result.rows.length > 0 ? this.mapToExpense(result.rows[0]) : null;
  }

  // Get recent expenses for user
  async getRecentExpenses(userName: string, limit: number = 10): Promise<Expense[]> {
    const query = `
      SELECT * FROM expenses
      WHERE user_name = $1 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await this.pool.query(query, [userName, limit]);
    return result.rows.map(row => this.mapToExpense(row));
  }

  // Update expense category
  async updateExpenseCategory(
    expenseId: string,
    newCategory: ExpenseCategory
  ): Promise<Expense | null> {
    const query = `
      UPDATE expenses
      SET kategoria = $2
      WHERE title = $1 AND status = 'active'
      RETURNING *
    `;
    const result = await this.pool.query(query, [expenseId, newCategory]);
    return result.rows.length > 0 ? this.mapToExpense(result.rows[0]) : null;
  }

  // Soft delete expense
  async deleteExpense(expenseId: string): Promise<boolean> {
    const query = `
      UPDATE expenses
      SET status = 'deleted'
      WHERE title = $1
    `;
    const result = await this.pool.query(query, [expenseId]);
    return (result.rowCount ?? 0) > 0;
  }

  // Query expenses by date range
  async queryExpenses(
    userName: string,
    startDate: string,
    endDate: string,
    category?: string,
    shop?: string
  ): Promise<Expense[]> {
    let query = `
      SELECT * FROM expenses
      WHERE user_name = $1
        AND data >= $2
        AND data <= $3
        AND status = 'active'
    `;
    const values: (string | number)[] = [userName, startDate, endDate];

    if (category) {
      values.push(category);
      query += ` AND kategoria ILIKE $${values.length}`;
    }

    if (shop) {
      values.push(`%${shop}%`);
      query += ` AND sprzedawca ILIKE $${values.length}`;
    }

    query += ' ORDER BY data DESC';

    const result = await this.pool.query(query, values);
    return result.rows.map(row => this.mapToExpense(row));
  }

  // Query all expenses in date range (for weekly report)
  async getExpensesForWeeklyReport(
    startDate: string,
    endDate: string
  ): Promise<Expense[]> {
    const query = `
      SELECT * FROM expenses
      WHERE data >= $1 AND data <= $2 AND status = 'active'
      ORDER BY data DESC
    `;
    const result = await this.pool.query(query, [startDate, endDate]);
    return result.rows.map(row => this.mapToExpense(row));
  }

  // Audit log
  async createAuditLog(
    action: string,
    details: object,
    userId: string,
    expenseId?: string
  ): Promise<void> {
    const query = `
      INSERT INTO audit_log (timestamp, akcja, szczegoly, user_id, expense_id)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await this.pool.query(query, [
      new Date().toISOString(),
      action,
      JSON.stringify(details),
      userId,
      expenseId || null,
    ]);
  }

  // Idempotency check
  async checkIdempotency(messageId: string, chatId: string): Promise<boolean> {
    const query = `
      INSERT INTO idempotency (message_id, chat_id, created_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (message_id, chat_id) DO NOTHING
      RETURNING 1
    `;
    const result = await this.pool.query(query, [
      messageId,
      chatId,
      new Date().toISOString(),
    ]);
    return result.rows.length > 0;
  }

  // Cleanup old idempotency records
  async cleanupIdempotency(): Promise<number> {
    const query = `
      DELETE FROM idempotency
      WHERE created_at < NOW() - INTERVAL '5 minutes'
    `;
    const result = await this.pool.query(query);
    return result.rowCount || 0;
  }

  // Get merchant by shortcut
  async getMerchant(skrot: string): Promise<{ kategoria: string } | null> {
    const query = 'SELECT domyslna_kategoria as kategoria FROM merchants WHERE skrot = $1';
    const result = await this.pool.query(query, [skrot.toLowerCase()]);
    return result.rows[0] || null;
  }

  // Update merchant category (learning)
  async updateMerchantCategory(skrot: string, category: string): Promise<void> {
    const query = `
      INSERT INTO merchants (skrot, pelna_nazwa, domyslna_kategoria, learned_from, correction_count)
      VALUES ($1, $1, $2, 'user_correction', 1)
      ON CONFLICT (skrot) DO UPDATE SET
        domyslna_kategoria = $2,
        correction_count = merchants.correction_count + 1,
        updated_at = NOW()
    `;
    await this.pool.query(query, [skrot.toLowerCase(), category]);
  }

  private async getExistingHashes(client: pg.PoolClient): Promise<Set<string>> {
    const query = 'SELECT hash FROM expenses';
    const result = await client.query(query);
    return new Set(result.rows.map((row: { hash: string }) => row.hash));
  }

  private generateExpenseId(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const time = now.toISOString().slice(11, 23).replace(/[:.]/g, '');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `exp_${date}_${time}_${random}`;
  }

  private generateHash(expense: CreateExpenseInput): string {
    const parts = [
      expense.amount.toString(),
      expense.shop.toLowerCase().replace(/\s+/g, '_'),
      expense.date || new Date().toISOString().split('T')[0],
      expense.user.toLowerCase(),
    ];
    return parts.join('_');
  }

  private mapToExpense(row: Record<string, unknown>): Expense {
    return {
      id: row.title as string,
      data: row.data instanceof Date
        ? row.data.toISOString().split('T')[0]
        : String(row.data),
      kwota: parseFloat(row.kwota as string),
      waluta: row.waluta as string,
      kategoria: row.kategoria as ExpenseCategory,
      sprzedawca: row.sprzedawca as string,
      user_name: row.user_name as string,
      opis: row.opis as string,
      zrodlo: row.zrodlo as Expense['zrodlo'],
      raw_input: row.raw_input as string,
      status: row.status as Expense['status'],
      hash: row.hash as string,
      created_at: row.created_at as string,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  // Ensure database exists (connect to postgres, create if needed)
  static async ensureDatabaseExists(connectionString: string): Promise<void> {
    // Parse connection string to get database name
    const url = new URL(connectionString);
    const dbName = url.pathname.slice(1); // Remove leading /

    if (!dbName || dbName === 'postgres') {
      console.log('[Database] Using default postgres database, skipping creation');
      return;
    }

    // Connect to postgres database to check/create target db
    url.pathname = '/postgres';
    const adminPool = new Pool({
      connectionString: url.toString(),
      max: 1,
    });

    try {
      // Check if database exists
      const checkResult = await adminPool.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [dbName]
      );

      if (checkResult.rows.length === 0) {
        console.log(`[Database] Creating database "${dbName}"...`);
        // Use raw query - can't use parameterized query for CREATE DATABASE
        await adminPool.query(`CREATE DATABASE "${dbName}"`);
        console.log(`[Database] ✓ Database "${dbName}" created`);
      } else {
        console.log(`[Database] ✓ Database "${dbName}" already exists`);
      }
    } finally {
      await adminPool.end();
    }
  }

  // Run migrations - creates tables if they don't exist
  async runMigrations(): Promise<void> {
    console.log('[Database] Running migrations...');

    // 001_expenses.sql
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        data DATE NOT NULL,
        kwota DECIMAL(10,2) NOT NULL,
        waluta VARCHAR(10) DEFAULT 'PLN',
        kategoria VARCHAR(50) NOT NULL,
        sprzedawca VARCHAR(255),
        user_name VARCHAR(50) NOT NULL,
        opis TEXT,
        zrodlo VARCHAR(20) DEFAULT 'telegram',
        raw_input TEXT,
        status VARCHAR(20) DEFAULT 'active',
        hash VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_data ON expenses(data)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_kategoria ON expenses(kategoria)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_name)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_hash ON expenses(hash)');
    console.log('[Database] ✓ expenses table ready');

    // 002_audit_log.sql
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        akcja VARCHAR(50) NOT NULL,
        szczegoly JSONB,
        user_id VARCHAR(50),
        expense_id VARCHAR(50)
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_audit_akcja ON audit_log(akcja)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)');
    console.log('[Database] ✓ audit_log table ready');

    // 003_idempotency.sql
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS idempotency (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(50) NOT NULL,
        chat_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_message_chat UNIQUE (message_id, chat_id)
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency(created_at)');
    console.log('[Database] ✓ idempotency table ready');

    // 004_merchants.sql
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS merchants (
        id SERIAL PRIMARY KEY,
        skrot VARCHAR(100) NOT NULL UNIQUE,
        pelna_nazwa VARCHAR(255) NOT NULL,
        domyslna_kategoria VARCHAR(50) NOT NULL,
        learned_from VARCHAR(50) DEFAULT 'preset',
        correction_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_merchants_skrot ON merchants(skrot)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_merchants_kategoria ON merchants(domyslna_kategoria)');

    // Seed preset merchants
    await this.pool.query(`
      INSERT INTO merchants (skrot, pelna_nazwa, domyslna_kategoria, learned_from) VALUES
        ('biedra', 'Biedronka', 'Zakupy spozywcze', 'preset'),
        ('biedronka', 'Biedronka', 'Zakupy spozywcze', 'preset'),
        ('lidl', 'Lidl', 'Zakupy spozywcze', 'preset'),
        ('zabka', 'Zabka', 'Zakupy spozywcze', 'preset'),
        ('zara', 'Zara', 'Ubrania', 'preset'),
        ('orlen', 'Orlen', 'Paliwo', 'preset'),
        ('bp', 'BP', 'Paliwo', 'preset'),
        ('shell', 'Shell', 'Paliwo', 'preset'),
        ('spotify', 'Spotify', 'Subskrypcje', 'preset'),
        ('netflix', 'Netflix', 'Subskrypcje', 'preset'),
        ('hbo', 'HBO Max', 'Subskrypcje', 'preset'),
        ('uber', 'Uber', 'Transport', 'preset'),
        ('bolt', 'Bolt', 'Transport', 'preset'),
        ('allegro', 'Allegro', 'Zakupy spozywcze', 'preset'),
        ('amazon', 'Amazon', 'Zakupy spozywcze', 'preset'),
        ('rossmann', 'Rossmann', 'Uroda', 'preset'),
        ('hebe', 'Hebe', 'Uroda', 'preset'),
        ('apteka', 'Apteka', 'Zdrowie', 'preset'),
        ('mcdonalds', 'McDonalds', 'Restauracje', 'preset'),
        ('kfc', 'KFC', 'Restauracje', 'preset'),
        ('starbucks', 'Starbucks', 'Kawiarnie', 'preset'),
        ('costa', 'Costa Coffee', 'Kawiarnie', 'preset'),
        ('ikea', 'IKEA', 'Dom', 'preset'),
        ('leroy', 'Leroy Merlin', 'Dom', 'preset'),
        ('castorama', 'Castorama', 'Dom', 'preset'),
        ('media', 'Media Expert', 'Elektronika', 'preset'),
        ('rtv', 'RTV Euro AGD', 'Elektronika', 'preset'),
        ('decathlon', 'Decathlon', 'Sport', 'preset'),
        ('empik', 'Empik', 'Rozrywka', 'preset'),
        ('cinema', 'Cinema City', 'Rozrywka', 'preset'),
        ('multikino', 'Multikino', 'Rozrywka', 'preset'),
        ('xtb', 'XTB', 'Inwestycje', 'preset'),
        ('revolut', 'Revolut', 'Przelewy', 'preset'),
        ('pyszne', 'Pyszne.pl', 'Delivery', 'preset'),
        ('glovo', 'Glovo', 'Delivery', 'preset'),
        ('wolt', 'Wolt', 'Delivery', 'preset'),
        ('ubereats', 'Uber Eats', 'Delivery', 'preset')
      ON CONFLICT (skrot) DO NOTHING
    `);
    console.log('[Database] ✓ merchants table ready');

    console.log('[Database] All migrations completed successfully!');
  }

  // Execute raw SQL query (for NLP queries)
  async executeRawQuery(sql: string, values: (string | number)[]): Promise<Expense[]> {
    const result = await this.pool.query(sql, values);
    return result.rows.map((row) => this.mapToExpense(row));
  }

  // Execute raw aggregation query (for NLP queries)
  async executeRawAggregation(
    sql: string,
    values: (string | number)[]
  ): Promise<Array<{ label: string; total_amount: number; transaction_count: number }>> {
    const result = await this.pool.query(sql, values);
    return result.rows.map((row) => ({
      label: row.label as string,
      total_amount: parseFloat(row.total_amount as string) || 0,
      transaction_count: parseInt(row.transaction_count as string, 10) || 0,
    }));
  }
}
