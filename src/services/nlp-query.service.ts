import { CircuitBreaker } from '../utils/circuit-breaker.ts';
import { getEnv } from '../config/env.ts';
import { EXPENSE_CATEGORIES } from '../types/expense.types.ts';
import type { ParsedNLPQuery, DateRange } from '../types/nlp-query.types.ts';

interface NLPQueryConfig {
  primaryModel: string;
  fallbackModel: string;
  openRouterApiKey: string;
  temperature: number;
  maxTokens: number;
  circuitBreakerThreshold: number;
  circuitBreakerCooldownMs: number;
}

export class NLPQueryService {
  private circuitBreaker: CircuitBreaker;
  private config: NLPQueryConfig;

  constructor(config: Partial<NLPQueryConfig> = {}) {
    const env = getEnv();
    this.config = {
      primaryModel: env.AI_PRIMARY_MODEL,
      fallbackModel: env.AI_FALLBACK_MODEL,
      openRouterApiKey: env.OPENROUTER_API_KEY,
      temperature: 0.1, // Low temperature for deterministic parsing
      maxTokens: 1500,
      circuitBreakerThreshold: 3,
      circuitBreakerCooldownMs: 300000, // 5 minutes
      ...config,
    };

    this.circuitBreaker = new CircuitBreaker({
      threshold: this.config.circuitBreakerThreshold,
      cooldownMs: this.config.circuitBreakerCooldownMs,
    });
  }

  async parseQuery(userQuery: string): Promise<ParsedNLPQuery> {
    const systemPrompt = this.buildSystemPrompt();
    const userMessage = `Przeanalizuj zapytanie: "${userQuery}"`;

    // Try primary model if circuit is closed
    if (this.circuitBreaker.isAllowed()) {
      try {
        const response = await this.callOpenRouter(
          this.config.primaryModel,
          systemPrompt,
          userMessage
        );
        this.circuitBreaker.recordSuccess();
        return this.parseResponse(response, userQuery);
      } catch (error) {
        this.circuitBreaker.recordFailure();
        console.error('[NLPQueryService] Primary model failed:', error);
      }
    }

    // Fallback to secondary model
    try {
      console.log('[NLPQueryService] Using fallback model');
      const response = await this.callOpenRouter(
        this.config.fallbackModel,
        systemPrompt,
        userMessage
      );
      return this.parseResponse(response, userQuery);
    } catch (error) {
      console.error('[NLPQueryService] Fallback model failed:', error);
      // Return a default low-confidence query
      return this.buildDefaultQuery(userQuery);
    }
  }

