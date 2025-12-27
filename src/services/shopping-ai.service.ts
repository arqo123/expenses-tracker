import { getEnv } from '../config/env.ts';
import type { MessageIntent, ShopCategory } from '../types/shopping.types.ts';
import { PRODUCT_CATEGORY_MAP, SHOP_CATEGORIES } from '../types/shopping.types.ts';
import { getPrompts } from '../i18n/index.ts';

interface ShoppingAIConfig {
  model: string;
  openRouterApiKey: string;
}

export class ShoppingAIService {
  private config: ShoppingAIConfig;

  constructor(config: Partial<ShoppingAIConfig> = {}) {
    const env = getEnv();
    this.config = {
      model: env.AI_PRIMARY_MODEL || 'anthropic/claude-3-haiku',
      openRouterApiKey: env.OPENROUTER_API_KEY,
      ...config,
    };
  }

  // Detect user intent from message text
  async detectIntent(text: string): Promise<MessageIntent> {
    const normalized = text.toLowerCase().trim();

    // 1. Price → expense
    if (this.hasPrice(normalized)) {
      return { type: 'expense', text };
    }

    // 2. Explicit shopping list keywords
    if (this.hasShoppingListKeywords(normalized)) {
      const items = this.parsePolishShoppingItems(text);
      if (items.length > 0) {
        return { type: 'add_to_list', items };
      }
    }

    // 3. Polish quantity patterns (razy, główki, kg, g)
    if (this.hasPolishQuantityPattern(normalized)) {
      const items = this.parsePolishShoppingItems(text);
      if (items.length > 0) {
        return { type: 'add_to_list', items };
      }
    }

    // 4. AUTO-DETECT: Product list without price (no keywords required)
    if (this.looksLikeProductList(normalized)) {
      console.log('[ShoppingAI] Auto-detected product list, using AI parser');
      try {
        return await this.parseShoppingListWithAI(text);
      } catch (error) {
        console.error('[ShoppingAI] AI parsing failed, trying heuristics:', error);
        const items = this.parsePolishShoppingItems(text);
        if (items.length > 0) {
          return { type: 'add_to_list', items };
        }
      }
    }

    // 5. Query patterns
    if (this.hasQueryKeywords(normalized)) {
      return { type: 'query', text };
    }

    // 6. AI fallback for ambiguous cases
    try {
      return await this.detectIntentWithAI(text);
    } catch (error) {
      console.error('[ShoppingAI] AI intent detection failed:', error);
      return { type: 'unknown', text };
    }
  }

  // Parse shopping items from text
  parseShoppingItems(text: string): Array<{ name: string; quantity: number }> {
    const items: Array<{ name: string; quantity: number }> = [];

    // Remove common prefixes
    let cleaned = text
      .replace(/^(kup(ic|ić)?|potrzebuj[eę]?|dodaj|lista zakup[oó]w?|do listy)\s*/i, '')
      .trim();

    // Split by common separators
    const parts = cleaned.split(/[,;\n]+|(\s+i\s+)|(\s+oraz\s+)/i).filter(Boolean);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed || /^(i|oraz)$/i.test(trimmed)) continue;

