# Pricing API Reference

> Complete API documentation for the Pricing module.

## Overview

The Pricing module provides types and functions for calculating LLM usage costs based on token counts and model pricing. It includes built-in pricing tables for OpenAI, Google, and Anthropic models, with support for custom pricing configuration.

## Import

```typescript
import {
  // Types
  type ProviderType,
  type ModelPricing,
  type ProviderPricing,
  type PricingConfig,
  type CalculateCostParams,
  type CostResult,
  type PricingSource,
  type EffectivePricingResult,

  // Calculation functions
  calculateCost,
  calculateCostFromUsage,
  calculateTotalCost,
  getModelPricing,

  // Configuration functions
  configurePricing,
  getPricingConfig,
  resetPricingConfig,
  getEffectivePricing,

  // Validation functions
  validateModelPricing,
  validateProviderPricing,
  validatePricingConfig,

  // Default pricing tables
  OPENAI_PRICING,
  GOOGLE_PRICING,
  ANTHROPIC_PRICING,
  DEFAULT_PRICING_CONFIG,
  DEFAULT_FALLBACK_PRICING,
} from '@agtlantis/core';
```

## Types

### ProviderType

AI provider type identifier.

```typescript
type ProviderType = string;
```

Common values: `'google'`, `'openai'`, `'anthropic'`, `'mock'`

Extensible to support custom providers.

### ModelPricing

Pricing for a specific model in USD per million tokens.

```typescript
interface ModelPricing {
  /** Price per million input tokens */
  inputPricePerMillion: number;
  /** Price per million output tokens */
  outputPricePerMillion: number;
  /** Price per million cached input tokens (optional, defaults to inputPricePerMillion if not set) */
  cachedInputPricePerMillion?: number;
}
```

**Example:**

```typescript
const gpt4oPricing: ModelPricing = {
  inputPricePerMillion: 2.5,
  outputPricePerMillion: 10.0,
};

const geminiFlashPricing: ModelPricing = {
  inputPricePerMillion: 0.15,
  outputPricePerMillion: 0.6,
  cachedInputPricePerMillion: 0.0375, // 75% discount for cached tokens
};
```

### ProviderPricing

Pricing map for a provider's models. Maps model IDs to their pricing.

```typescript
type ProviderPricing = Record<string, ModelPricing>;
```

**Example:**

```typescript
const myGooglePricing: ProviderPricing = {
  'gemini-2.5-flash': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
  'gemini-2.5-pro': { inputPricePerMillion: 1.25, outputPricePerMillion: 10.0 },
};
```

### PricingConfig

Global pricing configuration. Allows overriding built-in pricing defaults for any provider/model.

```typescript
interface PricingConfig {
  /** Provider-specific pricing overrides (keyed by provider type) */
  providers?: Partial<Record<ProviderType, ProviderPricing>>;
  /** Fallback pricing for unknown models */
  fallback?: ModelPricing;
}
```

**Example:**

```typescript
const config: PricingConfig = {
  providers: {
    google: {
      'gemini-2.5-flash': { inputPricePerMillion: 0.20, outputPricePerMillion: 0.80 },
    },
    openai: {
      'gpt-4o': { inputPricePerMillion: 3.0, outputPricePerMillion: 12.0 },
    },
  },
  fallback: {
    inputPricePerMillion: 1.0,
    outputPricePerMillion: 5.0,
  },
};
```

### CalculateCostParams

Parameters for cost calculation.

```typescript
interface CalculateCostParams {
  /**
   * Total input tokens INCLUDING cached tokens.
   * Note: This is the TOTAL count. The cost calculator will subtract
   * cachedInputTokens to get non-cached tokens for pricing.
   */
  inputTokens: number;
  /** Output tokens count */
  outputTokens: number;
  /**
   * Cached input tokens count (optional).
   * Must be <= inputTokens. Cached tokens are billed at a lower rate.
   */
  cachedInputTokens?: number;
  /** Model identifier (e.g., 'gemini-2.5-flash', 'gpt-4o', 'claude-3-5-sonnet') */
  model: string;
  /** Provider type */
  provider: ProviderType;
}
```

### CostResult

Result of cost calculation.

```typescript
interface CostResult {
  /** Total cost in USD */
  total: number;
  /** Input token cost in USD */
  inputCost: number;
  /** Output token cost in USD */
  outputCost: number;
  /** Cached input token cost in USD */
  cachedInputCost: number;
}
```

### PricingSource

Source of pricing information returned by `getEffectivePricing()`.

```typescript
type PricingSource = 'global' | 'default' | 'fallback';
```

