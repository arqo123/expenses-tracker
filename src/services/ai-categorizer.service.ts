import { CircuitBreaker, type CircuitBreakerState } from '../utils/circuit-breaker.ts';
import { buildSystemPrompt } from '../config/categories.ts';
import { getEnv } from '../config/env.ts';
import type {
  CategorizationResult,
  BatchCategorizationItem,
  VisionResult,
  ExpenseCategory,
  StoreType,
} from '../types/expense.types.ts';

// Force category based on store type for specialized stores
function getVisionForcedCategory(storeType: StoreType | undefined, source: string): ExpenseCategory | null {
  const sourceLower = source.toLowerCase();

  // Veterinary clinics and pet stores → Zwierzeta
  if (storeType === 'veterinary' || storeType === 'pet_store' ||
      sourceLower.includes('weteryn') || sourceLower.includes('vet') ||
      sourceLower.includes('zoo') || sourceLower.includes('kakadu') ||
      sourceLower.includes('maxi zoo') || sourceLower.includes('animax') ||
      sourceLower.includes('zooplus')) {
    return 'Zwierzeta';
  }

  // Pharmacies → Zdrowie
  if (storeType === 'pharmacy' ||
      sourceLower.includes('aptek') || sourceLower.includes('pharmacy') ||
      sourceLower.includes('doz') || sourceLower.includes('gemini')) {
    return 'Zdrowie';
  }

  return null; // AI categorizes individually
}

interface AICategorizerConfig {
  primaryModel: string;
  fallbackModel: string;
  visionModel: string;
  openRouterApiKey: string;
  temperature: number;
  maxTokens: number;
  circuitBreakerThreshold: number;
  circuitBreakerCooldownMs: number;
}

type CategorizerMode = 'single' | 'batch' | 'vision';

export class AICategorizerService {
  private circuitBreaker: CircuitBreaker;
  private config: AICategorizerConfig;

  constructor(config: Partial<AICategorizerConfig> = {}) {
    const env = getEnv();
    this.config = {
      primaryModel: env.AI_PRIMARY_MODEL,
      fallbackModel: env.AI_FALLBACK_MODEL,
      visionModel: env.AI_VISION_MODEL,
      openRouterApiKey: env.OPENROUTER_API_KEY,
      temperature: 0.05,
      maxTokens: 18000,
      circuitBreakerThreshold: 3,
      circuitBreakerCooldownMs: 600000, // 10 minutes
      ...config,
    };

    this.circuitBreaker = new CircuitBreaker({
      threshold: this.config.circuitBreakerThreshold,
      cooldownMs: this.config.circuitBreakerCooldownMs,
    });
  }

  // Single expense categorization
  async categorizeSingle(input: string): Promise<CategorizationResult> {
    const result = await this.callAI('single', input);
    return result as CategorizationResult;
  }

  // Batch categorization for CSV imports
  async categorizeBatch(
    transactions: Array<{ idx: number; text: string; date?: string; source?: string }>
  ): Promise<BatchCategorizationItem[]> {
    const result = await this.callAI('batch', transactions);
    return result as BatchCategorizationItem[];
  }

  // Vision/OCR for receipts
  async categorizeImage(
    imageBase64: string,
    mimeType: string = 'image/jpeg'
  ): Promise<VisionResult> {
    const result = await this.callAI('vision', {
      image_base64: imageBase64,
      mime: mimeType,
    });
    return result as VisionResult;
  }

  private async callAI(
    mode: CategorizerMode,
    inputData: unknown
  ): Promise<CategorizationResult | BatchCategorizationItem[] | VisionResult> {
    const systemPrompt = this.buildModePrompt(mode);
    const userMessage = this.buildUserMessage(mode, inputData);
    const isVision = mode === 'vision';
    const model = isVision ? this.config.visionModel : this.config.primaryModel;

    // Try primary model if circuit is closed
    if (this.circuitBreaker.isAllowed()) {
      try {
        const response = await this.callOpenRouter(
          model,
          systemPrompt,
          userMessage,
          isVision
        );
        this.circuitBreaker.recordSuccess();
        return this.parseResponse(mode, response);
      } catch (error) {
        this.circuitBreaker.recordFailure();
        console.error('[AICategorizerService] Primary model failed:', error);
      }
    }

    // Fallback to secondary model
    try {
      console.log('[AICategorizerService] Using fallback model');
      const response = await this.callOpenRouter(
        this.config.fallbackModel,
        systemPrompt,
        userMessage,
        isVision
      );
      return this.parseResponse(mode, response);
    } catch (error) {
      console.error('[AICategorizerService] Fallback model failed:', error);
      throw new Error('Both primary and fallback AI models failed');
    }
  }