      const parsed = this.parseItemWithQuantity(trimmed);
      if (parsed.name) {
        items.push(parsed);
      }
    }

    return items;
  }

  // Parse single item with optional quantity (e.g., "mleko x3" or "3x mleko")
  private parseItemWithQuantity(text: string): { name: string; quantity: number } {
    let quantity = 1;
    let name = text.trim();

    // Pattern: "3x mleko" or "3 x mleko"
    const prefixMatch = name.match(/^(\d+)\s*x\s+(.+)/i);
    if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
      quantity = parseInt(prefixMatch[1], 10);
      name = prefixMatch[2].trim();
    }

    // Pattern: "mleko x3" or "mleko x 3"
    const suffixMatch = name.match(/(.+)\s*x\s*(\d+)$/i);
    if (suffixMatch && suffixMatch[1] && suffixMatch[2]) {
      name = suffixMatch[1].trim();
      quantity = parseInt(suffixMatch[2], 10);
    }

    // Pattern: "mleko 3szt" or "mleko 3 szt"
    const sztMatch = name.match(/(.+)\s+(\d+)\s*(szt|sztuk|op|opak)?\.?$/i);
    if (sztMatch && sztMatch[1] && sztMatch[2]) {
      name = sztMatch[1].trim();
      quantity = parseInt(sztMatch[2], 10);
    }

    return { name, quantity: Math.max(1, quantity) };
  }

  // Parse Polish shopping items with complex patterns (for voice messages)
  parsePolishShoppingItems(text: string): Array<{ name: string; quantity: number }> {
    const items: Array<{ name: string; quantity: number }> = [];

    // Remove common prefixes
    let cleaned = text
      .replace(/^(kup(ic|ić)?|potrzebuj[eę]?|dodaj|lista zakup[oó]w?|do listy)\s*/i, '')
      .trim();

    // Replace periods with commas for consistent splitting
    cleaned = cleaned.replace(/\.\s+/g, ', ');

    // Split by common separators
    const parts = cleaned.split(/[,;]+|\s+i\s+|\s+oraz\s+/i).filter(Boolean);

    let lastItemIndex = -1;

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed || /^(i|oraz)$/i.test(trimmed)) continue;

      const parsed = this.parsePolishItem(trimmed);

      // Check if this is just a mass unit (continuation of previous item)
      const lastItem = lastItemIndex >= 0 ? items[lastItemIndex] : undefined;
      if (parsed.isMassOnly && lastItem) {
        // Append mass to previous item name
        lastItem.name = `${lastItem.name} ${parsed.name}`;
      } else if (parsed.name) {
        items.push({ name: parsed.name, quantity: parsed.quantity });
        lastItemIndex = items.length - 1;
      }
    }

    return items;
  }

  // Parse single Polish item with quantity
  private parsePolishItem(text: string): { name: string; quantity: number; isMassOnly?: boolean } {
    let name = text.trim();
    let quantity = 1;

    // PATTERN 1: "mleko razy 2" or "razy 2 mleko" (Polish "razy" = times)
    const razyMatch =
      name.match(/(.+?)\s+razy\s+(\d+)/i) || name.match(/(\d+)\s+razy\s+(.+)/i);
    if (razyMatch && razyMatch[1] && razyMatch[2]) {
      if (/^\d+$/.test(razyMatch[1])) {
        quantity = parseInt(razyMatch[1], 10);
        name = razyMatch[2];
      } else {
        quantity = parseInt(razyMatch[2], 10);
        name = razyMatch[1];
      }
      return { name: this.cleanProductName(name), quantity };
    }

    // PATTERN 2: "kawa 1 kilogram ziernista" or "ser 300g" (product first, then mass)
    const massPatternProductFirst = name.match(
      /^([a-ząćęłńóśźż\s]+?)\s+(\d+)\s*(g|gram|gramow|gramów|kg|kilo|kilogram|kilogramow|kilogramów)(\s+[a-ząćęłńóśźż]+)?$/i
    );
    if (
      massPatternProductFirst &&
      massPatternProductFirst[1] &&
      massPatternProductFirst[2] &&
      massPatternProductFirst[3]
    ) {
      const product = massPatternProductFirst[1].trim();
      const amount = massPatternProductFirst[2];
      const unit = this.normalizeUnit(massPatternProductFirst[3]);
      const suffix = massPatternProductFirst[4]?.trim() || '';
      const fullName = suffix
        ? `${this.cleanProductName(product)} ${suffix} ${amount}${unit}`
        : `${this.cleanProductName(product)} ${amount}${unit}`;
      return { name: fullName, quantity: 1 };
    }

    // PATTERN 2b: "300 gramów sera" (mass first, then product in genitive)
    const massPatternMassFirst = name.match(
      /^(\d+)\s*(g|gram|gramow|gramów|kg|kilo|kilogram|kilogramow|kilogramów)\s+(.+)$/i
    );
    if (massPatternMassFirst && massPatternMassFirst[1] && massPatternMassFirst[2] && massPatternMassFirst[3]) {
      const amount = massPatternMassFirst[1];
      const unit = this.normalizeUnit(massPatternMassFirst[2]);
      const product = massPatternMassFirst[3].trim();
      return {
        name: `${this.cleanProductName(this.genitiveToNominative(product))} ${amount}${unit}`,
        quantity: 1,
      };
    }

    // PATTERN 2c: Just mass unit alone (e.g., "300 gramów" as continuation)
    const massOnly = name.match(
      /^(\d+)\s*(g|gram|gramow|gramów|kg|kilo|kilogram|kilogramow|kilogramów)$/i
    );
    if (massOnly && massOnly[1] && massOnly[2]) {
      const amount = massOnly[1];
      const unit = this.normalizeUnit(massOnly[2]);
      return { name: `${amount}${unit}`, quantity: 1, isMassOnly: true };
    }

    // PATTERN 3: "2 główki cebuli" or "cebula 2 główki" → qty=2
    const containerPatternPrefix = name.match(
      /(\d+)\s*(glowk|główk|karton|paczk|butel|sztuk|szt)\w*\s+(.+)/i
    );
    if (containerPatternPrefix && containerPatternPrefix[1] && containerPatternPrefix[3]) {
      quantity = parseInt(containerPatternPrefix[1], 10);
      const product = containerPatternPrefix[3].trim();
      return {
        name: this.cleanProductName(this.genitiveToNominative(product)),
        quantity,
      };
    }

    const containerPatternSuffix = name.match(
      /(.+?)\s+(\d+)\s*(glowk|główk|karton|paczk|butel|sztuk|szt)/i
    );
    if (containerPatternSuffix && containerPatternSuffix[1] && containerPatternSuffix[2]) {
      const product = containerPatternSuffix[1].trim();
      quantity = parseInt(containerPatternSuffix[2], 10);
      return { name: this.cleanProductName(product), quantity };
    }

    // Fallback to existing parser
    const fallback = this.parseItemWithQuantity(text);
    return { name: fallback.name, quantity: fallback.quantity };
  }

  // Normalize unit to short form
  private normalizeUnit(unit: string): string {
    const u = unit.toLowerCase();
    if (/^(g|gram|gramy|gramow|gramów)$/i.test(u)) return 'g';
    if (/^(kg|kilo|kilogram|kilogramy|kilogramow|kilogramów)$/i.test(u)) return 'kg';
    if (/^(l|litr|litry|litrow|litrów)$/i.test(u)) return 'l';
    if (/^(ml|mililitr|mililitry|mililitrow|mililitrów)$/i.test(u)) return 'ml';
    return u;
  }

  // Convert Polish genitive to nominative
  private genitiveToNominative(word: string): string {
    const map: Record<string, string> = {
      cebuli: 'cebula',
      mleka: 'mleko',
      sera: 'ser',
      kawy: 'kawa',
      maki: 'mąka',
      mąki: 'mąka',
      wody: 'woda',
      masla: 'masło',
      masła: 'masło',
      chleba: 'chleb',
      mięsa: 'mięso',
      miesa: 'mięso',
      ryzu: 'ryż',
      ryżu: 'ryż',
      jajek: 'jajka',
    };
    return map[word.toLowerCase()] || word;
  }

  // Clean product name
  private cleanProductName(name: string): string {
    return name
      .toLowerCase()
      .replace(/^\s*(i|oraz)\s+/i, '') // Remove leading conjunctions
      .replace(/\s+(i|oraz)\s*$/i, '') // Remove trailing conjunctions
      .trim();
  }

  // Categorize product into shop category
  async categorizeProduct(name: string): Promise<ShopCategory> {
    const normalized = this.normalizeForMatching(name);

    // Check known patterns first
    for (const [pattern, category] of Object.entries(PRODUCT_CATEGORY_MAP)) {
      if (normalized.includes(pattern)) {
        return category;
      }
    }

    // Try AI categorization
    try {
      return await this.categorizeWithAI(name);
    } catch (error) {
      console.error('[ShoppingAI] AI categorization failed:', error);
      return 'Inne';
    }
  }

  // Check if text has price patterns
  private hasPrice(text: string): boolean {
    // Patterns: 50zł, 50 zł, 50zl, 50.99, 15,50
    return /\d+([.,]\d{1,2})?\s*(zl|zł|pln|gr)|\d+[.,]\d{2}/.test(text);
  }

  // Check for shopping list keywords (language-aware)
  private hasShoppingListKeywords(text: string): boolean {
    const prompts = getPrompts();
    const shoppingPrompts = prompts.shopping as Record<string, unknown>;
    const keywords = shoppingPrompts.keywords as Record<string, string[]> | undefined;

    if (keywords) {
      // Flatten all keyword arrays from i18n
      const allKeywords = [
        ...(keywords.buy || []),
        ...(keywords.need || []),
        ...(keywords.add || []),
        ...(keywords.list || []),
        ...(keywords.mustBuy || []),
        ...(keywords.useful || []),
        ...(keywords.missing || []),
      ];
      return allKeywords.some((kw) => text.includes(kw.toLowerCase()));
    }

    // Fallback to hardcoded Polish keywords
    const fallbackKeywords = [
      'kup',
      'kupic',
      'kupić',
      'potrzebuje',
      'potrzebuję',
      'dodaj',
      'lista',
      'zakupy',
      'do kupienia',
      'trzeba kupic',
      'trzeba kupić',
      'przyda sie',
      'przyda się',
      'brakuje',
    ];
    return fallbackKeywords.some((kw) => text.includes(kw));
  }

  // Check for Polish quantity patterns (enhanced for voice)
  private hasPolishQuantityPattern(text: string): boolean {
    return [
      /\d+\s*x\s+\w/i, // "3x mleko"
      /\w+\s*x\s*\d+/i, // "mleko x3"
      /\d+\s*szt/i, // "3szt"
      /\brazy\s+\d+/i, // "razy 2"
      /\d+\s+razy\b/i, // "2 razy"
      /\d+\s*(g|gram|gramow|gramów|kg|kilo|kilogram|kilogramow|kilogramów)\b/i, // "300g", "1kg"
      /\d+\s*(glowk|główk|karton|paczk|butel|sztuk)/i, // "2 główki"
    ].some((p) => p.test(text));
  }

  // Auto-detect shopping list: multiple products without prices (language-aware)
  private looksLikeProductList(text: string): boolean {
    // Must NOT have price
    if (this.hasPrice(text)) return false;

    // Multiple items (commas, periods as separators)
    const parts = text.split(/[,.;]+/).filter((p) => p.trim().length > 2);
    if (parts.length < 2) return false;

    // Get grocery words from i18n
    const prompts = getPrompts();
    const shoppingPrompts = prompts.shopping as Record<string, unknown>;
    const groceryWordsList = shoppingPrompts.groceryWords as string[] | undefined;

    if (groceryWordsList && groceryWordsList.length > 0) {
      const pattern = new RegExp(`\\b(${groceryWordsList.join('|')})\\b`, 'i');
      return pattern.test(text);
    }

    // Fallback to hardcoded Polish grocery words
    const fallbackGroceryWords =
      /\b(mleko|chleb|ser|maslo|masło|jajka|kawa|herbata|mieso|mięso|kurczak|cebula|ziemniak|makaron|ryż|ryz|jogurt|smietana|śmietana|woda|sok|owoce|warzywa|banany|jabłka|jablka|pomidory|ogorki|ogórki)\b/i;
    return fallbackGroceryWords.test(text);
  }

  // Check for query keywords (language-aware)
  private hasQueryKeywords(text: string): boolean {
    const prompts = getPrompts();
    const shoppingPrompts = prompts.shopping as Record<string, unknown>;
    const keywords = shoppingPrompts.keywords as Record<string, string[]> | undefined;

    if (keywords && keywords.query) {
      return keywords.query.some((kw) => text.includes(kw.toLowerCase()));
    }

    // Fallback to hardcoded Polish keywords
    const fallbackKeywords = [
      'ile',
      'pokaz',
      'pokaż',
      'statystyki',
      'wydatki',
      'raport',
      'wydalem',
      'wydałem',
      'ostatnie',
      'top',
      'porownaj',
      'porównaj',
    ];
    return fallbackKeywords.some((kw) => text.includes(kw));
  }

  // Normalize text for matching
  private normalizeForMatching(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  }

  // Build i18n-aware shopping list parsing prompt
  private buildListParsingPrompt(): string {
    const prompts = getPrompts();
    const shopping = prompts.shopping as Record<string, unknown>;
    const parsingRules = shopping.parsingRules as Record<string, string> | undefined;
    const voicePatterns = shopping.voicePatterns as Record<string, string> | undefined;
    const parsingExamples = shopping.parsingExamples as { input?: string; output?: string } | undefined;

    let prompt = `${shopping.listParsing || 'Parse shopping list from voice message. Return ONLY JSON.'}\n\n`;

    if (parsingRules) {
      prompt += 'PARSING RULES:\n';
      prompt += `1. ${parsingRules.massInName || 'MASS (grams, kg) -> include in product name'}\n`;
      prompt += `2. ${parsingRules.quantityInQty || 'QUANTITY (times, pieces) -> increase quantity'}\n`;
      prompt += `3. ${parsingRules.genitiveToNominative || 'Keep product name in base form'}\n`;
      prompt += `4. ${parsingRules.splitByCommas || 'Split by commas and periods'}\n\n`;
    }

    if (voicePatterns) {
      prompt += 'VOICE PATTERNS:\n';
      Object.values(voicePatterns).forEach((pattern) => {
        prompt += `- ${pattern}\n`;
      });
      prompt += '\n';
    }

    if (parsingExamples && parsingExamples.input && parsingExamples.output) {
      prompt += `EXAMPLE:\nInput: "${parsingExamples.input}"\nOutput: {"items": ${parsingExamples.output}}\n`;
    }

    return prompt;
  }

  // Use AI specifically for parsing shopping lists (voice messages) - language-aware
  private async parseShoppingListWithAI(text: string): Promise<MessageIntent> {
    const systemPrompt = this.buildListParsingPrompt();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://expense-tracker.local',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from AI');
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (Array.isArray(parsed.items) && parsed.items.length > 0) {
      return {
        type: 'add_to_list',
        items: parsed.items.map((item: { name: string; quantity?: number }) => ({
          name: item.name,
          quantity: item.quantity || 1,
        })),
      };
    }

    throw new Error('Invalid AI response format');
  }

  // Build i18n-aware intent detection prompt
  private buildIntentDetectionPrompt(): string {
    const prompts = getPrompts();
    const shopping = prompts.shopping as Record<string, unknown>;
    const intentTypes = shopping.intentTypes as Record<string, string> | undefined;
    const intentRules = shopping.intentRules as Record<string, string> | undefined;
    const voicePatterns = shopping.voicePatterns as Record<string, string> | undefined;
    const intentExamples = shopping.intentExamples as Record<string, string> | undefined;

    let prompt = `${shopping.intentDetection || 'Recognize user intent. Reply ONLY with JSON without additional text.'}\n\n`;

    if (intentTypes) {
      prompt += 'INTENTS:\n';
      Object.values(intentTypes).forEach((desc, idx) => {
        prompt += `${idx + 1}. ${desc}\n`;
      });
      prompt += '\n';
    }

    if (intentRules) {
      prompt += 'RULES:\n';
      Object.values(intentRules).forEach((rule) => {
        prompt += `- ${rule}\n`;
      });
      prompt += '\n';
    }

    if (voicePatterns) {
      prompt += 'VOICE PATTERNS:\n';
      Object.values(voicePatterns).forEach((pattern) => {
        prompt += `- ${pattern}\n`;
      });
      prompt += '\n';
    }

    if (intentExamples) {
      prompt += 'EXAMPLES:\n';
      Object.values(intentExamples).forEach((example) => {
        prompt += `${example}\n`;
      });
    }

    return prompt;
  }

  // Use AI to detect intent when heuristics fail - language-aware
  private async detectIntentWithAI(text: string): Promise<MessageIntent> {
    const systemPrompt = this.buildIntentDetectionPrompt();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://expense-tracker.local',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from AI');
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.intent === 'add_to_list') {
      return {
        type: 'add_to_list',
        items: parsed.items || this.parseShoppingItems(text),
      };
    } else if (parsed.intent === 'expense') {
      return { type: 'expense', text };
    } else if (parsed.intent === 'query') {
      return { type: 'query', text };
    }

    return { type: 'unknown', text };
  }

  // Use AI to categorize product into shop category
  private async categorizeWithAI(productName: string): Promise<ShopCategory> {
    const categories = SHOP_CATEGORIES.join(', ');
    const prompts = getPrompts();
    const shopping = prompts.shopping as Record<string, string>;

    const systemPrompt = `${shopping.categorization}

KATEGORIE: ${categories}

${shopping.categoryRules}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://expense-tracker.local',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: productName },
        ],
        temperature: 0.1,
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      return 'Inne';
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();

    if (content && SHOP_CATEGORIES.includes(content as ShopCategory)) {
      return content as ShopCategory;
    }

    return 'Inne';
  }
}
