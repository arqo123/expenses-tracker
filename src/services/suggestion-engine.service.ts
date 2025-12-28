import pg from 'pg';
import type {
  SmartSuggestion,
  SuggestionContext,
  SuggestionReason,
  RawSuggestion,
  SuggestionFilter,
} from '../types/suggestion.types.ts';
import type { ShopCategory } from '../types/shopping.types.ts';
import { getProductEmoji, PRODUCT_CATEGORY_MAP } from '../types/shopping.types.ts';
import { DatabaseService } from './database.service.ts';

export class SuggestionEngineService {
  private pool: pg.Pool;
  private database: DatabaseService;

  constructor(pool: pg.Pool, database: DatabaseService) {
    this.pool = pool;
    this.database = database;
  }

  /**
   * Main method - get smart suggestions combining all sources
   */
  async getSmartSuggestions(context: SuggestionContext = {}): Promise<SmartSuggestion[]> {
    const limit = context.limit || 15;
    const filter = context.filter || 'all';

    // Collect suggestions from different sources
    const allSuggestions: RawSuggestion[] = [];

    // 1. Shopping list stats (always include)
    const shoppingStatsSuggestions = await this.getShoppingStatsSuggestions();
    allSuggestions.push(...shoppingStatsSuggestions);

    // 2. Receipt-based suggestions
    const receiptSuggestions = await this.getReceiptBasedSuggestions();
    allSuggestions.push(...receiptSuggestions);

    // 3. Store-specific suggestions (if store is selected)
    if (context.currentStore) {
      const storeSuggestions = await this.getStoreSpecificSuggestions(context.currentStore);
      // Mark these as matching current store
      for (const s of storeSuggestions) {
        s.matchesCurrentStore = true;
      }
      allSuggestions.push(...storeSuggestions);
    }

    // 4. Correlated suggestions (if items on list)
    if (context.currentItems && context.currentItems.length > 0) {
      const correlatedSuggestions = await this.getCorrelatedSuggestions(context.currentItems);
      allSuggestions.push(...correlatedSuggestions);
    }

    // Merge duplicates, calculate scores, and sort
    const mergedSuggestions = this.mergeSuggestions(allSuggestions, context);

    // Apply filter
    let filteredSuggestions = this.applyFilter(mergedSuggestions, filter);

    // Sort by score
    filteredSuggestions.sort((a, b) => b.score - a.score);

    // Limit results
    return filteredSuggestions.slice(0, limit);
  }

  /**
   * Get suggestions from shopping_stats table
   */
  private async getShoppingStatsSuggestions(): Promise<RawSuggestion[]> {
    const result = await this.pool.query(
      `SELECT
        product_name,
        purchase_count,
        avg_interval_days,
        last_bought_at,
        typical_shop,
        avg_price,
        category,
        source,
        EXTRACT(DAY FROM NOW() - last_bought_at)::INTEGER as days_since
      FROM shopping_stats
      WHERE last_bought_at IS NOT NULL
      ORDER BY purchase_count DESC
      LIMIT 30`
    );

    return result.rows.map((row) => {
      const daysSince = row.days_since || 0;
      const avgInterval = row.avg_interval_days || 0;
      const isOverdue = avgInterval > 0 && daysSince > avgInterval;

      return {
        productName: row.product_name,
        purchaseCount: row.purchase_count || 0,
        avgIntervalDays: avgInterval,
        lastBoughtAt: row.last_bought_at?.toISOString(),
        daysSinceLastPurchase: daysSince,
        typicalShop: row.typical_shop,
        avgPrice: row.avg_price ? parseFloat(row.avg_price) : undefined,
        category: row.category,
        source: row.source || 'shopping_list',
        isOverdue,
        daysOverdue: isOverdue ? daysSince - avgInterval : 0,
      };
    });
  }

  /**
   * Get suggestions from receipt OCR data
   */
  private async getReceiptBasedSuggestions(): Promise<RawSuggestion[]> {
    const products = await this.database.getProductsFromReceipts(30);

    return products.map((p) => ({
      productName: p.productName,
      purchaseCount: p.purchaseCount,
      lastBoughtAt: p.lastBoughtAt,
      avgPrice: p.avgPrice,
      shops: p.shops,
      category: p.category,
      source: 'receipt' as const,
    }));
  }