  private async callOpenRouter(
    model: string,
    systemPrompt: string,
    userMessage: string | object[],
    isVision: boolean
  ): Promise<string> {
    const content = isVision ? userMessage : userMessage;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ];

    console.log(`[AICategorizerService] Calling ${model}`);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.openRouterApiKey}`,
        'HTTP-Referer': 'https://expense-tracker.arqo.org',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const responseContent = data.choices?.[0]?.message?.content;

    if (!responseContent) {
      throw new Error('Empty response from AI');
    }

    return responseContent;
  }

  private buildModePrompt(mode: CategorizerMode): string {
    const basePrompt = buildSystemPrompt();

    if (mode === 'single') {
      return `${basePrompt}

=== ZADANIE: Kategoryzuj POJEDYNCZY wydatek ===
INPUT: Tekst w dowolnym formacie polskim opisującym wydatek.

WSPIERANE FORMATY (wszystkie są OK):
- "sklep kwota" → zabka 15
- "rzecz kwota" → guma 6.50
- "rzecz sklep kwota" → paliwo orlen 200
- "sklep rzecz kwota" → lidl chleb 5
- "typ sklep kwota" → stacja paliw darex 259,40 gr

JEDNOSTKI: zł, pln, gr, groszy (wszystkie = złotówki, gr != grosze)

EKSTRAKCJA:
1. Znajdź kwotę (liczba + opcjonalna jednostka)
2. Zidentyfikuj sklep/sprzedawcę (np. "darex", "orlen", "zabka")
3. Zidentyfikuj typ miejsca (np. "stacja paliw", "sklep", "restauracja")
4. Zidentyfikuj produkt/rzecz (np. "guma", "paliwo", "chleb")
5. Dopasuj kategorię na podstawie typu miejsca lub produktu

WAŻNE - Rozróżniaj sklep od typu/opisu:
- "stacja paliw darex" → shop: "Darex", description: "stacja paliw"
- "guma zabka" → shop: "Zabka", description: "guma"
- "paliwo orlen" → shop: "Orlen", description: "paliwo"

GDY BRAK SKLEPU - użyj "Nieznany":
- "guma do żucia 6,50" → shop: "Nieznany", description: "guma do żucia"
- "kawa 15" → shop: "Nieznany", description: "kawa"

ROZPOZNAWANIE NATURALNYCH ZDAŃ:
Użytkownicy piszą różnie - rozpoznaj wzorce:
- "na stacji X", "w sklepie X", "u X", "w X" → X to SKLEP
- "zakupione/kupione w X", "z X" → X to SKLEP
- Produkty to rzeczowniki pospolite: guma, chleb, paliwo, kawa, piwo
- Sklepy to nazwy własne/brandy: Darek, Orlen, Żabka, Lidl, Biedronka

PRZYKŁADY NATURALNYCH ZDAŃ:
- "guma do żucia zakupiona na stacji darex 6,50 zł"
  → shop: "Darex", description: "guma do żucia", amount: 6.50, category: "Zakupy spozywcze"
  (UWAGA: stacja to tylko miejsce, guma to żywność → Zakupy spozywcze!)
- "kawa na stacji shell 12 zł"
  → shop: "Shell", description: "kawa", amount: 12, category: "Kawiarnie"
  (kawa to napój, nie paliwo!)
- "tankowanie u orlena 250"
  → shop: "Orlen", description: "tankowanie", amount: 250, category: "Paliwo"
- "piwo kupione w biedronce za 5 zł"
  → shop: "Biedronka", description: "piwo", amount: 5, category: "Zakupy spozywcze"
- "obiad w restauracji u mamy 45 zl"
  → shop: "U Mamy", description: "obiad", amount: 45, category: "Restauracje"
- "kawa w żabce 8 zł"
  → shop: "Żabka", description: "kawa", amount: 8, category: "Kawiarnie"

KOREKTA LITERÓWEK W OPISIE:
- "guma do życia" → "guma do żucia"
- "guma do rzucia" → "guma do żucia"
- "kaawa" → "kawa"
- Poprawiaj oczywiste błędy ortograficzne w opisie produktu

PRIORYTET PRODUKTU NAD MIEJSCEM:
Kategoria zależy od PRODUKTU, nie od miejsca zakupu!
- "guma na stacji" → Zakupy spozywcze (guma to żywność, nie paliwo!)
- "kawa na stacji" → Kawiarnie (kawa, nie paliwo!)
- "piwo w żabce" → Zakupy spozywcze
- "tankowanie na stacji" → Paliwo (tankowanie = paliwo)
- "paliwo orlen" → Paliwo

Tylko te produkty to Paliwo: tankowanie, paliwo, benzyna, diesel, ON, LPG, gaz
Żywność/napoje kupione na stacji to nadal Zakupy spozywcze!

