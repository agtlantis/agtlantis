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
  // Event type helpers
  type CompletionEvent,
  type ErrorEvent,
  type ExtractResult,
  type SessionEvent,
  // Execution mapping
  mapExecution,
  mapExecutionResult,
  type ReplaceResult,
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

**Key benefit:** `summary` is always accessible regardless of execution status (succeeded, failed, or canceled).

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

### StreamingExecution\<TEvent\>

Streaming execution that yields events during execution. Uses explicit `stream()` method for event access.

- `TEvent` — your event union type (must include `CompletionEvent<TResult>`)
- Result type is automatically extracted via `ExtractResult<TEvent>`
- `ErrorEvent` is auto-included in `stream()` and `result()` return types

```typescript
interface StreamingExecution<TEvent extends { type: string }>
  extends Execution<ExtractResult<TEvent>> {
  /**
   * Access the event stream.
   * Events are yielded with metrics. ErrorEvent is auto-included.
   */
  stream(): AsyncIterable<SessionEvent<TEvent | ErrorEvent>>;

  /**
   * Get the result with all collected events.
   */
  result(): Promise<StreamingResult<SessionEvent<TEvent | ErrorEvent>, ExtractResult<TEvent>>>;
}
```

**Example:**

```typescript
import { createGoogleProvider, type CompletionEvent } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// Define event types — CompletionEvent defines the result type
type MyEvent =
  | { type: 'progress'; message: string }
  | CompletionEvent<string>;

const execution = provider.streamingExecution<MyEvent>(
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
const execution = provider.streamingExecution<MyEvent>(
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

## Execution Mapping

Standalone functions for transforming execution results and events. Useful at agent→service boundaries where internal types need to be mapped to public domain types.

### ReplaceResult\<TEvent, U\>

Type helper that replaces the `CompletionEvent` data type in an event union while preserving all other event types.

```typescript
type ReplaceResult<TEvent extends { type: string }, U> =
  | Exclude<TEvent, { type: 'complete' }>
  | CompletionEvent<U>;
```

**Example:**

```typescript
type AgentEvent =
  | { type: 'thinking'; content: string }
  | CompletionEvent<RawOutput>;

// ReplaceResult<AgentEvent, DomainOutput> =
//   | { type: 'thinking'; content: string }
//   | CompletionEvent<DomainOutput>
```

---

### mapExecutionResult()

Transforms only the result (CompletionEvent data) of an execution, passing all other events through unchanged. This is the most common use case — mapping agent output to domain types at service boundaries.

**Streaming overload:**

```typescript
function mapExecutionResult<TEvent extends { type: string }, U>(
  execution: StreamingExecution<TEvent>,
  fn: (result: ExtractResult<TEvent>) => U | Promise<U>,
): StreamingExecution<ReplaceResult<TEvent, U>>;
```

**Simple overload:**

```typescript
function mapExecutionResult<A, B>(
  execution: SimpleExecution<A>,
  fn: (result: A) => B | Promise<B>,
): SimpleExecution<B>;
```

**Behavior:**

| Aspect | Behavior |
|--------|----------|
| Intermediate events | Passed through unchanged |
| CompletionEvent data | Transformed via `fn` |
| `cancel()` / `cleanup()` / `[Symbol.asyncDispose]()` | Delegated to original |
| `fn` throws | Result becomes `{ status: 'failed' }` |
| Error events | Passed through unchanged |

**Example — Agent→Service boundary:**

```typescript
// Before: Manual reconstruction (21 lines + 3 `as` casts)
createQuestionExecution(interview: Interview): StreamingExecution<InterviewStreamEvent> {
  const agentExecution = this.interviewer.execute(input);
  return {
    stream() { /* manual re-mapping */ },
    result() { /* manual re-mapping */ },
    cancel: () => agentExecution.cancel(),
    cleanup: () => agentExecution.cleanup(),
    [Symbol.asyncDispose]: () => agentExecution[Symbol.asyncDispose](),
  };
}

// After: One-liner with mapExecutionResult
createQuestionExecution(interview: Interview): StreamingExecution<InterviewStreamEvent> {
  const agentExecution = this.interviewer.execute(input);
  return mapExecutionResult(agentExecution, (raw) =>
    this.transformOutput(raw, interview.getQuestionCount() + 1),
  );
}
```

---

### mapExecution()

Transforms every event in a streaming execution, or the result of a simple execution. Use this when you need to map the entire event union (not just the result).

**Streaming overload:**

```typescript
function mapExecution<TEvent extends { type: string }, UEvent extends { type: string }>(
  execution: StreamingExecution<TEvent>,
  fn: (event: TEvent) => UEvent | Promise<UEvent>,
): StreamingExecution<UEvent>;
```

**Simple overload:**

```typescript
function mapExecution<A, B>(
  execution: SimpleExecution<A>,
  fn: (result: A) => B | Promise<B>,
): SimpleExecution<B>;
```

**Behavior:**

| Aspect | Behavior |
|--------|----------|
| All events (including `complete`) | Transformed via `fn` |
| `cancel()` / `cleanup()` / `[Symbol.asyncDispose]()` | Delegated to original |
| `fn` throws | Result becomes `{ status: 'failed' }` |
| Error events | Passed through unchanged (not passed to `fn`) |

**Example:**

```typescript
type InternalEvent =
  | { type: 'step'; detail: string }
  | CompletionEvent<{ raw: string }>;

type PublicEvent =
  | { type: 'progress'; message: string }
  | CompletionEvent<string>;

const publicExecution = mapExecution(internalExecution, (event) => {
  if (event.type === 'step') {
    return { type: 'progress', message: event.detail } as PublicEvent;
  }
  // event.type === 'complete'
  return { type: 'complete', data: event.data.raw } as PublicEvent;
});
```

---

## See Also

- [Cancellation Guide](../guides/cancellation.md) - Comprehensive guide to cancellation patterns
- [Session API](./session.md) - Session interfaces and metadata
- [Streaming Guide](../guides/streaming-guide.md) - Event streaming patterns
