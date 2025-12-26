import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().optional(),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.string().default('5432').transform(Number),
  POSTGRES_DATABASE: z.string().default('expense_tracker'),
  POSTGRES_USER: z.string().default('test'),
  POSTGRES_PASSWORD: z.string().default('test'),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string(),
  TELEGRAM_BOT_TOKEN_DEV: z.string().optional(),
  ALLOWED_CHAT_IDS: z.string().default('').transform(s => s.split(',').filter(Boolean)),

  // AI APIs
  OPENROUTER_API_KEY: z.string(),
  GROQ_API_KEY: z.string().optional(),

  // AI Models
  AI_PRIMARY_MODEL: z.string().default('mistralai/mistral-small-3.2-24b-instruct'),
  AI_FALLBACK_MODEL: z.string().default('google/gemini-2.5-flash-preview-09-2025'),
  AI_VISION_MODEL: z.string().default('google/gemini-2.5-flash-preview-09-2025'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment validation failed:');
    console.error(result.error.format());
    throw new Error('Invalid environment configuration');
  }

  cachedEnv = result.data;
  return cachedEnv;
}

// Helper to get database URL
export function getDatabaseUrl(): string {
  const env = getEnv();
  if (env.DATABASE_URL) return env.DATABASE_URL;
  return `postgres://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DATABASE}`;
}
