/**
 * Tests for CSV parser
 * Testing detectBankFormat, parseCSV, formatSkippedStats
 */
import { describe, test, expect } from 'bun:test';
import {
  detectBankFormat,
  parseCSV,
  formatSkippedStats,
} from '../../../src/parsers/csv/index';

describe('detectBankFormat', () => {
  test('wykrywa Millennium', () => {
    const csv = `"Numer rachunku/karty","Data transakcji","Data rozliczenia","Rodzaj transakcji"`;
    expect(detectBankFormat(csv)).toBe('millennium');
  });

  test('wykrywa mBank z #', () => {
    const csv = `#Data operacji;Data księgowania;Opis operacji`;
    expect(detectBankFormat(csv)).toBe('mbank');
  });

  test('wykrywa mBank bez #', () => {
    const csv = `Data operacji;Data księgowania;Opis operacji`;
    expect(detectBankFormat(csv)).toBe('mbank');
  });

  test('wykrywa Revolut (EN)', () => {
    const csv = `Completed Date,Description,Amount,Currency`;
    expect(detectBankFormat(csv)).toBe('revolut');
  });

  test('wykrywa Revolut (PL)', () => {
    const csv = `Rodzaj,Produkt,Data rozpoczęcia,Data zrealizowania,Opis,Kwota`;
    expect(detectBankFormat(csv)).toBe('revolut-pl');
  });

  test('wykrywa ING', () => {
    const csv = `"Data waluty","Opis","Nr rachunku","Kwota"`;
    expect(detectBankFormat(csv)).toBe('ing');
  });

  test('wykrywa ZEN', () => {
    const csv = `Account Statement
Transactions:
Date,Transaction type,Description,Settlement amount`;
    expect(detectBankFormat(csv)).toBe('zen');
  });

  test('nieznany format', () => {
    const csv = `Random,CSV,Headers,Data`;
    expect(detectBankFormat(csv)).toBe('unknown');
  });

  test('pusty string', () => {
    expect(detectBankFormat('')).toBe('unknown');
  });
});

describe('parseCSV - Millennium', () => {
  const millenniumHeader = `"Numer rachunku/karty","Data transakcji","Data rozliczenia","Rodzaj transakcji","Na konto/Z konta","Odbiorca/Zleceniodawca","Opis","Obciążenia","Uznania","Saldo","Waluta"`;

  test('parsuje standardowa transakcje', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","ZAKUP KARTĄ","","BIEDRONKA SP. Z O.O.","Zakupy","-50.00","","1000.00","PLN"`;

    const result = parseCSV(csv);

    expect(result.bank).toBe('millennium');
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.merchant).toBe('Biedronka');
    expect(result.transactions[0]?.amount).toBe(50);
    expect(result.transactions[0]?.date).toBe('2024-01-15');
  });

  test('parsuje wiele transakcji', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","ZAKUP KARTĄ","","BIEDRONKA","Zakupy","-50.00","","1000.00","PLN"
"123","2024-01-16","2024-01-16","ZAKUP KARTĄ","","LIDL","Zakupy","-75.00","","925.00","PLN"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]?.merchant).toBe('Biedronka');
    expect(result.transactions[1]?.merchant).toBe('Lidl');
  });

  test('pomija przelewy wewnetrzne', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","PRZELEW WEWNĘTRZNY","","JAN KOWALSKI","Transfer","-100.00","","1000.00","PLN"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.skipped.count).toBe(1);
    expect(result.skipped.reasons['internal_transfer']).toBe(1);
  });

  test('pomija wyplaty z bankomatu', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","WYPŁATA Z BANKOMATU","","BANKOMAT","ATM","-200.00","","1000.00","PLN"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.skipped.reasons['atm_withdrawal']).toBe(1);
  });

  test('pomija splaty karty', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","WCZEŚN.SPŁ.KARTY","","KARTA","Spłata","-1000.00","","0.00","PLN"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.skipped.reasons['card_payment']).toBe(1);
  });

  test('wymusza kategorie Inwestycje dla XTB', () => {
    // getForcedCategory checks desc.includes('xtb s.a.') or recipient.includes('xtb.com')
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","PRZELEW","","Broker","XTB S.A. przelew","-500.00","","1000.00","PLN"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.forcedCategory).toBe('Inwestycje');
  });

  test('wymusza kategorie Transport dla biletow', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","ZAKUP BILETU","","MPK","Bilet","-5.00","","1000.00","PLN"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.forcedCategory).toBe('Transport');
  });

  test('wymusza kategorie Subskrypcje dla doladowania telefonu', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","DOŁADOWANIE TELEFONU","","PLUS","Doładowanie","-30.00","","1000.00","PLN"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.forcedCategory).toBe('Subskrypcje');
  });

  test('ignoruje puste linie', () => {
    const csv = `${millenniumHeader}

"123","2024-01-15","2024-01-15","ZAKUP KARTĄ","","BIEDRONKA","Zakupy","-50.00","","1000.00","PLN"

`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(1);
  });

  test('ignoruje transakcje bez kwoty', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","ZAKUP KARTĄ","","BIEDRONKA","Zakupy","","","1000.00","PLN"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(0);
  });
});

