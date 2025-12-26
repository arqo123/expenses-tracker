import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types/expense.types.ts';

// Merchant patterns for AI categorization
export const MERCHANT_PATTERNS: Record<string, ExpenseCategory> = {
  // Zakupy spozywcze
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

  // Restauracje
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

  // Kawiarnie
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

  // Paliwo
  'orlen': 'Paliwo',
  'bp': 'Paliwo',
  'shell': 'Paliwo',
  'circle k': 'Paliwo',
  'lotos': 'Paliwo',
  'amic': 'Paliwo',
  'moya': 'Paliwo',
  'stacja paliw': 'Paliwo',
  'stacja benzynowa': 'Paliwo',
  'tankowanie': 'Paliwo',
  'paliwo': 'Paliwo',

  // Dom
  'ikea': 'Dom',
  'leroy merlin': 'Dom',
  'castorama': 'Dom',
  'obi': 'Dom',
  'bricoman': 'Dom',
  'jysk': 'Dom',
  'pepco': 'Dom',
  'action': 'Dom',
  'tedi': 'Dom',

  // Zdrowie
  'apteka': 'Zdrowie',
  'gemini': 'Zdrowie',
  'doz': 'Zdrowie',
  'super-pharm': 'Zdrowie',
  'alab': 'Zdrowie',
  'diagnostyka': 'Zdrowie',
  'luxmed': 'Zdrowie',
  'medicover': 'Zdrowie',
  'enel-med': 'Zdrowie',

  // Uroda
  'rossmann': 'Uroda',
  'hebe': 'Uroda',
  'douglas': 'Uroda',
  'sephora': 'Uroda',
  'inglot': 'Uroda',
  'fryzjer': 'Uroda',
  'barber': 'Uroda',

  // Rozrywka
  'cinema city': 'Rozrywka',
  'multikino': 'Rozrywka',
  'helios': 'Rozrywka',
  'empik': 'Rozrywka',
  'spotify': 'Subskrypcje',
  'netflix': 'Subskrypcje',
  'hbo': 'Subskrypcje',
  'disney': 'Subskrypcje',
  'amazon prime': 'Subskrypcje',

  // Sport
  'decathlon': 'Sport',
  'intersport': 'Sport',
  'go sport': 'Sport',
  'silownia': 'Sport',
  'fitness': 'Sport',
  'gym': 'Sport',

  // Elektronika
  'media expert': 'Elektronika',
  'media markt': 'Elektronika',
  'rtv euro agd': 'Elektronika',
  'komputronik': 'Elektronika',
  'x-kom': 'Elektronika',
  'morele': 'Elektronika',
  'apple': 'Elektronika',

  // Ubrania
  'zara': 'Ubrania',
  'h&m': 'Ubrania',
  'reserved': 'Ubrania',
  'cropp': 'Ubrania',
  'house': 'Ubrania',
  'sinsay': 'Ubrania',
  'mohito': 'Ubrania',
  'ccc': 'Ubrania',
  'deichmann': 'Ubrania',

  // Inwestycje
  'xtb': 'Inwestycje',
  'revolut': 'Przelewy',
  'wise': 'Przelewy',
  'paypal': 'Przelewy',

  // Zwierzeta
  'maxi zoo': 'Zwierzeta',
  'kakadu': 'Zwierzeta',
  'zooplus': 'Zwierzeta',
  'weterynarz': 'Zwierzeta',
  'vet': 'Zwierzeta',
};

// Critical rules for AI (edge cases)
export const CRITICAL_RULES = `
KRYTYCZNE REGUŁY (zawsze sprawdź!):
- alab.pl, alab → "Zdrowie" (laboratorium medyczne, NIE elektronika!)
- cosibella.pl → "Uroda" (kosmetyki)
- food.bolt.eu, bolt food → "Delivery" (dostawa jedzenia)
- bolt.eu (bez "food") → "Transport" (taxi)
- Shell, Orlen, BP → "Paliwo" (NIE transport!)
- XTB, xtb.com → "Inwestycje"
- Imiona/nazwiska bez kontekstu → "Przelewy"
- Revolut top-up → "Przelewy" (nie Inwestycje)
- Allegro → sprawdź kontekst produktu
- Amazon → sprawdź kontekst produktu

ROZPOZNAWANIE SKLEPÓW I PRODUKTÓW:
- "stacja paliw [nazwa]" → shop: [nazwa], category: Paliwo, description: stacja paliw
- "guma", "przekąska", "napój", "jedzenie" bez sklepu → shop: Nieznany, category: Zakupy spożywcze
- "kawa", "latte", "cappuccino" bez sklepu → shop: Nieznany, category: Kawiarnie
- Jeśli nie ma nazwy sklepu, użyj "Nieznany" jako shop
`;

export function buildSystemPrompt(): string {
  const categoriesList = EXPENSE_CATEGORIES.join(', ');

  const merchantPatterns = Object.entries(MERCHANT_PATTERNS)
    .reduce((acc, [merchant, category]) => {
      if (!acc[category]) acc[category] = [];
      acc[category].push(merchant);
      return acc;
    }, {} as Record<string, string[]>);

  const patternsText = Object.entries(merchantPatterns)
    .map(([cat, merchants]) => `${cat}: ${merchants.join(', ')}`)
    .join('\n');

  return `Jestes ekspertem kategoryzacji wydatkow. Analizujesz transakcje w JEZYKU POLSKIM.

=== 25 KATEGORII (uzyj DOKLADNIE tych nazw) ===
${categoriesList}

=== WZORCE SPRZEDAWCOW ===
${patternsText}

${CRITICAL_RULES}

📊 CONFIDENCE (pewnosc):
- 0.95-1.0: Jednoznaczne (Biedronka → Zakupy spozywcze)
- 0.80-0.94: Bardzo prawdopodobne
- 0.60-0.79: Prawdopodobne
- 0.40-0.59: Niepewne
- 0.00-0.39: Bardzo niepewne (uzyj "Inne")

WAZNE: Zwracaj TYLKO valid JSON, bez markdown, bez komentarzy!`;
}
