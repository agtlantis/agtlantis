/**
 * Cost calculation functions.
 *
 * @module pricing/calculator
 *
 * NOTE: Cost calculations use standard JavaScript floating-point arithmetic.
 * For high-volume usage tracking, accumulated totals may have minor precision drift.
 * For financial reporting, consider rounding results to appropriate decimal places
 * (e.g., `Math.round(cost * 100) / 100` for cents).
 */

import type { LanguageModelUsage } from 'ai';
import type {
  CalculateCostParams,
  CostResult,
  ModelPricing,
  ProviderPricing,
  ProviderType,
} from './types';
import { DEFAULT_PRICING_CONFIG, DEFAULT_FALLBACK_PRICING } from './defaults';
import { getPricingConfig } from './config';

const TOKENS_PER_MILLION = 1_000_000;

/**
 * Get pricing for a specific model.
 *
 * Resolution order:
 * 1. Provider-level config (providerPricing param)
 * 2. Global config (configurePricing)
 * 3. Built-in defaults
 * 4. Fallback pricing
 */
export function getModelPricing(
  model: string,
  provider: ProviderType,
  providerPricing?: ProviderPricing
): ModelPricing {
  if (providerPricing?.[model]) {
    return providerPricing[model];
  }

  const globalConfig = getPricingConfig();
  if (globalConfig?.providers?.[provider]?.[model]) {
    return globalConfig.providers[provider][model];
  }

  const defaultProviderPricing = DEFAULT_PRICING_CONFIG.providers[provider];
  if (defaultProviderPricing?.[model]) {
    return defaultProviderPricing[model];
  }

  return (
    globalConfig?.fallback ??
    DEFAULT_PRICING_CONFIG.fallback ??
    DEFAULT_FALLBACK_PRICING
  );
}

function validateCostParams(params: CalculateCostParams): void {
  const { inputTokens, outputTokens, cachedInputTokens = 0 } = params;

  if (inputTokens < 0 || outputTokens < 0 || cachedInputTokens < 0) {
    throw new Error('Token counts must be non-negative');
  }

  if (cachedInputTokens > inputTokens) {
    throw new Error('cachedInputTokens cannot exceed inputTokens');
  }

  if (
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(outputTokens) ||
    !Number.isFinite(cachedInputTokens)
  ) {
    throw new Error('Token counts must be finite numbers');
  }
}

/**
 * Calculate cost from token counts.
 *
 * @throws Error if token counts are negative, non-finite, or if cachedInputTokens > inputTokens
 *
 * @example
 * ```typescript
 * const cost = calculateCost({
 *   inputTokens: 1000,
 *   outputTokens: 500,
 *   cachedInputTokens: 200,
 *   model: 'gemini-2.5-flash',
 *   provider: 'google',
 * });
 * console.log(cost.total); // 0.000315
 * ```
 */
export function calculateCost(
  params: CalculateCostParams,
  providerPricing?: ProviderPricing
): CostResult {
  validateCostParams(params);

  const {
    inputTokens,
    outputTokens,
    cachedInputTokens = 0,
    model,
    provider,
  } = params;

  const pricing = getModelPricing(model, provider, providerPricing);

  const nonCachedInputTokens = inputTokens - cachedInputTokens;
  const inputCost =
    (nonCachedInputTokens / TOKENS_PER_MILLION) * pricing.inputPricePerMillion;
  const outputCost =
    (outputTokens / TOKENS_PER_MILLION) * pricing.outputPricePerMillion;

  const cachedInputPricePerMillion =
    pricing.cachedInputPricePerMillion ?? pricing.inputPricePerMillion;
  const cachedInputCost =
    (cachedInputTokens / TOKENS_PER_MILLION) * cachedInputPricePerMillion;

  return {
    total: inputCost + outputCost + cachedInputCost,
    inputCost,
    outputCost,
    cachedInputCost,
  };
}

/**
 * Calculate cost from AI SDK LanguageModelUsage.
 *
 * Convenience function that extracts token counts from the
 * AI SDK's LanguageModelUsage type and calculates the cost.
 *
 * @example
 * ```typescript
 * const usage = await result.usage;
 * const cost = calculateCostFromUsage(usage, 'gemini-2.5-flash', 'google');
 * ```
 */
export function calculateCostFromUsage(
  usage: LanguageModelUsage,
  model: string,
  provider: ProviderType,
  providerPricing?: ProviderPricing
): CostResult {
  return calculateCost(
    {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
      model,
      provider,
    },
    providerPricing
  );
}

/**
 * Calculate total cost for multiple LLM calls.
 *
 * Aggregates costs from multiple calls, grouping by model.
 *
 * @returns Object with:
 *   - `totalCost`: Sum of all call costs in USD
 *   - `costByModel`: Map where key format is `${provider}/${model}`
 */
export function calculateTotalCost(
  calls: Array<{
    usage: LanguageModelUsage;
    model: string;
    provider: ProviderType;
  }>,
  providerPricing?: ProviderPricing
): { totalCost: number; costByModel: Record<string, number> } {
  const costByModel: Record<string, number> = {};
  let totalCost = 0;

  for (const call of calls) {
    const cost = calculateCostFromUsage(
      call.usage,
      call.model,
      call.provider,
      providerPricing
    );
    totalCost += cost.total;

    const key = `${call.provider}/${call.model}`;
    costByModel[key] = (costByModel[key] ?? 0) + cost.total;
  }

  return { totalCost, costByModel };
}
