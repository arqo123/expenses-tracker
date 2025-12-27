import { isFeatureEnabled } from './env.ts';

/**
 * Feature flag helper with descriptive methods.
 * Provides semantic access to features.
 */
export const Features = {
  /** Shopping list feature (add items, view list, check off) */
  shoppingList: (): boolean => isFeatureEnabled('FEATURE_SHOPPING_LIST'),

  /** Voice message transcription via Whisper */
  voiceMessages: (): boolean => isFeatureEnabled('FEATURE_VOICE_MESSAGES'),

  /** Auto-match manual expenses with scanned receipts */
  receiptMatching: (): boolean => isFeatureEnabled('FEATURE_RECEIPT_MATCHING'),

  /** Natural language query API */
  nlpQuery: (): boolean => isFeatureEnabled('FEATURE_NLP_QUERY'),

  /** Debug/test endpoints (/test/*) */
  debugEndpoints: (): boolean => isFeatureEnabled('FEATURE_DEBUG_ENDPOINTS'),

  /** Product learning (remember category corrections) */
  productLearning: (): boolean => isFeatureEnabled('FEATURE_PRODUCT_LEARNING'),
} as const;

export type FeatureName = keyof typeof Features;
