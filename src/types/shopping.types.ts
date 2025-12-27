// Kategorie sklepowe dla smart routing (kolejność w sklepie)
export const SHOP_CATEGORIES = [
  'Warzywa i owoce',
  'Pieczywo',
  'Nabial',
  'Mieso i wedliny',
  'Mrozonki',
  'Suche produkty',
  'Napoje',
  'Slodycze',
  'Chemia',
  'Kosmetyki',
  'Dla zwierzat',
  'Inne',
] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

// Kolejność kategorii w supermarkecie (smart routing)
export const CATEGORY_ORDER: Record<ShopCategory, number> = {
  'Warzywa i owoce': 1,
  'Pieczywo': 2,
  'Nabial': 3,
  'Mieso i wedliny': 4,
  'Mrozonki': 5,
  'Suche produkty': 6,
  'Napoje': 7,
  'Slodycze': 8,
  'Chemia': 9,
  'Kosmetyki': 10,
  'Dla zwierzat': 11,
  'Inne': 12,
};

// Emoji dla kategorii sklepowych
export const SHOP_CATEGORY_EMOJI: Record<ShopCategory, string> = {
  'Warzywa i owoce': '🥬',
  'Pieczywo': '🍞',
  'Nabial': '🥛',
  'Mieso i wedliny': '🥩',
  'Mrozonki': '🧊',
  'Suche produkty': '🍝',
  'Napoje': '🥤',
  'Slodycze': '🍫',
  'Chemia': '🧴',
  'Kosmetyki': '💄',
  'Dla zwierzat': '🐕',
  'Inne': '📦',
};

// Emoji dla konkretnych produktów (bardziej szczegółowe niż kategorie)
export const PRODUCT_EMOJI_MAP: Record<string, string> = {
  // Warzywa
  'pomidor': '🍅',
  'ogorek': '🥒',
  'ogórek': '🥒',
  'marchew': '🥕',
  'marchewka': '🥕',
  'ziemniak': '🥔',
  'kartofl': '🥔',
  'cebula': '🧅',
  'czosnek': '🧄',
  'brokul': '🥦',
  'brokuł': '🥦',
  'salata': '🥬',
  'sałata': '🥬',
  'papryka': '🫑',
  'kukurydza': '🌽',
  'baklazan': '🍆',
  'bakłażan': '🍆',
  'grzyb': '🍄',
  'pieczarka': '🍄',
  'kapusta': '🥬',
  'szpinak': '🥬',
  'pietruszka': '🥬',
  'kalafior': '🥦',
  'por': '🧅',
  'rzodkiew': '🥕',
  'burak': '🥕',
  'dynia': '🎃',
  'fasola': '🫘',
  'groszek': '🫛',

  // Owoce
  'jabłko': '🍎',
  'jablko': '🍎',
  'banan': '🍌',
  'pomarancz': '🍊',
  'pomarańcz': '🍊',
  'cytryna': '🍋',
  'arbuz': '🍉',
  'winogrono': '🍇',
  'truskawk': '🍓',
  'brzoskwinia': '🍑',
  'gruszka': '🍐',
  'ananas': '🍍',
  'kiwi': '🥝',
  'awokado': '🥑',
  'mango': '🥭',
  'wisnia': '🍒',
  'wiśnia': '🍒',
  'czereśnia': '🍒',
  'czeresnia': '🍒',
  'malina': '🫐',
  'jagoda': '🫐',
  'borowka': '🫐',
  'borówka': '🫐',
  'melon': '🍈',
  'kokos': '🥥',
  'limonka': '🍋',
  'grejpfrut': '🍊',
  'mandarynka': '🍊',
  'śliwka': '🫐',
  'sliwka': '🫐',
  'nektarynka': '🍑',

  // Pieczywo
  'chleb': '🍞',
  'bagietka': '🥖',
  'bulka': '🥐',
  'bułka': '🥐',
  'croissant': '🥐',
  'rogalik': '🥐',
  'precel': '🥨',
  'paczek': '🍩',
  'pączek': '🍩',
  'drozdzowka': '🧁',
  'drożdżówka': '🧁',

  // Nabiał
  'mleko': '🥛',
  'ser': '🧀',
  'serek': '🧀',
  'maslo': '🧈',
  'masło': '🧈',
  'jajko': '🥚',
  'jajka': '🥚',
  'jaja': '🥚',
  'jogurt': '🥛',
  'smietana': '🥛',
  'śmietana': '🥛',
  'kefir': '🥛',
  'twarog': '🧀',
  'twaróg': '🧀',

  // Mięso
  'mieso': '🥩',
  'mięso': '🥩',
  'kurczak': '🍗',
  'szynka': '🥓',
  'kielbasa': '🌭',
  'kiełbasa': '🌭',
  'bekon': '🥓',
  'boczek': '🥓',
  'ryba': '🐟',
  'losos': '🐟',
  'łosoś': '🐟',
  'krewetka': '🦐',
  'parowki': '🌭',
  'parówki': '🌭',
  'wedlina': '🥓',
  'wędlina': '🥓',
  'salami': '🥓',
  'indyk': '🍗',

  // Napoje
  'woda': '💧',
  'sok': '🧃',
  'kawa': '☕',
  'herbata': '🍵',
  'piwo': '🍺',
  'wino': '🍷',
  'cola': '🥤',
  'pepsi': '🥤',
  'sprite': '🥤',
  'fanta': '🥤',

  // Słodycze
  'czekolada': '🍫',
  'cukierek': '🍬',
  'cukierki': '🍬',
  'ciasto': '🍰',
  'tort': '🎂',
  'lod': '🍦',
  'lody': '🍦',
  'ciastko': '🍪',
  'ciastka': '🍪',
  'wafel': '🧇',
  'wafelki': '🧇',
  'chipsy': '🥔',
  'chrupki': '🥔',

  // Suche produkty
  'pizza': '🍕',
  'makaron': '🍝',
  'ryz': '🍚',
  'ryż': '🍚',
  'sol': '🧂',
  'sól': '🧂',
  'miod': '🍯',
  'miód': '🍯',
  'orzech': '🥜',
  'orzechy': '🥜',
  'maka': '🌾',
  'mąka': '🌾',
  'kasza': '🌾',
  'platki': '🥣',
  'płatki': '🥣',
  'musli': '🥣',

  // Chemia
  'papier toaletowy': '🧻',
  'mydlo': '🧼',
  'mydło': '🧼',
  'szampon': '🧴',
  'zel': '🧴',
  'żel': '🧴',

  // Dla zwierząt
  'karma': '🐕',
  'przysmak': '🦴',
};

