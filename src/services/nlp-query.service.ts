import { CircuitBreaker } from '../utils/circuit-breaker.ts';
import { getEnv } from '../config/env.ts';
import { EXPENSE_CATEGORIES } from '../types/expense.types.ts';
import type { ParsedNLPQuery, DateRange } from '../types/nlp-query.types.ts';
import { getPrompts, getAllCategories } from '../i18n/index.ts';

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
    const prompts = getPrompts();
    const nlp = prompts.nlp as { userMessage: string; [key: string]: unknown };
    const userMessage = nlp.userMessage.replace('{query}', userQuery);

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
    const today = new Date().toISOString().split('T')[0] ?? '';
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const prompts = getPrompts();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nlp = prompts.nlp as any;
    const sections = nlp.sections || {};
    const intents = nlp.intents || {};
    const relativeDates = nlp.relativeDates || {};
    const absoluteDates = nlp.absoluteDates || {};
    const negationExamples = nlp.negationExamples || {};
    const categoryFilterExamples = nlp.categoryFilterExamples || {};
    const shopFilterExamples = nlp.shopFilterExamples || {};
    const amountFilterExamples = nlp.amountFilterExamples || {};
    const aggregationExamples = nlp.aggregationExamples || {};
    const datePatterns = nlp.datePatterns || { months: [], weekdays: [] };
    const outputRules = nlp.outputRules || [];

    const currentMonthName = datePatterns.months[currentMonth - 1];
    const categories = getAllCategories();

    // Helper to replace placeholders
    const replacePlaceholders = (text: string | undefined): string => {
      if (!text) return '';
      return text
        .replace(/\{today\}/g, today)
        .replace(/\{year\}/g, String(currentYear))
        .replace(/\{nextYear\}/g, String(currentYear + 1));
    };

    let prompt = `${nlp.systemPrompt}\n\n`;

    // Date info
    prompt += `${sections.todayDate}: ${today}\n`;
    prompt += `${sections.currentYear}: ${currentYear}\n`;
    prompt += `${sections.currentMonth}: ${currentMonth} (${currentMonthName})\n\n`;

    // Categories
    prompt += `=== ${sections.availableCategories} ===\n`;
    prompt += `${categories.join(', ')}\n\n`;

    // Intents
    prompt += `=== ${sections.intentTypes} ===\n`;
    Object.entries(intents).forEach(([key, desc]) => {
      prompt += `- "${key}": ${desc}\n`;
    });
    prompt += '\n';

    // Date parsing
    prompt += `=== ${sections.dateParsing} ===\n`;
    prompt += `${sections.dateParsingNote}:\n\n`;

    prompt += `${datePatterns.relative || 'Relative'}:\n`;
    Object.values(relativeDates).forEach((example) => {
      prompt += `- ${replacePlaceholders(String(example))}\n`;
    });
    prompt += '\n';

    prompt += `${datePatterns.absolute || 'Absolute'}:\n`;
    Object.values(absoluteDates).forEach((example) => {
      prompt += `- ${replacePlaceholders(String(example))}\n`;
    });
    prompt += '\n';

    prompt += `${(sections.monthNote || '').replace('{year}', String(currentYear))}\n\n`;

    // Negations
    prompt += `=== ${sections.negations} ===\n`;
    prompt += `${sections.negationNote}:\n\n`;
    Object.values(negationExamples).forEach((example) => {
      prompt += `- ${example}\n`;
    });
    prompt += '\n';

    // Category filters
    prompt += `=== ${sections.categoryFilters} ===\n`;
    Object.values(categoryFilterExamples).forEach((example) => {
      prompt += `- ${example}\n`;
    });
    prompt += '\n';

    // Shop filters
    prompt += `=== ${sections.shopFilters} ===\n`;
    Object.values(shopFilterExamples).forEach((example) => {
      prompt += `- ${example}\n`;
    });
    prompt += '\n';

    // Amount filters
    prompt += `=== ${sections.amountFilters} ===\n`;
    Object.values(amountFilterExamples).forEach((example) => {
      prompt += `- ${example}\n`;
    });
    prompt += '\n';

    // Aggregations
    prompt += `=== ${sections.aggregations} ===\n`;
    Object.values(aggregationExamples).forEach((example) => {
      prompt += `- ${example}\n`;
    });
    prompt += '\n';

    // Output format (static JSON schema)
    prompt += `=== ${sections.outputFormat} ===\n`;
    prompt += `{
  "intent": "sum|list|count|average|top|comparison",
  "dateRange": {
    "type": "absolute|relative",
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "relativeUnit": "days|weeks|months|years",
    "relativeValue": number,
    "description": "string"
  },
  "categories": { "include": ["..."], "exclude": ["..."] },
  "shops": { "include": ["..."], "exclude": ["..."] },
  "amountFilter": { "min": number, "max": number, "exact": number },
  "aggregation": { "groupBy": "category|shop|day|week|month", "limit": number },
  "confidence": 0.0-1.0
}\n\n`;

    // Important rules
    prompt += `${sections.important}:\n`;
    outputRules.forEach((rule: string) => {
      prompt += `- ${rule}\n`;
    });

    return prompt;
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
    const prompts = getPrompts();
    const nlp = prompts.nlp as { defaultDescription: string; [key: string]: unknown };

    return {
      intent: 'list',
      dateRange: {
        type: 'absolute',
        start: firstDay.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0],
        description: nlp.defaultDescription,
      },
      confidence: 0.3,
      originalQuery,
    };
  }

  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }
}
