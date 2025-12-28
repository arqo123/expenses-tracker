import pg from 'pg';
import type {
  ShoppingList,
  ShoppingItem,
  ShoppingSuggestion,
  ShopCategory,
  ReceiptMatchResult,
} from '../types/shopping.types.ts';
import { CATEGORY_ORDER, PRODUCT_CATEGORY_MAP, getProductEmoji } from '../types/shopping.types.ts';

export class ShoppingDatabaseService {
  private pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  // Generate unique list ID
  private generateListId(): string {
    return crypto.randomUUID().slice(0, 8);
  }

  // Generate unique item ID
  private generateItemId(): string {
    return crypto.randomUUID().slice(0, 8);
  }

  // Get or create the active shared shopping list
  async getOrCreateActiveList(createdBy: string = 'System'): Promise<ShoppingList> {
    // First, try to get existing active list
    const existing = await this.pool.query(
      `SELECT * FROM shopping_lists WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );

    if (existing.rows.length > 0) {
      return this.mapToShoppingList(existing.rows[0]);
    }

    // Create new list if none exists
    const listId = this.generateListId();
    const result = await this.pool.query(
      `INSERT INTO shopping_lists (list_id, name, is_active, created_by)
       VALUES ($1, 'Lista zakupow', true, $2)
       RETURNING *`,
      [listId, createdBy]
    );

    return this.mapToShoppingList(result.rows[0]);
  }

  // Add item to the shopping list
  async addItem(
    name: string,
    quantity: number,
    addedBy: string,
    shopCategory?: ShopCategory
  ): Promise<ShoppingItem> {
    const list = await this.getOrCreateActiveList(addedBy);
    const itemId = this.generateItemId();

    // Determine category if not provided
    const category = shopCategory || this.detectCategory(name);
    const priority = CATEGORY_ORDER[category] || 99;

    // Get product-specific emoji
    const emoji = getProductEmoji(name, category);

    const result = await this.pool.query(
      `INSERT INTO shopping_items (item_id, list_id, name, quantity, shop_category, added_by, priority, emoji)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [itemId, list.listId, name, quantity, category, addedBy, priority, emoji]
    );

    // Update list timestamp
    await this.pool.query(
      `UPDATE shopping_lists SET updated_at = NOW() WHERE list_id = $1`,
      [list.listId]
    );

    return this.mapToShoppingItem(result.rows[0]);
  }

  // Add multiple items at once
  async addItems(
    items: Array<{ name: string; quantity: number }>,
    addedBy: string
  ): Promise<ShoppingItem[]> {
    const results: ShoppingItem[] = [];
    for (const item of items) {
      const added = await this.addItem(item.name, item.quantity, addedBy);
      results.push(added);
    }
    return results;
  }

