-- Migration 007: Add receipt_id for grouping receipt items
-- This allows expenses from the same receipt to be grouped together in statistics

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_id VARCHAR(36);

-- Index for efficient grouping queries
CREATE INDEX IF NOT EXISTS idx_expenses_receipt_id ON expenses(receipt_id);

-- Composite index for common grouped query patterns
CREATE INDEX IF NOT EXISTS idx_expenses_user_receipt ON expenses(user_name, receipt_id, created_at DESC);