  private buildSystemPrompt(): string {
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const monthNames = [
      'styczen', 'luty', 'marzec', 'kwiecien', 'maj', 'czerwiec',
      'lipiec', 'sierpien', 'wrzesien', 'pazdziernik', 'listopad', 'grudzien'
    ];
    const currentMonthName = monthNames[currentMonth - 1];

    return `Jestes parserem zapytan o wydatki. Analizujesz zapytania uzytkownika w JEZYKU POLSKIM i zwracasz ustrukturyzowany JSON.

DZISIEJSZA DATA: ${today}
BIEZACY ROK: ${currentYear}
BIEZACY MIESIAC: ${currentMonth} (${currentMonthName})

=== DOSTEPNE KATEGORIE ===
${EXPENSE_CATEGORIES.join(', ')}

=== TYPY ZAPYTAN (intent) ===
- "list": lista wydatkow (domyslne gdy nie sprecyzowano)
- "sum": suma wydatkow ("ile wydalem", "suma", "lacznie")
- "count": ile transakcji ("ile razy", "ile zakupow")
- "average": srednia ("srednia", "przecietnie", "srednio")
- "top": top N wedlug kwoty ("top 5", "5 najwiekszych")
- "comparison": porownanie (rzadko uzywane)

=== PARSOWANIE DAT ===
Polskie wyrazenia dat - ZAWSZE przelicz na konkretne daty YYYY-MM-DD:

Relatywne (type: "relative"):
- "dzisiaj", "dzis" -> start i end = ${today}
- "wczoraj" -> dzien przed ${today}
- "przedwczoraj" -> 2 dni przed ${today}
- "ostatnie 3 dni", "w ostatnich 3 dniach" -> relativeUnit: "days", relativeValue: 3
- "w tym tygodniu" -> od poniedzialku do ${today}
- "w zeszlym tygodniu" -> caly poprzedni tydzien
- "w tym miesiacu" -> od 1 dnia biezacego miesiaca
- "w zeszlym miesiacu" -> caly poprzedni miesiac
- "w tym roku" -> od 1 stycznia ${currentYear}

Absolutne (type: "absolute"):
- "w grudniu" -> start: "${currentYear}-12-01", end: "${currentYear}-12-31"
- "w styczniu" -> jezeli jestesmy przed styczniem, to ${currentYear}-01, inaczej ${currentYear + 1}-01
- "od 1 do 15 grudnia" -> start: "${currentYear}-12-01", end: "${currentYear}-12-15"
- "miedzy 5 a 10 stycznia" -> start i end z konkretnych dni
- "w grudniu 2023" -> start: "2023-12-01", end: "2023-12-31"

WAZNE: Jezeli miesiac nie ma podanego roku, uzyj ${currentYear}.

=== NEGACJE (BARDZO WAZNE!) ===
Rozpoznawaj wykluczenia i mapuj na pole "exclude":

- "bez kategorii elektronika" -> categories.exclude: ["Elektronika"]
- "bez elektroniki" -> categories.exclude: ["Elektronika"]
- "oprocz restauracji" -> categories.exclude: ["Restauracje"]
- "nie liczac transportu" -> categories.exclude: ["Transport"]
- "wykluczajac zabke" -> shops.exclude: ["Zabka"]
- "bez sklepu lidl" -> shops.exclude: ["Lidl"]

Mozna laczyc wiele wykluczeni:
- "bez elektroniki i restauracji" -> categories.exclude: ["Elektronika", "Restauracje"]

=== FILTRY KATEGORII (include) ===
- "na jedzenie", "jedzenie" -> categories.include: ["Zakupy spozywcze"]
- "w restauracjach", "restauracje" -> categories.include: ["Restauracje"]
- "na paliwo" -> categories.include: ["Paliwo"]
- "na transport" -> categories.include: ["Transport"]
- "na rozrywke" -> categories.include: ["Rozrywka"]
- "na subskrypcje" -> categories.include: ["Subskrypcje"]

=== FILTRY SKLEPOW ===
- "w biedronce", "u biedronki" -> shops.include: ["Biedronka"]
- "w lidlu" -> shops.include: ["Lidl"]
- "na orlenie" -> shops.include: ["Orlen"]

=== FILTRY KWOT ===
- "powyzej 50zl", "za wiecej niz 50" -> amountFilter.min: 50
- "ponizej 100zl", "do 100", "maksymalnie 100" -> amountFilter.max: 100
- "miedzy 20 a 50 zl" -> amountFilter.min: 20, amountFilter.max: 50
- "dokladnie 25zl" -> amountFilter.exact: 25

=== AGREGACJE ===
- "top 5 kategorii" -> aggregation.groupBy: "category", aggregation.limit: 5
- "top 10 sklepow" -> aggregation.groupBy: "shop", aggregation.limit: 10
- "pogrupuj po kategoriach" -> aggregation.groupBy: "category"
- "po sklepach" -> aggregation.groupBy: "shop"
- "po dniach" -> aggregation.groupBy: "day"
- "po miesiacach" -> aggregation.groupBy: "month"

=== PRZYKLADY PARSEOWANIA ===

Zapytanie: "ile wydalem w grudniu"
{
  "intent": "sum",
  "dateRange": {
    "type": "absolute",
    "start": "${currentYear}-12-01",
    "end": "${currentYear}-12-31",
    "description": "grudzien ${currentYear}"
  },
  "confidence": 0.95
}

Zapytanie: "suma bez elektroniki w tym miesiacu"
{
  "intent": "sum",
  "dateRange": {
    "type": "absolute",
    "start": "${currentYear}-${String(currentMonth).padStart(2, '0')}-01",
    "end": "${today}",
    "description": "biezacy miesiac"
  },
  "categories": {
    "exclude": ["Elektronika"]
  },
  "confidence": 0.9
}

Zapytanie: "top 5 kategorii od 1 do 15 grudnia"
{
  "intent": "top",
  "dateRange": {
    "type": "absolute",
    "start": "${currentYear}-12-01",
    "end": "${currentYear}-12-15",
    "description": "od 1 do 15 grudnia"
  },
  "aggregation": {
    "groupBy": "category",
    "limit": 5,
    "orderBy": "amount",
    "orderDirection": "desc"
  },
  "confidence": 0.95
}

Zapytanie: "wydatki w biedronce powyzej 50zl"
{
  "intent": "list",
  "shops": {
    "include": ["Biedronka"]
  },
  "amountFilter": {
    "min": 50
  },
  "confidence": 0.9
}

=== OUTPUT FORMAT ===
Zwroc TYLKO valid JSON (bez markdown, bez dodatkowego tekstu):
{
  "intent": "sum|list|count|average|top|comparison",
  "dateRange": {
    "type": "absolute|relative",
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "relativeUnit": "days|weeks|months|years",
    "relativeValue": number,
    "description": "opis slowny"
  },
  "categories": {
    "include": ["Kategoria1"],
    "exclude": ["Kategoria2"]
  },
  "shops": {
    "include": ["Sklep1"],
    "exclude": ["Sklep2"]
  },
  "amountFilter": {
    "min": number,
    "max": number,
    "exact": number
  },
  "aggregation": {
    "type": "sum|count|average",
    "groupBy": "category|shop|day|week|month",
    "limit": number,
    "orderBy": "amount|count|date",
    "orderDirection": "asc|desc"
  },
  "confidence": 0.0-1.0
}

WAZNE:
- Zwracaj TYLKO valid JSON
- Pomijaj puste pola (nie uzywaj null)
- Dla niejasnych zapytan uzyj niskiej confidence (< 0.5)
- Domyslny intent to "list" jezeli nie sprecyzowano
- Zawsze dodawaj "description" w dateRange`;
  }