  // Remove item from list (delete)
  async removeItem(itemId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM shopping_items WHERE item_id = $1 RETURNING item_id`,
      [itemId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Check item (and remove it - no archive)
  async checkItem(itemId: string, _checkedBy: string): Promise<ShoppingItem | null> {
    // First get the item info for returning
    const item = await this.pool.query(
      `SELECT * FROM shopping_items WHERE item_id = $1`,
      [itemId]
    );

    if (item.rows.length === 0) {
      return null;
    }

    // Update stats before removing
    const itemData = this.mapToShoppingItem(item.rows[0]);
    await this.updateStatsFromPurchase(itemData.name);

    // Delete the item (no archive, as per requirements)
    await this.pool.query(
      `DELETE FROM shopping_items WHERE item_id = $1`,
      [itemId]
    );

    return { ...itemData, isChecked: true };
  }

  // Get all unchecked items from active list
  async getItems(): Promise<ShoppingItem[]> {
    const list = await this.getOrCreateActiveList();

    const result = await this.pool.query(
      `SELECT * FROM shopping_items
       WHERE list_id = $1 AND is_checked = false
       ORDER BY priority ASC, created_at ASC`,
      [list.listId]
    );

    return result.rows.map((row) => this.mapToShoppingItem(row));
  }

  // Get items sorted by smart routing (category order)
  async getSortedItems(): Promise<ShoppingItem[]> {
    const items = await this.getItems();
    return items.sort((a, b) => {
      const orderA = CATEGORY_ORDER[a.shopCategory] || 99;
      const orderB = CATEGORY_ORDER[b.shopCategory] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name, 'pl');
    });
  }

  // Get items grouped by category
  async getItemsGroupedByCategory(): Promise<Map<ShopCategory, ShoppingItem[]>> {
    const items = await this.getSortedItems();
    const groups = new Map<ShopCategory, ShoppingItem[]>();

    for (const item of items) {
      const category = item.shopCategory;
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(item);
    }

    return groups;
  }

  // Get count of items
  async getItemCount(): Promise<number> {
    const list = await this.getOrCreateActiveList();
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM shopping_items WHERE list_id = $1 AND is_checked = false`,
      [list.listId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  // Clear all checked items (not needed if we delete on check, but keeping for potential future use)
  async clearCheckedItems(): Promise<number> {
    const list = await this.getOrCreateActiveList();
    const result = await this.pool.query(
      `DELETE FROM shopping_items WHERE list_id = $1 AND is_checked = true`,
      [list.listId]
    );
    return result.rowCount || 0;
  }

  // Clear all items from the list
  async clearAllItems(): Promise<number> {
    const list = await this.getOrCreateActiveList();
    const result = await this.pool.query(
      `DELETE FROM shopping_items WHERE list_id = $1`,
      [list.listId]
    );
    return result.rowCount || 0;
  }

  // Get suggestions based on purchase history
  async getSuggestions(limit: number = 10): Promise<ShoppingSuggestion[]> {
    const result = await this.pool.query(
      `SELECT
        product_name,
        purchase_count,
        avg_interval_days,
        last_bought_at,
        typical_shop,
        EXTRACT(DAY FROM NOW() - last_bought_at)::INTEGER as days_since
       FROM shopping_stats
       WHERE last_bought_at IS NOT NULL
       ORDER BY
         CASE
           WHEN avg_interval_days IS NOT NULL AND EXTRACT(DAY FROM NOW() - last_bought_at) > avg_interval_days
           THEN 0 ELSE 1
         END,
         purchase_count DESC,
         last_bought_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      productName: row.product_name,
      purchaseCount: row.purchase_count,
      avgIntervalDays: row.avg_interval_days,
      lastBoughtAt: row.last_bought_at?.toISOString(),
      typicalShop: row.typical_shop,
      daysSinceLastPurchase: row.days_since,
    }));
  }

  // Get "haven't bought in a while" suggestions
  async getOverdueSuggestions(limit: number = 5): Promise<ShoppingSuggestion[]> {
    const result = await this.pool.query(
      `SELECT
        product_name,
        purchase_count,
        avg_interval_days,
        last_bought_at,
        typical_shop,
        EXTRACT(DAY FROM NOW() - last_bought_at)::INTEGER as days_since
       FROM shopping_stats
       WHERE last_bought_at IS NOT NULL
         AND avg_interval_days IS NOT NULL
         AND EXTRACT(DAY FROM NOW() - last_bought_at) > avg_interval_days
       ORDER BY
         (EXTRACT(DAY FROM NOW() - last_bought_at) - avg_interval_days) DESC,
         purchase_count DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      productName: row.product_name,
      purchaseCount: row.purchase_count,
      avgIntervalDays: row.avg_interval_days,
      lastBoughtAt: row.last_bought_at?.toISOString(),
      typicalShop: row.typical_shop,
      daysSinceLastPurchase: row.days_since,
    }));
  }

