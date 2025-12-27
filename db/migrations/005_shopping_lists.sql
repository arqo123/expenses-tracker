-- Shopping lists (shared between users)
CREATE TABLE IF NOT EXISTS shopping_lists (
    id SERIAL PRIMARY KEY,
    list_id VARCHAR(36) NOT NULL UNIQUE,
    name VARCHAR(100) DEFAULT 'Lista zakupow',
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_active ON shopping_lists(is_active);

-- Shopping items (products on the list)
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON shopping_items(list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_items_checked ON shopping_items(is_checked);
CREATE INDEX IF NOT EXISTS idx_shopping_items_category ON shopping_items(shop_category);

-- Shopping statistics for suggestions (based on purchase history)
CREATE TABLE IF NOT EXISTS shopping_stats (
    id SERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL UNIQUE,
    purchase_count INTEGER DEFAULT 1,
    avg_interval_days INTEGER,
    last_bought_at TIMESTAMPTZ,
    typical_shop VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_stats_name ON shopping_stats(product_name);
CREATE INDEX IF NOT EXISTS idx_shopping_stats_count ON shopping_stats(purchase_count DESC);
CREATE INDEX IF NOT EXISTS idx_shopping_stats_last_bought ON shopping_stats(last_bought_at);
