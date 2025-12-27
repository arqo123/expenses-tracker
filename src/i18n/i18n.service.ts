import type { Translations, SupportedLanguage, CategoryTranslations } from './types.ts';
import { EXPENSE_CATEGORY_KEYS, EXPENSE_CATEGORY_DB_VALUES, SHOP_CATEGORY_KEYS } from './types.ts';
import { getEnv } from '../config/env.ts';

// Import translations
import pl from './locales/pl.json';
import en from './locales/en.json';
import de from './locales/de.json';

// ============================================================
// Translation Registry
// ============================================================

const translations: Record<SupportedLanguage, Translations> = {
  pl: pl as Translations,
  en: en as Translations,
  de: de as Translations,
};

// ============================================================
// i18n Service
// ============================================================

let currentLanguage: SupportedLanguage = 'pl';
let initialized = false;

/**
 * Initialize i18n with the configured language.
 * Must be called after initConfig().
 */
export function initI18n(): void {
  if (initialized) return;

  const env = getEnv();
  currentLanguage = env.LANGUAGE;
  initialized = true;

  console.log(`[i18n] Initialized with language: ${currentLanguage}`);
}

/**
 * Get current language.
 */
export function getLanguage(): SupportedLanguage {
  return currentLanguage;
}

/**
 * Get translation by dot-notation path.
 * Example: t('ui.errors.amountNotRecognized')
 */
export function t(path: string, params?: Record<string, string | number>): string {
  const lang = translations[currentLanguage];
  const fallback = translations.pl; // Polish as fallback

  let value = getNestedValue(lang, path);

  // Fallback to Polish if translation not found
  if (value === undefined) {
    value = getNestedValue(fallback, path);
  }

  // Return path if still not found
  if (value === undefined) {
    console.warn(`[i18n] Missing translation: ${path}`);
    return path;
  }

  // Interpolate parameters
  if (params && typeof value === 'string') {
    return interpolate(value, params);
  }

  return String(value);
}

/**
 * Get translated category name from DB value.
 * Example: tc('Zakupy spozywcze') -> 'Groceries' (in English)
 */
export function tc(dbCategory: string): string {
  const key = EXPENSE_CATEGORY_KEYS[dbCategory];
  if (!key) return dbCategory; // Return original if not mapped

  return t(`categories.expense.${key}`);
}

/**
 * Get translated shop category name from DB value.
 */
export function tsc(dbCategory: string): string {
  const key = SHOP_CATEGORY_KEYS[dbCategory];
  if (!key) return dbCategory;

  return t(`categories.shop.${key}`);
}

/**
 * Get DB category value from translation key.
 * Used when AI returns translated category name.
 */
export function categoryToDb(key: keyof CategoryTranslations['expense']): string {
  return EXPENSE_CATEGORY_DB_VALUES[key] || 'Inne';
}

/**
 * Get all expense category names in current language.
 * Returns array of translated names.
 */
export function getAllCategories(): string[] {
  const lang = translations[currentLanguage];
  return Object.values(lang.categories.expense);
}

/**
 * Get all expense categories as key-value pairs.
 * Returns: { dbValue: translatedName }
 */
export function getCategoryMap(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [dbValue, key] of Object.entries(EXPENSE_CATEGORY_KEYS)) {
    result[dbValue] = t(`categories.expense.${key}`);
  }
  return result;
}

/**
 * Get prompt translations for AI services.
 */
export function getPrompts(): Translations['prompts'] {
  return translations[currentLanguage].prompts;
}

/**
 * Get common translations.
 */
export function getCommon(): Translations['common'] {
  return translations[currentLanguage].common;
}

/**
 * Get the correct plural form for "product" in current language.
 * Polish has complex plural rules: 1 produkt, 2-4 produkty, 5+ produktów
 */
export function getProductWord(count: number): string {
  const common = getCommon();

  if (currentLanguage === 'pl') {
    if (count === 1) return common.product;
    if (count >= 2 && count <= 4) return common.products2_4;
    return common.products5plus;
  }

  // English/German: simple plural
  return count === 1 ? common.product : common.products5plus;
}

/**
 * Format currency amount with proper symbol.
 */
export function formatCurrency(amount: number): string {
  const common = getCommon();
  const formatted = amount.toFixed(2);

  // Polish/German: amount + symbol (50.00 zł)
  // English: symbol + amount ($50.00) - but we keep zł for now
  return `${formatted} ${common.currencySymbol}`;
}

// ============================================================
// Helpers
// ============================================================

function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{${key}}`;
  });
}