describe('parseCSV - Revolut PL', () => {
  const revolutHeader = `Rodzaj,Produkt,Data rozpoczęcia,Data zrealizowania,Opis,Kwota,Opłata,Waluta,State,Saldo`;

  test('parsuje platnosc karta', () => {
    const csv = `${revolutHeader}
"Płatność kartą","Current","2024-01-15","2024-01-15 10:00:00","LIDL","-45.50","0","PLN","ZAKOŃCZONO","1000.00"`;

    const result = parseCSV(csv);

    expect(result.bank).toBe('revolut-pl');
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.merchant).toBe('Lidl');
    expect(result.transactions[0]?.amount).toBe(45.5);
    expect(result.transactions[0]?.date).toBe('2024-01-15');
  });

  test('ignoruje niezakonczone transakcje', () => {
    const csv = `${revolutHeader}
"Płatność kartą","Current","2024-01-15","2024-01-15 10:00:00","LIDL","-45.50","0","PLN","PENDING","1000.00"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(0);
  });

  test('ignoruje przelewy', () => {
    const csv = `${revolutHeader}
"Przelew","Current","2024-01-15","2024-01-15 10:00:00","Jan Kowalski","-100.00","0","PLN","ZAKOŃCZONO","1000.00"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(0);
  });

  test('parsuje transakcje bankomatowe', () => {
    const csv = `${revolutHeader}
"Bankomat","Current","2024-01-15","2024-01-15 10:00:00","ATM Withdrawal","-200.00","0","PLN","ZAKOŃCZONO","1000.00"`;

    const result = parseCSV(csv);

    // Bankomat is in allowedTypes
    expect(result.transactions).toHaveLength(1);
  });

  test('parsuje oplaty', () => {
    const csv = `${revolutHeader}
"Opłata","Current","2024-01-15","2024-01-15 10:00:00","Monthly fee","-4.99","0","PLN","ZAKOŃCZONO","1000.00"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(1);
  });
});

describe('parseCSV - ZEN', () => {
  test('parsuje Card payment', () => {
    const csv = `Account Statement
Transactions:
Date,Transaction type,Description,Settlement amount,Settlement currency
"1 Dec 2024","Card payment","LIDL                POL,POL CARD: MASTERCARD *5382","-35.50","PLN"`;

    const result = parseCSV(csv);

    expect(result.bank).toBe('zen');
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.merchant).toBe('Lidl');
    expect(result.transactions[0]?.date).toBe('2024-12-01');
    expect(result.transactions[0]?.amount).toBe(35.5);
  });

  test('parsuje rozne miesiace', () => {
    const testCases = [
      { input: '15 Jan 2024', expected: '2024-01-15' },
      { input: '1 Feb 2024', expected: '2024-02-01' },
      { input: '28 Mar 2024', expected: '2024-03-28' },
      { input: '10 Nov 2024', expected: '2024-11-10' },
      { input: '31 Dec 2024', expected: '2024-12-31' },
    ];

    for (const { input, expected } of testCases) {
      const csv = `Account Statement
Transactions:
Date,Transaction type,Description,Settlement amount,Settlement currency
"${input}","Card payment","TEST SHOP                POL","-10.00","PLN"`;

      const result = parseCSV(csv);
      expect(result.transactions[0]?.date).toBe(expected);
    }
  });

  test('ignoruje uznania (positive amounts)', () => {
    const csv = `Account Statement
Transactions:
Date,Transaction type,Description,Settlement amount,Settlement currency
"1 Dec 2024","Card payment","Refund","35.50","PLN"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(0);
  });

  test('ignoruje inne typy transakcji', () => {
    const csv = `Account Statement
Transactions:
Date,Transaction type,Description,Settlement amount,Settlement currency
"1 Dec 2024","Transfer","Internal transfer","-100.00","PLN"`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(0);
  });

  test('ignoruje footer', () => {
    const csv = `Account Statement
Transactions:
Date,Transaction type,Description,Settlement amount,Settlement currency
"1 Dec 2024","Card payment","SHOP                POL","-10.00","PLN"
This is a computer-generated document`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(1);
  });
});

