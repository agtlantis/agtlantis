# Architecture Overview

> A high-level guide to the design principles and module structure of @agtlantis/core.

## Table of Contents

- [Overview](#overview)
- [Design Philosophy](#design-philosophy)
- [System Architecture](#system-architecture)
- [Module Dependency Graph](#module-dependency-graph)
- [Core Data Flow](#core-data-flow)
- [Key Design Patterns](#key-design-patterns)
- [Module Summary](#module-summary)
- [Extension Points](#extension-points)
- [See Also](#see-also)

---

## Overview

@agtlantis/core is a TypeScript framework for building AI agents on top of the [Vercel AI SDK](https://sdk.vercel.ai/). It provides a unified, provider-agnostic abstraction for working with language models (Google AI, OpenAI) while adding essential cross-cutting concerns:

- **Provider abstraction**: Switch between AI providers without changing your agent code
- **Observability**: Event logging and metrics collection for monitoring
- **Pricing**: Automatic cost calculation from token usage
- **Validation**: Retry-based result validation with failure history
- **Patterns**: Reusable execution patterns like Progressive streaming

Think of @agtlantis/core as the "infrastructure layer" between your agent logic and the raw AI SDKs. You focus on what your agent does; the core handles how it connects to AI services.

---

## Design Philosophy

@agtlantis/core follows these guiding principles:

### 1. Provider-Agnostic API

You write agent code once, then switch providers by changing a single factory call. Whether you use Google AI or OpenAI, the session API stays the same.

```typescript
// Switch providers with one line change
const google = createGoogleProvider({ apiKey: GOOGLE_KEY });
const openai = createOpenAIProvider({ apiKey: OPENAI_KEY });

// Same execution code works with both
const result = provider.simpleExecution(async (session) => {
  return await session.generateText({ prompt: 'Hello!' });
});
```

### 2. Immutable Fluent Configuration

Configuration methods return new provider instances, keeping the original unchanged. This makes it safe to derive multiple configurations from a base provider.

```typescript
const base = createGoogleProvider({ apiKey });

// Each returns a NEW provider instance
const flash = base.withDefaultModel('gemini-2.5-flash');
const pro = base.withDefaultModel('gemini-2.5-pro');
const withLogging = flash.withLogger(myLogger);

// base, flash, pro, and withLogging are all independent
```

### 3. Session-Based Lifecycle Management

Instead of managing AI SDK calls directly, you work through a **Session** that handles:

- Automatic usage tracking (tokens, costs)
- File upload/cleanup via `FileManager`
- Cleanup hooks that run in LIFO order
- Per-call model selection

### 4. Event-Driven Observability

The `Logger` interface lets you subscribe to execution lifecycle events without coupling your monitoring to the core logic. All logger methods are optional—implement only what you need.

### 5. Separation of Concerns

Validation is deliberately an **application-level** concern, not built into the provider layer. This keeps the core simple and lets you apply validation where it makes sense for your use case.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Your Application                                    │
│                                                                               │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│   │   Agent Logic   │  │ Business Rules  │  │   UI / API Handlers         │  │
│   └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            @agtlantis/core                                    │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                        Core Modules                                     │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐              │  │
│  │  │ Provider │  │ Session  │  │Execution │  │  Patterns  │              │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────┘              │  │
│  │  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐            │  │
│  │  │Observability│  │ Pricing  │  │  Prompt  │  │ Validation │            │  │
│  │  └────────────┘  └──────────┘  └──────────┘  └────────────┘            │  │
│  │  ┌──────────┐                                                          │  │
│  │  │  Errors  │                                                          │  │
│  │  └──────────┘                                                          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ @agtlantis/core/testing (Separate Entrypoint)                          │  │
│  │  ┌───────────────┐  ┌─────────────────┐  ┌──────────────────────────┐  │  │
│  │  │ MockProvider  │  │   mock.text()   │  │   Test Helpers           │  │  │
│  │  └───────────────┘  └─────────────────┘  └──────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Vercel AI SDK                                      │
│                                                                               │
│      generateText()  │  streamText()  │  tools  │  LanguageModelV1           │
│                                                                               │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              LLM APIs                                         │
│                                                                               │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│   │    Google AI    │    │     OpenAI      │    │   Anthropic (Planned)   │  │
│   │    (Gemini)     │    │    (GPT-4o)     │    │       (Claude)          │  │
│   └─────────────────┘    └─────────────────┘    └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Module Dependency Graph

This diagram shows how modules depend on each other. Arrows point from dependent to dependency.

```
                              ┌─────────────┐
                              │   index.ts  │  (Public API)
                              └──────┬──────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
 ┌─────────────┐            ┌─────────────┐            ┌─────────────┐
 │  Provider   │◀───────────│   Patterns  │            │ Validation  │
 │   (Core)    │            │ Progressive │            │withValidation│
 └──────┬──────┘            └──────┬──────┘            └──────┬──────┘
        │                          │                          │
        │ depends on               │ depends on               │ depends on
        ▼                          ▼                          ▼
 ┌─────────────┐            ┌─────────────┐            ┌─────────────┐
 │  Session    │            │  Session    │            │   Errors    │
 │  Execution  │            │Observability│            │             │
 │Observability│            └─────────────┘            └─────────────┘
 │   Pricing   │
 └─────────────┘

 ┌─────────────┐            ┌─────────────┐            ┌─────────────┐
 │  Session    │            │  Execution  │            │   Prompt    │
 │ LLM Calls   │◀───────────│ Stream Host │            │ File-based  │
 │ Usage Track │            │  Lifecycle  │            │ Templates   │
 └──────┬──────┘            └─────────────┘            └─────────────┘
        │
        │ depends on                                   ┌─────────────┐
        ▼                                              │   Testing   │
 ┌─────────────┐                                       │   Mocks     │
 │Observability│                                       │   Helpers   │
 │   Pricing   │                                       └─────────────┘
 └─────────────┘                                       (Separate entrypoint)
```

### Import Relationships

| Module | Depends On | Purpose |
|--------|------------|---------|
| `Provider` | Session, Execution, Observability, Pricing | Provider-agnostic LLM abstraction |
| `Session` | Observability, Pricing | LLM call wrappers with usage tracking |
| `Execution` | Session | Streaming execution host and lifecycle |
| `Patterns` | Session, Observability | Reusable execution patterns |
| `Validation` | Errors | Retry-based result validation |
| `Prompt` | Errors | Template management with versioning |
| `Testing` | All modules (provides mocks) | Test utilities |
| `Errors` | None (base layer) | Structured error hierarchy |

---

## Core Data Flow

### Execution Flow

This diagram shows how an execution flows through the system, from provider to result.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            EXECUTION FLOW                                     │
└──────────────────────────────────────────────────────────────────────────────┘

  Provider
      │
      ├─── simpleExecution(fn) ───────────────────────────┐
      │    Returns: Promise<Execution<TResult>>           │
      │                                                   │
      └─── streamingExecution(generator) ─────┐           │
           Returns: StreamingExecution<TEvent, TResult>   │
                                              │           │
                                              ▼           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Session                                          │
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  AI SDK Wrappers (with automatic usage tracking)                      │   │
│  │    • session.generateText({ prompt, model? })                        │   │
│  │    • session.streamText({ prompt, model? })                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  File Management                                                      │   │
│  │    • session.fileManager.upload(files)                               │   │
│  │    • session.fileManager.clear()                                     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Lifecycle (cleanup hooks run in LIFO order)                         │   │
│  │    • session.onDone(() => cleanup())                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Stream Control (streaming only)                                      │   │
│  │    • yield session.emit(event)       → Intermediate events           │   │
│  │    • return session.done(result)     → Success with result           │   │
│  │    • return session.fail(error)      → Failure with error            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Observability (Logger)                                │
│                                                                               │
│  Events fired during execution:                                               │
│    • onExecutionStart({ executionType, timestamp })                          │
│    • onLLMCallStart({ modelId, callType })                                   │
│    • onLLMCallEnd({ modelId, response: { duration, usage } })                │
│    • onExecutionEmit({ event, metrics })           (streaming only)          │
│    • onExecutionDone({ data, summary, duration })                            │
│    • onExecutionError({ error })                                             │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Execution Result                                    │
│                                                                               │
│  Simple Execution:                                                            │
│    const result = await execution.toResult();                                │
│    const metadata = await execution.getSummary();                           │
│                                                                               │
│  Streaming Execution:                                                         │
│    for await (const event of execution) {                                    │
│      // Each event includes: { data, metrics: EventMetrics }                 │
│      // EventMetrics: { timestamp, elapsedMs, deltaMs }                      │
│    }                                                                          │
│    const result = await execution.toResult();                                │
│                                                                               │
│  Both include SessionSummary:                                                 │
│    { llmCalls, totalLLMUsage, totalCost, costByModel, ... }                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### EventMetrics

Every streaming event includes timing metrics:

| Field | Description |
|-------|-------------|
| `timestamp` | Unix timestamp in milliseconds |
| `elapsedMs` | Milliseconds since execution started |
| `deltaMs` | Milliseconds since previous event |

---

## Key Design Patterns

| Pattern | Where It's Used | Purpose |
|---------|-----------------|---------|
| **Factory** | `createGoogleProvider()`, `createOpenAIProvider()`, `createMockProvider()` | Encapsulate provider creation with configuration |
| **Fluent API** | `.withDefaultModel()`, `.withLogger()`, `.withPricing()` | Chainable, immutable configuration |
| **Abstract Base Class** | `BaseProvider` | Share common execution logic across providers |
| **Session** | `SimpleSession`, `StreamingSession` | Encapsulate execution lifecycle and state |
| **Generator** | `streamingExecution(async function* (session) {...})` | Enable streaming with `for await...of` |
| **Type Guards** | `isFilePart()`, `isFilePartPath()`, etc. | Safe type narrowing for discriminated unions |
| **Observer** | `Logger` interface | Decouple monitoring from execution logic |

### Factory Pattern Example

Providers use factory functions that encapsulate configuration:

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
  // Provider-specific options like safety settings
}).withDefaultModel('gemini-2.5-flash');
```

### Generator Pattern Example

Streaming executions use async generators for natural streaming semantics:

```typescript
const execution = provider.streamingExecution(async function* (session) {
  // Emit progress events
  yield session.emit({ type: 'progress', stage: 'analyzing' });

  const result = await session.generateText({ prompt: 'Analyze this...' });

  yield session.emit({ type: 'progress', stage: 'complete' });

  // Return final result
  return session.done({ analysis: result.text });
});

// Consume with for-await-of
for await (const event of execution) {
  console.log(event.data.stage); // 'analyzing', 'complete'
}
```

---

## Module Summary

| Module | Purpose | Guide | API Reference |
|--------|---------|-------|---------------|
| **Errors** | Structured error hierarchy with codes | — | [api/errors.md](../api/errors.md) |
| **Session** | LLM call wrappers with usage tracking | [provider-guide.md](../guides/provider-guide.md) | — |
| **Execution** | Streaming execution host and lifecycle | [streaming-guide.md](../guides/streaming-guide.md) | — |
| **Provider** | Provider-agnostic LLM abstraction | [provider-guide.md](../guides/provider-guide.md) | [api/provider.md](../api/provider.md) |
| **Observability** | Event logging and metrics | [observability-guide.md](../guides/observability-guide.md) | [api/observability.md](../api/observability.md) |
| **Pricing** | Cost calculation from token usage | [pricing-guide.md](../guides/pricing-guide.md) | [api/pricing.md](../api/pricing.md) |
| **Prompt** | Template management with versioning | — | [api/prompt.md](../api/prompt.md) |
| **Validation** | Retry-based result validation | [validation-guide.md](../guides/validation-guide.md) | [api/validation.md](../api/validation.md) |
| **Patterns** | Reusable execution patterns | [patterns-guide.md](../guides/patterns-guide.md) | [api/patterns.md](../api/patterns.md) |
| **Testing** | Mocks and test helpers | [testing-guide.md](../guides/testing-guide.md) | [api/testing.md](../api/testing.md) |

> **Note:** The Testing module has a separate entrypoint: `@agtlantis/core/testing`

---

## Extension Points

### Custom Providers

The `BaseProvider` abstract class is exported for advanced use cases. However, creating a custom provider requires deep understanding of the internal session management APIs.

For most customization needs, use the fluent API instead:

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';

// Customize behavior through composition, not inheritance
const customProvider = createGoogleProvider({ apiKey })
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(myLogger)
  .withPricing(customPricing);
```

> **Note:** If you truly need a custom provider implementation, refer to the source code of `GoogleProvider` or `OpenAIProvider` in `src/provider/` as reference implementations.

### Custom Loggers

Implement the `Logger` interface to integrate with your monitoring system:

```typescript
import { Logger, createLogger } from '@agtlantis/core';

const customLogger = createLogger({
  onLLMCallEnd: (event) => {
    // Send to your analytics
    analytics.track('llm_call', {
      model: event.modelId,
      tokens: event.response.usage?.totalTokens,
      duration: event.duration,
    });
  },
  onExecutionError: (event) => {
    // Send to error tracking
    errorTracker.capture(event.error);
  },
});

const provider = baseProvider.withLogger(customLogger);
```

### Custom Pricing

Override pricing for specific models or add new providers:

```typescript
import { createGoogleProvider, type ProviderPricing } from '@agtlantis/core';

const customPricing: ProviderPricing = {
  'my-custom-model': {
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 1.5,
  },
};

const provider = createGoogleProvider({ apiKey })
  .withPricing(customPricing);
```

---

## See Also

### Getting Started

- [Getting Started Guide](../getting-started.md) - Your first steps with @agtlantis/core

### Guides

- [Provider Guide](../guides/provider-guide.md) - Deep dive into providers and sessions
- [Streaming Guide](../guides/streaming-guide.md) - Working with streaming executions
- [Patterns Guide](../guides/patterns-guide.md) - Using the Progressive pattern
- [Validation Guide](../guides/validation-guide.md) - Retry-based validation
- [Observability Guide](../guides/observability-guide.md) - Logging and metrics
- [Pricing Guide](../guides/pricing-guide.md) - Cost tracking
- [Testing Guide](../guides/testing-guide.md) - Testing your agents

### API Reference

- [API Reference Index](../api/README.md) - Complete API documentation

---

*Last Updated: 2026-01-18*
