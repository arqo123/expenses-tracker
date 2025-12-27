import { envSchema, featureFlagsSchema, type Env, type FeatureFlags, type AppConfig } from './types.ts';

let cachedConfig: AppConfig | null = null;
let initialized = false;

/**
 * Initialize configuration at startup.
 * MUST be called before any other config access.
 * Throws on validation failure (fail-fast).
 */
export function initConfig(): AppConfig {
  if (initialized && cachedConfig) {
    return cachedConfig;
  }

  // Validate environment variables
  const envResult = envSchema.safeParse(process.env);
  if (!envResult.success) {
    console.error('=== CONFIGURATION ERROR ===');
    console.error('Required environment variables are missing or invalid:');

    const formatted = envResult.error.format();
    for (const [key, value] of Object.entries(formatted)) {
      if (key !== '_errors' && typeof value === 'object' && value !== null && '_errors' in value) {
        const errors = (value as { _errors: string[] })._errors;
        if (errors.length > 0) {
          console.error(`  - ${key}: ${errors.join(', ')}`);
        }
      }
    }

    console.error('===========================');
    process.exit(1);
  }

  // Validate feature flags
  const featuresResult = featureFlagsSchema.safeParse(process.env);
  if (!featuresResult.success) {
    console.error('=== FEATURE FLAGS ERROR ===');
    console.error(featuresResult.error.format());
    console.error('===========================');
    process.exit(1);
  }

  cachedConfig = {
    env: envResult.data,
    features: featuresResult.data,
  };

  initialized = true;

  // Log loaded configuration (without secrets)
  console.log('[Config] Loaded successfully');
  console.log(`[Config] Environment: ${cachedConfig.env.NODE_ENV}`);
  console.log(`[Config] Features enabled: ${Object.entries(cachedConfig.features)
    .filter(([_, v]) => v === true)
    .map(([k]) => k.replace('FEATURE_', ''))
    .join(', ') || 'none'}`);

  return cachedConfig;
}

/**
 * Get environment configuration.
 * Throws if initConfig() was not called.
 */
export function getEnv(): Env {
  if (!initialized || !cachedConfig) {
    throw new Error('Config not initialized. Call initConfig() at app startup.');
  }
  return cachedConfig.env;
}

/**
 * Get feature flags.
 * Throws if initConfig() was not called.
 */
export function getFeatures(): FeatureFlags {
  if (!initialized || !cachedConfig) {
    throw new Error('Config not initialized. Call initConfig() at app startup.');
  }
  return cachedConfig.features;
}

/**
 * Get full app config.
 */
export function getConfig(): AppConfig {
  if (!initialized || !cachedConfig) {
    throw new Error('Config not initialized. Call initConfig() at app startup.');
  }
  return cachedConfig;
}

/**
 * Check if a specific feature is enabled.
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return getFeatures()[feature] === true;
}

/**
 * Helper to get database URL.
 */
export function getDatabaseUrl(): string {
  const env = getEnv();
  if (env.DATABASE_URL) return env.DATABASE_URL;
  return `postgres://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DATABASE}`;
}

/**
 * Check if running in development mode.
 */
export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

/**
 * Check if running in production mode.
 */
export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}
