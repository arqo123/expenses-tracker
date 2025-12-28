-- Migration 009: Product correlations for smart suggestions
-- Tracks products frequently bought together (co-occurrence on same receipt)

CREATE TABLE IF NOT EXISTS product_correlations (
  id SERIAL PRIMARY KEY,
  product_a VARCHAR(255) NOT NULL,
  product_b VARCHAR(255) NOT NULL,
  co_occurrences INTEGER DEFAULT 1,
  correlation DECIMAL(4,3) DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_a, product_b)
);

-- Index for fast lookup by product
CREATE INDEX IF NOT EXISTS idx_corr_product_a ON product_correlations(product_a);
CREATE INDEX IF NOT EXISTS idx_corr_product_b ON product_correlations(product_b);

-- Index for finding top correlations
CREATE INDEX IF NOT EXISTS idx_corr_cooccurrences ON product_correlations(co_occurrences DESC);
