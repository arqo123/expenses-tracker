/**
 * Test environment setup for Bun test
 * Auto-loaded via bunfig.toml preload
 */

// Suppress console output in tests
const originalConsole = { ...console };

export function suppressConsole(): void {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

export function restoreConsole(): void {
  Object.assign(console, originalConsole);
}

// Set test environment variables
export function setupTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  process.env.GROQ_API_KEY = 'test-groq-key';
  process.env.POSTGRES_HOST = 'localhost';
  process.env.POSTGRES_PORT = '5432';
  process.env.POSTGRES_DATABASE = 'test_db';
  process.env.POSTGRES_USER = 'test';
  process.env.POSTGRES_PASSWORD = 'test';
  process.env.ALLOWED_CHAT_IDS = '123,456';
}

// Auto-setup on import
setupTestEnv();
suppressConsole();
