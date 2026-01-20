/**
 * Pricing types for cost calculation.
 *
 * @module pricing/types
 */

/**
 * AI provider type identifier.
 *
 * Common values: 'google', 'openai', 'anthropic', 'mock'
 * Extensible to support custom providers.
 */
export type ProviderType = string;

/**
 * Pricing for a specific model in USD per million tokens.
 *
 * @example
 * ```typescript
 * const gpt4Pricing: ModelPricing = {
 *   inputPricePerMillion: 2.5,
 *   outputPricePerMillion: 10.0,
 *   cachedInputPricePerMillion: 1.25, // 50% discount for cached tokens
 * };
 * ```
 */
export interface ModelPricing {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  /** Defaults to inputPricePerMillion if not set */
  cachedInputPricePerMillion?: number;
}

/**
 * Pricing map for a provider's models.
 *
 * @example
 * ```typescript
 * const googlePricing: ProviderPricing = {
 *   'gemini-2.5-flash': { inputPricePerMillion: 0.3, outputPricePerMillion: 2.5 },
 *   'gemini-2.5-pro': { inputPricePerMillion: 1.25, outputPricePerMillion: 10.0 },
 * };
 * ```
 */
export type ProviderPricing = Record<string, ModelPricing>;

/**
 * Global pricing configuration.
 *
 * Allows overriding built-in pricing defaults for any provider/model.
 * Used with `configurePricing()` for global overrides or
 * `Provider.withPricing()` for provider-level overrides.
 *
 * @example
 * ```typescript
 * const config: PricingConfig = {
 *   providers: {
 *     google: {
 *       'gemini-2.5-flash': { inputPricePerMillion: 0.5, outputPricePerMillion: 3.0 },
 *     },
 *   },
 *   fallback: {
 *     inputPricePerMillion: 1.0,
 *     outputPricePerMillion: 5.0,
 *   },
 * };
 * ```
 */
export interface PricingConfig {
  providers?: Partial<Record<ProviderType, ProviderPricing>>;
  fallback?: ModelPricing;
}

/**
 * Parameters for cost calculation.
 */
export interface CalculateCostParams {
  /**
   * Total input tokens INCLUDING cached tokens.
   * The cost calculator subtracts cachedInputTokens to get non-cached tokens.
   */
  inputTokens: number;
  outputTokens: number;
  /**
   * Cached input tokens count (optional).
   * Must be <= inputTokens. Cached tokens are billed at a lower rate.
   */
  cachedInputTokens?: number;
  model: string;
  provider: ProviderType;
}

/**
 * Result of cost calculation.
 */
export interface CostResult {
  total: number;
  inputCost: number;
  outputCost: number;
  cachedInputCost: number;
}
