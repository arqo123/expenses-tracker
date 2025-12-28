-- Migration 011: Fix hash constraint for ON CONFLICT support
-- Problem: Partial unique index doesn't work with ON CONFLICT, need actual CONSTRAINT

-- Drop the problematic partial unique index if it exists
DROP INDEX IF EXISTS idx_expenses_hash_unique;

-- Add proper UNIQUE constraint (required for ON CONFLICT (hash) DO NOTHING)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_hash'
  ) THEN
    ALTER TABLE expenses ADD CONSTRAINT unique_hash UNIQUE (hash);
  END IF;
END $$;