  /**
   * Get suggestions for a specific store
   */
  private async getStoreSpecificSuggestions(storeName: string): Promise<RawSuggestion[]> {
    const products = await this.database.getStoreProducts(storeName, 20);

    return products.map((p) => ({
      productName: p.productName,
      purchaseCount: p.purchaseCount,
      avgPrice: p.avgPrice,
      category: p.category,
      source: 'expense' as const,
      matchesCurrentStore: true,
    }));
  }

  /**
   * Get correlated suggestions based on current list items
   */
  private async getCorrelatedSuggestions(currentItems: string[]): Promise<RawSuggestion[]> {
    // Try correlation table first
    const correlations = await this.database.getCorrelationsFromTable(currentItems, 10);

    if (correlations.length > 0) {
      return correlations.map((c) => ({
        productName: c.productName,
        purchaseCount: c.coOccurrences,
        source: 'receipt' as const,
        correlationScore: Math.min(c.coOccurrences / 10, 1), // Normalize to 0-1
      }));
    }

    // Fallback to dynamic query
    const dynamicCorrelations = await this.database.getCorrelatedProducts(currentItems, 10);

    return dynamicCorrelations.map((c) => ({
      productName: c.productName,
      purchaseCount: c.coOccurrences,
      source: 'receipt' as const,
      correlationScore: c.correlation,
    }));
  }

  /**
   * Merge duplicate suggestions and calculate final scores
   */
  private mergeSuggestions(
    suggestions: RawSuggestion[],
    context: SuggestionContext
  ): SmartSuggestion[] {
    const merged = new Map<string, RawSuggestion>();

    for (const s of suggestions) {
      const key = this.normalizeProductName(s.productName);

      if (merged.has(key)) {
        // Merge with existing
        const existing = merged.get(key)!;
        existing.purchaseCount = Math.max(existing.purchaseCount, s.purchaseCount);
        if (s.isOverdue) existing.isOverdue = true;
        if (s.daysOverdue && (!existing.daysOverdue || s.daysOverdue > existing.daysOverdue)) {
          existing.daysOverdue = s.daysOverdue;
        }
        if (s.matchesCurrentStore) existing.matchesCurrentStore = true;
        if (s.correlationScore && (!existing.correlationScore || s.correlationScore > existing.correlationScore)) {
          existing.correlationScore = s.correlationScore;
        }
        if (!existing.avgPrice && s.avgPrice) existing.avgPrice = s.avgPrice;
        if (!existing.typicalShop && s.typicalShop) existing.typicalShop = s.typicalShop;
        if (!existing.avgIntervalDays && s.avgIntervalDays) existing.avgIntervalDays = s.avgIntervalDays;
        if (!existing.lastBoughtAt && s.lastBoughtAt) existing.lastBoughtAt = s.lastBoughtAt;
        if (!existing.daysSinceLastPurchase && s.daysSinceLastPurchase) {
          existing.daysSinceLastPurchase = s.daysSinceLastPurchase;
        }
      } else {
        merged.set(key, { ...s });
      }
    }

    // Convert to SmartSuggestion with scores
    const result: SmartSuggestion[] = [];

    for (const [_, raw] of merged) {
      // Skip if already on list
      if (context.currentItems?.some(
        (item) => this.normalizeProductName(item) === this.normalizeProductName(raw.productName)
      )) {
        continue;
      }

      const score = this.calculateScore(raw);
      const reasons = this.collectReasons(raw);
      const category = this.detectCategory(raw.productName, raw.category);

      result.push({
        productName: raw.productName,
        score,
        source: raw.source,
        reasons,
        lastBought: raw.lastBoughtAt,
        daysSinceLastPurchase: raw.daysSinceLastPurchase,
        typicalShop: raw.typicalShop,
        avgPrice: raw.avgPrice,
        purchaseCount: raw.purchaseCount,
        avgIntervalDays: raw.avgIntervalDays,
        daysOverdue: raw.daysOverdue,
        correlationScore: raw.correlationScore,
        category,
        emoji: getProductEmoji(raw.productName, category),
      });
    }

    return result;
  }

