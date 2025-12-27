import { type ExpenseCategory } from '../types/expense.types.ts';
import { getPrompts, getAllCategories, getCategoryMap } from '../i18n/index.ts';

// Merchant patterns for AI categorization
// These are mostly universal brand names that don't need translation
// The DB category values are always in Polish (used internally)
export const MERCHANT_PATTERNS: Record<string, ExpenseCategory> = {
  // Groceries (Zakupy spozywcze)
  'biedronka': 'Zakupy spozywcze',
  'lidl': 'Zakupy spozywcze',
  'zabka': 'Zakupy spozywcze',
  'carrefour': 'Zakupy spozywcze',
  'auchan': 'Zakupy spozywcze',
  'kaufland': 'Zakupy spozywcze',
  'netto': 'Zakupy spozywcze',
  'dino': 'Zakupy spozywcze',
  'stokrotka': 'Zakupy spozywcze',
  'lewiatan': 'Zakupy spozywcze',
  'aldi': 'Zakupy spozywcze',
  'makro': 'Zakupy spozywcze',
  'selgros': 'Zakupy spozywcze',
  'walmart': 'Zakupy spozywcze',
  'tesco': 'Zakupy spozywcze',
  'rewe': 'Zakupy spozywcze',
  'edeka': 'Zakupy spozywcze',

  // Restaurants (Restauracje)
  'mcdonalds': 'Restauracje',
  'kfc': 'Restauracje',
  'burger king': 'Restauracje',
  'pizza hut': 'Restauracje',
  'dominos': 'Restauracje',
  'subway': 'Restauracje',
  'telepizza': 'Restauracje',
  'north fish': 'Restauracje',

  // Delivery
  'pyszne': 'Delivery',
  'glovo': 'Delivery',
  'wolt': 'Delivery',
  'uber eats': 'Delivery',
  'bolt food': 'Delivery',
  'food.bolt': 'Delivery',
  'doordash': 'Delivery',
  'lieferando': 'Delivery',

  // Cafes (Kawiarnie)
  'starbucks': 'Kawiarnie',
  'costa': 'Kawiarnie',
  'coffeeheaven': 'Kawiarnie',
  'green caffe': 'Kawiarnie',

  // Transport
  'uber': 'Transport',
  'bolt': 'Transport',
  'freenow': 'Transport',
  'itaxi': 'Transport',
  'mpk': 'Transport',
  'ztm': 'Transport',
  'koleje': 'Transport',
  'pkp': 'Transport',
  'flixbus': 'Transport',
  'deutsche bahn': 'Transport',

  // Fuel (Paliwo)
  'orlen': 'Paliwo',
  'bp': 'Paliwo',
  'shell': 'Paliwo',
  'circle k': 'Paliwo',
  'lotos': 'Paliwo',
  'amic': 'Paliwo',
  'moya': 'Paliwo',
  'aral': 'Paliwo',
  'esso': 'Paliwo',
  'total': 'Paliwo',

  // Home (Dom)
  'ikea': 'Dom',
  'leroy merlin': 'Dom',
  'castorama': 'Dom',
  'obi': 'Dom',
  'bricoman': 'Dom',
  'jysk': 'Dom',
  'pepco': 'Dom',
  'action': 'Dom',
  'tedi': 'Dom',
  'bauhaus': 'Dom',
  'hornbach': 'Dom',

  // Health (Zdrowie)
  'apteka': 'Zdrowie',
  'gemini': 'Zdrowie',
  'doz': 'Zdrowie',
  'super-pharm': 'Zdrowie',
  'alab': 'Zdrowie',
  'diagnostyka': 'Zdrowie',
  'luxmed': 'Zdrowie',
  'medicover': 'Zdrowie',
  'enel-med': 'Zdrowie',
  'apotheke': 'Zdrowie',
  'pharmacy': 'Zdrowie',
  'dm': 'Zdrowie',

  // Beauty (Uroda)
  'rossmann': 'Uroda',
  'hebe': 'Uroda',
  'douglas': 'Uroda',
  'sephora': 'Uroda',
  'inglot': 'Uroda',

  // Entertainment (Rozrywka)
  'cinema city': 'Rozrywka',
  'multikino': 'Rozrywka',
  'helios': 'Rozrywka',
  'empik': 'Rozrywka',

  // Subscriptions (Subskrypcje)
  'spotify': 'Subskrypcje',
  'netflix': 'Subskrypcje',
  'hbo': 'Subskrypcje',
  'disney': 'Subskrypcje',
  'amazon prime': 'Subskrypcje',
  'apple music': 'Subskrypcje',
  'youtube premium': 'Subskrypcje',

  // Sport
  'decathlon': 'Sport',
  'intersport': 'Sport',
  'go sport': 'Sport',

  // Electronics (Elektronika)
  'media expert': 'Elektronika',
  'media markt': 'Elektronika',
  'rtv euro agd': 'Elektronika',
  'komputronik': 'Elektronika',
  'x-kom': 'Elektronika',
  'morele': 'Elektronika',
  'apple': 'Elektronika',
  'saturn': 'Elektronika',

  // Clothing (Ubrania)
  'zara': 'Ubrania',
  'h&m': 'Ubrania',
  'reserved': 'Ubrania',
  'cropp': 'Ubrania',
  'house': 'Ubrania',
  'sinsay': 'Ubrania',
  'mohito': 'Ubrania',
  'ccc': 'Ubrania',
  'deichmann': 'Ubrania',
  'primark': 'Ubrania',
  'c&a': 'Ubrania',

  // Investments (Inwestycje)
  'xtb': 'Inwestycje',

  // Transfers (Przelewy)
  'revolut': 'Przelewy',
  'wise': 'Przelewy',
  'paypal': 'Przelewy',

  // Pets (Zwierzeta)
  'maxi zoo': 'Zwierzeta',
  'kakadu': 'Zwierzeta',
  'zooplus': 'Zwierzeta',
  'fressnapf': 'Zwierzeta',
};