OUTPUT (TYLKO JSON):
{"shop": "Darex", "category": "Paliwo", "amount": 259.40, "description": "stacja paliw", "confidence": 0.95}`;
    }

    if (mode === 'batch') {
      return `${basePrompt}

=== ZADANIE: Kategoryzuj BATCH wydatkow ===
INPUT: Array obiektow [{idx: 0, text: "BIEDRONKA SP. Z O.O. 45.5"}, ...]
- Wyciagnij nazwe sprzedawcy (usun SP. Z O.O., SPOLKA, etc.)
- Wyciagnij kwote z konca tekstu

OUTPUT (TYLKO JSON array):
[{"idx": 0, "shop": "Biedronka", "category": "Zakupy spozywcze", "amount": 45.5, "confidence": 0.95}, ...]`;
    }

    // vision mode
    return `${basePrompt}

=== ZADANIE: OCR paragonu lub screenshota ===
Przeanalizuj obraz paragonu/rachunku/screenshota zamowienia.

WYCIĄGNIJ:
1. Nazwę sklepu/restauracji (source) - WAŻNE: rozpoznaj po nazwie, logo, lub kontekście
2. Adres sklepu (address) - jeśli widoczny (miasto, ulica, numer, kod pocztowy)
3. Typ sklepu (store_type): grocery, veterinary, pharmacy, restaurant, electronics, clothing, home, pet_store, other
4. Produkty z cenami NETTO (po rabatach) I KATEGORIAMI
5. Typ obrazu: "receipt" lub "ecommerce"

=== ROZPOZNAWANIE NAZWY SKLEPU ===
POLSKIE SKLEPY SPOŻYWCZE (rozpoznaj nawet po fragmentach nazwy):
- Biedronka, Lidl, Żabka, Kaufland, Carrefour, Auchan, Dino, Stokrotka
- Netto, Lewiatan, Polo Market, Polomarket, Topaz, Mila, Chata Polska
- Delikatesy Centrum, Intermarché, E.Leclerc, Aldi, Społem, Piotr i Paweł
- Freshmarket, Groszek, ABC, Małpka Express, Odido

DROGERIE I APTEKI:
- Rossmann, Hebe, Super-Pharm, Natura, Drogeria Laboo, DOZ Apteka

MARKETY BUDOWLANE:
- Castorama, Leroy Merlin, OBI, Bricomarché, Mrówka, PSB, Praktiker

ELEKTRONIKA:
- Media Expert, RTV Euro AGD, x-kom, Media Markt, Komputronik, Saturn, Neonet

INNE SIECI:
- Pepco, Action, KiK, TK Maxx, Half Price, Flying Tiger, Dealz, Tiger, Tedi
- Jysk, IKEA, Agata Meble, Black Red White, Abra, Komfort

E-COMMERCE (screenshoty zamówień):
- Allegro, Amazon, AliExpress, Temu, Shein, Zalando, Modivo, eobuwie
- OLX, Vinted, Facebook Marketplace

HURTOWNIE:
- Selgros, Makro, Eurocash

STACJE PALIW:
- Orlen, BP, Shell, Circle K, Moya, Amic, Lotos

=== ROZRÓŻNIANIE NAZWY OD ADRESU ===
- Nazwa sklepu to zazwyczaj krótka nazwa/brand (np. "Lidl", "Biedronka", "Żabka")
- Adres zawiera miasto, ulicę, numer, kod pocztowy
- Jeśli widzisz TYLKO adres bez nazwy sklepu → source: "", address: "pełny adres"
- Jeśli widzisz nazwę I adres → source: "nazwa", address: "adres"
- Jeśli to e-commerce screenshot (Allegro, Amazon, Temu) → source: "Allegro", address: null

PRZYKŁADY:
1. Paragon z "RZESZÓW, KWIATKOWSKIEGO 46, 20-952" bez widocznej nazwy:
   → source: "", address: "RZESZÓW, KWIATKOWSKIEGO 46, 20-952"

2. Paragon z "Lidl Sp. z o.o.\nul. Kwiatkowskiego 46\n35-952 Rzeszów":
   → source: "Lidl", address: "ul. Kwiatkowskiego 46, 35-952 Rzeszów"

3. Screenshot zamówienia Allegro:
   → source: "Allegro", address: null (e-commerce nie ma adresu sklepu)

KRYTYCZNE - OBSŁUGA RABATÓW:
1. Znajdź KOŃCOWĄ SUMĘ z paragonu (np. "Razem", "SUMA", "Do zapłaty") - to jest wartość "total"
2. Dla KAŻDEGO produktu z rabatem (RABAT, ZNIZKA, KUPON, ujemna kwota poniżej):
   - Odejmij rabat od ceny produktu
   - Zwróć TYLKO cenę NETTO (np. Masło 5.00, RABAT -1.00 → price: 4.00)
