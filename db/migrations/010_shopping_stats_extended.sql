-- Migration 010: Extend shopping_stats with additional tracking fields

-- Add source column to track where the product data came from
ALTER TABLE shopping_stats
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'shopping_list';

-- Add average price tracking
ALTER TABLE shopping_stats
  ADD COLUMN IF NOT EXISTS avg_price DECIMAL(12,2);

-- Add category for smart categorization
ALTER TABLE shopping_stats
  ADD COLUMN IF NOT EXISTS category VARCHAR(50);

-- Add shop array for tracking all shops where product was bought
ALTER TABLE shopping_stats
  ADD COLUMN IF NOT EXISTS shops TEXT[];

-- Index for source-based queries
CREATE INDEX IF NOT EXISTS idx_shopping_stats_source ON shopping_stats(source);
