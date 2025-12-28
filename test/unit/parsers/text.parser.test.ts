/**
 * Tests for text.parser.ts
 * Testing parseExpenseText, isQuery, isCorrection, extractCorrectionCategory
 */
import { describe, test, expect } from 'bun:test';
import {
  parseExpenseText,
  isQuery,
  isCorrection,
  extractCorrectionCategory,
} from '../../../src/parsers/text.parser';

describe('parseExpenseText', () => {
  describe('podstawowe formaty', () => {
    test('sklep kwota: zabka 15', () => {
      const result = parseExpenseText('zabka 15');
      expect(result).toEqual({
        shop: 'Zabka',
        amount: 15,
        description: undefined,
      });
    });

    test('sklep kwota z groszy (przecinek): zabka 15,50', () => {
      const result = parseExpenseText('zabka 15,50');
      expect(result).toEqual({
        shop: 'Zabka',
        amount: 15.5,
        description: undefined,
      });
    });

    test('sklep kwota z groszy (kropka): zabka 15.50', () => {
      const result = parseExpenseText('zabka 15.50');
      expect(result).toEqual({
        shop: 'Zabka',
        amount: 15.5,
        description: undefined,
      });
    });

    test('sklep opis kwota: zabka piwo 15', () => {
      const result = parseExpenseText('zabka piwo 15');
      expect(result).toEqual({
        shop: 'Zabka',
        amount: 15,
        description: 'piwo',
      });
    });

    test('sklep opis wielowyrazowy kwota: zabka piwo i chipsy 25', () => {
      const result = parseExpenseText('zabka piwo i chipsy 25');
      expect(result).toEqual({
        shop: 'Zabka',
        amount: 25,
        description: 'piwo i chipsy',
      });
    });
  });

  describe('jednostki walutowe', () => {
    test('z zl: zabka 15 zl', () => {
      const result = parseExpenseText('zabka 15 zl');
      expect(result?.amount).toBe(15);
      expect(result?.shop).toBe('Zabka');
    });

    test('z pln: zabka 15 pln', () => {
      const result = parseExpenseText('zabka 15 pln');
      expect(result?.amount).toBe(15);
    });

    test('z gr (traktowane jako zl): zabka 15 gr', () => {
      const result = parseExpenseText('zabka 15 gr');
      expect(result?.amount).toBe(15);
    });

    test('z zlotych: zabka 15 zlotych', () => {
      const result = parseExpenseText('zabka 15 zlotych');
      expect(result?.amount).toBe(15);
    });

    test('z gr.: zabka 15 gr.', () => {
      const result = parseExpenseText('zabka 15 gr.');
      expect(result?.amount).toBe(15);
    });
  });

  describe('edge cases', () => {
    test('pusty string zwraca null', () => {
      expect(parseExpenseText('')).toBeNull();
    });

    test('tylko whitespace zwraca null', () => {
      expect(parseExpenseText('   ')).toBeNull();
    });

    test('brak kwoty zwraca null', () => {
      expect(parseExpenseText('zabka piwo')).toBeNull();
    });

    test('tylko kwota zwraca null', () => {
      expect(parseExpenseText('15')).toBeNull();
    });

    test('kwota zero zwraca null', () => {
      expect(parseExpenseText('zabka 0')).toBeNull();
    });

    test('kwota ujemna - minus jest traktowany jako opis', () => {
      // Parser traktuje '-' jako opis, nie jako ujemną kwotę
      const result = parseExpenseText('zabka -15');
      expect(result?.amount).toBe(15);
      expect(result?.description).toBe('-');
    });
  });

  describe('kapitalizacja nazwy sklepu', () => {
    test('uppercase: BIEDRONKA 50', () => {
      const result = parseExpenseText('BIEDRONKA 50');
      expect(result?.shop).toBe('Biedronka');
    });

    test('lowercase: biedronka 50', () => {
      const result = parseExpenseText('biedronka 50');
      expect(result?.shop).toBe('Biedronka');
    });

    test('mixed case: BiEdRoNkA 50', () => {
      const result = parseExpenseText('BiEdRoNkA 50');
      expect(result?.shop).toBe('Biedronka');
    });
  });

  describe('rozne kwoty', () => {
    test('duza kwota: lidl 1234', () => {
      const result = parseExpenseText('lidl 1234');
      expect(result?.amount).toBe(1234);
    });

    test('mala kwota: orlen 0,99', () => {
      const result = parseExpenseText('orlen 0,99');
      expect(result?.amount).toBe(0.99);
    });

    test('kwota z jednym groszem: zabka 15,5', () => {
      const result = parseExpenseText('zabka 15,5');
      expect(result?.amount).toBe(15.5);
    });
  });
});

