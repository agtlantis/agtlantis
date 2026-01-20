/**
 * Pricing validation utilities.
 *
 * Provides fail-fast validation for pricing configuration to catch
 * invalid values (negative, NaN, Infinity) at configuration time.
 *
 * @module pricing/validator
 */

import type { ModelPricing, PricingConfig, ProviderPricing } from './types';

function validatePriceValue(
  value: number,
  fieldName: string,
  context: string
): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${context}: ${fieldName} must be a finite number`);
  }
  if (value < 0) {
    throw new Error(`${context}: ${fieldName} cannot be negative`);
  }
}

/**
 * Validates a ModelPricing object.
 * Ensures all price values are non-negative and finite.
 *
 * @throws {Error} If any price value is invalid
 *
 * @example
 * ```typescript
 * validateModelPricing(
 *   { inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 },
 *   'openai/gpt-4o'
 * );
 * ```
 */
export function validateModelPricing(
  pricing: ModelPricing,
  context: string
): void {
  validatePriceValue(
    pricing.inputPricePerMillion,
    'inputPricePerMillion',
    context
  );
  validatePriceValue(
    pricing.outputPricePerMillion,
    'outputPricePerMillion',
    context
  );

  if (pricing.cachedInputPricePerMillion !== undefined) {
    validatePriceValue(
      pricing.cachedInputPricePerMillion,
      'cachedInputPricePerMillion',
      context
    );
  }
}

/**
 * Validates a ProviderPricing object.
 *
 * @throws {Error} If any model pricing is invalid
 *
 * @example
 * ```typescript
 * validateProviderPricing({
 *   'gemini-2.5-flash': { inputPricePerMillion: 0.3, outputPricePerMillion: 2.5 },
 *   'gemini-2.5-pro': { inputPricePerMillion: 1.25, outputPricePerMillion: 10.0 },
 * }, 'google');
 * ```
 */
export function validateProviderPricing(
  pricing: ProviderPricing,
  providerContext?: string
): void {
  for (const [model, modelPricing] of Object.entries(pricing)) {
    const context = providerContext ? `${providerContext}/${model}` : model;
    validateModelPricing(modelPricing, context);
  }
}

/**
 * Validates a PricingConfig object.
 *
 * @throws {Error} If any pricing configuration is invalid
 *
 * @example
 * ```typescript
 * validatePricingConfig({
 *   providers: {
 *     google: { 'gemini-2.5-flash': { inputPricePerMillion: 0.3, outputPricePerMillion: 2.5 } },
 *   },
 *   fallback: { inputPricePerMillion: 1.0, outputPricePerMillion: 5.0 },
 * });
 * ```
 */
export function validatePricingConfig(config: PricingConfig): void {
  if (config.providers) {
    for (const [providerKey, pricing] of Object.entries(config.providers)) {
      if (pricing) {
        validateProviderPricing(pricing, providerKey);
      }
    }
  }

  if (config.fallback) {
    validateModelPricing(config.fallback, 'fallback');
  }
}
