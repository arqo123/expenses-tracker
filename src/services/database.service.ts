import pg from 'pg';
import type { Expense, CreateExpenseInput, ExpenseCategory, GroupedExpense, ExpenseOrGroup } from '../types/expense.types.ts';
import type { PendingReceipt, MatchedExpense, ReplaceResult } from '../types/receipt-matcher.types.ts';
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

  // Get pool for other services
  getPool(): pg.Pool {
    return this.pool;
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
          user_name, opis, zrodlo, raw_input, status, hash, created_at, receipt_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
        expense.receipt_id || null,
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
            user_name, opis, zrodlo, raw_input, status, hash, created_at, receipt_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
          expense.receipt_id || null,
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

  // Optimized batch create with UNNEST - single INSERT for all rows
  async createExpensesBatchOptimized(expenses: CreateExpenseInput[]): Promise<{
    created: Expense[];
    duplicates: string[];
  }> {
    if (expenses.length === 0) {
      return { created: [], duplicates: [] };
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const now = new Date().toISOString();

      // Prepare all data with hashes upfront
      const preparedData = expenses.map(e => ({
        id: this.generateExpenseId(),
        hash: this.generateHash(e),
        date: e.date || now.split('T')[0],
        amount: e.amount,
        currency: e.currency || 'PLN',
        category: e.category,
        shop: e.shop,
        user: e.user,
        description: e.description || '',
        source: e.source,
        raw_input: e.raw_input || '',
        receipt_id: e.receipt_id || null,
      }));

      // Check only the hashes we need (not all!)
      const allHashes = preparedData.map(d => d.hash);
      const existingHashes = await this.checkExistingHashes(client, allHashes);

      // Filter duplicates locally
      const toInsert = preparedData.filter(d => !existingHashes.has(d.hash));
      const duplicateHashes = preparedData
        .filter(d => existingHashes.has(d.hash))
        .map(d => d.hash);

      if (toInsert.length === 0) {
        await client.query('COMMIT');
        return { created: [], duplicates: duplicateHashes };
      }

      // SINGLE INSERT with UNNEST - one round trip for all rows!
      const query = `
        INSERT INTO expenses (
          title, data, kwota, waluta, kategoria, sprzedawca,
          user_name, opis, zrodlo, raw_input, status, hash, created_at, receipt_id
        )
        SELECT * FROM UNNEST(
          $1::varchar[], $2::date[], $3::decimal[], $4::varchar[],
          $5::varchar[], $6::varchar[], $7::varchar[], $8::text[],
          $9::varchar[], $10::text[], $11::varchar[], $12::varchar[],
          $13::timestamptz[], $14::varchar[]
        )
        ON CONFLICT (hash) DO NOTHING
        RETURNING *
      `;

      const result = await client.query(query, [
        toInsert.map(d => d.id),
        toInsert.map(d => d.date),
        toInsert.map(d => d.amount),
        toInsert.map(d => d.currency),
        toInsert.map(d => d.category),
        toInsert.map(d => d.shop),
        toInsert.map(d => d.user),
        toInsert.map(d => d.description),
        toInsert.map(d => d.source),
        toInsert.map(d => d.raw_input),
        toInsert.map(() => 'active'),
        toInsert.map(d => d.hash),
        toInsert.map(() => now),
        toInsert.map(d => d.receipt_id),
      ]);

      await client.query('COMMIT');

      return {
        created: result.rows.map(row => this.mapToExpense(row)),
        duplicates: duplicateHashes,
      };
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

  // Get expense by ID
  async getExpenseById(expenseId: string): Promise<Expense | null> {
    const query = `
      SELECT * FROM expenses
      WHERE title = $1 AND status = 'active'
    `;
    const result = await this.pool.query(query, [expenseId]);
    return result.rows.length > 0 ? this.mapToExpense(result.rows[0]) : null;
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

  // Get recent expenses with receipt grouping for statistics
  async getRecentExpensesGrouped(userName: string, limit: number = 10): Promise<ExpenseOrGroup[]> {
    const query = `
      WITH grouped AS (
        SELECT
          receipt_id,
          sprzedawca as shop,
          SUM(kwota) as total_amount,
          COUNT(*) as product_count,
          MIN(data) as data,
          MIN(created_at) as created_at,
          user_name
        FROM expenses
        WHERE user_name = $1
          AND status = 'active'
          AND receipt_id IS NOT NULL
        GROUP BY receipt_id, sprzedawca, user_name

        UNION ALL

        SELECT
          NULL as receipt_id,
          sprzedawca as shop,
          kwota as total_amount,
          1 as product_count,
          data,
          created_at,
          user_name
        FROM expenses
        WHERE user_name = $1
          AND status = 'active'
          AND receipt_id IS NULL
      )
      SELECT * FROM grouped
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await this.pool.query(query, [userName, limit]);

    return result.rows.map(row => {
      const productCount = parseInt(row.product_count as string, 10);

      if (productCount > 1 && row.receipt_id) {
        // Grouped receipt
        return {
          receipt_id: row.receipt_id as string,
          shop: row.shop as string,
          total_amount: parseFloat(row.total_amount as string),
          product_count: productCount,
          data: row.data instanceof Date ? row.data.toISOString().slice(0, 10) : String(row.data),
          created_at: row.created_at as string,
          user_name: row.user_name as string,
        } as GroupedExpense;
      } else {
        // Single expense - need to fetch full details
        return {
          receipt_id: null,
          shop: row.shop as string,
          total_amount: parseFloat(row.total_amount as string),
          product_count: 1,
          data: row.data instanceof Date ? row.data.toISOString().slice(0, 10) : String(row.data),
          created_at: row.created_at as string,
          user_name: row.user_name as string,
        } as GroupedExpense;
      }
    });
  }

  // Get individual products from a receipt
  async getReceiptProducts(receiptId: string): Promise<Expense[]> {
    const query = `
      SELECT * FROM expenses
      WHERE receipt_id = $1 AND status = 'active'
      ORDER BY created_at ASC
    `;
    const result = await this.pool.query(query, [receiptId]);
    return result.rows.map(row => this.mapToExpense(row));
  }

  // Get recent expenses by source (for OCR edit)
  async getRecentExpensesBySource(
    userName: string,
    source: string,
    limit: number
  ): Promise<Expense[]> {
    const query = `
      SELECT * FROM expenses
      WHERE user_name = $1 AND zrodlo = $2 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT $3
    `;
    const result = await this.pool.query(query, [userName, source, limit]);
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

  // Save product learning for future categorization
  // IMPORTANT: Saves the FULL phrase, not individual words
  // e.g. "kremowe mydło w płynie" → Dom (not "krem" → Dom)
  async saveProductLearning(
    productName: string,
    correctCategory: ExpenseCategory,
    storeName?: string
  ): Promise<void> {
    const pattern = this.normalizeProductName(productName);

    // Skip if pattern is too short
    if (pattern.length < 3) {
      console.log(`[Database] Skipping learning - pattern too short: "${pattern}"`);
      return;
    }

    const storePattern = storeName?.toLowerCase() || null;

    try {
      await this.pool.query(`
        INSERT INTO product_learnings (product_pattern, correct_category, store_pattern)
        VALUES ($1, $2, $3)
        ON CONFLICT (product_pattern, store_pattern) DO UPDATE SET
          correct_category = $2,
          usage_count = product_learnings.usage_count + 1,
          updated_at = NOW()
      `, [pattern, correctCategory, storePattern]);

      console.log(`[Database] Saved learning: "${pattern}" → ${correctCategory}`);
    } catch (error) {
      console.error(`[Database] Failed to save learning for "${pattern}":`, error);
    }
  }

  // Get product learnings for categorization
  async getProductLearnings(
    productNames: string[],
    storeName?: string
  ): Promise<Map<string, ExpenseCategory>> {
    const result = new Map<string, ExpenseCategory>();

    if (productNames.length === 0) {
      return result;
    }

    // Fetch all learnings, prioritizing store-specific ones
    // Order by pattern length DESC to match more specific patterns first
    const query = `
      SELECT product_pattern, correct_category, store_pattern
      FROM product_learnings
      WHERE ($1::text IS NULL OR store_pattern IS NULL OR store_pattern = $1)
      ORDER BY
        CASE WHEN store_pattern IS NOT NULL THEN 0 ELSE 1 END,
        LENGTH(product_pattern) DESC,
        usage_count DESC
    `;
    const { rows } = await this.pool.query(query, [storeName?.toLowerCase() || null]);

    // Match patterns to product names
    // Check if normalized product name contains the pattern OR pattern contains the name
    for (const name of productNames) {
      const normalizedName = this.normalizeProductName(name);
      for (const row of rows) {
        // Match if: name contains pattern OR pattern contains name (for similar products)
        if (normalizedName.includes(row.product_pattern) || row.product_pattern.includes(normalizedName)) {
          result.set(name, row.correct_category as ExpenseCategory);
          console.log(`[Database] Matched learning: "${name}" → ${row.correct_category} (pattern: ${row.product_pattern})`);
          break;
        }
      }
    }

    return result;
  }

  // Normalize product name for comparison (keeps full phrase)
  private normalizeProductName(name: string): string {
    return name.toLowerCase()
      .replace(/[^a-ząćęłńóśźż0-9\s]/g, '')  // Keep Polish letters and numbers
      .replace(/\s+/g, ' ')                    // Normalize whitespace
      .trim();
  }

  private async getExistingHashes(client: pg.PoolClient): Promise<Set<string>> {
    const query = 'SELECT hash FROM expenses';
    const result = await client.query(query);
    return new Set(result.rows.map((row: { hash: string }) => row.hash));
  }

  // Optimized: check only specific hashes instead of loading all
  private async checkExistingHashes(
    client: pg.PoolClient,
    hashes: string[]
  ): Promise<Set<string>> {
    if (hashes.length === 0) return new Set();

    const query = 'SELECT hash FROM expenses WHERE hash = ANY($1)';
    const result = await client.query(query, [hashes]);
    return new Set(result.rows.map((row: { hash: string }) => row.hash));
  }

  private generateExpenseId(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    // crypto.randomUUID() guarantees uniqueness even in parallel batch inserts
    const uuid = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    return `exp_${date}_${uuid}`;
  }

  private generateHash(expense: CreateExpenseInput): string {
    const parts = [
      expense.amount.toString(),
      expense.shop.toLowerCase().replace(/\s+/g, '_'),
      expense.date || new Date().toISOString().split('T')[0],
      expense.user.toLowerCase(),
      // Include description to avoid collisions for multiple products with same price
      (expense.description || '').toLowerCase().replace(/\s+/g, '_').slice(0, 50),
    ];
    return parts.join('_');
  }

  private mapToExpense(row: Record<string, unknown>): Expense {
    return {
      id: row.title as string,
      data: row.data instanceof Date
        ? row.data.toISOString().slice(0, 10)
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
      receipt_id: row.receipt_id as string | null,
    };
  }

  // ===== RECEIPT MATCHING METHODS =====

  // Find manual expenses that might match a scanned receipt
  async findMatchingManualExpenses(
    userName: string,
    receiptDate: string,
    receiptTotal: number,
    receiptShop: string
  ): Promise<MatchedExpense[]> {
    const normalizedShop = receiptShop.toLowerCase()
      .replace(/\s*(sp\.?\s*z\.?\s*o\.?\s*o\.?|spółka|s\.?a\.?)\s*/gi, '')
      .replace(/\s*(polska|markety?|sklepy?)\s*/gi, '')
      .replace(/\d+/g, '')
      .replace(/[^a-ząćęłńóśźż\s]/gi, '')
      .trim()
      .split(' ')[0] || '';

    const query = `
      SELECT title as id, kwota, sprzedawca, data, zrodlo
      FROM expenses
      WHERE zrodlo IN ('telegram_text', 'telegram_voice')
        AND status = 'active'
        AND user_name = $1
        AND data BETWEEN ($2::date - INTERVAL '4 days') AND ($2::date + INTERVAL '4 days')
        AND kwota BETWEEN ($3 * 0.95) AND ($3 * 1.05)
        AND (
          LOWER(sprzedawca) = LOWER($4)
          OR LOWER($5) LIKE '%' || LOWER(sprzedawca) || '%'
          OR LOWER(sprzedawca) LIKE '%' || $5 || '%'
        )
      ORDER BY ABS(data - $2::date), ABS(kwota - $3)
      LIMIT 5
    `;

    const result = await this.pool.query(query, [
      userName,
      receiptDate,
      receiptTotal,
      receiptShop,
      normalizedShop,
    ]);

    return result.rows.map(row => ({
      id: row.id as string,
      kwota: parseFloat(row.kwota),
      sprzedawca: row.sprzedawca as string,
      data: row.data instanceof Date
        ? row.data.toISOString().split('T')[0]
        : String(row.data),
      zrodlo: row.zrodlo as MatchedExpense['zrodlo'],
    }));
  }

  // Save pending receipt session
  async saveReceiptSession(session: PendingReceipt): Promise<void> {
    const query = `
      INSERT INTO pending_receipts (
        session_id, user_name, chat_id, receipt_data, matched_expense_ids, status, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await this.pool.query(query, [
      session.sessionId,
      session.userName,
      session.chatId,
      JSON.stringify(session.receiptData),
      session.matchedExpenses.map(m => m.id),
      session.status,
      session.createdAt,
      session.expiresAt,
    ]);
  }

  // Get pending receipt session
  async getReceiptSession(sessionId: string): Promise<PendingReceipt | null> {
    const query = `
      SELECT session_id, user_name, chat_id, receipt_data, matched_expense_ids, status, created_at, expires_at
      FROM pending_receipts
      WHERE session_id = $1
    `;

    const result = await this.pool.query(query, [sessionId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Fetch matched expenses details
    const matchedExpenses: MatchedExpense[] = [];
    if (row.matched_expense_ids && row.matched_expense_ids.length > 0) {
      const expQuery = `
        SELECT title as id, kwota, sprzedawca, data, zrodlo
        FROM expenses
        WHERE title = ANY($1)
      `;
      const expResult = await this.pool.query(expQuery, [row.matched_expense_ids]);
      for (const expRow of expResult.rows) {
        matchedExpenses.push({
          id: expRow.id as string,
          kwota: parseFloat(expRow.kwota),
          sprzedawca: expRow.sprzedawca as string,
          data: expRow.data instanceof Date
            ? expRow.data.toISOString().split('T')[0]
            : String(expRow.data),
          zrodlo: expRow.zrodlo as MatchedExpense['zrodlo'],
        });
      }
    }

    return {
      sessionId: row.session_id,
      userName: row.user_name,
      chatId: Number(row.chat_id),
      receiptData: row.receipt_data,
      matchedExpenses,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  // Replace manual expense with receipt products (atomic)
  async replaceManualWithReceipt(
    oldExpenseId: string,
    newExpenses: CreateExpenseInput[],
    userName: string
  ): Promise<ReplaceResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Soft delete the old expense
      const deleteResult = await client.query(
        `UPDATE expenses SET status = 'deleted' WHERE title = $1 AND user_name = $2 RETURNING title`,
        [oldExpenseId, userName]
      );

      if (deleteResult.rowCount === 0) {
        console.log(`[Database] Old expense ${oldExpenseId} not found or already deleted`);
      }

      // Create new expenses from receipt
      const created: Expense[] = [];
      const existingHashes = await this.getExistingHashes(client);

      for (const expense of newExpenses) {
        const hash = this.generateHash(expense);

        if (existingHashes.has(hash)) {
          continue; // Skip duplicates
        }

        const id = this.generateExpenseId();
        const now = new Date().toISOString();

        const query = `
          INSERT INTO expenses (
            title, data, kwota, waluta, kategoria, sprzedawca,
            user_name, opis, zrodlo, raw_input, status, hash, created_at, receipt_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
          expense.receipt_id || null,
        ];

        const result = await client.query(query, values);
        created.push(this.mapToExpense(result.rows[0]));
        existingHashes.add(hash);
      }

      await client.query('COMMIT');

      return {
        deletedExpenseId: oldExpenseId,
        created,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Mark receipt session as processed
  async markReceiptSessionProcessed(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE pending_receipts SET status = 'processed' WHERE session_id = $1`,
      [sessionId]
    );
  }

  // Cleanup expired receipt sessions
  async cleanupExpiredReceiptSessions(): Promise<number> {
    const result = await this.pool.query(`
      DELETE FROM pending_receipts
      WHERE expires_at < NOW() OR status = 'processed'
    `);
    return result.rowCount || 0;
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
  // If structure is broken, reset and recreate all tables
  async runMigrations(): Promise<void> {
    console.log('[Database] Checking database structure...');

    // Check if all required tables exist
    const requiredTables = [
      'expenses', 'audit_log', 'idempotency', 'merchants',
      'product_learnings', 'pending_receipts',
      'shopping_lists', 'shopping_items', 'shopping_stats'
    ];

    const tablesResult = await this.pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const existingTables = tablesResult.rows.map(r => r.table_name);
    console.log('[Database] Existing tables:', existingTables.join(', ') || 'none');

    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    // Also check if shopping_items has the emoji column
    let needsReset = missingTables.length > 0;
    if (!needsReset && existingTables.includes('shopping_items')) {
      const columnsResult = await this.pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'shopping_items' AND table_schema = 'public'
      `);
      const columns = columnsResult.rows.map(r => r.column_name);
      if (!columns.includes('emoji')) {
        console.log('[Database] shopping_items missing emoji column!');
        needsReset = true;
      }
    }

    if (needsReset) {
      if (missingTables.length > 0) {
        console.log('[Database] Missing tables:', missingTables.join(', '));
      }
      console.log('[Database] Resetting database to fix structure...');

      // Drop all tables and recreate
      await this.pool.query(`
        DROP TABLE IF EXISTS shopping_items CASCADE;
        DROP TABLE IF EXISTS shopping_lists CASCADE;
        DROP TABLE IF EXISTS shopping_stats CASCADE;
        DROP TABLE IF EXISTS pending_receipts CASCADE;
        DROP TABLE IF EXISTS product_learnings CASCADE;
        DROP TABLE IF EXISTS merchants CASCADE;
        DROP TABLE IF EXISTS idempotency CASCADE;
        DROP TABLE IF EXISTS audit_log CASCADE;
        DROP TABLE IF EXISTS expenses CASCADE;
      `);
      console.log('[Database] All tables dropped, recreating...');
    }

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
    // UNIQUE constraint for ON CONFLICT (needed for batch insert optimization)
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_hash_unique
      ON expenses(hash) WHERE hash IS NOT NULL
    `);
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

    // 005_product_learnings.sql
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS product_learnings (
        id SERIAL PRIMARY KEY,
        product_pattern VARCHAR(255) NOT NULL,
        correct_category VARCHAR(50) NOT NULL,
        store_pattern VARCHAR(255),
        confidence DECIMAL(3,2) DEFAULT 1.0,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(product_pattern, store_pattern)
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_learnings_pattern ON product_learnings(product_pattern)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_learnings_store ON product_learnings(store_pattern)');
    console.log('[Database] ✓ product_learnings table ready');

    // 006_pending_receipts.sql - for receipt matching feature
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS pending_receipts (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(36) NOT NULL UNIQUE,
        user_name VARCHAR(50) NOT NULL,
        chat_id BIGINT NOT NULL,
        receipt_data JSONB NOT NULL,
        matched_expense_ids TEXT[],
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_pending_session ON pending_receipts(session_id)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_pending_expires ON pending_receipts(expires_at)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_receipts(status)');
    console.log('[Database] ✓ pending_receipts table ready');

    // 007_shopping_lists.sql - for shopping list feature
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS shopping_lists (
        id SERIAL PRIMARY KEY,
        list_id VARCHAR(36) NOT NULL UNIQUE,
        name VARCHAR(100) DEFAULT 'Lista zakupow',
        is_active BOOLEAN DEFAULT true,
        created_by VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_shopping_lists_active ON shopping_lists(is_active)');
    console.log('[Database] ✓ shopping_lists table ready');

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS shopping_items (
        id SERIAL PRIMARY KEY,
        item_id VARCHAR(36) NOT NULL UNIQUE,
        list_id VARCHAR(36) NOT NULL REFERENCES shopping_lists(list_id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        quantity INTEGER DEFAULT 1,
        shop_category VARCHAR(50),
        added_by VARCHAR(50) NOT NULL,
        is_checked BOOLEAN DEFAULT false,
        priority INTEGER DEFAULT 0,
        emoji VARCHAR(10) DEFAULT '📦',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON shopping_items(list_id)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_shopping_items_checked ON shopping_items(is_checked)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_shopping_items_category ON shopping_items(shop_category)');
    // Add emoji column if missing (for existing tables)
    await this.pool.query(`
      ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS emoji VARCHAR(10) DEFAULT '📦'
    `);
    console.log('[Database] ✓ shopping_items table ready');

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS shopping_stats (
        id SERIAL PRIMARY KEY,
        product_name VARCHAR(255) NOT NULL UNIQUE,
        purchase_count INTEGER DEFAULT 1,
        avg_interval_days INTEGER,
        last_bought_at TIMESTAMPTZ,
        typical_shop VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_shopping_stats_name ON shopping_stats(product_name)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_shopping_stats_count ON shopping_stats(purchase_count DESC)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_shopping_stats_last_bought ON shopping_stats(last_bought_at)');
    console.log('[Database] ✓ shopping_stats table ready');

    // 008_receipt_grouping.sql - for grouping receipt items in statistics
    await this.pool.query('ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_id VARCHAR(36)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_receipt_id ON expenses(receipt_id)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_user_receipt ON expenses(user_name, receipt_id, created_at DESC)');
    console.log('[Database] ✓ receipt_id column ready');

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
