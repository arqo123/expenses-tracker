/**
 * Tests for AICategorizerService
 * Testing categorizeSingle, categorizeBatch, categorizeImage with mocked fetch
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { AICategorizerService } from '../../../src/services/ai-categorizer.service';
import {
  mockFetchWith,
  createOpenRouterResponse,
  restoreFetch,
} from '../../mocks/fetch.mock';

describe('AICategorizerService', () => {
  let service: AICategorizerService;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Create service with test config
    service = new AICategorizerService({
      primaryModel: 'test-model',
      fallbackModel: 'test-fallback-model',
      visionModel: 'test-vision-model',
      openRouterApiKey: 'test-api-key',
      circuitBreakerThreshold: 3,
      circuitBreakerCooldownMs: 100,
    });
    // Suppress console logs during tests
    console.log = () => {};
    console.error = () => {};
  });

  afterEach(() => {
    restoreFetch();
    globalThis.fetch = originalFetch;
  });

  describe('categorizeSingle', () => {
    test('kategoryzuje prosty wydatek', async () => {
      const mockResponse = {
        shop: 'Biedronka',
        category: 'Zakupy spozywcze',
        amount: 50,
        description: 'zakupy',
        confidence: 0.95,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.categorizeSingle('biedronka 50');

      expect(result.shop).toBe('Biedronka');
      expect(result.category).toBe('Zakupy spozywcze');
      expect(result.amount).toBe(50);
    });

    test('kategoryzuje z opisem produktu', async () => {
      const mockResponse = {
        shop: 'Orlen',
        category: 'Paliwo',
        amount: 250,
        description: 'tankowanie',
        confidence: 0.98,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.categorizeSingle('tankowanie orlen 250');

      expect(result.shop).toBe('Orlen');
      expect(result.category).toBe('Paliwo');
      expect(result.amount).toBe(250);
    });

    test('parsuje odpowiedz z markdown code blocks', async () => {
      const mockContent = '```json\n{"shop": "Żabka", "category": "Zakupy spozywcze", "amount": 15, "confidence": 0.9}\n```';

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: mockContent } }],
            }),
            { status: 200 }
          )
        )
      );

      const result = await service.categorizeSingle('zabka 15');

      expect(result.shop).toBe('Żabka');
      expect(result.amount).toBe(15);
    });

    test('uzywa fallback model gdy primary zawiedzie', async () => {
      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount <= 3) {
          // Fail first 3 calls to trigger circuit breaker
          return Promise.resolve(new Response('API Error', { status: 500 }));
        }
        // Fallback succeeds
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      shop: 'Test',
                      category: 'Inne',
                      amount: 10,
                      confidence: 0.5,
                    }),
                  },
                },
              ],
            }),
            { status: 200 }
          )
        );
      });

      // First 3 calls fail and open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await service.categorizeSingle('test 10');
        } catch {
          // Expected
        }
      }

      // Next call should use fallback
      const result = await service.categorizeSingle('test 10');
      expect(result.shop).toBe('Test');
    });

    test('wyrzuca blad gdy oba modele zawioda', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response('API Error', { status: 500 }))
      );

      // First fail primary 3 times to trigger circuit
      for (let i = 0; i < 3; i++) {
        try {
          await service.categorizeSingle('test 10');
        } catch {
          // Expected
        }
      }

      // Now circuit is open, but fallback also fails
      await expect(service.categorizeSingle('test 10')).rejects.toThrow(
        'Both primary and fallback AI models failed'
      );
    });

    test('wyrzuca blad dla pustej odpowiedzi', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '' } }],
            }),
            { status: 200 }
          )
        )
      );

      await expect(service.categorizeSingle('test 10')).rejects.toThrow(
        'Both primary and fallback AI models failed'
      );
    });
  });

  describe('categorizeBatch', () => {
    test('kategoryzuje batch transakcji', async () => {
      const mockResponse = [
        { idx: 0, shop: 'Biedronka', category: 'Zakupy spozywcze', amount: 50, confidence: 0.95 },
        { idx: 1, shop: 'Lidl', category: 'Zakupy spozywcze', amount: 75, confidence: 0.93 },
        { idx: 2, shop: 'Orlen', category: 'Paliwo', amount: 200, confidence: 0.98 },
      ];

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const transactions = [
        { idx: 0, text: 'BIEDRONKA SP Z O.O. 50' },
        { idx: 1, text: 'LIDL SP Z O.O. 75' },
        { idx: 2, text: 'ORLEN SA 200' },
      ];

      const result = await service.categorizeBatch(transactions);

      expect(result).toHaveLength(3);
      expect(result[0]?.shop).toBe('Biedronka');
      expect(result[1]?.shop).toBe('Lidl');
      expect(result[2]?.shop).toBe('Orlen');
      expect(result[2]?.category).toBe('Paliwo');
    });

    test('zachowuje idx z inputu', async () => {
      const mockResponse = [
        { idx: 5, shop: 'Test', category: 'Inne', amount: 10, confidence: 0.8 },
      ];

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.categorizeBatch([{ idx: 5, text: 'TEST 10' }]);

      expect(result[0]?.idx).toBe(5);
    });

    test('obsluguje pusty batch', async () => {
      mockFetchWith(createOpenRouterResponse([]));

      const result = await service.categorizeBatch([]);

      expect(result).toHaveLength(0);
    });
  });

  describe('categorizeImage', () => {
    test('kategoryzuje paragon', async () => {
      const mockResponse = {
        image_type: 'receipt',
        source: 'Biedronka',
        store_type: 'grocery',
        products: [
          { name: 'Chleb', price: 5.99, category: 'Zakupy spozywcze' },
          { name: 'Mleko', price: 3.49, category: 'Zakupy spozywcze' },
        ],
        total: 9.48,
        total_discounts: 0,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.categorizeImage('base64data', 'image/jpeg');

      expect(result.source).toBe('Biedronka');
      expect(result.products).toHaveLength(2);
      expect(result.total).toBe(9.48);
    });

    test('wymusza kategorie Zdrowie dla apteki', async () => {
      const mockResponse = {
        image_type: 'receipt',
        source: 'DOZ Apteka',
        store_type: 'pharmacy',
        products: [
          { name: 'Ibuprofen', price: 15.99 },
          { name: 'Witamina C', price: 9.99 },
        ],
        total: 25.98,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.categorizeImage('base64data', 'image/png');

      // All products should be forced to Zdrowie
      expect(result.products[0]?.category).toBe('Zdrowie');
      expect(result.products[1]?.category).toBe('Zdrowie');
      expect(result.products[0]?.confidence).toBe(1.0);
    });

    test('wymusza kategorie Zwierzeta dla weterynarza', async () => {
      const mockResponse = {
        image_type: 'receipt',
        source: 'Klinika Weterynaryjna',
        store_type: 'veterinary',
        products: [
          { name: 'Wizyta kontrolna', price: 80 },
          { name: 'Szczepienie', price: 50 },
        ],
        total: 130,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.categorizeImage('base64data', 'image/jpeg');

      expect(result.products[0]?.category).toBe('Zwierzeta');
      expect(result.products[1]?.category).toBe('Zwierzeta');
    });

    test('wymusza kategorie Zwierzeta dla sklepu zoologicznego', async () => {
      const mockResponse = {
        image_type: 'receipt',
        source: 'Maxi Zoo',
        store_type: 'pet_store',
        products: [
          { name: 'Karma dla kota', price: 45 },
        ],
        total: 45,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.categorizeImage('base64data', 'image/jpeg');

      expect(result.products[0]?.category).toBe('Zwierzeta');
    });

    test('wymusza kategorie na podstawie source name (Kakadu)', async () => {
      const mockResponse = {
        image_type: 'receipt',
        source: 'Kakadu',
        store_type: 'other', // Even if type is wrong
        products: [
          { name: 'Karma', price: 30 },
        ],
        total: 30,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.categorizeImage('base64data', 'image/jpeg');

      // Should detect from source name
      expect(result.products[0]?.category).toBe('Zwierzeta');
    });

    test('uzywa AI kategorii dla zwyklych sklepow', async () => {
      const mockResponse = {
        image_type: 'receipt',
        source: 'Lidl',
        store_type: 'grocery',
        products: [
          { name: 'Chleb', price: 4.99, category: 'Zakupy spozywcze' },
          { name: 'Szampon', price: 12.99, category: 'Uroda' },
        ],
        total: 17.98,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.categorizeImage('base64data', 'image/jpeg');

      // AI categories should be preserved
      expect(result.products[0]?.category).toBe('Zakupy spozywcze');
      expect(result.products[1]?.category).toBe('Uroda');
    });

    test('obsluguje e-commerce screenshot', async () => {
      const mockResponse = {
        image_type: 'ecommerce',
        source: 'Allegro',
        store_type: 'other',
        products: [
          { name: 'Kabel USB-C', price: 29.99, category: 'Elektronika' },
        ],
        total: 29.99,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.categorizeImage('base64data', 'image/png');

      expect(result.image_type).toBe('ecommerce');
      expect(result.source).toBe('Allegro');
    });

    test('obsluguje rabaty', async () => {
      const mockResponse = {
        image_type: 'receipt',
        source: 'Lidl',
        store_type: 'grocery',
        products: [
          { name: 'Masło', price: 4.01, category: 'Zakupy spozywcze' }, // After discount
        ],
        total: 4.01,
        total_discounts: 0.99,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.categorizeImage('base64data', 'image/jpeg');

      expect(result.total_discounts).toBe(0.99);
      expect(result.products[0]?.price).toBe(4.01);
    });
  });

  describe('getCircuitBreakerState', () => {
    test('zwraca stan closed na poczatku', () => {
      const state = service.getCircuitBreakerState();
      expect(state.state).toBe('closed');
      expect(state.failureCount).toBe(0);
    });

    test('otwiera circuit po przekroczeniu threshold', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response('Error', { status: 500 }))
      );

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        try {
          await service.categorizeSingle('test');
        } catch {
          // Expected
        }
      }

      const state = service.getCircuitBreakerState();
      expect(state.state).toBe('open');
      expect(state.failureCount).toBe(3);
    });
  });

  describe('response parsing edge cases', () => {
    test('parsuje JSON z dodatkowym tekstem', async () => {
      const mockContent = 'Here is the categorization: {"shop": "Test", "category": "Inne", "amount": 10, "confidence": 0.8}';

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: mockContent } }],
            }),
            { status: 200 }
          )
        )
      );

      const result = await service.categorizeSingle('test 10');
      expect(result.shop).toBe('Test');
    });

    test('parsuje array z markdown', async () => {
      const mockContent = '```json\n[{"idx": 0, "shop": "Test", "category": "Inne", "amount": 10, "confidence": 0.8}]\n```';

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: mockContent } }],
            }),
            { status: 200 }
          )
        )
      );

      const result = await service.categorizeBatch([{ idx: 0, text: 'TEST 10' }]);
      expect(result[0]?.shop).toBe('Test');
    });

    test('wyrzuca blad dla niepoprawnego JSON', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: 'not valid json' } }],
            }),
            { status: 200 }
          )
        )
      );

      await expect(service.categorizeSingle('test')).rejects.toThrow();
    });
  });
});