| Value | Description |
|-------|-------------|
| `'global'` | Pricing from `configurePricing()` override |
| `'default'` | Pricing from built-in default tables |
| `'fallback'` | Fallback pricing for unknown models |

### EffectivePricingResult

Result of `getEffectivePricing()`, includes resolved pricing and its source.

```typescript
interface EffectivePricingResult {
  /** The resolved pricing for the model */
  pricing: ModelPricing;
  /** Where the pricing was resolved from */
  source: PricingSource;
}
```

## Calculation Functions

### calculateCost

Calculate cost from token counts.

```typescript
function calculateCost(
  params: CalculateCostParams,
  providerPricing?: ProviderPricing
): CostResult;
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `params` | `CalculateCostParams` | Token counts and model info |
| `providerPricing` | `ProviderPricing` | Optional provider-level pricing override |

**Returns:** `CostResult` with cost breakdown.

**Throws:**
- `Error` if token counts are negative
- `Error` if token counts are non-finite (NaN, Infinity)
- `Error` if `cachedInputTokens > inputTokens`

**Example:**

```typescript
import { calculateCost } from '@agtlantis/core';

const cost = calculateCost({
  inputTokens: 1000,
  outputTokens: 500,
  cachedInputTokens: 200,
  model: 'gemini-2.5-flash',
  provider: 'google',
});

console.log(cost);
// {
//   inputCost: 0.00012,     // 800 non-cached tokens
//   outputCost: 0.0003,     // 500 output tokens
//   cachedInputCost: 0.0000075, // 200 cached tokens
//   total: 0.0003275
// }
```

### calculateCostFromUsage

Convenience function that calculates cost from AI SDK `LanguageModelUsage` object.

```typescript
function calculateCostFromUsage(
  usage: LanguageModelUsage,
  model: string,
  provider: ProviderType,
  providerPricing?: ProviderPricing
): CostResult;
```

### calculateTotalCost

Aggregate costs from multiple LLM calls.

```typescript
function calculateTotalCost(
  calls: Array<{ usage: LanguageModelUsage; model: string; provider: ProviderType }>,
  providerPricing?: ProviderPricing
): { totalCost: number; costByModel: Record<string, number> };
```

**Returns:** Object with `totalCost` (sum in USD) and `costByModel` (keyed by `${provider}/${model}`).

### getModelPricing

Get resolved pricing for a specific model.

```typescript
function getModelPricing(
  model: string,
  provider: ProviderType,
  providerPricing?: ProviderPricing
): ModelPricing;
```

**Resolution order:** Provider-level > Global config > Built-in defaults > Fallback

## Configuration Functions

### configurePricing

Configure global pricing overrides.

```typescript
function configurePricing(config: PricingConfig | undefined): void;
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `PricingConfig \| undefined` | Pricing configuration, or `undefined` to reset |

**Throws:** `Error` if any pricing value is invalid (negative, NaN, Infinity).

> **Warning:** This uses global mutable state and is not thread-safe. For multi-tenant scenarios or concurrent requests with different pricing, use `Provider.withPricing()` instead.

**Example:**

```typescript
import { configurePricing } from '@agtlantis/core';

// Override pricing for specific models
configurePricing({
  providers: {
    google: {
      'gemini-2.5-flash': { inputPricePerMillion: 0.20, outputPricePerMillion: 0.80 },
    },
  },
});

// Reset to built-in defaults
configurePricing(undefined);
```

### getPricingConfig

Get the current global pricing configuration.

```typescript
function getPricingConfig(): PricingConfig | undefined;
```

**Returns:** The current global pricing configuration, or `undefined` if none is set.

### resetPricingConfig

Reset global pricing configuration to undefined (use built-in defaults). Useful for testing.

```typescript
function resetPricingConfig(): void;
```

### getEffectivePricing

Get effective pricing for a model, showing the resolved source. Useful for debugging.

```typescript
function getEffectivePricing(model: string, provider: ProviderType): EffectivePricingResult;
```

**Returns:** `EffectivePricingResult` with `pricing` and `source` (`'global'`, `'default'`, or `'fallback'`).

**Example:**

```typescript
import { getEffectivePricing } from '@agtlantis/core';

const result = getEffectivePricing('gemini-2.5-flash', 'google');
console.log(result.source); // 'default'
console.log(result.pricing.inputPricePerMillion); // 0.15
```

## Validation Functions

These functions validate pricing objects and throw errors for invalid values (negative, NaN, Infinity).

### validateModelPricing

```typescript
function validateModelPricing(pricing: ModelPricing, context: string): void;
```