3. NIE twórz osobnych pozycji dla rabatów
4. WERYFIKACJA: suma wszystkich "price" MUSI równać się "total"
5. Pole "total_discounts" = suma wszystkich rabatów (wartość dodatnia)
6. WAŻNE: Pole "total" = DOKŁADNA wartość z linii "Razem" na paragonie - NIE obliczaj, ODCZYTAJ!

PRZYKŁAD paragonu Lidl:
  Mleko UHT 3.2%    6.58
  RABAT            -0.99
  Masło            5.00
  ---
  Razem           10.59

OUTPUT:
  products: [
    {"name": "Mleko UHT 3.2%", "price": 5.59},  // 6.58 - 0.99
    {"name": "Masło", "price": 5.00}
  ]
  total: 10.59  // = 5.59 + 5.00 ✓
  total_discounts: 0.99

KATEGORYZACJA PRODUKTÓW:
- Dla sklepów weterynaryjnych/zoologicznych → WSZYSTKO jako "Zwierzeta"
- Dla aptek → WSZYSTKO jako "Zdrowie"
- Dla mieszanych sklepów (Lidl, Biedronka, Carrefour, Auchan):
  - Żywność (chleb, masło, mleko, mięso, warzywa, owoce) → "Zakupy spozywcze"
  - Chemia (płyn do naczyń, proszek, środki czystości) → "Dom"
  - Kosmetyki (szampon, krem, pasta do zębów) → "Uroda"
  - Karma dla zwierząt → "Zwierzeta"
  - Leki, suplementy → "Zdrowie"
  - Artykuły dziecięce (pieluchy, przeciery owocowe dla dzieci) → "Dzieci"
- Dla e-commerce (Allegro, Amazon, Temu) → kategoryzuj KAŻDY produkt indywidualnie!

DOSTĘPNE KATEGORIE:
Zakupy spozywcze, Restauracje, Delivery, Kawiarnie, Transport, Paliwo, Auto, Dom,
Zdrowie, Uroda, Rozrywka, Sport, Hobby, Ubrania, Elektronika, Subskrypcje,
Edukacja, Zwierzeta, Dzieci, Prezenty, Inwestycje, Przelewy, Hotele, Oplaty administracyjne, Inne

OUTPUT (TYLKO JSON):
{
  "image_type": "receipt",
  "source": "Lidl",
  "address": "ul. Kwiatkowskiego 46, 35-952 Rzeszów",
  "store_type": "grocery",
  "products": [
    {"name": "Mleko UHT 3.2%", "price": 5.59, "category": "Zakupy spozywcze"},
    {"name": "Masło", "price": 5.00, "category": "Zakupy spozywcze"}
  ],
  "total": 10.59,
  "total_discounts": 0.99
}`;
  }

  private buildUserMessage(mode: CategorizerMode, inputData: unknown): string | object[] {
    if (mode === 'vision') {
      const data = inputData as { image_base64: string; mime: string };
      return [
        {
          type: 'image_url',
          image_url: {
            url: `data:${data.mime};base64,${data.image_base64}`,
          },
        },
        {
          type: 'text',
          text: 'Przeanalizuj ten paragon/rachunek i zwroc JSON z produktami.',
        },
      ];
    }

    if (mode === 'batch') {
      return `Kategoryzuj te transakcje:\n${JSON.stringify(inputData, null, 2)}`;
    }

    return `Kategoryzuj wydatek: ${inputData as string}`;
  }

  private parseResponse(
    mode: CategorizerMode,
    content: string
  ): CategorizationResult | BatchCategorizationItem[] | VisionResult {
    // Strip markdown code blocks
    let cleaned = content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Try to extract JSON from the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    try {
      const parsed = JSON.parse(cleaned);

      // For vision mode, add/validate categories for products
      if (mode === 'vision' && parsed.products) {
        const storeType = parsed.store_type as StoreType | undefined;
        const source = parsed.source || '';

        // Check if this is a specialized store (vet, pharmacy, pet store)
        const forcedCategory = getVisionForcedCategory(storeType, source);

        parsed.products = parsed.products.map((p: { name: string; price: number; category?: ExpenseCategory }) => ({
          ...p,
          // Use forced category for specialized stores, otherwise AI category or fallback
          category: forcedCategory || p.category || 'Inne',
          confidence: forcedCategory ? 1.0 : 0.8,
        }));

        // Log for debugging
        if (forcedCategory) {
          console.log(`[AICategorizerService] Forced category "${forcedCategory}" for store type "${storeType}" (${source})`);
        }
      }

      return parsed;
    } catch (error) {
      console.error('[AICategorizerService] Failed to parse response:', content);
      throw new Error(`Failed to parse AI response: ${error}`);
    }
  }

  getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }
}
