#!/usr/bin/env bun
import pg from 'pg';
import { getDatabaseUrl } from '../src/config/env.ts';

const { Pool } = pg;

async function cleanDatabase() {
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
  });

  try {
    console.log('[DB Clean] Connecting to database...');

    // Truncate all tables (order matters due to potential foreign keys)
    const tables = [
      'expenses',
      'audit_log',
      'idempotency',
      'product_learnings',
    ];

    for (const table of tables) {
      try {
        await pool.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
        console.log(`[DB Clean] ✓ Truncated ${table}`);
      } catch (error) {
        // Table might not exist yet
        console.log(`[DB Clean] ⚠ Skipped ${table} (not exists)`);
      }
    }

    // Keep merchants data (presets) - just reset correction counts
    await pool.query(`
      UPDATE merchants
      SET correction_count = 0, updated_at = NOW()
      WHERE learned_from = 'user_correction'
    `);
    await pool.query(`
      DELETE FROM merchants WHERE learned_from = 'user_correction'
    `);
    console.log('[DB Clean] ✓ Reset merchants (kept presets)');

    console.log('[DB Clean] Database cleaned successfully!');
  } catch (error) {
    console.error('[DB Clean] Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanDatabase();
