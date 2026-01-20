/**
 * Global pricing configuration.
 *
 * Priority order (highest to lowest):
 * 1. Provider.withPricing() - per-provider override
 * 2. configurePricing() - global override
 * 3. Built-in defaults (defaults.ts)
 * 4. Fallback pricing
 *
 * @module pricing/config
 */

import type { ModelPricing, PricingConfig, ProviderType } from './types';
import { validatePricingConfig } from './validator';
import { DEFAULT_PRICING_CONFIG, DEFAULT_FALLBACK_PRICING } from './defaults';

let globalConfig: PricingConfig | undefined;

/**
 * Configure global pricing overrides.
 *
 * WARNING: This uses global mutable state and is not thread-safe.
 * For multi-tenant scenarios or concurrent requests with different pricing,
 * use `Provider.withPricing()` instead for proper isolation.
 *
 * @example
 * ```typescript
 * configurePricing({
 *   providers: {
 *     google: {
 *       'gemini-2.5-flash': { inputPricePerMillion: 0.5, outputPricePerMillion: 3.0 },
 *     },
 *   },
 * });
 *
 * // Reset to built-in defaults
 * configurePricing(undefined);
 * ```
 */
export function configurePricing(config: PricingConfig | undefined): void {
  if (config) {
    validatePricingConfig(config);
  }
  globalConfig = config;
}

export function getPricingConfig(): PricingConfig | undefined {
  return globalConfig;
}

/**
 * Reset global pricing configuration.
 * Useful for testing to ensure clean state between tests.
 */
export function resetPricingConfig(): void {
  globalConfig = undefined;
}

export type PricingSource = 'global' | 'default' | 'fallback';

export interface EffectivePricingResult {
  pricing: ModelPricing;
  source: PricingSource;
}

/**
 * Get effective pricing for a model with source information.
 * Useful for debugging to understand which pricing layer is applied.
 *
 * @example
 * ```typescript
 * const result = getEffectivePricing('gemini-2.5-flash', 'google');
 * console.log(result.source); // 'default' (using built-in pricing)
 *
 * configurePricing({ providers: { google: { 'gemini-2.5-flash': {...} } } });
 * const result2 = getEffectivePricing('gemini-2.5-flash', 'google');
 * console.log(result2.source); // 'global' (using configured override)
 * ```
 */
export function getEffectivePricing(
  model: string,
  provider: ProviderType
): EffectivePricingResult {
  if (globalConfig?.providers?.[provider]?.[model]) {
    return {
      pricing: globalConfig.providers[provider]![model],
      source: 'global',
    };
  }

  const defaultPricing = DEFAULT_PRICING_CONFIG.providers[provider];
  if (defaultPricing?.[model]) {
    return {
      pricing: defaultPricing[model],
      source: 'default',
    };
  }

  return {
    pricing:
      globalConfig?.fallback ??
      DEFAULT_PRICING_CONFIG.fallback ??
      DEFAULT_FALLBACK_PRICING,
    source: 'fallback',
  };
}
