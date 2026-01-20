/**
 * Pricing module for cost calculation.
 *
 * Provides types and functions for calculating LLM usage costs
 * based on token counts and model pricing.
 *
 * @example
 * ```typescript
 * import {
 *   configurePricing,
 *   calculateCost,
 *   calculateCostFromUsage,
 * } from '@agtlantis/core';
 *
 * // Configure custom pricing (optional)
 * configurePricing({
 *   providers: {
 *     google: {
 *       'gemini-2.5-flash': { inputPricePerMillion: 0.5, outputPricePerMillion: 3.0 },
 *     },
 *   },
 * });
 *
 * // Calculate cost from token counts
 * const cost = calculateCost({
 *   inputTokens: 1000,
 *   outputTokens: 500,
 *   model: 'gemini-2.5-flash',
 *   provider: 'google',
 * });
 * ```
 *
 * @module pricing
 */

// Types
export type {
  ProviderType,
  ModelPricing,
  ProviderPricing,
  PricingConfig,
  CalculateCostParams,
  CostResult,
} from './types';

// Configuration
export {
  configurePricing,
  getPricingConfig,
  resetPricingConfig,
  getEffectivePricing,
  type PricingSource,
  type EffectivePricingResult,
} from './config';

// Validation
export {
  validateModelPricing,
  validateProviderPricing,
  validatePricingConfig,
} from './validator';

// Calculation
export {
  getModelPricing,
  calculateCost,
  calculateCostFromUsage,
  calculateTotalCost,
} from './calculator';

// Defaults (for reference/inspection)
export {
  OPENAI_PRICING,
  GOOGLE_PRICING,
  ANTHROPIC_PRICING,
  DEFAULT_PRICING_CONFIG,
  DEFAULT_FALLBACK_PRICING,
} from './defaults';
