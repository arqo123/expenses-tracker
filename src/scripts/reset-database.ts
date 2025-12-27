/**
 * Reset database script - drops all tables and recreates them
 * Run with production DATABASE_URL to fix production database:
 * DATABASE_URL="postgres://..." bun src/scripts/reset-database.ts
 */

import pg from 'pg';
import { getDatabaseUrl } from '../config/env.ts';

const { Pool } = pg;

async function resetDatabase() {
  const connectionString = getDatabaseUrl();
  console.log('[Reset] Connecting to database...');
  console.log('[Reset] URL:', connectionString.replace(/:[^:@]+@/, ':***@')); // Hide password

  const pool = new Pool({
    connectionString,
    max: 5,
  });

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('[Reset] Connected successfully!');

    // Check current tables
    const tablesResult = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    console.log('[Reset] Current tables:', tablesResult.rows.map(r => r.table_name).join(', ') || 'none');

    // Drop all tables
    console.log('[Reset] Dropping all tables...');
    await pool.query(`
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
    console.log('[Reset] All tables dropped!');

    // Recreate all tables
    console.log('[Reset] Creating tables...');

    // 001_expenses.sql
    await pool.query(`
      CREATE TABLE expenses (
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
        created_at TIMESTAMPTZ DEFAULT NOW(),
        receipt_id VARCHAR(36)
      )
    `);
    await pool.query('CREATE INDEX idx_expenses_data ON expenses(data)');
    await pool.query('CREATE INDEX idx_expenses_kategoria ON expenses(kategoria)');
    await pool.query('CREATE INDEX idx_expenses_user ON expenses(user_name)');
    await pool.query('CREATE INDEX idx_expenses_hash ON expenses(hash)');
    await pool.query('CREATE INDEX idx_expenses_receipt_id ON expenses(receipt_id)');
    await pool.query('CREATE INDEX idx_expenses_user_receipt ON expenses(user_name, receipt_id, created_at DESC)');
    console.log('[Reset] ✓ expenses table created');

    // 002_audit_log.sql
    await pool.query(`
      CREATE TABLE audit_log (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        akcja VARCHAR(50) NOT NULL,
        szczegoly JSONB,
        user_id VARCHAR(50),
        expense_id VARCHAR(50)
      )
    `);
    await pool.query('CREATE INDEX idx_audit_timestamp ON audit_log(timestamp)');
    await pool.query('CREATE INDEX idx_audit_akcja ON audit_log(akcja)');
    await pool.query('CREATE INDEX idx_audit_user ON audit_log(user_id)');
    console.log('[Reset] ✓ audit_log table created');

    // 003_idempotency.sql
    await pool.query(`
      CREATE TABLE idempotency (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(50) NOT NULL,
        chat_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_message_chat UNIQUE (message_id, chat_id)
      )
    `);
    await pool.query('CREATE INDEX idx_idempotency_created ON idempotency(created_at)');
    console.log('[Reset] ✓ idempotency table created');

    // 004_merchants.sql
    await pool.query(`
      CREATE TABLE merchants (
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
    await pool.query('CREATE INDEX idx_merchants_skrot ON merchants(skrot)');
    await pool.query('CREATE INDEX idx_merchants_kategoria ON merchants(domyslna_kategoria)');

    // Seed preset merchants
    await pool.query(`
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
    `);
    console.log('[Reset] ✓ merchants table created with seed data');

    // 005_product_learnings.sql
    await pool.query(`
      CREATE TABLE product_learnings (
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
    await pool.query('CREATE INDEX idx_learnings_pattern ON product_learnings(product_pattern)');
    await pool.query('CREATE INDEX idx_learnings_store ON product_learnings(store_pattern)');
    console.log('[Reset] ✓ product_learnings table created');

    // 006_pending_receipts.sql
    await pool.query(`
      CREATE TABLE pending_receipts (
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
    await pool.query('CREATE INDEX idx_pending_session ON pending_receipts(session_id)');
    await pool.query('CREATE INDEX idx_pending_expires ON pending_receipts(expires_at)');
    await pool.query('CREATE INDEX idx_pending_status ON pending_receipts(status)');
    console.log('[Reset] ✓ pending_receipts table created');

    // 007_shopping_lists.sql
    await pool.query(`
      CREATE TABLE shopping_lists (
        id SERIAL PRIMARY KEY,
        list_id VARCHAR(36) NOT NULL UNIQUE,
        name VARCHAR(100) DEFAULT 'Lista zakupow',
        is_active BOOLEAN DEFAULT true,
        created_by VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX idx_shopping_lists_active ON shopping_lists(is_active)');
    console.log('[Reset] ✓ shopping_lists table created');

    await pool.query(`
      CREATE TABLE shopping_items (
        id SERIAL PRIMARY KEY,
        item_id VARCHAR(36) NOT NULL UNIQUE,
        list_id VARCHAR(36) NOT NULL REFERENCES shopping_lists(list_id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        quantity INTEGER DEFAULT 1,
        shop_category VARCHAR(50),
        added_by VARCHAR(50) NOT NULL,
        is_checked BOOLEAN DEFAULT false,
        priority INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX idx_shopping_items_list ON shopping_items(list_id)');
    await pool.query('CREATE INDEX idx_shopping_items_checked ON shopping_items(is_checked)');
    await pool.query('CREATE INDEX idx_shopping_items_category ON shopping_items(shop_category)');
    console.log('[Reset] ✓ shopping_items table created');

    await pool.query(`
      CREATE TABLE shopping_stats (
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
    await pool.query('CREATE INDEX idx_shopping_stats_name ON shopping_stats(product_name)');
    await pool.query('CREATE INDEX idx_shopping_stats_count ON shopping_stats(purchase_count DESC)');
    await pool.query('CREATE INDEX idx_shopping_stats_last_bought ON shopping_stats(last_bought_at)');
    console.log('[Reset] ✓ shopping_stats table created');

    // Verify final state
    const finalTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log('\n[Reset] Final tables:', finalTables.rows.map(r => r.table_name).join(', '));
    console.log(`[Reset] Total: ${finalTables.rows.length} tables`);
    console.log('\n[Reset] Database reset completed successfully!');

  } catch (error) {
    console.error('[Reset] Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

resetDatabase().catch(console.error);
