# API Reference

> Complete API documentation for @agtlantis/core.

## Core Modules

| Module | Description | Documentation |
|--------|-------------|---------------|
| **Provider** | AI provider abstraction (Google, OpenAI, Anthropic) | [provider.md](./provider.md) |
| **Execution** | Execution abstractions with cancellation support | [execution.md](./execution.md) |
| **Session** | Execution context with state management | [session.md](./session.md) |
| **Patterns** | Reusable execution patterns (Progressive) | [patterns.md](./patterns.md) |

## Feature Modules

| Module | Description | Documentation |
|--------|-------------|---------------|
| **Validation** | Result validation with automatic retries | [validation.md](./validation.md) |
| **Observability** | Logging, metrics, and event tracking | [observability.md](./observability.md) |
| **Pricing** | Cost calculation and usage tracking | [pricing.md](./pricing.md) |
| **Prompt** | Structured prompt management with versioning | [prompt.md](./prompt.md) |
| **Errors** | Structured error handling with error codes | [errors.md](./errors.md) |

## Testing Module

| Module | Description | Documentation |
|--------|-------------|---------------|
| **Testing** | Mock providers and test utilities | [testing.md](./testing.md) |

> **Note:** Testing utilities are imported from `@agtlantis/core/testing`, a dedicated entrypoint.

## Quick Links

- [Getting Started](../getting-started.md) - Installation and first steps
- [Guides](../guides/) - In-depth tutorials and best practices

## Import Structure

All public APIs are exported from the main package:

```typescript
import {
  // Providers
  createGoogleProvider,
  createOpenAIProvider,
  createAnthropicProvider,

  // Patterns
  defineProgressivePattern,

  // Validation
  withValidation,
  ValidationExhaustedError,

  // Observability
  createLogger,
  noopLogger,

  // Pricing
  calculateCost,
  calculateCostFromUsage,
  configurePricing,

  // Types
  type Provider,
  type Session,
  type Execution,
  type SimpleExecution,
  type StreamingExecution,
  type ExecutionOptions,
  type Logger,
  type EventMetrics,
} from '@agtlantis/core';
```
