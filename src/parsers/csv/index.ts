export interface ParsedTransaction {
  date: string;
  merchant: string;
  amount: number;
  description: string;
  rawLine: string;
}

export interface CSVParseResult {
  bank: string;
  transactions: ParsedTransaction[];
  errors: string[];
}

// Detect bank format from CSV content
export function detectBankFormat(content: string): string {
  const firstLine = content.split('\n')[0]?.toLowerCase() || '';

  if (firstLine.includes('numer rachunku/karty') && firstLine.includes('data transakcji')) {
    return 'millennium';
  }
  if (firstLine.includes('#data operacji') || firstLine.includes('data operacji;')) {
    return 'mbank';
  }
  if (firstLine.includes('completed date') && firstLine.includes('description')) {
    return 'revolut';
  }
  // Revolut Polish format
  if (firstLine.includes('rodzaj') && firstLine.includes('data zrealizowania') && firstLine.includes('kwota')) {
    return 'revolut-pl';
  }
  if (firstLine.includes('data waluty') && firstLine.includes('nr rachunku')) {
    return 'ing';
  }
  // ZEN format has header section then "Transactions:" line
  if (content.includes('Transactions:') &&
      content.includes('Date,Transaction type,Description,Settlement amount')) {
    return 'zen';
  }

  return 'unknown';
}

// Parse CSV based on detected format
export function parseCSV(content: string): CSVParseResult {
  const bank = detectBankFormat(content);

  switch (bank) {
    case 'millennium':
      return parseMillennium(content);
    case 'mbank':
      return parseMBank(content);
    case 'revolut':
      return parseRevolut(content);
    case 'revolut-pl':
      return parseRevolutPL(content);
    case 'zen':
      return parseZen(content);
    default:
      return parseGeneric(content);
  }
}

// Millennium Bank format
function parseMillennium(content: string): CSVParseResult {
  const lines = content.split('\n');
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    try {
      // Parse CSV with quotes: "col1","col2",...
      const cols = parseCSVLine(line);

      // Millennium format:
      // 0: Numer rachunku/karty
      // 1: Data transakcji
      // 2: Data rozliczenia
      // 3: Rodzaj transakcji
      // 4: Na konto/Z konta
      // 5: Odbiorca/Zleceniodawca
      // 6: Opis
      // 7: Obciazenia (negative)
      // 8: Uznania (positive)
      // 9: Saldo
      // 10: Waluta

      const dateStr = cols[1] || '';
      const description = cols[6] || '';
      const debit = parseAmount(cols[7] || '');
      const credit = parseAmount(cols[8] || '');
      const amount = debit !== 0 ? Math.abs(debit) : credit;

      if (!dateStr || amount === 0) continue;

      // Extract merchant from description
      const merchant = extractMerchant(description);

      transactions.push({
        date: formatDate(dateStr),
        merchant,
        amount,
        description,
        rawLine: line,
      });
    } catch (e) {
      errors.push(`Line ${i + 1}: ${e}`);
    }
  }

  return { bank: 'millennium', transactions, errors };
}

// mBank format
function parseMBank(content: string): CSVParseResult {
  const lines = content.split('\n');
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Skip header lines (mBank has multiple header lines)
  let dataStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.startsWith('#Data operacji') || lines[i]?.toLowerCase().includes('data operacji;')) {
      dataStart = i + 1;
      break;
    }
  }

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    try {
      // mBank uses semicolon separator
      const cols = line.split(';').map(c => c.replace(/^"|"$/g, '').trim());

      // mBank format:
      // 0: Data operacji
      // 1: Data ksiegowania
      // 2: Opis operacji
      // 3: Tytul
      // 4: Nadawca/Odbiorca
      // 5: Numer konta
      // 6: Kwota
      // 7: Saldo po operacji

      const dateStr = cols[0] || '';
      const description = cols[2] || '';
      const title = cols[3] || '';
      const recipient = cols[4] || '';
      const amountStr = cols[6] || '';

      const amount = Math.abs(parseAmount(amountStr));
      if (!dateStr || amount === 0) continue;

      // Use recipient or extract from description
      const merchant = recipient || extractMerchant(description + ' ' + title);

      transactions.push({
        date: formatDate(dateStr),
        merchant,
        amount,
        description: `${description} ${title}`.trim(),
        rawLine: line,
      });
    } catch (e) {
      errors.push(`Line ${i + 1}: ${e}`);
    }
  }

  return { bank: 'mbank', transactions, errors };
}