Validates a `ModelPricing` object. The `context` parameter provides error message context (e.g., `"openai/gpt-4o"`).

### validateProviderPricing

```typescript
function validateProviderPricing(pricing: ProviderPricing, providerContext?: string): void;
```

Validates a `ProviderPricing` object by validating each model pricing entry.

### validatePricingConfig

```typescript
function validatePricingConfig(config: PricingConfig): void;
```

Validates a `PricingConfig` object including all provider pricing and fallback pricing.

## Default Pricing Tables

### OPENAI_PRICING

Pre-configured pricing for OpenAI models (USD per million tokens).

```typescript
const OPENAI_PRICING: ProviderPricing;
```

**Sample values:**

| Model | Input | Output |
|-------|-------|--------|
| `gpt-4o` | $2.50 | $10.00 |
| `gpt-4o-mini` | $0.15 | $0.60 |
| `gpt-4-turbo` | $10.00 | $30.00 |
| `gpt-4` | $30.00 | $60.00 |
| `gpt-3.5-turbo` | $0.50 | $1.50 |
| `o1` | $15.00 | $60.00 |
| `o1-mini` | $3.00 | $12.00 |
| `o3` | $20.00 | $80.00 |
| `o3-mini` | $4.00 | $16.00 |

### GOOGLE_PRICING

Pre-configured pricing for Google Gemini models (USD per million tokens).

```typescript
const GOOGLE_PRICING: ProviderPricing;
```

**Sample values:**

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| `gemini-2.5-flash` | $0.15 | $0.60 | $0.0375 |
| `gemini-2.5-flash-lite` | $0.075 | $0.30 | $0.01875 |
| `gemini-2.5-pro` | $1.25 | $10.00 | $0.3125 |
| `gemini-2.0-flash` | $0.10 | $0.40 | $0.025 |
| `gemini-1.5-pro` | $1.25 | $5.00 | $0.3125 |
| `gemini-1.5-flash` | $0.075 | $0.30 | $0.01875 |

### ANTHROPIC_PRICING

Pre-configured pricing for Anthropic Claude models (USD per million tokens).

```typescript
const ANTHROPIC_PRICING: ProviderPricing;
```

**Sample values:**

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| `claude-opus-4-5-20250514` | $15.00 | $75.00 | $1.875 |
| `claude-sonnet-4-20250514` | $3.00 | $15.00 | $0.375 |
| `claude-3-5-sonnet-20241022` | $3.00 | $15.00 | $0.375 |
| `claude-3-5-haiku-20241022` | $0.80 | $4.00 | $0.10 |
| `claude-3-opus-20240229` | $15.00 | $75.00 | $1.875 |
| `claude-3-haiku-20240307` | $0.25 | $1.25 | $0.03 |

### DEFAULT_PRICING_CONFIG

Default pricing configuration with all built-in providers.

```typescript
const DEFAULT_PRICING_CONFIG: Required<PricingConfig>;
```

Contains:
- `providers`: Object with `openai`, `google`, and `anthropic` pricing tables
- `fallback`: Default fallback pricing (`{ inputPricePerMillion: 1.0, outputPricePerMillion: 5.0 }`)

### DEFAULT_FALLBACK_PRICING

Default fallback pricing for unknown models.

```typescript
const DEFAULT_FALLBACK_PRICING: ModelPricing = {
  inputPricePerMillion: 1.0,
  outputPricePerMillion: 5.0,
};
```

## Examples

### Cost Tracking from Execution

```typescript
import { createGoogleProvider, calculateCostFromUsage } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'What is 2 + 2?' });
  return result.text;
});

const result = await execution.result();

const cost = calculateCostFromUsage(
  result.summary.totalLLMUsage,
  'gemini-2.5-flash',
  'google'
);

console.log(`Total: $${cost.total.toFixed(6)}`);
```

### Custom Pricing

```typescript
import { configurePricing, calculateCost, resetPricingConfig } from '@agtlantis/core';

configurePricing({
  providers: {
    openai: { 'gpt-4o': { inputPricePerMillion: 2.0, outputPricePerMillion: 8.0 } },
  },
});

const cost = calculateCost({
  inputTokens: 5000,
  outputTokens: 1000,
  model: 'gpt-4o',
  provider: 'openai',
});

console.log(`Cost: $${cost.total.toFixed(6)}`);
resetPricingConfig(); // Clean up
```

## See Also

- [Pricing Guide](../guides/pricing-guide.md) - Comprehensive guide with best practices
- [Provider Guide](../guides/provider-guide.md) - Provider configuration and withPricing()
- [API Reference: Provider](./provider.md) - Provider.withPricing() documentation
