import type { SupportedLanguage } from '../config/types.ts';

// ============================================================
// Translation Keys Structure
// ============================================================

export interface CategoryTranslations {
  expense: {
    groceries: string;
    restaurants: string;
    delivery: string;
    cafes: string;
    transport: string;
    fuel: string;
    auto: string;
    home: string;
    health: string;
    beauty: string;
    entertainment: string;
    sport: string;
    hobby: string;
    clothing: string;
    electronics: string;
    subscriptions: string;
    education: string;
    pets: string;
    children: string;
    gifts: string;
    investments: string;
    transfers: string;
    hotels: string;
    fees: string;
    other: string;
  };
  shop: {
    vegetables: string;
    bakery: string;
    dairy: string;
    meat: string;
    frozen: string;
    drinks: string;
    sweets: string;
    household: string;
    cosmetics: string;
    ready_meals: string;
    alcohol: string;
    other: string;
  };
}

export interface UITranslations {
  commands: {
    help: {
      title: string;
      howToAdd: string;
      addText: string;
      addVoice: string;
      addPhoto: string;
      addCsv: string;
      statsTitle: string;
      statsMenu: string;
      statsAsk: string;
      correctionTitle: string;
      correctionButton: string;
      correctionText: string;
      examplesTitle: string;
      example1: string;
      example2: string;
      example3: string;
      example4: string;
      commandsTitle: string;
      commandMenu: string;
      commandHelp: string;
    };
    menu: {
      title: string;
      whatToCheck: string;
    };
  };
  errors: {
    amountNotRecognized: string;
    alreadySaved: string;
    processingFailed: string;
    categoryUnknown: string;
    noExpensesToChange: string;
    correctionWindowExpired: string;
    updateFailed: string;
    categoryChangeFailed: string;
    expenseNotFound: string;
    invalidData: string;
    sessionExpired: string;
    unknownAction: string;
    error: string;
    voiceTooLong: string;
    fileTooLarge: string;
    speechNotRecognized: string;
    voiceProcessingError: string;
    imageTooLarge: string;
    noImageToProcess: string;
    ocrFailed: string;
    noProductsToSave: string;
    receiptAlreadyProcessed: string;
    imageProcessingError: string;
    csvTooLarge: string;
    noTransactionsFound: string;
    csvProcessingError: string;
    queryProcessingError: string;
    addToListError: string;
    openListError: string;
    listAlreadyEmpty: string;
    productNotFound: string;
    shoppingError: string;
  };
  buttons: {
    back: string;
    cancel: string;
    confirm: string;
    delete: string;
    edit: string;
    editCategories: string;
    showList: string;
    addProduct: string;
    suggestions: string;
    clearList: string;
    previous: string;
    next: string;
    yesClear: string;
    yesDelete: string;
    addMore: string;
    checkNext: string;
    check: string;
    add: string;
    addAll: string;
    yesReplace: string;
    keepBoth: string;
    keepAll: string;
    shoppingList: string;
    timeReports: string;
    categories: string;
    shops: string;
    comparison: string;
    trends: string;
    search: string;
    visitHistory: string;
  };
  stats: {
    total: string;
    average: string;
    averagePerDay: string;
    count: string;
    transactions: string;
    topCategories: string;
    topShops: string;
    categoryBreakdown: string;
    noData: string;
    noExpenses: string;
  };
  shopping: {
    listTitle: string;
    productsToBuy: string;
    emptyList: string;
    sharedList: string;
    addedToList: string;
    addProductInstruction: string;
    addExamples: string;
    voiceHint: string;
    checked: string;
    cleared: string;
    clearConfirm: string;
    listCleared: string;
    addedProducts: string;
    suggestionsTitle: string;
    noSuggestions: string;
    basedOnPurchases: string;
    daysAgo: string;
    buyEvery: string;
    lastPurchase: string;
  };
  menu: {
    statsTitle: string;
    timeReportsTitle: string;
    categoriesTitle: string;
    shopsTitle: string;
    comparisonTitle: string;
    trendsTitle: string;
    searchTitle: string;
    selectPeriod: string;
    selectOption: string;
  };
  periods: {
    today: string;
    yesterday: string;
    thisWeek: string;
    lastWeek: string;
    thisMonth: string;
    lastMonth: string;
    last30Days: string;
    last3Months: string;
    last6Months: string;
    thisYear: string;
    allTime: string;
  };
  csv: {
    processing: string;
    importComplete: string;
    skipped: string;
    categoryBreakdown: string;
  };
  receipt: {
    receiptFrom: string;
    totalAmount: string;
    discountsApplied: string;
    createdExpenses: string;
    duplicates: string;
    checkedFromList: string;
    foundSimilar: string;
    foundMultipleSimilar: string;
    replaceQuestion: string;
    whichReplace: string;
    replaced: string;
    kept: string;
    noReceiptId: string;
    productsNotFound: string;
  };
  correction: {
    provideCategory: string;
    changed: string;
  };
  query: {
    processingFailed: string;
    sumTitle: string;
    countTitle: string;
    averageTitle: string;
    totalLabel: string;
    transactionsLabel: string;
    averageLabel: string;
    sumLabel: string;
    andMore: string;
    excluded: string;
    withoutShops: string;
  };
  charts: {
    noData: string;
    average: string;
    total: string;
  };
}

