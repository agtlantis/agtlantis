# Observability API Reference

> Complete type documentation for the observability module in @agtlantis/core.

## Overview

The observability module provides interfaces for monitoring and debugging agent executions. You can track LLM calls, execution lifecycle events, and custom metrics without modifying your agent logic.

Key exports:
- **Logger** - Interface for receiving events
- **Event Types** - LLM call and execution lifecycle events
- **EventMetrics** - Timing information attached to streaming events
- **Helper Functions** - `createLogger()` and `noopLogger`

## Import

```typescript
import {
  // Functions
  createLogger,
  noopLogger,

  // Types
  type Logger,
  type LogLevel,
  type LLMCallLogType,
  type LLMCallStartEvent,
  type LLMCallEndEvent,
  type ExecutionStartEvent,
  type ExecutionEmitEvent,
  type ExecutionDoneEvent,
  type ExecutionErrorEvent,
  type EventMetrics,
  type LanguageModelUsage,
  type SessionSummary,
} from '@agtlantis/core';
```

## Types

### EventMetrics

Timing metrics attached to each streaming event. Enables performance monitoring and latency debugging.

```typescript
interface EventMetrics {
  /** Unix timestamp in milliseconds when this event was emitted */
  timestamp: number;

  /** Milliseconds elapsed since execution started */
  elapsedMs: number;

  /** Milliseconds since the previous event (0 for first event) */
  deltaMs: number;
}
```

**Example:**

```typescript
// EventMetrics is automatically added to events via session.emit()
const execution = provider.streamingExecution<MyEvent, string>(
  async function* (session) {
    // emit() returns the complete event with metrics attached
    yield session.emit({ type: 'progress', message: 'Step 1' });

    // The emitted event's metrics contains timing information:
    // - metrics.timestamp: 1704067200000 (Unix timestamp)
    // - metrics.elapsedMs: 150 (ms since execution start)
    // - metrics.deltaMs: 150 (ms since last event, 0 for first)

    return session.done('Result');
  }
);
```

---

### LanguageModelUsage

Token usage information from AI SDK calls. Re-exported from the AI SDK.

```typescript
interface LanguageModelUsage {
  /** Number of input tokens consumed */
  inputTokens: number;

  /** Number of output tokens generated */
  outputTokens: number;

  /** Total tokens (input + output) */
  totalTokens: number;
}
```

**Example:**

```typescript
import { createLogger } from '@agtlantis/core';
import type { LanguageModelUsage } from '@agtlantis/core';

const logger = createLogger({
  onLLMCallEnd(event) {
    const usage: LanguageModelUsage | undefined = event.response.usage;
    if (usage) {
      console.log(`Input: ${usage.inputTokens}`);
      console.log(`Output: ${usage.outputTokens}`);
      console.log(`Total: ${usage.totalTokens}`);
    }
  },
});
```

---

### SessionSummary

Aggregated session summary collected during agent execution. Available after execution completes via `getSummary()`.