  /**
   * Calculate score for a suggestion (0-100)
   */
  private calculateScore(raw: RawSuggestion): number {
    let score = 0;

    // 1. Frequency bonus (max 30 points)
    // More purchases = higher score
    score += Math.min(raw.purchaseCount * 3, 30);

    // 2. Overdue bonus (max 25 points)
    if (raw.isOverdue && raw.daysOverdue) {
      // Base 15 points for being overdue, up to 25 for very overdue
      score += Math.min(15 + raw.daysOverdue, 25);
    }

    // 3. Store match bonus (20 points)
    if (raw.matchesCurrentStore) {
      score += 20;
    }

    // 4. Correlation bonus (max 15 points)
    if (raw.correlationScore) {
      score += raw.correlationScore * 15;
    }

    // 5. Recency penalty/bonus
    const daysSince = raw.daysSinceLastPurchase || 0;
    if (daysSince < 3) {
      // Recent purchase - penalty
      score -= 10;
    } else if (daysSince > 14 && daysSince < 60) {
      // Medium time - small bonus
      score += 5;
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Collect reasons for suggestion
   */
  private collectReasons(raw: RawSuggestion): SuggestionReason[] {
    const reasons: SuggestionReason[] = [];

    if (raw.purchaseCount >= 3) {
      reasons.push('frequently_bought');
    }

    if (raw.isOverdue) {
      reasons.push('overdue');
    }

    if (raw.matchesCurrentStore) {
      reasons.push('store_match');
    }

    if (raw.correlationScore && raw.correlationScore > 0.3) {
      reasons.push('basket_correlation');
    }

    if (raw.daysSinceLastPurchase && raw.daysSinceLastPurchase < 7) {
      reasons.push('recently_bought');
    }

    return reasons;
  }

  /**
   * Apply filter to suggestions
   */
  private applyFilter(suggestions: SmartSuggestion[], filter: SuggestionFilter): SmartSuggestion[] {
    switch (filter) {
      case 'overdue':
        return suggestions.filter((s) => s.reasons.includes('overdue'));

      case 'popular':
        return suggestions
          .filter((s) => s.reasons.includes('frequently_bought'))
          .sort((a, b) => (b.purchaseCount || 0) - (a.purchaseCount || 0));

      case 'store':
        return suggestions.filter((s) => s.reasons.includes('store_match'));

      case 'correlated':
        return suggestions.filter((s) => s.reasons.includes('basket_correlation'));

      case 'all':
      default:
        return suggestions;
    }
  }

  /**
   * Detect category from product name
   */
  private detectCategory(name: string, existingCategory?: string): ShopCategory {
    if (existingCategory && existingCategory !== 'Inne' && existingCategory !== '') {
      // Try to map expense category to shop category
      const categoryMap: Record<string, ShopCategory> = {
        'Zakupy spozywcze': 'Warzywa i owoce',
        'Zdrowie': 'Kosmetyki',
        'Uroda': 'Kosmetyki',
        'Dom': 'Chemia',
        'Zwierzeta': 'Dla zwierzat',
      };
      return categoryMap[existingCategory] || 'Inne';
    }

    const normalized = this.normalizeProductName(name);

    for (const [pattern, category] of Object.entries(PRODUCT_CATEGORY_MAP)) {
      if (normalized.includes(pattern)) {
        return category;
      }
    }

    return 'Inne';
  }

  /**
   * Normalize product name for comparison
   */
  private normalizeProductName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get top stores for filter keyboard
   */
  async getTopStores(limit: number = 6): Promise<Array<{ storeName: string; productCount: number }>> {
    return this.database.getTopStores(limit);
  }

  /**
   * Get overdue suggestions only
   */
  async getOverdueSuggestions(limit: number = 10): Promise<SmartSuggestion[]> {
    return this.getSmartSuggestions({ limit, filter: 'overdue' });
  }

  /**
   * Get popular suggestions only
   */
  async getPopularSuggestions(limit: number = 10): Promise<SmartSuggestion[]> {
    return this.getSmartSuggestions({ limit, filter: 'popular' });
  }
}
