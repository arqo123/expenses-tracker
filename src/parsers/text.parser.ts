export interface ParsedExpense {
  shop: string;
  amount: number;
  description?: string;
}

// Parse text in format: "shop amount" or "shop description amount"
export function parseExpenseText(text: string): ParsedExpense | null {
  const trimmed = text.trim();

  if (!trimmed) return null;

  // Try to extract amount from the end
  // Pattern: "shop 15" or "shop 15.50" or "shop 15,50" or "shop 15 gr."
  // Note: "gr" is treated as PLN (user convention, not actual grosze)
  const amountMatch = trimmed.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:zl|pln|gr\.?|zlotych|zloty)?\s*$/i);

  if (!amountMatch) {
    return null;
  }

  const amountStr = amountMatch[1]!.replace(',', '.');
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    return null;
  }

  // Everything before the amount is shop + optional description
  const beforeAmount = trimmed.slice(0, amountMatch.index).trim();

  if (!beforeAmount) {
    return null;
  }

  // Split by common separators or take first word as shop
  const parts = beforeAmount.split(/\s+/);

  if (parts.length === 1) {
    // Simple case: "zabka 15"
    return {
      shop: capitalizeFirst(parts[0]!),
      amount,
    };
  }

  // First word is shop, rest is description
  // "zabka piwo 15" -> shop: Zabka, description: piwo
  const shop = capitalizeFirst(parts[0]!);
  const description = parts.slice(1).join(' ');

  return {
    shop,
    amount,
    description,
  };
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Detect if text is a query (not an expense)
export function isQuery(text: string): boolean {
  const lower = text.toLowerCase().trim();

  const queryPatterns = [
    // Existing patterns
    /^ile\s+/,
    /^pokaz\s+/,
    /^raport/,
    /^suma\s*/,
    /^ostatnie/,
    /^lista\s+/,
    /^wydatki\s+/,
    /^statystyki/,

    // New patterns for NLP queries
    /^top\s+\d+/, // "top 5", "top 10"
    /^srednia/, // "srednia", "srednio"
    /^sredni/, // "sredni wydatek"
    /^lacznie/, // "lacznie"
    /^porownaj/, // "porownaj"

    // Negation patterns (very important!)
    /bez\s+kategorii/, // "bez kategorii elektronika"
    /bez\s+\w+/, // "bez elektroniki"
    /oprocz\s+/, // "oprocz restauracji"
    /nie\s+liczac/, // "nie liczac transportu"
    /wykluczajac/, // "wykluczajac"

    // Date range patterns
    /od\s+\d+\s+do\s+\d+/, // "od 1 do 15"
    /miedzy\s+\d+\s+a\s+\d+/, // "miedzy 5 a 10"
    /w\s+(styczni|lut|marc|kwie|maj|czerw|lip|sierp|wrzes|paz|listop|grud)/i, // months

    // Relative time patterns
    /w\s+zeszl/, // "w zeszlym miesiacu"
    /w\s+ostatni/, // "w ostatnich 3 dniach"
    /w\s+tym\s+(tygodni|miesi|rok)/i, // "w tym tygodniu/miesiacu/roku"

    // Amount filter patterns
    /powyzej\s+\d+/, // "powyzej 50zl"
    /ponizej\s+\d+/, // "ponizej 100zl"
    /wiecej\s+niz\s+\d+/, // "wiecej niz 50"
    /mniej\s+niz\s+\d+/, // "mniej niz 100"

    // Aggregation patterns
    /pogrupuj/, // "pogrupuj po kategoriach"
    /po\s+kategori/, // "po kategoriach"
    /po\s+sklep/, // "po sklepach"
  ];

  return queryPatterns.some((pattern) => pattern.test(lower));
}

// Detect if text is a correction command
export function isCorrection(text: string): boolean {
  const lower = text.toLowerCase().trim();

  const correctionPatterns = [
    /^zmien\s+(na\s+)?/,
    /^popraw\s+/,
    /^kategoria\s+/,
    /^zmiana\s+/,
  ];

  return correctionPatterns.some(pattern => pattern.test(lower));
}

// Extract category from correction command
export function extractCorrectionCategory(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // "zmien na Restauracje" -> "Restauracje"
  const match = lower.match(/^(?:zmien|popraw|kategoria)\s+(?:na\s+)?(.+)$/i);

  if (match) {
    return capitalizeFirst(match[1]!.trim());
  }

  return null;
}
