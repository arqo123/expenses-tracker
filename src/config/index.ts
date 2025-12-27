// Main config exports
export {
  initConfig,
  getEnv,
  getFeatures,
  getConfig,
  isFeatureEnabled,
  getDatabaseUrl,
  isDevelopment,
  isProduction,
} from './env.ts';

export { Features } from './features.ts';

export type { Env, FeatureFlags, AppConfig, SupportedLanguage } from './types.ts';
export { SUPPORTED_LANGUAGES } from './types.ts';
