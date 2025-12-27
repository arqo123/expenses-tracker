// i18n exports
export {
  initI18n,
  getLanguage,
  t,
  tc,
  tsc,
  categoryToDb,
  getAllCategories,
  getCategoryMap,
  getPrompts,
  getCommon,
  getProductWord,
  formatCurrency,
} from './i18n.service.ts';

export type {
  Translations,
  CategoryTranslations,
  UITranslations,
  PromptTranslations,
  CommonTranslations,
  SupportedLanguage,
} from './types.ts';

export {
  EXPENSE_CATEGORY_KEYS,
  EXPENSE_CATEGORY_DB_VALUES,
  SHOP_CATEGORY_KEYS,
} from './types.ts';