> **See:** [SessionSummary in Session API Reference](./session.md#sessionsummary) for full type documentation.

**Example:**

```typescript
import { createGoogleProvider } from '@agtlantis/core';
import type { SessionSummary } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello' });
  return result.text;
});

await execution.toResult();
const summary: SessionSummary = await execution.getSummary();

console.log('Duration:', summary.totalDuration, 'ms');
console.log('LLM Calls:', summary.llmCallCount);
console.log('Tokens:', summary.totalLLMUsage.totalTokens);
console.log('Cost: $' + summary.totalCost.toFixed(4));
```

---

## Logger Interface

### Logger

The main interface for observability. All methods are optional - implement only the events you care about.

```typescript
interface Logger {
  // LLM Call Events
  onLLMCallStart?(event: LLMCallStartEvent): void;
  onLLMCallEnd?(event: LLMCallEndEvent): void;

  // Execution Lifecycle Events (streaming only)
  onExecutionStart?(event: ExecutionStartEvent): void;
  onExecutionEmit?<TEvent>(event: ExecutionEmitEvent<TEvent>): void;
  onExecutionDone?<TResult>(event: ExecutionDoneEvent<TResult>): void;
  onExecutionError?<TResult>(event: ExecutionErrorEvent<TResult>): void;

  // Generic Logging
  log?(level: LogLevel, message: string, data?: Record<string, unknown>): void;
}
```

**Methods:**

| Method | When Called | Notes |
|--------|-------------|-------|
| `onLLMCallStart` | Before each `generateText()` or `streamText()` call | Contains request params |
| `onLLMCallEnd` | After each LLM call completes | Contains response, usage, duration |
| `onExecutionStart` | When streaming execution begins | First generator iteration |
| `onExecutionEmit` | For each `yield session.emit()` | Contains the emitted event |
| `onExecutionDone` | When `session.done()` is called | Contains result and summary |
| `onExecutionError` | When execution fails | Contains error and partial data |
| `log` | Called explicitly by agents | Generic logging method |

**Example:**

```typescript
import { createGoogleProvider } from '@agtlantis/core';
import type { Logger } from '@agtlantis/core';

// Implement only the methods you need
const myLogger: Logger = {
  onLLMCallEnd(event) {
    console.log(`${event.modelId}: ${event.response.duration}ms`);
  },
  onExecutionDone(event) {
    console.log('Total duration:', event.duration);
  },
};

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(myLogger);
```

---

### LogLevel

Log levels for the generic `log()` method.

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

**Example:**

```typescript
import { createLogger } from '@agtlantis/core';
import type { LogLevel } from '@agtlantis/core';

const logger = createLogger({
  log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const prefix = `[${level.toUpperCase()}]`;
    console.log(prefix, message, data ?? '');
  },
});
```

---

## Event Types

### LLMCallStartEvent

Event emitted when an LLM call starts (`generateText` or `streamText`).

```typescript
interface LLMCallStartEvent {
  /** Discriminator for type narrowing */
  type: 'llm_call_start';

  /** Type of LLM call (generateText or streamText) */
  callType: LLMCallLogType;

  /** Model identifier (e.g., 'gemini-2.5-flash', 'gpt-4o') */
  modelId: string;

  /** Unix timestamp in milliseconds */
  timestamp: number;

  /** Request information */
  request: {
    /** Parameters passed to the LLM call (excluding model) */
    params: Record<string, unknown>;
  };
}
```

**Example:**

```typescript
import { createLogger } from '@agtlantis/core';
import type { LLMCallStartEvent } from '@agtlantis/core';

const logger = createLogger({
  onLLMCallStart(event: LLMCallStartEvent) {
    console.log(`[${event.type}] Starting ${event.callType}`);
    console.log(`  Model: ${event.modelId}`);
    console.log(`  Time: ${new Date(event.timestamp).toISOString()}`);
    console.log(`  Params:`, event.request.params);
  },
});
```

---

### LLMCallEndEvent

Event emitted when an LLM call ends (success or error).

```typescript
interface LLMCallEndEvent {
  /** Discriminator for type narrowing */
  type: 'llm_call_end';

  /** Type of LLM call (generateText or streamText) */
  callType: LLMCallLogType;

  /** Model identifier */
  modelId: string;

  /** Unix timestamp in milliseconds */
  timestamp: number;

  /** Response information */
  response: {
    /** Duration of the call in milliseconds */
    duration: number;

    /** Token usage (available on success) */
    usage?: LanguageModelUsage;

    /** Raw response from AI SDK */
    raw: unknown;

    /** Error if the call failed */
    error?: Error;
  };
}
```

**Example - Success:**

```typescript
import { createLogger } from '@agtlantis/core';
import type { LLMCallEndEvent } from '@agtlantis/core';

const logger = createLogger({
  onLLMCallEnd(event: LLMCallEndEvent) {
    console.log(`[${event.type}] ${event.callType} completed`);
    console.log(`  Model: ${event.modelId}`);
    console.log(`  Duration: ${event.response.duration}ms`);

    if (event.response.usage) {
      console.log(`  Input tokens: ${event.response.usage.inputTokens}`);
      console.log(`  Output tokens: ${event.response.usage.outputTokens}`);
    }
  },
});
```

**Example - Error:**

```typescript
const logger = createLogger({
  onLLMCallEnd(event) {
    if (event.response.error) {
      console.error(`LLM call failed: ${event.response.error.message}`);
      console.error(`  Model: ${event.modelId}`);
      console.error(`  Duration until error: ${event.response.duration}ms`);
    }
  },
});
```

---

### LLMCallLogType

Type of LLM call for logging purposes.

```typescript
type LLMCallLogType = 'generateText' | 'streamText';
```

---

### ExecutionStartEvent

Event emitted when a streaming execution starts.

```typescript
interface ExecutionStartEvent {
  /** Discriminator for type narrowing */
  type: 'execution_start';

  /** Unix timestamp in milliseconds */
  timestamp: number;
}
```

**Example:**

```typescript
import { createLogger } from '@agtlantis/core';
import type { ExecutionStartEvent } from '@agtlantis/core';

const logger = createLogger({
  onExecutionStart(event: ExecutionStartEvent) {
    console.log(`Execution started at ${new Date(event.timestamp).toISOString()}`);
  },
});
```

---

### ExecutionEmitEvent<TEvent>

Event emitted for each intermediate event during execution. The event parameter includes `EventMetrics` with timing information.

```typescript
interface ExecutionEmitEvent<TEvent = unknown> {
  /** Discriminator for type narrowing */
  type: 'execution_emit';

  /** The emitted event (includes metrics in event.metrics) */
  event: TEvent;
}
```

**Example:**

```typescript
import { createLogger } from '@agtlantis/core';
import type { ExecutionEmitEvent, EventMetrics } from '@agtlantis/core';

type MyEvent = {
  type: string;
  message?: string;
  metrics: EventMetrics;
};

const logger = createLogger({
  onExecutionEmit(event: ExecutionEmitEvent<MyEvent>) {
    const emitted = event.event;
    console.log(`Event: ${emitted.type}`);
    console.log(`  Message: ${emitted.message}`);
    console.log(`  Elapsed: ${emitted.metrics.elapsedMs}ms`);
    console.log(`  Delta: ${emitted.metrics.deltaMs}ms`);
  },
});
```

---

### ExecutionDoneEvent<TResult>

Event emitted when execution completes successfully.

```typescript
interface ExecutionDoneEvent<TResult = unknown> {
  /** Discriminator for type narrowing */
  type: 'execution_done';

  /** Unix timestamp in milliseconds */
  timestamp: number;

  /** Total execution duration in milliseconds */
  duration: number;

  /** The result data */
  data: TResult;

  /** Session summary with usage tracking */
  summary: SessionSummary;
}
```

**Example:**

```typescript
import { createLogger } from '@agtlantis/core';
import type { ExecutionDoneEvent } from '@agtlantis/core';

const logger = createLogger({
  onExecutionDone(event: ExecutionDoneEvent<string>) {
    console.log(`Execution completed in ${event.duration}ms`);
    console.log(`  Result: ${event.data}`);
    console.log(`  LLM calls: ${event.summary.llmCallCount}`);
    console.log(`  Total tokens: ${event.summary.totalLLMUsage.totalTokens}`);
    console.log(`  Total cost: $${event.summary.totalCost.toFixed(4)}`);
  },
});
```

---

### ExecutionErrorEvent<TResult>

Event emitted when execution fails with an error.

```typescript
interface ExecutionErrorEvent<TResult = unknown> {
  /** Discriminator for type narrowing */
  type: 'execution_error';

  /** Unix timestamp in milliseconds */
  timestamp: number;

  /** Execution duration until error in milliseconds */
  duration: number;

  /** The error that occurred */
  error: Error;

  /** Partial result data (if available) */
  data?: TResult;

  /** Session summary (if available) */
  summary?: SessionSummary;
}
```

**Example:**

```typescript
import { createLogger } from '@agtlantis/core';
import type { ExecutionErrorEvent } from '@agtlantis/core';

const logger = createLogger({
  onExecutionError(event: ExecutionErrorEvent) {
    console.error(`Execution failed after ${event.duration}ms`);
    console.error(`  Error: ${event.error.message}`);

    if (event.data) {
      console.log(`  Partial data:`, event.data);
    }

    if (event.summary) {
      console.log(`  LLM calls made: ${event.summary.llmCallCount}`);
    }
  },
});
```

---

## Functions

### createLogger()

Helper function to create a logger with type safety. Returns a `Logger` instance with only the handlers you provide.

```typescript
function createLogger(handlers: Partial<Logger>): Logger;
```

**Example:**

```typescript
import { createLogger } from '@agtlantis/core';

// Create a logger with only the handlers you need
const metricsLogger = createLogger({
  onLLMCallEnd(event) {
    recordLatency(event.modelId, event.response.duration);
    if (event.response.usage) {
      recordTokens(event.modelId, event.response.usage.totalTokens);
    }
  },
  onExecutionDone(event) {
    recordCost(event.summary.totalCost);
  },
});
```

---

### noopLogger

A no-op logger that does nothing. Useful as an explicit "no logging" value.

```typescript
const noopLogger: Logger = {};
```

**Example:**

```typescript
import { createGoogleProvider, noopLogger } from '@agtlantis/core';

// Explicitly disable logging
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withLogger(noopLogger);

// Same effect as omitting withLogger(), but more explicit
```

---

## Integration

### Provider.withLogger()

Attach a logger to a provider. The logger receives events for all executions created by that provider.

```typescript
interface Provider {
  withLogger(logger: Logger): Provider;
}
```

**Example:**

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';

const logger = createLogger({
  onLLMCallEnd(event) {
    console.log(`${event.modelId}: ${event.response.duration}ms`);
  },
});

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(logger);

// All executions from this provider will use the logger
const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello' });
  return result.text;
});
```

### Logging with Multiple Providers

Each provider can have its own logger:

```typescript
import { createGoogleProvider, createOpenAIProvider, createLogger } from '@agtlantis/core';

