import { z } from 'zod';

// ============================================================
// Environment Schema
// ============================================================
// Supported languages
export const SUPPORTED_LANGUAGES = ['pl', 'en', 'de'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Language
  LANGUAGE: z.enum(SUPPORTED_LANGUAGES).default('pl'),

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

  // Security
  API_KEYS: z.string().default('').transform(s => s.split(',').filter(Boolean)),
  ALLOWED_USERS: z.string().default('Arek,Nastka').transform(s => s.split(',').filter(Boolean)),
  CORS_ORIGINS: z.string().default('').transform(s => s.split(',').filter(Boolean)),

  // Telegram webhook secret (set via setWebhook secret_token parameter)
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

// ============================================================
// Feature Flags Schema
// ============================================================
export const featureFlagsSchema = z.object({
  // Shopping list feature (add items, view list, check off)
  FEATURE_SHOPPING_LIST: z.string().default('true').transform(s => s === 'true'),

  // Voice message transcription via Whisper
  FEATURE_VOICE_MESSAGES: z.string().default('true').transform(s => s === 'true'),

  // Auto-match manual expenses with scanned receipts
  FEATURE_RECEIPT_MATCHING: z.string().default('true').transform(s => s === 'true'),

  // Natural language query API
  FEATURE_NLP_QUERY: z.string().default('true').transform(s => s === 'true'),

  // Debug/test endpoints (/test/*)
  FEATURE_DEBUG_ENDPOINTS: z.string().default('false').transform(s => s === 'true'),

  // Product learning (remember category corrections)
  FEATURE_PRODUCT_LEARNING: z.string().default('true').transform(s => s === 'true'),
});

export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

// ============================================================
// Combined App Config
// ============================================================
export interface AppConfig {
  env: Env;
  features: FeatureFlags;
}
