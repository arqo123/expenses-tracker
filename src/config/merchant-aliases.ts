/**
 * Merchant name aliases for normalization
 * Maps various merchant name variants to canonical names
 */

export const MERCHANT_ALIASES: Record<string, string> = {
  // Streaming services
  'spotify ab': 'Spotify',
  'spotify technology': 'Spotify',
  'spotify': 'Spotify',

  // Transport
  'freenow': 'FreeNow',
  'free now': 'FreeNow',
  'bolt': 'Bolt',
  'uber': 'Uber',
  'uber eats': 'Uber Eats',
  'uber *eats': 'Uber Eats',

  // Food delivery
  'glovo': 'Glovo',
  'wolt': 'Wolt',
  'pyszne': 'Pyszne.pl',
  'pyszne.pl': 'Pyszne.pl',

  // Fuel stations
  'orlen': 'Orlen',
  'bp': 'BP',
  'shell': 'Shell',
  'circle k': 'Circle K',

  // Groceries
  'biedronka': 'Biedronka',
  'lidl': 'Lidl',
  'zabka': 'Żabka',
  'żabka': 'Żabka',
  'auchan': 'Auchan',
  'carrefour': 'Carrefour',
  'kaufland': 'Kaufland',

  // Fast food
  'mcdonalds': "McDonald's",
  "mcdonald's": "McDonald's",
  'kfc': 'KFC',
  'burger king': 'Burger King',
  'subway': 'Subway',

  // Electronics
  'x-kom': 'x-kom',
  'xkom': 'x-kom',
  'media expert': 'Media Expert',
  'mediaexpert': 'Media Expert',
  'rtv euro agd': 'RTV Euro AGD',
  'mediamarkt': 'MediaMarkt',
  'media markt': 'MediaMarkt',

  // Fashion
  'zalando': 'Zalando',
  'hm': 'H&M',
  'h&m': 'H&M',
  'zara': 'Zara',
  'reserved': 'Reserved',

  // Online shopping
  'amazon': 'Amazon',
  'allegro': 'Allegro',
  'aliexpress': 'AliExpress',

  // Services
  'netflix': 'Netflix',
  'hbo': 'HBO Max',
  'hbo max': 'HBO Max',
  'disney': 'Disney+',
  'disney+': 'Disney+',

  // Pharmacies
  'rossmann': 'Rossmann',
  'hebe': 'Hebe',
  'super-pharm': 'Super-Pharm',
  'superpharm': 'Super-Pharm',

  // Home improvement
  'ikea': 'IKEA',
  'castorama': 'Castorama',
  'leroy merlin': 'Leroy Merlin',
  'obi': 'OBI',
};

/**
 * Normalize a shop name using known aliases
 * @param name Raw shop name
 * @returns Normalized canonical name
 */
export function normalizeShopName(name: string): string {
  const lower = name.toLowerCase().trim();
  return MERCHANT_ALIASES[lower] || name;
}