const googleLogger = createLogger({
  onLLMCallEnd(event) {
    console.log(`[Google] ${event.modelId}: ${event.response.duration}ms`);
  },
});

const openaiLogger = createLogger({
  onLLMCallEnd(event) {
    console.log(`[OpenAI] ${event.modelId}: ${event.response.duration}ms`);
  },
});

const google = createGoogleProvider({ apiKey: process.env.GOOGLE_API_KEY })
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(googleLogger);

const openai = createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })
  .withDefaultModel('gpt-4o')
  .withLogger(openaiLogger);
```

---

## Examples

### Basic LLM Call Logging

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';

const logger = createLogger({
  onLLMCallStart(event) {
    console.log(`Starting ${event.callType} with ${event.modelId}...`);
  },
  onLLMCallEnd(event) {
    if (event.response.error) {
      console.error(`Failed: ${event.response.error.message}`);
    } else {
      console.log(`Completed in ${event.response.duration}ms`);
      console.log(`Tokens: ${event.response.usage?.totalTokens ?? 'N/A'}`);
    }
  },
});

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(logger);

const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello, world!' });
  return result.text;
});

await execution.toResult();
```

### Full Execution Lifecycle Tracking

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';
import type { EventMetrics } from '@agtlantis/core';

type ProgressEvent = {
  type: 'progress' | 'complete' | 'error';
  message?: string;
  data?: string;
  metrics: EventMetrics;
};

