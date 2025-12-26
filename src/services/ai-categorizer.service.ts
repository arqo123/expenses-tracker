import { CircuitBreaker, type CircuitBreakerState } from '../utils/circuit-breaker.ts';
import { buildSystemPrompt } from '../config/categories.ts';
import { getEnv } from '../config/env.ts';
import type {
  CategorizationResult,
  BatchCategorizationItem,
  VisionResult,
  ExpenseCategory,
} from '../types/expense.types.ts';

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
INPUT: tekst w formacie "sklep kwota" lub "sklep opis kwota"
Przyklady: "zabka piwo 15", "uber 25", "lidl zakupy 150"

OUTPUT (TYLKO JSON):
{"shop": "Zabka", "category": "Zakupy spozywcze", "amount": 15.00, "confidence": 0.95}`;
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
Wyciagnij:
- Nazwe sklepu/restauracji (source)
- Produkty z cenami
- Typ obrazu: "receipt" lub "ecommerce"

OUTPUT (TYLKO JSON):
{
  "image_type": "receipt",
  "source": "Biedronka",
  "products": [
    {"name": "Chleb", "price": 3.50},
    {"name": "Maslo", "price": 7.99}
  ],
  "total": 11.49
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

      // For vision mode, add categories to products
      if (mode === 'vision' && parsed.products) {
        // Products already have categories from AI, but ensure they're valid
        parsed.products = parsed.products.map((p: { name: string; price: number; category?: ExpenseCategory }) => ({
          ...p,
          category: p.category || 'Inne',
          confidence: 0.8,
        }));
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
