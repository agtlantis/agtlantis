# Pricing Guide

> Calculate and track LLM usage costs across providers with @agtlantis/core.

## Table of contents

- [Overview](#overview)
- [Quick start](#quick-start)
- [Basic usage](#basic-usage)
  - [Calculating per-call costs](#calculating-per-call-costs)
  - [Using AI SDK usage objects](#using-ai-sdk-usage-objects)
  - [Built-in pricing tables](#built-in-pricing-tables)
  - [Tracking multi-call costs](#tracking-multi-call-costs)
- [Advanced usage](#advanced-usage)
  - [Custom pricing with configurePricing()](#custom-pricing-with-configurepricing)
  - [Provider-level pricing with withPricing()](#provider-level-pricing-with-withpricing)
  - [Pricing resolution hierarchy](#pricing-resolution-hierarchy)
  - [Handling cached tokens](#handling-cached-tokens)
  - [Setting custom fallback pricing](#setting-custom-fallback-pricing)
  - [Debugging pricing configuration](#debugging-pricing-configuration)
- [Best practices](#best-practices)
  - [Cost optimization](#cost-optimization)
  - [Cost monitoring and budget limits](#cost-monitoring-and-budget-limits)
  - [Multi-tenant pricing](#multi-tenant-pricing)
  - [Precision and validation](#precision-and-validation)
- [See also](#see-also)

---

## Overview

The Pricing module helps you understand and control your AI spending. It provides:

- **Built-in pricing tables**: Pre-configured rates for OpenAI, Google, and Anthropic models
- **Flexible cost calculation**: Calculate from token counts or AI SDK usage objects
- **Hierarchical configuration**: Override pricing at global or per-provider level
- **Multi-call aggregation**: Track costs across multiple LLM calls in a session

Cost tracking is essential for production applications. Whether you need to bill customers, set usage budgets, or simply monitor spending, the Pricing module gives you the tools to stay in control.

## Quick Start

Here's the simplest way to calculate costs from an execution:

```typescript
import {
  createGoogleProvider,
  calculateCostFromUsage,
} from '@agtlantis/core';

// 1. Create provider and execute
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello, world!' });
  return result.text;
});

await execution.toResult();

// 2. Get session summary
const summary = await execution.getSummary();
const usage = summary.totalLLMUsage;

// 3. Calculate cost
const cost = calculateCostFromUsage(usage, 'gemini-2.5-flash', 'google');

console.log(`Input cost: $${cost.inputCost.toFixed(6)}`);
console.log(`Output cost: $${cost.outputCost.toFixed(6)}`);
console.log(`Total cost: $${cost.total.toFixed(6)}`);
```

## Basic Usage

### Calculating Per-Call Costs

The `calculateCost()` function calculates costs from raw token counts:

```typescript
import { calculateCost } from '@agtlantis/core';

const cost = calculateCost({
  inputTokens: 1000,
  outputTokens: 500,
  model: 'gemini-2.5-flash',
  provider: 'google',
});

console.log(cost);
// {
//   inputCost: 0.00015,      // 1000 tokens * $0.15/million
//   outputCost: 0.0003,      // 500 tokens * $0.60/million
//   cachedInputCost: 0,
//   total: 0.00045
// }
```

The function returns a `CostResult` object with a breakdown of costs:

| Field | Description |
|-------|-------------|
| `inputCost` | Cost for non-cached input tokens |
| `outputCost` | Cost for output tokens |
| `cachedInputCost` | Cost for cached input tokens (discounted rate) |
| `total` | Sum of all cost components |

### Using AI SDK Usage Objects

When you have an execution result, use `calculateCostFromUsage()` to calculate costs directly from the AI SDK's `LanguageModelUsage` object:

```typescript
import { createGoogleProvider, calculateCostFromUsage } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({
    prompt: 'Explain quantum computing in simple terms.',
  });
  return result.text;
});

await execution.toResult();
const summary = await execution.getSummary();

// Calculate cost from session summary
const cost = calculateCostFromUsage(
  summary.totalLLMUsage,
  'gemini-2.5-flash',
  'google'
);

console.log(`This call cost: $${cost.total.toFixed(6)}`);
```

### Built-in Pricing Tables

The module includes pre-configured pricing for popular models. You can inspect these tables directly:

```typescript
import {
  OPENAI_PRICING,
  GOOGLE_PRICING,
  ANTHROPIC_PRICING,
} from '@agtlantis/core';

// Check pricing for a specific model
console.log(GOOGLE_PRICING['gemini-2.5-flash']);
// {
//   inputPricePerMillion: 0.15,
//   outputPricePerMillion: 0.6,
//   cachedInputPricePerMillion: 0.0375
// }

console.log(OPENAI_PRICING['gpt-4o']);
// {
//   inputPricePerMillion: 2.5,
//   outputPricePerMillion: 10.0
// }

console.log(ANTHROPIC_PRICING['claude-3-5-sonnet-20241022']);
// {
//   inputPricePerMillion: 3.0,
//   outputPricePerMillion: 15.0,
//   cachedInputPricePerMillion: 0.375
// }
```

### Tracking Multi-Call Costs

For sessions with multiple LLM calls, use `calculateTotalCost()` to aggregate costs:

```typescript
import {
  createGoogleProvider,
  createLogger,
  calculateTotalCost,
} from '@agtlantis/core';
import type { LLMCallEndEvent } from '@agtlantis/core';

// Track individual LLM calls via logger
const llmCalls: Array<{
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  provider: string;
}> = [];

const logger = createLogger({
  onLLMCallEnd: (event: LLMCallEndEvent) => {
    llmCalls.push({
      usage: {
        inputTokens: event.response.usage?.inputTokens ?? 0,
        outputTokens: event.response.usage?.outputTokens ?? 0,
      },
      model: event.modelId,
      provider: 'google',
    });
  },
});

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(logger);

// Execute with multiple LLM calls
const execution = provider.simpleExecution(async (session) => {
  const outline = await session.generateText({ prompt: 'Create an outline.' });
  const draft = await session.generateText({
    prompt: `Expand this outline: ${outline.text}`,
  });
  const final = await session.generateText({
    prompt: `Polish this draft: ${draft.text}`,
  });
  return final.text;
});

await execution.toResult();

// Calculate total cost across all calls
const { totalCost, costByModel } = calculateTotalCost(llmCalls);

console.log(`Total session cost: $${totalCost.toFixed(6)}`);
console.log('Cost breakdown by model:', costByModel);
// { 'google/gemini-2.5-flash': 0.00234 }
```

## Advanced Usage

### Custom Pricing with configurePricing()

Use `configurePricing()` to override built-in pricing globally. This is useful when:

- Prices have changed since the last library update
- You have negotiated custom rates with a provider
- You want to use a different pricing model for testing

```typescript
import {
  configurePricing,
  calculateCost,
  getEffectivePricing,
  resetPricingConfig,
} from '@agtlantis/core';

// Set custom pricing globally
configurePricing({
  providers: {
    google: {
      'gemini-2.5-flash': {
        inputPricePerMillion: 0.20,   // Custom rate
        outputPricePerMillion: 0.80,
        cachedInputPricePerMillion: 0.05,
      },
    },
  },
});

// Verify the configuration
const effective = getEffectivePricing('gemini-2.5-flash', 'google');
console.log(effective.source); // 'global'
console.log(effective.pricing.inputPricePerMillion); // 0.20

// All subsequent calculations use custom pricing
const cost = calculateCost({
  inputTokens: 1000,
  outputTokens: 500,
  model: 'gemini-2.5-flash',
  provider: 'google',
});

console.log(cost.inputCost); // 0.0002 (using custom rate)

// Reset to built-in defaults
resetPricingConfig();
```

> **Warning:** `configurePricing()` uses global mutable state and is not thread-safe. For multi-tenant scenarios or concurrent requests with different pricing, use `Provider.withPricing()` instead.

### Provider-Level Pricing with withPricing()

For per-provider pricing overrides that are isolated and thread-safe, use the `withPricing()` fluent method:

```typescript
import { createGoogleProvider, calculateCostFromUsage } from '@agtlantis/core';

// Provider with custom pricing
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
})
  .withDefaultModel('gemini-2.5-flash')
  .withPricing({
    'gemini-2.5-flash': {
      inputPricePerMillion: 0.25,
      outputPricePerMillion: 1.0,
    },
  });

// This provider uses custom pricing
const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello!' });
  return result.text;
});

await execution.toResult();
```

### Pricing Resolution Hierarchy

When calculating costs, pricing is resolved in this order (highest priority first):

1. **Provider.withPricing()** - Per-provider override
2. **configurePricing()** - Global override
3. **Built-in defaults** - Pre-configured pricing tables
4. **Fallback** - Default rates for unknown models

```typescript
import {
  configurePricing,
  getEffectivePricing,
  createGoogleProvider,
} from '@agtlantis/core';

// Built-in pricing (source: 'default')
let result = getEffectivePricing('gemini-2.5-flash', 'google');
console.log(result.source); // 'default'

// Global override takes precedence
configurePricing({
  providers: {
    google: {
      'gemini-2.5-flash': { inputPricePerMillion: 0.5, outputPricePerMillion: 2.0 },
    },
  },
});

result = getEffectivePricing('gemini-2.5-flash', 'google');
console.log(result.source); // 'global'

// Unknown models fall back to default rates
result = getEffectivePricing('some-new-model', 'google');
console.log(result.source); // 'fallback'
console.log(result.pricing);
// { inputPricePerMillion: 1.0, outputPricePerMillion: 5.0 }
```

### Handling Cached Tokens

Some providers (Google, Anthropic) offer discounted rates for cached input tokens. The pricing module handles this automatically:

```typescript
import { calculateCost, GOOGLE_PRICING } from '@agtlantis/core';

// Check cached token pricing
console.log(GOOGLE_PRICING['gemini-2.5-flash']);
// {
//   inputPricePerMillion: 0.15,
//   outputPricePerMillion: 0.6,
//   cachedInputPricePerMillion: 0.0375  // 75% discount!
// }

// Calculate with cached tokens
const cost = calculateCost({
  inputTokens: 10000,      // Total input tokens (includes cached)
  outputTokens: 500,
  cachedInputTokens: 8000, // 8000 of the 10000 were cached
  model: 'gemini-2.5-flash',
  provider: 'google',
});

console.log(cost);
// {
//   inputCost: 0.0003,      // 2000 non-cached tokens * $0.15/million
//   outputCost: 0.0003,     // 500 tokens * $0.60/million
//   cachedInputCost: 0.0003, // 8000 cached tokens * $0.0375/million
//   total: 0.0009
// }
```

> **Note:** The `inputTokens` parameter represents the TOTAL count including cached tokens. The calculator subtracts `cachedInputTokens` to determine non-cached tokens for pricing.

### Setting Custom Fallback Pricing

You can configure fallback pricing for unknown models:

```typescript
import { configurePricing, calculateCost } from '@agtlantis/core';

configurePricing({
  fallback: {
    inputPricePerMillion: 2.0,
    outputPricePerMillion: 8.0,
  },
});

// Unknown model uses fallback pricing
const cost = calculateCost({
  inputTokens: 1000,
  outputTokens: 500,
  model: 'some-future-model',
  provider: 'google',
});

console.log(cost.total); // Uses fallback rates
```

### Debugging Pricing Configuration

Use `getEffectivePricing()` to understand which pricing layer is being applied:

```typescript
import { getEffectivePricing, configurePricing } from '@agtlantis/core';

// Check effective pricing for a model
const result = getEffectivePricing('gpt-4o', 'openai');

console.log('Source:', result.source);
console.log('Pricing:', result.pricing);

// Possible sources:
// - 'default': Using built-in pricing table
// - 'global': Using configurePricing() override
// - 'fallback': Model not found, using fallback rates
```

## Best Practices

### Cost Optimization

Choose models strategically based on task complexity and cost:

```typescript
import { createGoogleProvider, GOOGLE_PRICING } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
});

const execution = provider.simpleExecution(async (session) => {
  // Use cheap model for simple tasks
  const ideas = await session.generateText({
    model: 'gemini-2.5-flash', // $0.15 input / $0.60 output per million
    prompt: 'List 5 project ideas.',
  });

  // Use expensive model only for complex reasoning
  const analysis = await session.generateText({
    model: 'gemini-2.5-pro', // $1.25 input / $10.00 output per million
    prompt: `Provide detailed feasibility analysis for: ${ideas.text}`,
  });

  return analysis.text;
});
```

### Cost Monitoring and Budget Limits

Use a logger to track costs and enforce budget limits:

```typescript
import { createGoogleProvider, createLogger, calculateCostFromUsage } from '@agtlantis/core';

let sessionCost = 0;
const BUDGET_LIMIT = 0.10; // $0.10 per session

const logger = createLogger({
  onLLMCallEnd: (event) => {
    if (event.response.usage) {
      const cost = calculateCostFromUsage(event.response.usage, event.modelId, 'google');
      sessionCost += cost.total;
      console.log(`Call cost: $${cost.total.toFixed(6)}, Total: $${sessionCost.toFixed(6)}`);

      if (sessionCost > BUDGET_LIMIT) {
        throw new Error(`Budget exceeded: $${sessionCost.toFixed(4)} > $${BUDGET_LIMIT}`);
      }
    }
  },
});

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(logger);
```

### Multi-Tenant Pricing

For applications serving multiple tenants with different pricing tiers, use `withPricing()` for isolation:

```typescript
import { createGoogleProvider, type ProviderPricing } from '@agtlantis/core';

// Pricing tiers
const PRICING_TIERS: Record<string, ProviderPricing> = {
  free: {
    'gemini-2.5-flash': { inputPricePerMillion: 0.20, outputPricePerMillion: 0.80 },
  },
  pro: {
    'gemini-2.5-flash': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.60 },
  },
  enterprise: {
    'gemini-2.5-flash': { inputPricePerMillion: 0.10, outputPricePerMillion: 0.40 },
  },
};

function createProviderForTenant(tier: 'free' | 'pro' | 'enterprise') {
  return createGoogleProvider({
    apiKey: process.env.GOOGLE_AI_API_KEY!,
  })
    .withDefaultModel('gemini-2.5-flash')
    .withPricing(PRICING_TIERS[tier]);
}

// Each tenant gets isolated pricing
const freeProvider = createProviderForTenant('free');
const proProvider = createProviderForTenant('pro');
const enterpriseProvider = createProviderForTenant('enterprise');
```

### Precision and Validation

Cost calculations use JavaScript floating-point arithmetic. For financial reporting, round appropriately:

```typescript
import { calculateCost } from '@agtlantis/core';

const cost = calculateCost({
  inputTokens: 1234567,
  outputTokens: 987654,
  model: 'gpt-4o',
  provider: 'openai',
});

// Round to cents for billing
const billableCents = Math.round(cost.total * 100);
console.log(`Billable: $${(billableCents / 100).toFixed(2)}`);
```

The module validates inputs and throws errors for invalid values:

- Token counts must be non-negative
- `cachedInputTokens` cannot exceed `inputTokens`
- Pricing values in `configurePricing()` must be finite and non-negative

## See Also

- [API Reference: Pricing](../api/pricing.md) - Complete API documentation
- [Provider Guide](./provider-guide.md) - Provider configuration and withPricing()
- [Streaming Guide](./streaming-guide.md) - Cost tracking in streaming executions