const logger = createLogger({
  onExecutionStart(event) {
    console.log('=== Execution Started ===');
  },
  onLLMCallStart(event) {
    console.log(`  -> LLM Call: ${event.callType} (${event.modelId})`);
  },
  onLLMCallEnd(event) {
    console.log(`  <- LLM Done: ${event.response.duration}ms`);
  },
  onExecutionEmit(event) {
    const e = event.event as ProgressEvent;
    console.log(`  [${e.metrics.elapsedMs}ms] Event: ${e.type}`);
  },
  onExecutionDone(event) {
    console.log('=== Execution Complete ===');
    console.log(`Duration: ${event.duration}ms`);
    console.log(`LLM Calls: ${event.summary.llmCallCount}`);
    console.log(`Total Cost: $${event.summary.totalCost.toFixed(4)}`);
  },
  onExecutionError(event) {
    console.error('=== Execution Failed ===');
    console.error(`Error: ${event.error.message}`);
  },
});

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(logger);

const execution = provider.streamingExecution<ProgressEvent, string>(
  async function* (session) {
    yield session.emit({ type: 'progress', message: 'Starting...' });

    const result = await session.generateText({ prompt: 'Tell me a joke.' });

    yield session.emit({ type: 'progress', message: 'Got response!' });

    return session.done(result.text);
  }
);

for await (const event of execution) {
  // Events are also logged by the logger
}

await execution.cleanup();
```

### JSON Structured Logging for Production

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';

const logger = createLogger({
  onLLMCallEnd(event) {
    const logEntry = {
      timestamp: new Date(event.timestamp).toISOString(),
      event: 'llm_call_complete',
      model: event.modelId,
      call_type: event.callType,
      duration_ms: event.response.duration,
      input_tokens: event.response.usage?.inputTokens,
      output_tokens: event.response.usage?.outputTokens,
      total_tokens: event.response.usage?.totalTokens,
      success: !event.response.error,
      error: event.response.error?.message,
    };

    // Output JSON for log aggregation (ELK, Datadog, etc.)
    console.log(JSON.stringify(logEntry));
  },

  onExecutionDone(event) {
    const logEntry = {
      timestamp: new Date(event.timestamp).toISOString(),
      event: 'execution_complete',
      duration_ms: event.duration,
      llm_calls: event.summary.llmCallCount,
      total_tokens: event.summary.totalLLMUsage.totalTokens,
      total_cost_usd: event.summary.totalCost,
    };

    console.log(JSON.stringify(logEntry));
  },

  onExecutionError(event) {
    const logEntry = {
      timestamp: new Date(event.timestamp).toISOString(),
      event: 'execution_error',
      duration_ms: event.duration,
      error: event.error.message,
      error_stack: event.error.stack,
    };

    console.log(JSON.stringify(logEntry));
  },
});
```

---

## See Also

- [Observability Guide](../guides/observability-guide.md) - Comprehensive guide with examples
- [Provider Guide](../guides/provider-guide.md) - Configure providers with logging
- [Session API Reference](./session.md) - Session types and SessionSummary
