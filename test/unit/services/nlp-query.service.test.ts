/**
 * Tests for NLPQueryService
 * Testing parseQuery with mocked AI responses
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { NLPQueryService } from '../../../src/services/nlp-query.service';
import {
  mockFetchWith,
  createOpenRouterResponse,
  restoreFetch,
} from '../../mocks/fetch.mock';

describe('NLPQueryService', () => {
  let service: NLPQueryService;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    service = new NLPQueryService({
      primaryModel: 'test-model',
      fallbackModel: 'test-fallback-model',
      openRouterApiKey: 'test-api-key',
      circuitBreakerThreshold: 3,
      circuitBreakerCooldownMs: 100,
    });
    console.log = () => {};
    console.error = () => {};
  });

  afterEach(() => {
    restoreFetch();
    globalThis.fetch = originalFetch;
  });

  describe('parseQuery - intent detection', () => {
    test('rozpoznaje intent sum', async () => {
      const mockResponse = {
        intent: 'sum',
        dateRange: {
          type: 'absolute',
          start: '2024-12-01',
          end: '2024-12-31',
          description: 'grudzien',
        },
        confidence: 0.95,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('ile wydalem w grudniu');

      expect(result.intent).toBe('sum');
      expect(result.confidence).toBe(0.95);
      expect(result.originalQuery).toBe('ile wydalem w grudniu');
    });

    test('rozpoznaje intent list', async () => {
      const mockResponse = {
        intent: 'list',
        confidence: 0.9,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('pokaz wydatki');

      expect(result.intent).toBe('list');
    });

    test('rozpoznaje intent count', async () => {
      const mockResponse = {
        intent: 'count',
        shops: { include: ['Biedronka'] },
        confidence: 0.85,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('ile razy bylem w biedronce');

      expect(result.intent).toBe('count');
      expect(result.shops?.include).toContain('Biedronka');
    });

    test('rozpoznaje intent average', async () => {
      const mockResponse = {
        intent: 'average',
        categories: { include: ['Restauracje'] },
        confidence: 0.88,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('srednia w restauracjach');

      expect(result.intent).toBe('average');
    });

    test('rozpoznaje intent top', async () => {
      const mockResponse = {
        intent: 'top',
        aggregation: {
          groupBy: 'category',
          limit: 5,
          orderBy: 'amount',
          orderDirection: 'desc',
        },
        confidence: 0.92,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('top 5 kategorii');

      expect(result.intent).toBe('top');
      expect(result.aggregation?.groupBy).toBe('category');
      expect(result.aggregation?.limit).toBe(5);
    });
  });

  describe('parseQuery - dateRange', () => {
    test('parsuje dateRange absolute', async () => {
      const mockResponse = {
        intent: 'list',
        dateRange: {
          type: 'absolute',
          start: '2024-12-01',
          end: '2024-12-15',
          description: 'od 1 do 15 grudnia',
        },
        confidence: 0.9,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('wydatki od 1 do 15 grudnia');

      expect(result.dateRange?.type).toBe('absolute');
      expect(result.dateRange?.start).toBe('2024-12-01');
      expect(result.dateRange?.end).toBe('2024-12-15');
    });

    test('parsuje dateRange relative', async () => {
      const mockResponse = {
        intent: 'list',
        dateRange: {
          type: 'relative',
          relativeUnit: 'days',
          relativeValue: 7,
          description: 'ostatnie 7 dni',
        },
        confidence: 0.88,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('wydatki z ostatnich 7 dni');

      expect(result.dateRange?.type).toBe('relative');
      expect(result.dateRange?.relativeUnit).toBe('days');
      expect(result.dateRange?.relativeValue).toBe(7);
    });

    test('parsuje konkretny miesiac', async () => {
      const mockResponse = {
        intent: 'sum',
        dateRange: {
          type: 'absolute',
          start: '2024-11-01',
          end: '2024-11-30',
          description: 'listopad',
        },
        confidence: 0.95,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('ile wydalem w listopadzie');

      expect(result.dateRange?.start).toBe('2024-11-01');
      expect(result.dateRange?.end).toBe('2024-11-30');
    });
  });

  describe('parseQuery - categories', () => {
    test('parsuje include categories', async () => {
      const mockResponse = {
        intent: 'list',
        categories: {
          include: ['Zakupy spozywcze'],
        },
        confidence: 0.9,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('wydatki na jedzenie');

      expect(result.categories?.include).toContain('Zakupy spozywcze');
    });

    test('parsuje exclude categories', async () => {
      const mockResponse = {
        intent: 'sum',
        categories: {
          exclude: ['Elektronika'],
        },
        confidence: 0.88,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('suma bez elektroniki');

      expect(result.categories?.exclude).toContain('Elektronika');
    });

    test('parsuje wiele exclude categories', async () => {
      const mockResponse = {
        intent: 'sum',
        categories: {
          exclude: ['Elektronika', 'Restauracje'],
        },
        confidence: 0.85,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('suma bez elektroniki i restauracji');

      expect(result.categories?.exclude).toHaveLength(2);
      expect(result.categories?.exclude).toContain('Elektronika');
      expect(result.categories?.exclude).toContain('Restauracje');
    });

    test('filtruje nieznane kategorie', async () => {
      const mockResponse = {
        intent: 'list',
        categories: {
          include: ['Zakupy spozywcze', 'NieistniejacaKategoria'],
        },
        confidence: 0.8,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('test');

      // Should only include valid categories
      expect(result.categories?.include).toContain('Zakupy spozywcze');
      expect(result.categories?.include).not.toContain('NieistniejacaKategoria');
    });
  });

  describe('parseQuery - shops', () => {
    test('parsuje include shops', async () => {
      const mockResponse = {
        intent: 'list',
        shops: {
          include: ['Biedronka'],
        },
        confidence: 0.92,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('wydatki w biedronce');

      expect(result.shops?.include).toContain('Biedronka');
    });

    test('parsuje exclude shops', async () => {
      const mockResponse = {
        intent: 'sum',
        shops: {
          exclude: ['Zabka'],
        },
        confidence: 0.85,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('suma bez zabki');

      expect(result.shops?.exclude).toContain('Zabka');
    });

    test('parsuje wiele sklepow', async () => {
      const mockResponse = {
        intent: 'list',
        shops: {
          include: ['Biedronka', 'Lidl'],
        },
        confidence: 0.88,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('wydatki w biedronce i lidlu');

      expect(result.shops?.include).toHaveLength(2);
    });
  });

  describe('parseQuery - amountFilter', () => {
    test('parsuje min amount', async () => {
      const mockResponse = {
        intent: 'list',
        amountFilter: {
          min: 50,
        },
        confidence: 0.9,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('wydatki powyzej 50 zl');

      expect(result.amountFilter?.min).toBe(50);
    });

    test('parsuje max amount', async () => {
      const mockResponse = {
        intent: 'list',
        amountFilter: {
          max: 100,
        },
        confidence: 0.88,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('wydatki ponizej 100 zl');

      expect(result.amountFilter?.max).toBe(100);
    });

    test('parsuje zakres amount', async () => {
      const mockResponse = {
        intent: 'list',
        amountFilter: {
          min: 20,
          max: 50,
        },
        confidence: 0.85,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('wydatki miedzy 20 a 50 zl');

      expect(result.amountFilter?.min).toBe(20);
      expect(result.amountFilter?.max).toBe(50);
    });

    test('parsuje exact amount', async () => {
      const mockResponse = {
        intent: 'list',
        amountFilter: {
          exact: 25,
        },
        confidence: 0.8,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('wydatki dokladnie 25 zl');

      expect(result.amountFilter?.exact).toBe(25);
    });
  });

  describe('parseQuery - aggregation', () => {
    test('parsuje groupBy category', async () => {
      const mockResponse = {
        intent: 'list',
        aggregation: {
          groupBy: 'category',
        },
        confidence: 0.88,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('pogrupuj po kategoriach');

      expect(result.aggregation?.groupBy).toBe('category');
    });

    test('parsuje groupBy shop', async () => {
      const mockResponse = {
        intent: 'list',
        aggregation: {
          groupBy: 'shop',
        },
        confidence: 0.85,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('po sklepach');

      expect(result.aggregation?.groupBy).toBe('shop');
    });

    test('parsuje top N z limitem', async () => {
      const mockResponse = {
        intent: 'top',
        aggregation: {
          groupBy: 'shop',
          limit: 10,
          orderBy: 'amount',
          orderDirection: 'desc',
        },
        confidence: 0.92,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('top 10 sklepow');

      expect(result.aggregation?.limit).toBe(10);
      expect(result.aggregation?.orderDirection).toBe('desc');
    });
  });

  describe('parseQuery - complex queries', () => {
    test('parsuje zlozony query z wieloma filtrami', async () => {
      const mockResponse = {
        intent: 'sum',
        dateRange: {
          type: 'absolute',
          start: '2024-12-01',
          end: '2024-12-31',
          description: 'grudzien',
        },
        categories: {
          exclude: ['Elektronika'],
        },
        shops: {
          include: ['Biedronka'],
        },
        amountFilter: {
          min: 50,
        },
        confidence: 0.82,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery(
        'suma w biedronce w grudniu bez elektroniki powyzej 50 zl'
      );

      expect(result.intent).toBe('sum');
      expect(result.dateRange?.start).toBe('2024-12-01');
      expect(result.categories?.exclude).toContain('Elektronika');
      expect(result.shops?.include).toContain('Biedronka');
      expect(result.amountFilter?.min).toBe(50);
    });
  });

  describe('parseQuery - error handling', () => {
    test('uzywa fallback model gdy primary zawiedzie', async () => {
      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount <= 3) {
          return Promise.resolve(new Response('Error', { status: 500 }));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      intent: 'list',
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

      // Fail primary 3 times
      for (let i = 0; i < 3; i++) {
        await service.parseQuery('test');
      }

      // Next call uses fallback
      const result = await service.parseQuery('test');
      expect(result.intent).toBe('list');
    });

    test('zwraca default query gdy oba modele zawioda', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response('Error', { status: 500 }))
      );

      // Trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        await service.parseQuery('test');
      }

      // Both fail - should return default
      const result = await service.parseQuery('test query');

      expect(result.intent).toBe('list');
      expect(result.confidence).toBe(0.3);
      expect(result.originalQuery).toBe('test query');
      expect(result.dateRange?.description).toBe('biezacy miesiac');
    });

    test('zwraca default query dla niepoprawnego JSON', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: 'invalid json response' } }],
            }),
            { status: 200 }
          )
        )
      );

      const result = await service.parseQuery('test');

      expect(result.intent).toBe('list');
      expect(result.confidence).toBe(0.3);
    });
  });

  describe('parseQuery - response parsing', () => {
    test('parsuje JSON z markdown code blocks', async () => {
      const mockContent =
        '```json\n{"intent": "sum", "confidence": 0.9}\n```';

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

      const result = await service.parseQuery('ile wydalem');

      expect(result.intent).toBe('sum');
    });

    test('parsuje JSON z dodatkowym tekstem', async () => {
      const mockContent =
        'Here is the analysis: {"intent": "list", "confidence": 0.85} end';

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

      const result = await service.parseQuery('pokaz wydatki');

      expect(result.intent).toBe('list');
    });

    test('domyslny intent to list gdy brak', async () => {
      const mockResponse = {
        confidence: 0.8,
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('cos');

      expect(result.intent).toBe('list');
    });

    test('domyslna confidence 0.5 gdy brak', async () => {
      const mockResponse = {
        intent: 'sum',
      };

      mockFetchWith(createOpenRouterResponse(mockResponse));

      const result = await service.parseQuery('suma');

      expect(result.confidence).toBe(0.5);
    });
  });

  describe('getCircuitBreakerState', () => {
    test('zwraca stan closed na poczatku', () => {
      const state = service.getCircuitBreakerState();
      expect(state.state).toBe('closed');
    });

    test('otwiera circuit po przekroczeniu threshold', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response('Error', { status: 500 }))
      );

      for (let i = 0; i < 3; i++) {
        await service.parseQuery('test');
      }

      const state = service.getCircuitBreakerState();
      expect(state.state).toBe('open');
    });
  });
});