describe('isQuery', () => {
  describe('podstawowe wzorce zapytan', () => {
    const queryPatterns = [
      'ile wydalem',
      'ile wydałem w tym miesiącu',
      'pokaz wydatki',
      'pokaz ostatnie',
      'raport miesieczny',
      'raport',
      'suma za grudzien',
      'suma',
      'ostatnie zakupy',
      'ostatnie wydatki',
      'lista wydatkow',
      'wydatki w biedronce',
      'statystyki',
    ];

    queryPatterns.forEach((pattern) => {
      test(`rozpoznaje: "${pattern}"`, () => {
        expect(isQuery(pattern)).toBe(true);
      });
    });
  });

  describe('wzorce NLP - top N', () => {
    const nlpPatterns = [
      'top 5 kategorii',
      'top 10 sklepow',
      'top 3',
    ];

    nlpPatterns.forEach((pattern) => {
      test(`rozpoznaje NLP: "${pattern}"`, () => {
        expect(isQuery(pattern)).toBe(true);
      });
    });
  });

  describe('wzorce NLP - agregacje', () => {
    const aggregationPatterns = [
      'srednia wydatkow',
      'sredni wydatek',
      'lacznie w tym miesiacu',
      'porownaj miesiace',
    ];

    aggregationPatterns.forEach((pattern) => {
      test(`rozpoznaje agregacje: "${pattern}"`, () => {
        expect(isQuery(pattern)).toBe(true);
      });
    });
  });

  describe('wzorce negacji', () => {
    const negationPatterns = [
      'bez kategorii elektronika',
      'bez elektroniki',
      'oprocz restauracji',
      'nie liczac transportu',
      'wykluczajac zabke',
    ];

    negationPatterns.forEach((pattern) => {
      test(`rozpoznaje negacje: "${pattern}"`, () => {
        expect(isQuery(pattern)).toBe(true);
      });
    });
  });

  describe('wzorce dat', () => {
    const datePatterns = [
      'od 1 do 15 grudnia',
      'miedzy 5 a 10',
      'w styczniu',
      'w lutym',
      'w marcu',
      'w grudniu',
      'w zeszlym miesiacu',
      'w ostatnich 3 dniach',
      'w tym tygodniu',
      'w tym miesiacu',
      'w tym roku',
    ];

    datePatterns.forEach((pattern) => {
      test(`rozpoznaje date: "${pattern}"`, () => {
        expect(isQuery(pattern)).toBe(true);
      });
    });
  });

  describe('wzorce kwot', () => {
    const amountPatterns = [
      'powyzej 50zl',
      'powyzej 100',
      'ponizej 100',
      'ponizej 50zl',
      'wiecej niz 50',
      'mniej niz 100',
    ];

    amountPatterns.forEach((pattern) => {
      test(`rozpoznaje filtr kwoty: "${pattern}"`, () => {
        expect(isQuery(pattern)).toBe(true);
      });
    });
  });

  describe('wzorce grupowania', () => {
    const groupPatterns = [
      'pogrupuj po kategoriach',
      'po kategoriach',
      'po sklepach',
    ];

    groupPatterns.forEach((pattern) => {
      test(`rozpoznaje grupowanie: "${pattern}"`, () => {
        expect(isQuery(pattern)).toBe(true);
      });
    });
  });

  describe('nie-zapytania (wydatki)', () => {
    const nonQueryPatterns = [
      'zabka 15',
      'biedronka piwo 25',
      'lidl zakupy 150',
      'orlen 200',
      'kfc 45',
    ];

    nonQueryPatterns.forEach((pattern) => {
      test(`nie rozpoznaje jako zapytanie: "${pattern}"`, () => {
        expect(isQuery(pattern)).toBe(false);
      });
    });
  });
});

describe('isCorrection', () => {
  describe('wzorce korekty', () => {
    const correctionPatterns = [
      'zmien na Restauracje',
      'zmien Restauracje',
      'popraw kategorie',
      'popraw na Transport',
      'kategoria Transport',
      'kategoria Dom',
      'zmiana na Dom',
    ];

    correctionPatterns.forEach((pattern) => {
      test(`rozpoznaje korekcje: "${pattern}"`, () => {
        expect(isCorrection(pattern)).toBe(true);
      });
    });
  });

  describe('nie-korekty', () => {
    const nonCorrectionPatterns = [
      'zabka 15',
      'ile wydalem',
      'pokaz wydatki',
      'raport',
    ];

    nonCorrectionPatterns.forEach((pattern) => {
      test(`nie rozpoznaje jako korekcje: "${pattern}"`, () => {
        expect(isCorrection(pattern)).toBe(false);
      });
    });
  });
});

describe('extractCorrectionCategory', () => {
  test('zmien na Restauracje -> Restauracje', () => {
    expect(extractCorrectionCategory('zmien na Restauracje')).toBe(
      'Restauracje'
    );
  });

  test('zmien Restauracje -> Restauracje', () => {
    expect(extractCorrectionCategory('zmien Restauracje')).toBe('Restauracje');
  });

  test('kategoria Transport -> Transport', () => {
    expect(extractCorrectionCategory('kategoria Transport')).toBe('Transport');
  });

  test('popraw na Dom -> Dom', () => {
    expect(extractCorrectionCategory('popraw na Dom')).toBe('Dom');
  });

  test('popraw Dom -> Dom', () => {
    expect(extractCorrectionCategory('popraw Dom')).toBe('Dom');
  });

  test('nieprawidlowy format -> null', () => {
    expect(extractCorrectionCategory('zabka 15')).toBeNull();
  });

  test('pusty string -> null', () => {
    expect(extractCorrectionCategory('')).toBeNull();
  });

  test('case insensitive input, capitalized output', () => {
    expect(extractCorrectionCategory('zmien na restauracje')).toBe(
      'Restauracje'
    );
  });
});
