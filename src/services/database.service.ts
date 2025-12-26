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
