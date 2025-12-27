import type { InlineKeyboardMarkup } from '../types/telegram.types.ts';
import type { MatchedExpense } from '../types/receipt-matcher.types.ts';
import { CATEGORY_EMOJI, type ExpenseCategory } from '../types/expense.types.ts';

export class ReceiptMatcherService {
  // Normalize shop name for comparison
  // e.g., "LIDL Sp. z o.o. Polska 1234" → "lidl"
  normalizeShopName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s*(sp\.?\s*z\.?\s*o\.?\s*o\.?|spółka|s\.?a\.?)\s*/gi, '')
      .replace(/\s*(polska|markety?|sklepy?)\s*/gi, '')
      .replace(/\d+/g, '')
      .replace(/[^a-ząćęłńóśźż\s]/gi, '')
      .trim()
      .split(' ')[0] || '';
  }

  // Generate short session ID (8 chars from UUID)
  generateSessionId(): string {
    return crypto.randomUUID().slice(0, 8);
  }

  // Format message with receipt info and matching expenses
  formatMatchMessage(params: {
    receiptShop: string;
    receiptTotal: number;
    productCount: number;
    categoryGroups: Record<string, Array<{ name: string; price: number }>>;
    matches: MatchedExpense[];
  }): string {
    const { receiptShop, receiptTotal, productCount, categoryGroups, matches } = params;

    let text = `📷 Paragon z *${receiptShop}*\n\n`;

    // Group products by category
    for (const [category, products] of Object.entries(categoryGroups)) {
      const emoji = CATEGORY_EMOJI[category as ExpenseCategory] || '❓';
      text += `${emoji} *${category}*:\n`;
      for (const p of products) {
        text += `  - ${p.name}: ${p.price.toFixed(2)} zł\n`;
      }
      text += '\n';
    }

    text += `💰 Razem: *${receiptTotal.toFixed(2)} zł* (${productCount} ${this.pluralize(productCount, 'produkt', 'produkty', 'produktów')})\n\n`;

    // Show matching expenses
    if (matches.length === 1) {
      const match = matches[0]!;
      text += `⚠️ *Znaleziono podobny wydatek:*\n`;
      text += `• ${match.sprzedawca} - ${match.kwota.toFixed(2)} zł (${this.formatDate(match.data)})\n\n`;
      text += `Czy chcesz go zastąpić produktami z paragonu?`;
    } else {
      text += `⚠️ *Znaleziono ${matches.length} podobne wydatki:*\n`;
      matches.forEach((match, idx) => {
        text += `${this.numberEmoji(idx + 1)} ${match.sprzedawca} - ${match.kwota.toFixed(2)} zł (${this.formatDate(match.data)})\n`;
      });
      text += `\nKtóry chcesz zastąpić?`;
    }

    return text;
  }

  // Build keyboard for matching decision
  buildMatchKeyboard(params: {
    matches: MatchedExpense[];
    sessionId: string;
  }): InlineKeyboardMarkup {
    const { matches, sessionId } = params;
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];

    if (matches.length === 1) {
      // Single match - two buttons
      const match = matches[0]!;
      rows.push([
        { text: '✅ Tak, zastąp', callback_data: `rr:${match.id}:${sessionId}` },
        { text: '❌ Zachowaj oba', callback_data: `rk:${sessionId}` },
      ]);
    } else {
      // Multiple matches - numbered buttons + cancel
      const buttonRow: Array<{ text: string; callback_data: string }> = [];
      matches.forEach((match, idx) => {
        buttonRow.push({
          text: this.numberEmoji(idx + 1),
          callback_data: `rr:${match.id}:${sessionId}`,
        });
      });
      rows.push(buttonRow);
      rows.push([{ text: '❌ Żaden (zachowaj wszystkie)', callback_data: `rk:${sessionId}` }]);
    }

    return { inline_keyboard: rows };
  }

  // Helper: Polish pluralization
  private pluralize(n: number, one: string, few: string, many: string): string {
    if (n === 1) return one;
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return few;
    return many;
  }

  // Helper: Format date as DD.MM.YYYY
  private formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
  }

  // Helper: Number to emoji
  private numberEmoji(n: number): string {
    const emojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
    return emojis[n] || `${n}`;
  }
}