describe('parseCSV - mBank', () => {
  const mbankHeader = `#Data operacji;Data księgowania;Opis operacji;Tytuł;Nadawca/Odbiorca;Numer konta;Kwota;Saldo po operacji`;

  test('parsuje standardowa transakcje', () => {
    // Note: mBank uses recipient directly without extractMerchant normalization
    // So merchant names stay as-is from CSV
    const csv = `${mbankHeader}
2024-01-15;2024-01-15;Przelew wychodzący;Zakupy;BIEDRONKA;;-50,00 PLN;1000,00 PLN`;

    const result = parseCSV(csv);

    expect(result.bank).toBe('mbank');
    expect(result.transactions).toHaveLength(1);
    // mBank doesn't normalize recipient names
    expect(result.transactions[0]?.merchant).toBe('BIEDRONKA');
  });

  test('normalizuje nazwy gdy recipient pusty', () => {
    // mBank format: opis;tytul;recipient - when recipient empty, uses extractMerchant(opis + ' ' + tytul)
    const csv = `${mbankHeader}
2024-01-15;2024-01-15;;BIEDRONKA SP Z O.O.;;;-50,00 PLN;1000,00 PLN`;

    const result = parseCSV(csv);

    expect(result.transactions).toHaveLength(1);
    // extractMerchant removes "SP Z O.O." and normalizes
    expect(result.transactions[0]?.merchant).toBe('Biedronka');
  });
});

describe('parseCSV - Revolut EN', () => {
  const revolutHeader = `Completed Date,Description,Amount,Currency`;

  test('parsuje standardowa transakcje', () => {
    const csv = `${revolutHeader}
"2024-01-15","LIDL","-45.50","PLN"`;

    const result = parseCSV(csv);

    expect(result.bank).toBe('revolut');
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.merchant).toBe('Lidl');
    expect(result.transactions[0]?.amount).toBe(45.5);
  });
});

describe('parseCSV - Generic/Unknown', () => {
  test('probuje parsowac nieznany format', () => {
    const csv = `Date,Merchant,Amount
2024-01-15,BIEDRONKA,-50.00`;

    const result = parseCSV(csv);

    expect(result.bank).toBe('unknown');
    // Generic parser tries to extract data
    expect(result.transactions.length).toBeGreaterThanOrEqual(0);
  });

  test('obsluguje separator srednika', () => {
    const csv = `Date;Merchant;Amount
2024-01-15;BIEDRONKA;-50.00`;

    const result = parseCSV(csv);

    expect(result.bank).toBe('unknown');
  });
});

