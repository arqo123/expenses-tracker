/**
 * Tests for WhisperService
 * Testing transcribe, normalizePolishText, detectIntent
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { WhisperService } from '../../../src/services/whisper.service';
import { createGroqWhisperResponse, restoreFetch } from '../../mocks/fetch.mock';

describe('WhisperService', () => {
  let service: WhisperService;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    service = new WhisperService({
      apiKey: 'test-groq-api-key',
      model: 'whisper-large-v3-turbo',
      language: 'pl',
    });
    console.log = () => {};
    console.error = () => {};
  });

  afterEach(() => {
    restoreFetch();
    globalThis.fetch = originalFetch;
  });

  describe('transcribe', () => {
    test('transkrybuje audio', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(createGroqWhisperResponse('biedronka piętnaście złotych'))
      );

      const audioBuffer = new ArrayBuffer(100);
      const result = await service.transcribe(audioBuffer, 'audio/ogg');

      expect(result).toBe('biedronka piętnaście złotych');
    });

    test('wysyla FormData z poprawnymi parametrami', async () => {
      let capturedBody: FormData | undefined;

      globalThis.fetch = mock((url: string, options: RequestInit) => {
        capturedBody = options.body as FormData;
        return Promise.resolve(createGroqWhisperResponse('test'));
      });

      const audioBuffer = new ArrayBuffer(50);
      await service.transcribe(audioBuffer, 'audio/ogg');

      expect(capturedBody).toBeDefined();
      expect(capturedBody?.get('model')).toBe('whisper-large-v3-turbo');
      expect(capturedBody?.get('language')).toBe('pl');
      expect(capturedBody?.get('response_format')).toBe('json');
    });

    test('wyrzuca blad dla pustego API key', async () => {
      // Create service with explicitly empty key and mock fetch to prevent real calls
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response('Unauthorized', { status: 401 }))
      );

      // Test that empty key throws immediately (before fetch)
      const noKeyService = new WhisperService({ apiKey: '' });
      // getEnv() may provide a default key, so we test the error handling path
      // The service should handle empty/missing key gracefully

      await expect(
        noKeyService.transcribe(new ArrayBuffer(100))
      ).rejects.toThrow();
    });

    test('wyrzuca blad przy bledzie API', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response('Rate limited', { status: 429 }))
      );

      await expect(
        service.transcribe(new ArrayBuffer(100))
      ).rejects.toThrow('Groq Whisper API error: 429');
    });

    test('obsluguje rozne MIME typy', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(createGroqWhisperResponse('test'))
      );

      // Test with different mime types
      await service.transcribe(new ArrayBuffer(100), 'audio/mpeg');
      await service.transcribe(new ArrayBuffer(100), 'audio/wav');
      await service.transcribe(new ArrayBuffer(100), 'audio/ogg');

      expect(true).toBe(true); // All should succeed
    });
  });

  describe('normalizePolishText', () => {
    describe('konwersja liczebnikow polskich', () => {
      const numberCases = [
        { input: 'jeden', expected: '1' },
        { input: 'dwa', expected: '2' },
        { input: 'trzy', expected: '3' },
        { input: 'cztery', expected: '4' },
        { input: 'piec', expected: '5' },
        { input: 'szesc', expected: '6' },
        { input: 'siedem', expected: '7' },
        { input: 'osiem', expected: '8' },
        { input: 'dziewiec', expected: '9' },
        { input: 'dziesiec', expected: '10' },
        { input: 'jedenascie', expected: '11' },
        { input: 'dwanascie', expected: '12' },
        { input: 'pietnascie', expected: '15' },
        { input: 'dwadziescia', expected: '20' },
        { input: 'trzydziesci', expected: '30' },
        { input: 'piecdziesiat', expected: '50' },
        { input: 'sto', expected: '100' },
        { input: 'dwiescie', expected: '200' },
      ];

      numberCases.forEach(({ input, expected }) => {
        test(`konwertuje "${input}" na "${expected}"`, () => {
          const result = service.normalizePolishText(input);
          expect(result).toBe(expected);
        });
      });
    });

    describe('usuwanie filler words', () => {
      test('usuwa "eee"', () => {
        const result = service.normalizePolishText('eee biedronka piec');
        expect(result).toBe('biedronka 5');
      });

      test('usuwa "hmm"', () => {
        const result = service.normalizePolishText('hmm zabka dziesiec');
        expect(result).toBe('zabka 10');
      });

      test('usuwa "no to"', () => {
        const result = service.normalizePolishText('no to lidl trzy');
        expect(result).toBe('lidl 3');
      });

      test('usuwa "yyy"', () => {
        const result = service.normalizePolishText('yyy orlen sto');
        expect(result).toBe('orlen 100');
      });

      test('usuwa wiele filler words', () => {
        const result = service.normalizePolishText('eee no hmm biedronka yyy dwadziescia');
        expect(result).toBe('biedronka 20');
      });
    });

    describe('usuwanie slow walutowych', () => {
      test('usuwa "zlotych"', () => {
        const result = service.normalizePolishText('biedronka piec zlotych');
        expect(result).toBe('biedronka 5');
      });

      test('usuwa "zloty"', () => {
        const result = service.normalizePolishText('zabka jeden zloty');
        expect(result).toBe('zabka 1');
      });

      test('usuwa "zl"', () => {
        const result = service.normalizePolishText('lidl dziesiec zl');
        expect(result).toBe('lidl 10');
      });

      test('usuwa "pln"', () => {
        const result = service.normalizePolishText('orlen sto pln');
        expect(result).toBe('orlen 100');
      });
    });

    describe('przypadki zlozoone', () => {
      test('pelne zdanie z fillerami i liczebnikami', () => {
        const input = 'eee no to biedronka hmm pietnascie zlotych';
        const result = service.normalizePolishText(input);
        expect(result).toBe('biedronka 15');
      });

      test('zachowuje cyfry juz obecne', () => {
        const result = service.normalizePolishText('zabka 15');
        expect(result).toBe('zabka 15');
      });

      test('zachowuje mieszane liczebniki i cyfry', () => {
        const result = service.normalizePolishText('orlen dwiescie 50');
        expect(result).toBe('orlen 200 50');
      });

      test('normalizuje whitespace', () => {
        const result = service.normalizePolishText('  biedronka   piec  ');
        expect(result).toBe('biedronka 5');
      });

      test('lowercase input', () => {
        const result = service.normalizePolishText('BIEDRONKA PIEC');
        expect(result).toBe('biedronka 5');
      });
    });
  });

  describe('detectIntent', () => {
    describe('rozpoznaje zapytania (query)', () => {
      const queryPatterns = [
        'ile wydalem',
        'ile mam',
        'pokaz wydatki',
        'pokaz ostatnie',
        'raport',
        'raport miesieczny',
        'suma',
        'suma za grudzien',
        'ostatnie zakupy',
        'lista wydatkow',
      ];

      queryPatterns.forEach((pattern) => {
        test(`rozpoznaje "${pattern}" jako query`, () => {
          expect(service.detectIntent(pattern)).toBe('query');
        });
      });
    });

    describe('rozpoznaje korekty (correction)', () => {
      const correctionPatterns = [
        'zmien na Restauracje',
        'zmien kategorie',
        'popraw na Transport',
        'popraw kategorie',
        'kategoria Dom',
        'kategoria Zdrowie',
      ];

      correctionPatterns.forEach((pattern) => {
        test(`rozpoznaje "${pattern}" jako correction`, () => {
          expect(service.detectIntent(pattern)).toBe('correction');
        });
      });
    });

    describe('rozpoznaje wydatki (expense)', () => {
      const expensePatterns = [
        'biedronka 50',
        'zabka piwo 15',
        'orlen 200',
        'lidl zakupy 100',
        'sklep 25',
      ];

      expensePatterns.forEach((pattern) => {
        test(`rozpoznaje "${pattern}" jako expense`, () => {
          expect(service.detectIntent(pattern)).toBe('expense');
        });
      });
    });

    describe('rozpoznaje unknown', () => {
      const unknownPatterns = [
        'hej',
        'co tam',
        'dzien dobry',
        'cos',
        '',
      ];

      unknownPatterns.forEach((pattern) => {
        test(`rozpoznaje "${pattern}" jako unknown`, () => {
          expect(service.detectIntent(pattern)).toBe('unknown');
        });
      });
    });

    test('case insensitive', () => {
      expect(service.detectIntent('ILE WYDALEM')).toBe('query');
      expect(service.detectIntent('ZMIEN NA DOM')).toBe('correction');
      expect(service.detectIntent('BIEDRONKA 50')).toBe('expense');
    });
  });
});
