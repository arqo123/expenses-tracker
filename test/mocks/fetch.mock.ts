/**
 * Fetch mock utilities for testing AI services
 */
import { mock } from 'bun:test';

/**
 * Mock globalThis.fetch with a map of URL -> Response
 */
export function mockFetch(responses: Map<string, Response>): void {
  globalThis.fetch = mock((input: string | URL | Request) => {
    const urlStr = input instanceof Request ? input.url : input.toString();

    // Find matching response (partial URL match)
    for (const [pattern, response] of responses) {
      if (urlStr.includes(pattern)) {
        return Promise.resolve(response.clone());
      }
    }

    return Promise.reject(new Error(`Unmocked URL: ${urlStr}`));
  }) as typeof fetch;
}

/**
 * Mock fetch to always return a specific response
 */
export function mockFetchWith(response: Response): void {
  globalThis.fetch = mock(() => Promise.resolve(response.clone())) as typeof fetch;
}

/**
 * Mock fetch to always fail
 */
export function mockFetchError(error: Error): void {
  globalThis.fetch = mock(() => Promise.reject(error)) as typeof fetch;
}

/**
 * Create an OpenRouter API response
 */
export function createOpenRouterResponse(content: object | object[]): Response {
  return new Response(
    JSON.stringify({
      id: 'test-id',
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify(content),
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create an OpenRouter API response with markdown code blocks
 */
export function createOpenRouterResponseWithMarkdown(content: object): Response {
  return new Response(
    JSON.stringify({
      id: 'test-id',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '```json\n' + JSON.stringify(content) + '\n```',
          },
          finish_reason: 'stop',
        },
      ],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create a Groq Whisper API response
 */
export function createGroqWhisperResponse(text: string): Response {
  return new Response(
    JSON.stringify({ text }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create an error response
 */
export function createErrorResponse(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: { message } }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Restore original fetch
 */
let originalFetch: typeof fetch | null = null;

export function saveFetch(): void {
  originalFetch = globalThis.fetch;
}

export function restoreFetch(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
}
