# Observability Guide

> Learn how to monitor, debug, and analyze your AI agent executions with the Logger interface.

## Table of contents

- [Overview](#overview)
- [Quick start](#quick-start)
- [Basic usage](#basic-usage)
  - [Tracking LLM calls](#tracking-llm-calls)
  - [Understanding event sequences](#understanding-event-sequences)
  - [Execution lifecycle events](#execution-lifecycle-events)
  - [Call type identification](#call-type-identification)
- [Advanced usage](#advanced-usage)
  - [Custom loggers](#custom-loggers)
  - [Metrics aggregation](#metrics-aggregation)
  - [Error tracking](#error-tracking)
  - [Latency monitoring with EventMetrics](#latency-monitoring-with-eventmetrics)
  - [OpenTelemetry integration](#opentelemetry-integration)
  - [Conditional logging](#conditional-logging)
  - [Combining multiple loggers](#combining-multiple-loggers)
- [Best practices](#best-practices)
  - [What to log](#what-to-log)
  - [Performance considerations](#performance-considerations)
  - [Production patterns](#production-patterns)
  - [Using noopLogger](#using-nooplogger)
- [See also](#see-also)

---

## Overview

Observability in @agtlantis/core helps you understand what's happening inside your agent executions. The Logger interface provides hooks into key events:

| Event Type | When It Fires | Use Case |
|------------|--------------|----------|
| LLM Call Events | Start/end of each AI SDK call | Latency tracking, token monitoring |
| Execution Events | Start/emit/done/error of streaming executions | Progress monitoring, error tracking |
| Generic Log | Custom messages at any time | Debug logging, audit trails |

You can implement just the events you care about - all methods are optional.

## Quick Start

Here's the simplest way to add logging to your provider:

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';

// Create a logger that tracks LLM calls
const logger = createLogger({
  onLLMCallEnd(event) {
    console.log(`[${event.modelId}] ${event.response.duration}ms`);
    if (event.response.usage) {
      console.log(`  Tokens: ${event.response.usage.totalTokens}`);
    }
  },
});

// Attach to provider with withLogger()
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(logger);

// Now all LLM calls are logged automatically
const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello, world!' });
  return result.text;
});

const text = await execution.toResult();
console.log(text);
// Output: [gemini-2.5-flash] 523ms
//         Tokens: 42
```

## Basic Usage

### Tracking LLM Calls

The most common observability need is tracking LLM calls. Use `onLLMCallStart` and `onLLMCallEnd` to monitor every AI SDK call:

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';
import type { LLMCallStartEvent, LLMCallEndEvent } from '@agtlantis/core';

const logger = createLogger({
  onLLMCallStart(event: LLMCallStartEvent) {
    console.log(`Starting ${event.callType} with ${event.modelId}`);
    console.log(`  Timestamp: ${new Date(event.timestamp).toISOString()}`);
  },

  onLLMCallEnd(event: LLMCallEndEvent) {
    console.log(`Completed ${event.callType} with ${event.modelId}`);
    console.log(`  Duration: ${event.response.duration}ms`);

    if (event.response.error) {
      console.error(`  Error: ${event.response.error.message}`);
    } else if (event.response.usage) {
      console.log(`  Input tokens: ${event.response.usage.inputTokens}`);
      console.log(`  Output tokens: ${event.response.usage.outputTokens}`);
    }
  },
});

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(logger);
```

### Understanding Event Sequences

LLM events always fire in pairs. For each `generateText()` or `streamText()` call, you'll receive:

1. `onLLMCallStart` - When the call begins
2. `onLLMCallEnd` - When the call completes (success or failure)

For multiple LLM calls in a single execution:

```typescript
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(logger);

const execution = provider.simpleExecution(async (session) => {
  // First call: onLLMCallStart -> onLLMCallEnd
  const first = await session.generateText({ prompt: 'Say 1' });

  // Second call: onLLMCallStart -> onLLMCallEnd
  const second = await session.generateText({ prompt: 'Say 2' });

  return { first: first.text, second: second.text };
});

// Event order: llm-start, llm-end, llm-start, llm-end
```

### Execution Lifecycle Events

For streaming executions, you can also track the overall execution lifecycle:

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';
import type {
  ExecutionStartEvent,
  ExecutionEmitEvent,
  ExecutionDoneEvent,
  ExecutionErrorEvent,
} from '@agtlantis/core';

const logger = createLogger({
  onExecutionStart(event: ExecutionStartEvent) {
    console.log(`Execution started at ${new Date(event.timestamp).toISOString()}`);
  },

  onExecutionEmit(event: ExecutionEmitEvent) {
    console.log('Intermediate event:', event.event);
  },

  onExecutionDone(event: ExecutionDoneEvent) {
    console.log(`Execution completed in ${event.duration}ms`);
    console.log(`  Result:`, event.data);
    console.log(`  LLM calls: ${event.summary.llmCallCount}`);
    console.log(`  Total tokens: ${event.summary.totalLLMUsage.totalTokens}`);
  },

  onExecutionError(event: ExecutionErrorEvent) {
    console.error(`Execution failed after ${event.duration}ms`);
    console.error(`  Error: ${event.error.message}`);
  },
});

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(logger);

// Execution lifecycle events fire for streamingExecution
const execution = provider.streamingExecution<MyEvent, string>(
  async function* (session) {
    yield session.emit({ type: 'progress', message: 'Working...' });
    const result = await session.generateText({ prompt: 'Hello' });
    return session.done(result.text);
  }
);

for await (const event of execution) {
  // Process events
}
```

> **Note:** Execution lifecycle events (`onExecutionStart`, `onExecutionEmit`, `onExecutionDone`, `onExecutionError`) only fire for `streamingExecution`. For `simpleExecution`, only LLM call events are emitted.

### Call Type Identification

The `callType` field tells you which AI SDK method was used:

```typescript
const logger = createLogger({
  onLLMCallEnd(event) {
    switch (event.callType) {
      case 'generateText':
        console.log('Non-streaming text generation');
        break;
      case 'streamText':
        console.log('Streaming text generation');
        break;
    }
  },
});
```

## Advanced Usage

### Custom Loggers

For production systems, you'll want to integrate with your existing logging infrastructure:

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';
import type { LogLevel } from '@agtlantis/core';

// Integration with Winston, Pino, or any logging library
const logger = createLogger({
  log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    switch (level) {
      case 'debug':
        myLogger.debug(message, data);
        break;
      case 'info':
        myLogger.info(message, data);
        break;
      case 'warn':
        myLogger.warn(message, data);
        break;
      case 'error':
        myLogger.error(message, data);
        break;
    }
  },

  onLLMCallEnd(event) {
    // Also log LLM calls to your observability platform
    myLogger.info('LLM call completed', {
      model: event.modelId,
      duration: event.response.duration,
      tokens: event.response.usage?.totalTokens,
    });
  },
});
```

### Metrics Aggregation

Build a logger that aggregates metrics across multiple executions:

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';
import type { LLMCallEndEvent, ExecutionDoneEvent } from '@agtlantis/core';

class MetricsAggregator {
  private totalCalls = 0;
  private totalTokens = 0;
  private totalDuration = 0;
  private errors = 0;

  recordLLMCall(event: LLMCallEndEvent) {
    this.totalCalls++;
    this.totalDuration += event.response.duration;

    if (event.response.error) {
      this.errors++;
    } else if (event.response.usage) {
      this.totalTokens += event.response.usage.totalTokens;
    }
  }

  getStats() {
    return {
      totalCalls: this.totalCalls,
      totalTokens: this.totalTokens,
      totalDuration: this.totalDuration,
      averageDuration: this.totalCalls > 0 ? this.totalDuration / this.totalCalls : 0,
      errorRate: this.totalCalls > 0 ? this.errors / this.totalCalls : 0,
    };
  }
}

const metrics = new MetricsAggregator();

const logger = createLogger({
  onLLMCallEnd(event) {
    metrics.recordLLMCall(event);
  },
});

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(logger);

// After running executions, check metrics
console.log('Aggregated metrics:', metrics.getStats());
```

### Error Tracking

Track and report errors for debugging and alerting:

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';
import type { LLMCallEndEvent, ExecutionErrorEvent } from '@agtlantis/core';

const logger = createLogger({
  onLLMCallEnd(event) {
    if (event.response.error) {
      // Report to error tracking service (Sentry, etc.)
      reportError(event.response.error, {
        model: event.modelId,
        callType: event.callType,
        duration: event.response.duration,
      });
    }
  },

  onExecutionError(event) {
    // Track execution-level failures
    reportError(event.error, {
      duration: event.duration,
      partialData: event.data,
    });
  },
});
```

### Latency Monitoring with EventMetrics

Events in streaming executions include detailed timing metrics:

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';
import type { EventMetrics } from '@agtlantis/core';

const logger = createLogger({
  onExecutionEmit(event) {
    // event.event contains the emitted event with metrics
    const emittedEvent = event.event as { type: string; metrics: EventMetrics };

    console.log(`Event type: ${emittedEvent.type}`);
    console.log(`  Timestamp: ${emittedEvent.metrics.timestamp}`);
    console.log(`  Elapsed since start: ${emittedEvent.metrics.elapsedMs}ms`);
    console.log(`  Delta from last event: ${emittedEvent.metrics.deltaMs}ms`);
  },
});
```

The `EventMetrics` type provides three timing values:

| Field | Description |
|-------|-------------|
| `timestamp` | Unix timestamp in milliseconds when the event was emitted |
| `elapsedMs` | Milliseconds elapsed since execution started |
| `deltaMs` | Milliseconds since the previous event (0 for first event) |

### OpenTelemetry Integration

For distributed tracing, you can integrate with OpenTelemetry:

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('agtlantis');

const logger = createLogger({
  onLLMCallStart(event) {
    const span = tracer.startSpan(`llm.${event.callType}`, {
      attributes: {
        'llm.model': event.modelId,
        'llm.call_type': event.callType,
      },
    });
    // Store span reference for later (e.g., in AsyncLocalStorage)
    storeCurrentSpan(span);
  },

  onLLMCallEnd(event) {
    const span = getCurrentSpan();
    if (span) {
      span.setAttributes({
        'llm.duration_ms': event.response.duration,
        'llm.input_tokens': event.response.usage?.inputTokens ?? 0,
        'llm.output_tokens': event.response.usage?.outputTokens ?? 0,
      });

      if (event.response.error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: event.response.error.message });
      }

      span.end();
    }
  },
});
```

### Conditional Logging

Create loggers that filter based on environment or conditions:

```typescript
import { createGoogleProvider, createLogger, noopLogger } from '@agtlantis/core';

function createEnvironmentLogger() {
  // Use noop logger in production to minimize overhead
  if (process.env.NODE_ENV === 'production') {
    return createLogger({
      // Only log errors in production
      onLLMCallEnd(event) {
        if (event.response.error) {
          console.error(`LLM Error: ${event.response.error.message}`);
        }
      },
    });
  }

  // Verbose logging in development
  return createLogger({
    onLLMCallStart(event) {
      console.log(`[DEV] Starting ${event.callType}...`);
    },
    onLLMCallEnd(event) {
      console.log(`[DEV] Completed in ${event.response.duration}ms`);
      console.log(`[DEV] Tokens: ${event.response.usage?.totalTokens ?? 'N/A'}`);
    },
  });
}

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(createEnvironmentLogger());
```

### Combining Multiple Loggers

You can create a composite logger that delegates to multiple loggers:

```typescript
import { createLogger } from '@agtlantis/core';
import type { Logger } from '@agtlantis/core';

function combineLoggers(...loggers: Logger[]): Logger {
  return createLogger({
    onLLMCallStart(event) {
      loggers.forEach((l) => l.onLLMCallStart?.(event));
    },
    onLLMCallEnd(event) {
      loggers.forEach((l) => l.onLLMCallEnd?.(event));
    },
    onExecutionStart(event) {
      loggers.forEach((l) => l.onExecutionStart?.(event));
    },
    onExecutionEmit(event) {
      loggers.forEach((l) => l.onExecutionEmit?.(event));
    },
    onExecutionDone(event) {
      loggers.forEach((l) => l.onExecutionDone?.(event));
    },
    onExecutionError(event) {
      loggers.forEach((l) => l.onExecutionError?.(event));
    },
    log(level, message, data) {
      loggers.forEach((l) => l.log?.(level, message, data));
    },
  });
}

// Use it to combine metrics + console logging + error reporting
const logger = combineLoggers(metricsLogger, consoleLogger, errorReportingLogger);
```

## Best Practices

### What to Log

**Do log:**
- LLM call durations for latency monitoring
- Token usage for cost tracking
- Errors and failures for debugging
- Model identifiers for A/B testing

**Avoid logging:**
- Full request/response content (privacy, size)
- Sensitive data in custom records
- High-frequency events without sampling

### Performance Considerations

Logger methods are called synchronously. Keep them fast:

```typescript
// Good: Quick synchronous logging
const logger = createLogger({
  onLLMCallEnd(event) {
    metricsBuffer.push({
      model: event.modelId,
      duration: event.response.duration,
    });
    // Batch flush later
  },
});

// Avoid: Slow synchronous operations
const logger = createLogger({
  onLLMCallEnd(event) {
    // Don't do synchronous I/O in logger methods
    fs.writeFileSync('log.txt', JSON.stringify(event));
  },
});
```

### Production Patterns

For production deployments:

1. **Use structured logging** - Output JSON for log aggregation systems
2. **Sample high-volume events** - Not every intermediate event needs logging
3. **Batch metrics** - Aggregate and send metrics in batches
4. **Handle errors gracefully** - Logger errors shouldn't crash your app

```typescript
import { createLogger } from '@agtlantis/core';

const productionLogger = createLogger({
  onLLMCallEnd(event) {
    try {
      // Structured JSON output
      console.log(
        JSON.stringify({
          type: 'llm_call',
          model: event.modelId,
          call_type: event.callType,
          duration_ms: event.response.duration,
          tokens: event.response.usage?.totalTokens,
          success: !event.response.error,
          timestamp: event.timestamp,
        })
      );
    } catch (err) {
      // Don't let logger errors propagate
      console.error('Logger error:', err);
    }
  },
});
```

### Using noopLogger

When you want to explicitly disable logging:

```typescript
import { createGoogleProvider, noopLogger } from '@agtlantis/core';

// Explicitly no logging (same as omitting logger)
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withLogger(noopLogger);
```

This is useful when you want to be explicit about not logging, or when conditionally choosing between a real logger and no logging.

## See Also

- [Observability API Reference](../api/observability.md) - Complete type documentation
- [Provider Guide](./provider-guide.md) - Configure providers with logging
- [Streaming Guide](./streaming-guide.md) - Streaming executions and events