// Revolut format
function parseRevolut(content: string): CSVParseResult {
  const lines = content.split('\n');
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    try {
      const cols = parseCSVLine(line);

      // Revolut format:
      // 0: Completed Date
      // 1: Description
      // 2: Amount
      // 3: Currency
      // 4: etc...

      const dateStr = cols[0] || '';
      const description = cols[1] || '';
      const amountStr = cols[2] || '';

      const amount = Math.abs(parseAmount(amountStr));
      if (!dateStr || amount === 0) continue;

      const merchant = extractMerchant(description);

      transactions.push({
        date: formatDate(dateStr),
        merchant,
        amount,
        description,
        rawLine: line,
      });
    } catch (e) {
      errors.push(`Line ${i + 1}: ${e}`);
    }
  }

  return { bank: 'revolut', transactions, errors };
}

// Revolut Polish format
function parseRevolutPL(content: string): CSVParseResult {
  const lines = content.split('\n');
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Allowed transaction types
  const allowedTypes = ['płatność kartą', 'bankomat', 'opłata'];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    try {
      const cols = parseCSVLine(line);

      // Revolut PL format:
      // 0: Rodzaj (Type)
      // 1: Produkt (Product)
      // 2: Data rozpoczęcia (Start date)
      // 3: Data zrealizowania (Completed date)
      // 4: Opis (Description)
      // 5: Kwota (Amount)
      // 6: Opłata (Fee)
      // 7: Waluta (Currency)
      // 8: State
      // 9: Saldo (Balance)

      const transactionType = (cols[0] || '').toLowerCase();
      const completedDate = cols[3] || '';
      const description = cols[4] || '';
      const amountStr = cols[5] || '';
      const state = cols[8] || '';

      // Skip if not completed
      if (state.toUpperCase() !== 'ZAKOŃCZONO') continue;

      // Skip if not an allowed transaction type
      if (!allowedTypes.includes(transactionType)) continue;

      const amount = Math.abs(parseAmount(amountStr));
      if (amount === 0) continue;

      // Extract date (format: YYYY-MM-DD HH:MM:SS -> YYYY-MM-DD)
      const dateStr = completedDate.split(' ')[0] || '';
      if (!dateStr) continue;

      const merchant = extractMerchant(description);

      transactions.push({
        date: dateStr,
        merchant,
        amount,
        description,
        rawLine: line,
      });
    } catch (e) {
      errors.push(`Line ${i + 1}: ${e}`);
    }
  }

  return { bank: 'revolut-pl', transactions, errors };
}

// ZEN Bank format
function parseZen(content: string): CSVParseResult {
  const lines = content.split('\n');
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Find "Transactions:" section and skip to data
  let dataStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim() === 'Transactions:') {
      // Next line is header, data starts after that
      dataStart = i + 2;
      break;
    }
  }

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    // Stop at footer
    if (line.startsWith('This is a computer-generated')) break;
    if (line.startsWith('"ZEN.COM')) break;

    try {
      const cols = parseCSVLine(line);

      // ZEN format:
      // 0: Date (e.g., "1 Nov 2025")
      // 1: Transaction type
      // 2: Description
      // 3: Settlement amount
      // 4: Settlement currency
      // ...

      const dateStr = cols[0] || '';
      const transactionType = cols[1] || '';
      const description = cols[2] || '';
      const amountStr = cols[3] || '';

      // Only process "Card payment" transactions
      if (transactionType !== 'Card payment') continue;

      const amount = parseAmount(amountStr);
      // Only negative amounts (expenses)
      if (amount >= 0) continue;

      if (!dateStr) continue;

      // Extract merchant from description (format: "Shop name              POL,POL CARD: ...")
      const merchant = extractZenMerchant(description);

      transactions.push({
        date: formatZenDate(dateStr),
        merchant,
        amount: Math.abs(amount),
        description,
        rawLine: line,
      });
    } catch (e) {
      errors.push(`Line ${i + 1}: ${e}`);
    }
  }

  return { bank: 'zen', transactions, errors };
}