export interface PromptTranslations {
  categorizer: {
    systemBase: string;
    singleTask: string;
    batchTask: string;
    visionTask: string;
    criticalRulesHeader: string;
    criticalRulesItems: string[];
    shopRecognitionHeader: string;
    shopRecognitionItems: string[];
    merchantPatterns: string;
    confidenceLevelsHeader: string;
    confidenceLevelsItems: string[];
    outputFormat: string;
    categoriesHeader: string;
    userMessageVision: string;
  };
  nlp: {
    systemPrompt: string;
    userMessage: string;
    datePatterns: {
      relative: string;
      absolute: string;
      months: string[];
      weekdays: string[];
    };
    sections: {
      todayDate: string;
      currentYear: string;
      currentMonth: string;
      availableCategories: string;
      intentTypes: string;
      dateParsing: string;
      dateParsingNote: string;
      monthNote: string;
      negations: string;
      negationNote: string;
      categoryFilters: string;
      shopFilters: string;
      amountFilters: string;
      aggregations: string;
      parsingExamples: string;
      outputFormat: string;
      important: string;
    };
    intents: {
      list: string;
      sum: string;
      count: string;
      average: string;
      top: string;
      comparison: string;
    };
    relativeDates: {
      today: string;
      yesterday: string;
      dayBeforeYesterday: string;
      lastNDays: string;
      thisWeek: string;
      lastWeek: string;
      thisMonth: string;
      lastMonth: string;
      thisYear: string;
    };
    absoluteDates: {
      inMonth: string;
      inMonthBeforeCurrent: string;
      fromToDate: string;
      betweenDates: string;
      inMonthYear: string;
    };
    negationExamples: {
      withoutCategory: string;
      exceptCategory: string;
      notCountingCategory: string;
      excludingShop: string;
      withoutShop: string;
      combineMultiple: string;
    };
    categoryFilterExamples: {
      forFood: string;
      inRestaurants: string;
      forFuel: string;
      forTransport: string;
      forEntertainment: string;
      forSubscriptions: string;
    };
    shopFilterExamples: {
      inShop1: string;
      inShop2: string;
      atGasStation: string;
    };
    amountFilterExamples: {
      above: string;
      below: string;
      between: string;
      exactly: string;
    };
    aggregationExamples: {
      topCategories: string;
      topShops: string;
      groupByCategory: string;
      groupByShop: string;
      groupByDay: string;
      groupByMonth: string;
    };
    outputRules: string[];
    defaultDescription: string;
  };
  shopping: {
    intentDetection: string;
    listParsing: string;
    categorization: string;
  };
}

export interface CommonTranslations {
  currency: string;
  currencySymbol: string;
  unknown: string;
  other: string;
  deleted: string;
  cancelled: string;
  done: string;
  processing: string;
  correctIfWrong: string;
  product: string;
  products2_4: string;
  products5plus: string;
}

export interface Translations {
  categories: CategoryTranslations;
  ui: UITranslations;
  prompts: PromptTranslations;
  common: CommonTranslations;
}

// ============================================================
// Category Key Mappings (DB value -> i18n key)
// ============================================================

// Maps Polish DB category names to translation keys
export const EXPENSE_CATEGORY_KEYS: Record<string, keyof CategoryTranslations['expense']> = {
  'Zakupy spozywcze': 'groceries',
  'Restauracje': 'restaurants',
  'Delivery': 'delivery',
  'Kawiarnie': 'cafes',
  'Transport': 'transport',
  'Paliwo': 'fuel',
  'Auto': 'auto',
  'Dom': 'home',
  'Zdrowie': 'health',
  'Uroda': 'beauty',
  'Rozrywka': 'entertainment',
  'Sport': 'sport',
  'Hobby': 'hobby',
  'Ubrania': 'clothing',
  'Elektronika': 'electronics',
  'Subskrypcje': 'subscriptions',
  'Edukacja': 'education',
  'Zwierzeta': 'pets',
  'Dzieci': 'children',
  'Prezenty': 'gifts',
  'Inwestycje': 'investments',
  'Przelewy': 'transfers',
  'Hotele': 'hotels',
  'Oplaty administracyjne': 'fees',
  'Inne': 'other',
};

// Reverse mapping: i18n key -> Polish DB value
export const EXPENSE_CATEGORY_DB_VALUES: Record<keyof CategoryTranslations['expense'], string> = {
  groceries: 'Zakupy spozywcze',
  restaurants: 'Restauracje',
  delivery: 'Delivery',
  cafes: 'Kawiarnie',
  transport: 'Transport',
  fuel: 'Paliwo',
  auto: 'Auto',
  home: 'Dom',
  health: 'Zdrowie',
  beauty: 'Uroda',
  entertainment: 'Rozrywka',
  sport: 'Sport',
  hobby: 'Hobby',
  clothing: 'Ubrania',
  electronics: 'Elektronika',
  subscriptions: 'Subskrypcje',
  education: 'Edukacja',
  pets: 'Zwierzeta',
  children: 'Dzieci',
  gifts: 'Prezenty',
  investments: 'Inwestycje',
  transfers: 'Przelewy',
  hotels: 'Hotele',
  fees: 'Oplaty administracyjne',
  other: 'Inne',
};

export const SHOP_CATEGORY_KEYS: Record<string, keyof CategoryTranslations['shop']> = {
  'Warzywa i owoce': 'vegetables',
  'Pieczywo': 'bakery',
  'Nabiał': 'dairy',
  'Mięso i wędliny': 'meat',
  'Mrożonki': 'frozen',
  'Napoje': 'drinks',
  'Słodycze': 'sweets',
  'Chemia domowa': 'household',
  'Kosmetyki': 'cosmetics',
  'Gotowe dania': 'ready_meals',
  'Alkohol': 'alcohol',
  'Inne': 'other',
};

export type { SupportedLanguage };