  private async callOpenRouter(
    model: string,
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    console.log(`[NLPQueryService] Calling ${model}`);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.openRouterApiKey}`,
        'HTTP-Referer': 'https://expense-tracker.arqo.org',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const responseContent = data.choices?.[0]?.message?.content;

    if (!responseContent) {
      throw new Error('Empty response from AI');
    }

    return responseContent;
  }

  private parseResponse(content: string, originalQuery: string): ParsedNLPQuery {
    // Strip markdown code blocks
    let cleaned = content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Try to extract JSON from the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    try {
      const parsed = JSON.parse(cleaned);

      // Validate and normalize
      const result: ParsedNLPQuery = {
        intent: parsed.intent || 'list',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        originalQuery,
      };

      // Add optional fields if present
      if (parsed.dateRange) {
        result.dateRange = this.normalizeDateRange(parsed.dateRange);
      }

      if (parsed.categories?.include?.length || parsed.categories?.exclude?.length) {
        result.categories = {
          include: parsed.categories.include?.filter((c: string) =>
            EXPENSE_CATEGORIES.includes(c as any)
          ),
          exclude: parsed.categories.exclude?.filter((c: string) =>
            EXPENSE_CATEGORIES.includes(c as any)
          ),
        };
      }

      if (parsed.shops?.include?.length || parsed.shops?.exclude?.length) {
        result.shops = parsed.shops;
      }

      if (parsed.amountFilter) {
        result.amountFilter = {};
        if (typeof parsed.amountFilter.min === 'number') {
          result.amountFilter.min = parsed.amountFilter.min;
        }
        if (typeof parsed.amountFilter.max === 'number') {
          result.amountFilter.max = parsed.amountFilter.max;
        }
        if (typeof parsed.amountFilter.exact === 'number') {
          result.amountFilter.exact = parsed.amountFilter.exact;
        }
      }

      if (parsed.aggregation) {
        result.aggregation = parsed.aggregation;
      }

      console.log('[NLPQueryService] Parsed query:', JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error('[NLPQueryService] Failed to parse response:', content);
      return this.buildDefaultQuery(originalQuery);
    }
  }

  private normalizeDateRange(dateRange: any): DateRange {
    const result: DateRange = {
      type: dateRange.type || 'relative',
      description: dateRange.description || 'wybrany okres',
    };

    if (dateRange.type === 'absolute') {
      if (dateRange.start) result.start = dateRange.start;
      if (dateRange.end) result.end = dateRange.end;
    } else {
      if (dateRange.relativeUnit) result.relativeUnit = dateRange.relativeUnit;
      if (dateRange.relativeValue) result.relativeValue = dateRange.relativeValue;
      // Also copy start/end if provided for relative
      if (dateRange.start) result.start = dateRange.start;
      if (dateRange.end) result.end = dateRange.end;
    }

    return result;
  }

  private buildDefaultQuery(originalQuery: string): ParsedNLPQuery {
    // Default to current month list
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
      intent: 'list',
      dateRange: {
        type: 'absolute',
        start: firstDay.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0],
        description: 'biezacy miesiac',
      },
      confidence: 0.3,
      originalQuery,
    };
  }

  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }
}
