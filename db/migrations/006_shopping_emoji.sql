-- Migration 006: Add emoji column to shopping_items
-- Allows storing product-specific emojis for better visual representation

ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS emoji VARCHAR(10);
