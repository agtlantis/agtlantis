# Execution API Reference

> Complete type documentation for execution abstractions in @agtlantis/core.

## Overview

The execution module provides abstractions for running AI operations with cancellation support. This module includes:

- **Execution** - Base interface for all execution types
- **SimpleExecution** - Non-streaming execution with `cancel()` support
- **StreamingExecution** - Event streaming execution with `stream()` method
- **ExecutionResult** - Discriminated union for execution outcomes
- **ExecutionOptions** - Configuration options including AbortSignal

## Import

```typescript
import {
  type Execution,
  type SimpleExecution,
  type StreamingExecution,
  type ExecutionResult,
  type StreamingResult,
  type ExecutionOptions,
  // Type helpers for event definitions (deprecated - no longer needed)
  // type SessionEvent,      // deprecated: framework adds metrics automatically
  // type SessionEventInput, // deprecated: use event type directly
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

const result = await execution.result();
if (result.status === 'succeeded') {
  console.log(result.value);
} else if (result.status === 'canceled') {
  console.log('Operation timed out or was cancelled');
} else {
  console.error('Failed:', result.error);
}
// Summary is always available
console.log(`Cost: $${result.summary.totalCost}`);
```

---

### ExecutionStatus

Status of the execution outcome.

```typescript
type ExecutionStatus = 'succeeded' | 'failed' | 'canceled';
```

---

### ExecutionResult<T>

Discriminated union representing all possible execution outcomes. The `summary` is always available regardless of status.

```typescript
type ExecutionResult<T> =
  | { status: 'succeeded'; value: T; summary: SessionSummary }
  | { status: 'failed'; error: Error; summary: SessionSummary }
  | { status: 'canceled'; summary: SessionSummary };
```

**Key benefit:** Unlike the previous API where `getSummary()` was only available on success, this pattern guarantees `summary` access even on failures or cancellations.

---

### Execution<T>

Base interface for all execution types. Both streaming and simple executions implement this interface.

```typescript
interface Execution<T> extends AsyncDisposable {
  /**
   * Get the execution result with status, value/error, and summary.
   * Returns a discriminated union based on execution outcome.
   */
  result(): Promise<ExecutionResult<T>>;

  /**
   * Request cancellation of the execution.
   * Aborts the current LLM call if in progress.
   * No-op if execution already completed.
   */
  cancel(): void;

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

### SimpleResult<T>

Result type for simple (non-streaming) executions. Alias for `ExecutionResult<T>`.

```typescript
type SimpleResult<T> = ExecutionResult<T>;
```

---

### SimpleExecution<T>

Non-streaming execution with cancellation support.

```typescript
interface SimpleExecution<T> extends Execution<T> {
  result(): Promise<SimpleResult<T>>;
}
```

**Key Characteristics:**

| Aspect | Behavior |
|--------|----------|
| Start timing | Immediate (eager evaluation) |
| Return type | Sync (no await needed) |
| Cancellation | `cancel()` or external signal |
| Result access | `await execution.result()` |

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

const result = await execution.result();
if (result.status === 'succeeded') {
  console.log(result.value);
} else if (result.status === 'canceled') {
  console.log('Cancelled!');
} else {
  console.error('Failed:', result.error);
}
// Summary always available
console.log('Tokens:', result.summary.totalLLMUsage.totalTokens);
```

---

### StreamingResult<TEvent, T>

Result type for streaming executions. Extends `ExecutionResult<T>` with collected events.

```typescript
type StreamingResult<TEvent, T> = ExecutionResult<T> & {
  readonly events: readonly TEvent[];
};
```

**Key benefit:** All emitted events are captured and available via `result().events`, even if you skip streaming.

---

### StreamingExecution<TEvent, T>

Streaming execution that yields events during execution. Uses explicit `stream()` method for event access.

```typescript
interface StreamingExecution<TEvent, T> extends Execution<T> {
  /**
   * Access the event stream.
   * Events are yielded as they are emitted by the generator.
   */
  stream(): AsyncIterable<TEvent>;

  /**
   * Get the result with all collected events.
   */
  result(): Promise<StreamingResult<TEvent, T>>;
}
```

**Example:**

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// Define event types - metrics are added automatically by the framework
type MyEvent =
  | { type: 'progress'; message: string }
  | { type: 'complete'; data: string }
  | { type: 'error'; error: Error };

const execution = provider.streamingExecution<MyEvent, string>(
  async function* (session) {
    yield session.emit({ type: 'progress', message: 'Working...' });
    const result = await session.generateText({ prompt: 'Hello' });
    return session.done(result.text);
  }
);

// Consume events via stream() method
for await (const event of execution.stream()) {
  console.log(`[${event.metrics.elapsedMs}ms] ${event.type}`);
}

// Get result with all events
const result = await execution.result();
if (result.status === 'succeeded') {
  console.log('Value:', result.value);
  console.log('All events:', result.events);
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

const result = await execution.result();
switch (result.status) {
  case 'succeeded':
    displayResult(result.value);
    break;
  case 'canceled':
    showCancelledMessage();
    break;
  case 'failed':
    showErrorMessage(result.error);
    break;
}
// Log usage regardless of outcome
console.log('Tokens used:', result.summary.totalLLMUsage.totalTokens);
```

---

## Breaking Changes (v0.2)

### Execution Result Pattern

**Core Changes:**

1. `toResult()` + `getSummary()` → `result()` 통합
2. `StreamingExecution`이 더 이상 `AsyncIterable`을 직접 구현하지 않음
3. 실패/취소 시에도 summary 접근 가능

**Before:**
```typescript
try {
  for await (const event of execution) {
    console.log(event);
  }
  const value = await execution.toResult();
  const summary = await execution.getSummary();
} catch (error) {
  // summary 접근 불가
}
```

**After:**
```typescript
for await (const event of execution.stream()) {
  console.log(event);
}
const result = await execution.result();
// result.status: 'succeeded' | 'failed' | 'canceled'
// result.summary: 항상 접근 가능
// result.events: 모든 이벤트 (StreamingExecution)
```

**Migration Steps:**

| Before | After |
|--------|-------|
| `await execution.toResult()` | `await execution.result()` → `result.value` |
| `await execution.getSummary()` | `await execution.result()` → `result.summary` |
| `for await (const e of execution)` | `for await (const e of execution.stream())` |
| `try/catch` for error handling | `result.status === 'failed'` check |

---

### simpleExecution Return Type Change

**Before (v0.1):**
```typescript
// simpleExecution returned Promise<Execution<T>>
const execution = await provider.simpleExecution(fn);
const result = await execution.toResult();
```

**After (v0.2):**
```typescript
// simpleExecution returns SimpleExecution<T> directly (sync)
const execution = provider.simpleExecution(fn);
const result = await execution.result();
console.log(result.value);
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