  // Update shopping stats when a product is purchased (extended version)
  async updateStatsFromPurchase(
    productName: string,
    shopName?: string,
    price?: number,
    category?: string,
    source: 'shopping_list' | 'receipt' = 'shopping_list'
  ): Promise<void> {
    const normalized = this.normalizeProductName(productName);

    const existing = await this.pool.query(
      `SELECT * FROM shopping_stats WHERE product_name = $1`,
      [normalized]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const lastBought = row.last_bought_at ? new Date(row.last_bought_at) : null;
      const now = new Date();

      let newAvgInterval = row.avg_interval_days;
      if (lastBought) {
        const daysSinceLast = Math.floor(
          (now.getTime() - lastBought.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (row.avg_interval_days) {
          // Weighted average
          newAvgInterval = Math.round(
            (row.avg_interval_days * row.purchase_count + daysSinceLast) /
              (row.purchase_count + 1)
          );
        } else {
          newAvgInterval = daysSinceLast;
        }
      }

      // Calculate new average price
      let newAvgPrice = price;
      if (row.avg_price && price) {
        newAvgPrice = (parseFloat(row.avg_price) * row.purchase_count + price) / (row.purchase_count + 1);
      }

      // Update shops array
      const currentShops: string[] = row.shops || [];
      const updatedShops = shopName && !currentShops.includes(shopName)
        ? [...currentShops, shopName]
        : currentShops;

      await this.pool.query(
        `UPDATE shopping_stats SET
          purchase_count = purchase_count + 1,
          avg_interval_days = $1,
          last_bought_at = NOW(),
          typical_shop = COALESCE($2, typical_shop),
          avg_price = COALESCE($3, avg_price),
          category = COALESCE($4, category),
          source = COALESCE($5, source),
          shops = $6,
          updated_at = NOW()
         WHERE product_name = $7`,
        [newAvgInterval, shopName, newAvgPrice, category, source, updatedShops, normalized]
      );
    } else {
      await this.pool.query(
        `INSERT INTO shopping_stats (product_name, purchase_count, last_bought_at, typical_shop, avg_price, category, source, shops)
         VALUES ($1, 1, NOW(), $2, $3, $4, $5, $6)`,
        [normalized, shopName, price, category, source, shopName ? [shopName] : []]
      );
    }
  }

  // Sync products from a receipt to shopping_stats
  async syncReceiptToStats(
    receiptProducts: Array<{ name: string; price: number; shop: string; category?: string }>
  ): Promise<number> {
    let synced = 0;

    for (const product of receiptProducts) {
      if (!product.name || product.name.trim() === '') continue;

      await this.updateStatsFromPurchase(
        product.name,
        product.shop,
        product.price,
        product.category,
        'receipt'
      );
      synced++;
    }

    return synced;
  }

  // Get current shopping list item names (for correlation context)
  async getCurrentItemNames(): Promise<string[]> {
    const items = await this.getItems();
    return items.map((item) => item.name);
  }

  // Match receipt products to shopping list items
  async matchReceiptToList(receiptProducts: string[]): Promise<ReceiptMatchResult[]> {
    const items = await this.getItems();
    const matches: ReceiptMatchResult[] = [];

    for (const item of items) {
      const itemNormalized = this.normalizeProductName(item.name);

      for (const product of receiptProducts) {
        const productNormalized = this.normalizeProductName(product);
        const confidence = this.calculateMatchConfidence(itemNormalized, productNormalized);

        if (confidence >= 0.6) {
          matches.push({
            itemId: item.itemId,
            itemName: item.name,
            receiptProduct: product,
            confidence,
          });
          break; // One match per item
        }
      }
    }

    return matches;
  }

  // Check multiple items that matched receipt
  async checkMatchedItems(matches: ReceiptMatchResult[], checkedBy: string): Promise<string[]> {
    const checkedNames: string[] = [];

    for (const match of matches) {
      const checked = await this.checkItem(match.itemId, checkedBy);
      if (checked) {
        checkedNames.push(checked.name);
      }
    }

    return checkedNames;
  }

  // Detect category from product name
  private detectCategory(name: string): ShopCategory {
    const normalized = this.normalizeProductName(name);

    // Check against known product patterns
    for (const [pattern, category] of Object.entries(PRODUCT_CATEGORY_MAP)) {
      if (normalized.includes(pattern)) {
        return category;
      }
    }

    return 'Inne';
  }

  // Normalize product name for matching
  private normalizeProductName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9\s]/g, '') // Remove special chars
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Calculate match confidence between two product names
  private calculateMatchConfidence(name1: string, name2: string): number {
    // Exact match
    if (name1 === name2) return 1.0;

    // Contains match
    if (name1.includes(name2) || name2.includes(name1)) {
      const shorter = name1.length < name2.length ? name1 : name2;
      const longer = name1.length < name2.length ? name2 : name1;
      return shorter.length / longer.length;
    }

    // Word overlap
    const words1 = new Set(name1.split(' '));
    const words2 = new Set(name2.split(' '));
    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  // Map database row to ShoppingList
  private mapToShoppingList(row: pg.QueryResultRow): ShoppingList {
    return {
      listId: row.list_id,
      name: row.name,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
    };
  }

  // Map database row to ShoppingItem
  private mapToShoppingItem(row: pg.QueryResultRow): ShoppingItem {
    return {
      itemId: row.item_id,
      listId: row.list_id,
      name: row.name,
      quantity: row.quantity,
      shopCategory: row.shop_category || 'Inne',
      addedBy: row.added_by,
      isChecked: row.is_checked,
      priority: row.priority,
      emoji: row.emoji || getProductEmoji(row.name, row.shop_category) || '📦',
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
    };
  }
}