// Helper: Extract merchant from ZEN description
function extractZenMerchant(description: string): string {
  // Format: "Shop Name              POL,POL CARD: MASTERCARD *5382"
  // Take everything before the country code pattern
  let merchant = description
    .replace(/\s{2,}[A-Z]{3},[A-Z]{3}\s+CARD:.*$/i, '')  // Remove "   POL,POL CARD: ..."
    .replace(/\s{2,}[A-Z]{3}$/i, '')  // Remove trailing country code
    .trim();

  // Clean up common patterns
  merchant = merchant
    .replace(/SP\.?\s*Z\.?\s*O\.?\s*O\.?/gi, '')
    .replace(/\*\d+$/, '')  // Remove card number suffix
    .trim();

  // Capitalize properly
  if (merchant.length > 0) {
    merchant = merchant.charAt(0).toUpperCase() + merchant.slice(1).toLowerCase();
  }

  return merchant || 'Unknown';
}

// Helper: Format ZEN date (e.g., "1 Nov 2025" -> "2025-11-01")
function formatZenDate(dateStr: string): string {
  const months: Record<string, string> = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
  };

  const match = dateStr.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (match) {
    const day = match[1]!.padStart(2, '0');
    const month = months[match[2]!.toLowerCase()] || '01';
    const year = match[3];
    return `${year}-${month}-${day}`;
  }

  return dateStr;
}

// Generic CSV parser (best effort)
function parseGeneric(content: string): CSVParseResult {
  const lines = content.split('\n');
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Try to detect separator
  const firstDataLine = lines[1] || '';
  const separator = firstDataLine.includes(';') ? ';' : ',';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    try {
      const cols = line.split(separator).map(c => c.replace(/^"|"$/g, '').trim());

      // Try to find date and amount columns
      let dateStr = '';
      let amount = 0;
      let description = '';

      for (const col of cols) {
        // Date pattern: YYYY-MM-DD or DD.MM.YYYY
        if (/^\d{4}-\d{2}-\d{2}$/.test(col) || /^\d{2}\.\d{2}\.\d{4}$/.test(col)) {
          dateStr = col;
        }
        // Amount pattern: negative or positive number
        const parsed = parseAmount(col);
        if (parsed !== 0) {
          amount = Math.abs(parsed);
        }
        // Description: longest text column
        if (col.length > description.length && !/^[\d.,\-\s]+$/.test(col)) {
          description = col;
        }
      }

      if (!dateStr || amount === 0) continue;

      transactions.push({
        date: formatDate(dateStr),
        merchant: extractMerchant(description),
        amount,
        description,
        rawLine: line,
      });
    } catch (e) {
      errors.push(`Line ${i + 1}: ${e}`);
    }
  }

  return { bank: 'unknown', transactions, errors };
}

// Helper: Parse CSV line respecting quotes
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// Helper: Parse amount string to number
function parseAmount(str: string): number {
  if (!str) return 0;

  // Remove currency symbols and whitespace
  let cleaned = str.replace(/[PLN\s]/gi, '').trim();

  // Handle Polish number format: 1 234,56 -> 1234.56
  cleaned = cleaned.replace(/\s/g, '');
  cleaned = cleaned.replace(',', '.');

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Helper: Extract merchant name from description
function extractMerchant(description: string): string {
  // Remove common suffixes
  let merchant = description
    .replace(/SP\.?\s*Z\s*O\.?O\.?/gi, '')
    .replace(/SPOLKA\s*(AKCYJNA|Z\.?O\.?O\.?)?/gi, '')
    .replace(/S\.?A\.?$/gi, '')
    .replace(/,\s*\d+$/g, '')  // Remove trailing numbers
    .replace(/,\s*[A-Z]{2,3}$/g, '')  // Remove country codes
    .trim();

  // Take first meaningful part
  const parts = merchant.split(/[,;]/);
  merchant = parts[0]?.trim() || merchant;

  // Capitalize first letter
  if (merchant.length > 0) {
    merchant = merchant.charAt(0).toUpperCase() + merchant.slice(1).toLowerCase();
  }

  return merchant || 'Unknown';
}

// Helper: Format date to YYYY-MM-DD
function formatDate(dateStr: string): string {
  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Handle DD.MM.YYYY
  const match = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  // Handle DD/MM/YYYY
  const match2 = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match2) {
    return `${match2[3]}-${match2[2]}-${match2[1]}`;
  }

  return dateStr;
}