/**
 * Build critical rules text using i18n translations.
 * Category placeholders like {health} are replaced with translated category names.
 */
function buildCriticalRules(): string {
  const prompts = getPrompts();
  const categoryMap = getCategoryMap();

  // Helper to replace category placeholders with translated names
  const replaceCategoryPlaceholders = (text: string): string => {
    return text
      .replace(/\{health\}/g, categoryMap['Zdrowie'] ?? 'Health')
      .replace(/\{beauty\}/g, categoryMap['Uroda'] ?? 'Beauty')
      .replace(/\{delivery\}/g, categoryMap['Delivery'] ?? 'Delivery')
      .replace(/\{transport\}/g, categoryMap['Transport'] ?? 'Transport')
      .replace(/\{fuel\}/g, categoryMap['Paliwo'] ?? 'Fuel')
      .replace(/\{investments\}/g, categoryMap['Inwestycje'] ?? 'Investments')
      .replace(/\{transfers\}/g, categoryMap['Przelewy'] ?? 'Transfers')
      .replace(/\{groceries\}/g, categoryMap['Zakupy spozywcze'] ?? 'Groceries')
      .replace(/\{cafes\}/g, categoryMap['Kawiarnie'] ?? 'Cafes')
      .replace(/\{other\}/g, categoryMap['Inne'] ?? 'Other');
  };

  const criticalRulesText = prompts.categorizer.criticalRulesItems
    .map((item: string) => `- ${replaceCategoryPlaceholders(item)}`)
    .join('\n');

  const shopRecognitionText = prompts.categorizer.shopRecognitionItems
    .map((item: string) => `- ${replaceCategoryPlaceholders(item)}`)
    .join('\n');

  return `${prompts.categorizer.criticalRulesHeader}:
${criticalRulesText}

${prompts.categorizer.shopRecognitionHeader}:
${shopRecognitionText}`;
}

/**
 * Build confidence levels text using i18n translations.
 */
function buildConfidenceLevels(): string {
  const prompts = getPrompts();
  const categoryMap = getCategoryMap();

  const levels = prompts.categorizer.confidenceLevelsItems
    .map((item: string) => {
      // Replace category placeholders
      return `- ${item
        .replace(/\{groceries\}/g, categoryMap['Zakupy spozywcze'] ?? 'Groceries')
        .replace(/\{other\}/g, categoryMap['Inne'] ?? 'Other')}`;
    })
    .join('\n');

  return `${prompts.categorizer.confidenceLevelsHeader}:
${levels}`;
}

/**
 * Build the system prompt for AI categorization using i18n.
 * Uses translated category names, critical rules, and confidence levels.
 */
export function buildSystemPrompt(): string {
  const prompts = getPrompts();
  const categories = getAllCategories();
  const categoriesList = categories.join(', ');
  const categoryMap = getCategoryMap();

  // Build merchant patterns text with translated category names
  const merchantPatterns = Object.entries(MERCHANT_PATTERNS)
    .reduce((acc, [merchant, dbCategory]) => {
      const translatedCategory = categoryMap[dbCategory] || dbCategory;
      if (!acc[translatedCategory]) acc[translatedCategory] = [];
      acc[translatedCategory].push(merchant);
      return acc;
    }, {} as Record<string, string[]>);

  const patternsText = Object.entries(merchantPatterns)
    .map(([cat, merchants]) => `${cat}: ${merchants.join(', ')}`)
    .join('\n');

  const criticalRules = buildCriticalRules();
  const confidenceLevels = buildConfidenceLevels();

  return `${prompts.categorizer.systemBase}

=== ${prompts.categorizer.categoriesHeader} ===
${categoriesList}

=== ${prompts.categorizer.merchantPatterns} ===
${patternsText}

${criticalRules}

${confidenceLevels}

${prompts.categorizer.outputFormat}`;
}