// Funkcja do znajdowania emoji dla produktu
export function getProductEmoji(productName: string, category?: ShopCategory): string {
  const normalized = productName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Usuń diakrytyki do porównania

  // Szukaj dopasowania w mapie produktów
  for (const [pattern, emoji] of Object.entries(PRODUCT_EMOJI_MAP)) {
    const normalizedPattern = pattern
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (normalized.includes(normalizedPattern)) {
      return emoji;
    }
  }

  // Fallback do emoji kategorii
  if (category) {
    return SHOP_CATEGORY_EMOJI[category] || '📦';
  }

  return '📦';
}

// Mapowanie popularnych produktów na kategorie
export const PRODUCT_CATEGORY_MAP: Record<string, ShopCategory> = {
  // Warzywa i owoce
  'pomidor': 'Warzywa i owoce',
  'pomidory': 'Warzywa i owoce',
  'ogorek': 'Warzywa i owoce',
  'ogorki': 'Warzywa i owoce',
  'jablko': 'Warzywa i owoce',
  'jablka': 'Warzywa i owoce',
  'banan': 'Warzywa i owoce',
  'banany': 'Warzywa i owoce',
  'ziemniak': 'Warzywa i owoce',
  'ziemniaki': 'Warzywa i owoce',
  'cebula': 'Warzywa i owoce',
  'czosnek': 'Warzywa i owoce',
  'marchew': 'Warzywa i owoce',
  'marchewka': 'Warzywa i owoce',
  'salata': 'Warzywa i owoce',
  'papryka': 'Warzywa i owoce',
  'cytryna': 'Warzywa i owoce',
  'pomarancza': 'Warzywa i owoce',
  'gruszka': 'Warzywa i owoce',
  'truskawki': 'Warzywa i owoce',
  'maliny': 'Warzywa i owoce',
  'borowki': 'Warzywa i owoce',
  'winogrona': 'Warzywa i owoce',
  'awokado': 'Warzywa i owoce',
  'brokuł': 'Warzywa i owoce',
  'brokul': 'Warzywa i owoce',
  'kalafior': 'Warzywa i owoce',
  'szpinak': 'Warzywa i owoce',

  // Pieczywo
  'chleb': 'Pieczywo',
  'bulka': 'Pieczywo',
  'bulki': 'Pieczywo',
  'bagietka': 'Pieczywo',
  'rogal': 'Pieczywo',
  'rogalik': 'Pieczywo',
  'croissant': 'Pieczywo',
  'drozdzowka': 'Pieczywo',
  'paczek': 'Pieczywo',

  // Nabiał
  'mleko': 'Nabial',
  'maslo': 'Nabial',
  'ser': 'Nabial',
  'serek': 'Nabial',
  'jogurt': 'Nabial',
  'kefir': 'Nabial',
  'smietana': 'Nabial',
  'twarog': 'Nabial',
  'jajka': 'Nabial',
  'jaja': 'Nabial',

  // Mięso i wędliny
  'szynka': 'Mieso i wedliny',
  'wedlina': 'Mieso i wedliny',
  'kielbasa': 'Mieso i wedliny',
  'parówki': 'Mieso i wedliny',
  'parowki': 'Mieso i wedliny',
  'bekon': 'Mieso i wedliny',
  'kurczak': 'Mieso i wedliny',
  'drob': 'Mieso i wedliny',
  'wolowina': 'Mieso i wedliny',
  'wieprzowina': 'Mieso i wedliny',
  'mieso': 'Mieso i wedliny',
  'miesne': 'Mieso i wedliny',

  // Mrożonki
  'mrozonki': 'Mrozonki',
  'lody': 'Mrozonki',
  'pizza mrozona': 'Mrozonki',
  'warzywa mrozone': 'Mrozonki',
  'ryba mrozona': 'Mrozonki',

  // Suche produkty
  'makaron': 'Suche produkty',
  'ryz': 'Suche produkty',
  'kasza': 'Suche produkty',
  'maka': 'Suche produkty',
  'cukier': 'Suche produkty',
  'sol': 'Suche produkty',
  'olej': 'Suche produkty',
  'oliwa': 'Suche produkty',
  'platki': 'Suche produkty',
  'musli': 'Suche produkty',
  'kawa': 'Suche produkty',
  'herbata': 'Suche produkty',

  // Napoje
  'woda': 'Napoje',
  'sok': 'Napoje',
  'cola': 'Napoje',
  'pepsi': 'Napoje',
  'sprite': 'Napoje',
  'piwo': 'Napoje',
  'wino': 'Napoje',

  // Słodycze
  'czekolada': 'Slodycze',
  'ciastka': 'Slodycze',
  'cukierki': 'Slodycze',
  'chrupki': 'Slodycze',
  'chipsy': 'Slodycze',
  'wafel': 'Slodycze',
  'wafelki': 'Slodycze',

  // Chemia
  'plyn': 'Chemia',
  'proszek': 'Chemia',
  'detergent': 'Chemia',
  'mydlo': 'Chemia',
  'szampon': 'Chemia',
  'pasta': 'Chemia',
  'papier toaletowy': 'Chemia',
  'reczniki': 'Chemia',
  'worki': 'Chemia',

  // Kosmetyki
  'krem': 'Kosmetyki',
  'balsam': 'Kosmetyki',
  'dezodorant': 'Kosmetyki',
  'perfumy': 'Kosmetyki',

  // Dla zwierząt
  'karma': 'Dla zwierzat',
  'zywiec': 'Dla zwierzat',
  'przysmak': 'Dla zwierzat',
  'piasek': 'Dla zwierzat',
  'zuwirek': 'Dla zwierzat',
};

// Lista zakupów
export interface ShoppingList {
  listId: string;
  name: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Produkt na liście
export interface ShoppingItem {
  itemId: string;
  listId: string;
  name: string;
  quantity: number;
  shopCategory: ShopCategory;
  addedBy: string;
  isChecked: boolean;
  priority: number;
  emoji: string;
  createdAt: string;
}

// Podpowiedź zakupowa
export interface ShoppingSuggestion {
  productName: string;
  purchaseCount: number;
  avgIntervalDays?: number;
  lastBoughtAt?: string;
  typicalShop?: string;
  daysSinceLastPurchase?: number;
}

// Intencja wiadomości
export interface AddToListIntent {
  type: 'add_to_list';
  items: Array<{
    name: string;
    quantity: number;
  }>;
}

export interface ExpenseIntent {
  type: 'expense';
  text: string;
}

export interface QueryIntent {
  type: 'query';
  text: string;
}

export interface UnknownIntent {
  type: 'unknown';
  text: string;
}

export type MessageIntent = AddToListIntent | ExpenseIntent | QueryIntent | UnknownIntent;

// Wynik dopasowania paragonu do listy
export interface ReceiptMatchResult {
  itemId: string;
  itemName: string;
  receiptProduct: string;
  confidence: number;
}
