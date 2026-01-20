# Execution API Reference

> Complete type documentation for execution abstractions in @agtlantis/core.

## Overview

The execution module provides abstractions for running AI operations with cancellation support. This module includes:

- **Execution** - Base interface for all execution types
- **SimpleExecution** - Non-streaming execution with `cancel()` support
- **StreamingExecution** - Async iterable execution with event streaming
- **ExecutionOptions** - Configuration options including AbortSignal

## Import

```typescript
import {
  type Execution,
  type SimpleExecution,
  type StreamingExecution,
  type ExecutionOptions,
  // Type helpers for event definitions
  type SessionEvent,
  type SessionEventInput,
} from '@agtlantis/core';
```

## Types

### ExecutionOptions

Configuration options for execution. Used by both `simpleExecution` and `streamingExecution`.

```typescript
interface ExecutionOptions {
  /**
   * AbortSignal for external cancellation.
   * Combined with internal AbortController - both can trigger cancellation.
   */
  signal?: AbortSignal;
}
```

**Example:**

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

// Use external AbortController for timeout
const controller = new AbortController();
setTimeout(() => controller.abort(), 10000); // 10 second timeout

const execution = provider.simpleExecution(
  async (session) => {
    const result = await session.generateText({ prompt: 'Write a story' });
    return result.text;
  },
  { signal: controller.signal }
);

try {
  const text = await execution.toResult();
  console.log(text);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Operation timed out');
  }
}
```

---

### Execution<TResult>

Base interface for all execution types. Both streaming and simple executions implement this interface.

```typescript
interface Execution<TResult> extends AsyncDisposable {
  /**
   * Consume the execution and return the final result.
   * For streaming executions, this consumes all events first.
   */
  toResult(): Promise<TResult>;

  /**
   * Get execution metadata (token usage, duration, etc.).
   * Only available after execution completes.
   */
  getSummary(): Promise<SessionSummary>;

  /**
   * Cleanup resources (uploaded files, connections, etc.).
   * Safe to call multiple times.
   */
  cleanup(): Promise<void>;

  /**
   * Async disposal for `await using` syntax (TS 5.2+).
   */
  [Symbol.asyncDispose](): Promise<void>;
}
```

---

### SimpleExecution<TResult>

Non-streaming execution with cancellation support. Extends `Execution` with a `cancel()` method.

```typescript
interface SimpleExecution<TResult> extends Execution<TResult> {
  /**
   * Request cancellation of the execution.
   * Aborts the current LLM call if in progress.
   * Works even if custom signal was provided (signals are combined).
   *
   * No-op if execution already completed.
   */
  cancel(): void;
}
```

**Key Characteristics:**

| Aspect | Behavior |
|--------|----------|
| Start timing | Immediate (eager evaluation) |
| Return type | Sync (no await needed) |
| Cancellation | `cancel()` or external signal |
| Result access | `await execution.toResult()` |

**Example:**

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// Start execution (returns immediately - execution runs in background)
const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello' });
  return result.text;
});

// Can cancel at any time
setTimeout(() => execution.cancel(), 5000);

try {
  const text = await execution.toResult();
  console.log(text);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Cancelled!');
  }
}
```

---

### StreamingExecution<TEvent, TResult>

Streaming execution that yields events during execution. Extends both `Execution` and `AsyncIterable`.

```typescript
interface StreamingExecution<TEvent, TResult>
  extends Execution<TResult>,
    AsyncIterable<TEvent> {
  /**
   * Request cancellation (cooperative).
   * The generator must check for cancellation and stop gracefully.
   */
  cancel(): void;
}
```

**Example:**

```typescript
import { createGoogleProvider, SessionEvent } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

type MyEvent = SessionEvent<
  | { type: 'progress'; message: string }
  | { type: 'complete'; data: string }
  | { type: 'error'; error: Error }
>;

const execution = provider.streamingExecution<MyEvent, string>(
  async function* (session) {
    yield session.emit({ type: 'progress', message: 'Working...' });
    const result = await session.generateText({ prompt: 'Hello' });
    return session.done(result.text);
  }
);

// Consume events
for await (const event of execution) {
  console.log(`[${event.metrics.elapsedMs}ms] ${event.type}`);
}

await execution.cleanup();
```

**Auto-abort on Terminal Events:**

When a streaming execution yields a `complete` or `error` event, the internal abort signal is automatically triggered. This ensures:

- No additional AI calls can be made after the execution logically completes
- Prevents accidental resource usage from forgotten `return` statements
- The terminal event is always delivered to consumers before abort

```typescript
// Safe: auto-abort protects against forgotten returns
const execution = provider.streamingExecution<MyEvent, string>(
  async function* (session) {
    const result = await session.generateText({ prompt: 'Hello' });
    yield session.done(result.text);  // complete event → auto-abort

    // Even without return, subsequent AI calls will fail with AbortError
    await session.generateText({ prompt: 'This will fail' });  // throws AbortError
  }
);
```

See the [Cancellation Guide](../guides/cancellation.md#automatic-termination-on-terminal-events) for detailed behavior.

---

## cancel() Method

The `cancel()` method requests cancellation of in-progress LLM operations.

### How It Works

1. **Internal AbortController**: Each execution creates its own `AbortController`
2. **Signal Combination**: If you provide an external signal via `ExecutionOptions`, it's combined with the internal one
3. **AI SDK Integration**: The combined signal is passed to AI SDK's `generateText`/`streamText` calls
4. **AbortError**: Cancelled operations throw an `AbortError`

### Signal Combination Behavior

| Scenario | Result |
|----------|--------|
| Call `execution.cancel()` | Internal AbortController aborts → AI SDK request cancelled |
| External signal aborts | Combined signal aborts → AI SDK request cancelled |
| Call `cancel()` after completion | No-op (safe to call) |
| Both cancel and external abort | First one triggers cancellation |

### Example: Dual Cancellation

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

// External timeout
const timeoutController = new AbortController();
setTimeout(() => timeoutController.abort(), 30000);

const execution = provider.simpleExecution(
  async (session) => {
    const result = await session.generateText({ prompt: 'Write an essay' });
    return result.text;
  },
  { signal: timeoutController.signal }
);

// User clicks "Cancel" button
document.getElementById('cancel-btn')?.addEventListener('click', () => {
  execution.cancel();
});

try {
  const text = await execution.toResult();
  displayResult(text);
} catch (error) {
  if (error.name === 'AbortError') {
    showCancelledMessage();
  } else {
    showErrorMessage(error);
  }
}
```

---

## Breaking Changes (v2.0)

### simpleExecution Return Type Change

**Before (v1.x):**
```typescript
// simpleExecution returned Promise<Execution<T>>
const execution = await provider.simpleExecution(fn);
const result = await execution.toResult();
```

**After (v2.x):**
```typescript
// simpleExecution returns SimpleExecution<T> directly (sync)
const execution = provider.simpleExecution(fn);
const result = await execution.toResult();
```

**Migration:** Remove the first `await` when calling `simpleExecution()`.

### Why This Change?

The new API enables cancellation of in-progress LLM calls:

```typescript
// Now possible - cancel before completion
const execution = provider.simpleExecution(fn);
execution.cancel(); // Can cancel immediately
```

Previously, the `await` blocked until execution completed, making early cancellation impossible.

---

## See Also

- [Cancellation Guide](../guides/cancellation.md) - Comprehensive guide to cancellation patterns
- [Session API](./session.md) - Session interfaces and metadata
- [Streaming Guide](../guides/streaming-guide.md) - Event streaming patterns