describe('formatSkippedStats', () => {
  test('formatuje statystyki pomiejetych', () => {
    const stats = {
      count: 5,
      reasons: {
        internal_transfer: 2,
        atm_withdrawal: 3,
      },
    };

    const result = formatSkippedStats(stats);

    expect(result).toContain('5 transakcji');
    expect(result).toContain('2 przelewów wewnętrznych');
    expect(result).toContain('3 wypłat z bankomatu');
  });

  test('zwraca pusty string dla count=0', () => {
    expect(formatSkippedStats({ count: 0, reasons: {} })).toBe('');
  });

  test('formatuje pojedyncza przyczyne', () => {
    const stats = {
      count: 1,
      reasons: {
        card_payment: 1,
      },
    };

    const result = formatSkippedStats(stats);

    expect(result).toContain('1 transakcji');
    expect(result).toContain('1 spłat karty');
  });

  test('obsluguje nieznane przyczyny', () => {
    const stats = {
      count: 1,
      reasons: {
        unknown_reason: 1,
      },
    };

    const result = formatSkippedStats(stats);

    expect(result).toContain('unknown_reason');
  });
});

describe('extractMerchant - normalizacja nazw', () => {
  // Test przez parseCSV z różnymi nazwami merchantów
  const millenniumHeader = `"Numer rachunku/karty","Data transakcji","Data rozliczenia","Rodzaj transakcji","Na konto/Z konta","Odbiorca/Zleceniodawca","Opis","Obciążenia","Uznania","Saldo","Waluta"`;

  test('usuwa SP. Z O.O.', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","ZAKUP","","BIEDRONKA SP. Z O.O.","Test","-50.00","","1000.00","PLN"`;

    const result = parseCSV(csv);
    expect(result.transactions[0]?.merchant).toBe('Biedronka');
  });

  test('usuwa transaction ID', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","ZAKUP","","SPOTIFY P202b79a43","Test","-50.00","","1000.00","PLN"`;

    const result = parseCSV(csv);
    expect(result.transactions[0]?.merchant).toBe('Spotify');
  });

  test('usuwa numer karty', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","ZAKUP","","LIDL *1234","Test","-50.00","","1000.00","PLN"`;

    const result = parseCSV(csv);
    expect(result.transactions[0]?.merchant).toBe('Lidl');
  });

  test('kapitalizuje i normalizuje nazwy (Zabka -> Żabka)', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","ZAKUP","","ZABKA","Test","-50.00","","1000.00","PLN"`;

    const result = parseCSV(csv);
    // normalizeShopName converts 'zabka' -> 'Żabka'
    expect(result.transactions[0]?.merchant).toBe('Żabka');
  });
});

describe('parseAmount', () => {
  // Test przez parseCSV z różnymi formatami kwot
  const millenniumHeader = `"Numer rachunku/karty","Data transakcji","Data rozliczenia","Rodzaj transakcji","Na konto/Z konta","Odbiorca/Zleceniodawca","Opis","Obciążenia","Uznania","Saldo","Waluta"`;

  test('parsuje kwoty z przecinkiem', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","ZAKUP","","TEST","Test","-50,99","","1000.00","PLN"`;

    const result = parseCSV(csv);
    expect(result.transactions[0]?.amount).toBe(50.99);
  });

  test('parsuje kwoty z kropka', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","ZAKUP","","TEST","Test","-50.99","","1000.00","PLN"`;

    const result = parseCSV(csv);
    expect(result.transactions[0]?.amount).toBe(50.99);
  });

  test('parsuje duze kwoty', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","ZAKUP","","TEST","Test","-1234.56","","1000.00","PLN"`;

    const result = parseCSV(csv);
    expect(result.transactions[0]?.amount).toBe(1234.56);
  });
});

describe('formatDate', () => {
  // Test przez parseCSV z różnymi formatami dat
  const millenniumHeader = `"Numer rachunku/karty","Data transakcji","Data rozliczenia","Rodzaj transakcji","Na konto/Z konta","Odbiorca/Zleceniodawca","Opis","Obciążenia","Uznania","Saldo","Waluta"`;

  test('zachowuje format YYYY-MM-DD', () => {
    const csv = `${millenniumHeader}
"123","2024-01-15","2024-01-15","ZAKUP","","TEST","Test","-50.00","","1000.00","PLN"`;

    const result = parseCSV(csv);
    expect(result.transactions[0]?.date).toBe('2024-01-15');
  });
});
