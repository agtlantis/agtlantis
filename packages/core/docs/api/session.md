# Session API Reference

> Complete type documentation for sessions and executions in @agtlantis/core.

## Overview

Sessions and executions are the core abstractions for running AI operations. This module provides:

- **Execution** - Base interface for consuming results and metadata
- **StreamingExecution** - Async iterable execution that yields events
- **StreamingSession** - Session with event emission and lifecycle control
- **SimpleSession** - Session without streaming (for `simpleExecution`)
- **SessionSummary** - Aggregated usage and cost tracking

## Import

```typescript
import {
  SessionSummary, // Class (Value Object)
  type Execution,
  type StreamingExecution,
  type StreamingSession,
  type SimpleSession,
  type SessionSummaryJSON,
  type LLMCallRecord,
  type ToolCallSummary,
  type AdditionalCost,
  type EventMetrics,
  type GenerationOptions,
  // Event type helpers
  type CompletionEvent,
  type ErrorEvent,
  type ExtractResult,
  type EmittableEventInput,
  type SessionEvent,
  type DistributiveOmit,
} from '@agtlantis/core';
```

## Event Type Helpers

### CompletionEvent\<TResult\>

Completion event emitted by `session.done()`. Include this in your event union to define the result type.

```typescript
type CompletionEvent<TResult> = {
  type: 'complete';
  data: TResult;
  summary: SessionSummary;
};
```

**Example:**

```typescript
type MyEvent =
  | { type: 'progress'; step: string }
  | CompletionEvent<MyResult>;

// session.done(result) emits { type: 'complete', data: result, summary }
```

### ErrorEvent

Error event emitted by `session.fail()`. Auto-added to `stream()` and `result()` return types — you don't need to include this in your event union.

```typescript
type ErrorEvent = {
  type: 'error';
  error: Error;
  summary?: SessionSummary;
  data?: unknown;
};
```

**Example:**

```typescript
for await (const event of execution.stream()) {
  if (event.type === 'error') {
    console.error(event.error.message);
  }
}
```

### ExtractResult\<TEvent\>

Extracts the result type from an event union containing `CompletionEvent<T>`. Returns `never` if no `CompletionEvent` member exists (making `session.done()` uncallable).

```typescript
type ExtractResult<TEvent extends { type: string }> =
  Extract<TEvent, { type: 'complete' }> extends { data: infer R } ? R : never;
```

**Example:**

```typescript
type MyEvent =
  | { type: 'progress'; step: string }
  | CompletionEvent<{ answer: string }>;

type Result = ExtractResult<MyEvent>;
// Result = { answer: string }
```

### EmittableEventInput\<TEvent\>

Input type for `session.emit()` — excludes reserved event types (`'complete'`, `'error'`). Prevents accidental direct emission of terminal events.

```typescript
type EmittableEventInput<T extends { type: string }> =
  T extends { type: 'complete' | 'error' } ? never : T;
```

### SessionEvent\<T\>

Adds `metrics: EventMetrics` to your event type. The framework uses this internally to include timing information with each event.

**For most cases, you don't need this** - the framework automatically wraps your events with `SessionEvent<T>` internally. Just define your event types without metrics:

```typescript
// Recommended: Pure event types (framework adds metrics)
type MyEvent =
  | { type: 'progress'; message: string }
  | CompletionEvent<string>;
```

**When you need SessionEvent\<T\>:**
- Creating mock/stub streaming executions for testing
- Explicitly typing variables that hold emitted events (e.g., `StreamingResult.events`)

```typescript
import type { SessionEvent, StreamingResult, CompletionEvent } from '@agtlantis/core';

type MyEvent =
  | { type: 'progress'; message: string }
  | CompletionEvent<string>;

// Example: Creating a stub execution for testing
const events: SessionEvent<MyEvent>[] = [
  { type: 'progress', message: 'Working...', metrics: { timestamp: Date.now(), elapsedMs: 0, deltaMs: 0 } },
];
```

### DistributiveOmit\<T, K\>

Distributive version of `Omit` that properly handles union types. Standard `Omit<Union, K>` loses unique properties from union members.

```typescript
type A = { type: 'a'; foo: string; metrics: EventMetrics };
type B = { type: 'b'; bar: number; metrics: EventMetrics };
type Union = A | B;

// ❌ Standard Omit - loses unique properties (foo, bar)
type Bad = Omit<Union, 'metrics'>;
// Result: { type: 'a' | 'b' }

// ✅ DistributiveOmit - preserves unique properties
type Good = DistributiveOmit<Union, 'metrics'>;
// Result: { type: 'a'; foo: string } | { type: 'b'; bar: number }
```

### SessionEventInput\<T\> *(Deprecated)*

> **Deprecated**: With the simplified event generic, `SessionEventInput<T>` is no longer needed. The `session.emit()` method now accepts your event type directly.

---

## Types

### Execution\<TResult\>

Base interface for all execution types. Both streaming and simple executions implement this interface.

```typescript
interface Execution<TResult> extends AsyncDisposable {
  /**
   * Get the execution result with status and summary.
   * Returns a discriminated union: succeeded | failed | canceled.
   * Summary is always available regardless of status.
   */
  result(): Promise<ExecutionResult<TResult>>;

  /** Request cancellation (cooperative). */
  cancel(): void;

  /** Cleanup resources (uploaded files, connections, etc.). Safe to call multiple times. */
  cleanup(): Promise<void>;

  /** Async disposal for `await using` syntax (TS 5.2+). */
  [Symbol.asyncDispose](): Promise<void>;
}
```

**ExecutionResult\<T\>:**

```typescript
type ExecutionResult<T> =
  | { status: 'succeeded'; value: T; summary: SessionSummary }
  | { status: 'failed'; error: Error; summary: SessionSummary }
  | { status: 'canceled'; summary: SessionSummary };
```

**Example:**

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// Option 1: Manual cleanup
const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello' });
  return result.text;
});
try {
  const result = await execution.result();
  if (result.status === 'succeeded') {
    console.log('Text:', result.value);
    console.log('Tokens:', result.summary.totalLLMUsage.totalTokens);
  }
} finally {
  await execution.cleanup();
}

// Option 2: Automatic cleanup with await using
await using execution2 = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello' });
  return result.text;
});
const result2 = await execution2.result();
// cleanup() called automatically
```

---

### StreamingExecution\<TEvent\>

Streaming execution that yields events during execution. Extends `Execution<ExtractResult<TEvent>>`.

- `TEvent` — your event union type (must include `CompletionEvent<TResult>`)
- Result type is automatically extracted from `CompletionEvent<TResult>` in the union via `ExtractResult<TEvent>`
- `ErrorEvent` is auto-included in `stream()` and `result()` return types

```typescript
interface StreamingExecution<TEvent extends { type: string }>
  extends Execution<ExtractResult<TEvent>> {
  /**
   * Get the event stream.
   * Returns buffered + real-time events with metrics.
   * ErrorEvent is auto-included in the stream type.
   */
  stream(): AsyncIterable<SessionEvent<TEvent | ErrorEvent>>;

  /**
   * Get the execution result with status, summary, and all events.
   */
  result(): Promise<StreamingResult<SessionEvent<TEvent | ErrorEvent>, ExtractResult<TEvent>>>;

  /** Request cancellation (cooperative). */
  cancel(): void;
}
```

**Example:**

```typescript
import { createGoogleProvider, type CompletionEvent } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// Define event types — CompletionEvent<T> defines the result type
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

// Option 1: Stream events (metrics available on each event)
for await (const event of execution.stream()) {
  console.log(`[${event.metrics.elapsedMs}ms] ${event.type}`);
}

// Option 2: Get result directly
const result = await execution.result();
if (result.status === 'succeeded') {
  console.log(result.value);
}

// Cancel if needed
execution.cancel();

// Always cleanup
await execution.cleanup();
```

---

### StreamingSession\<TEvent\>

Session interface for streaming executions. Provides AI SDK wrappers, file management, lifecycle hooks, and stream control.

```typescript
interface StreamingSession<
  TEvent extends { type: string },
> {
  // AI SDK Wrappers
  generateText<TOOLS extends ToolSet = {}, OUTPUT extends OutputSpec = DefaultOutput>(
    params: GenerateTextParams<TOOLS, OUTPUT>
  ): Promise<GenerateTextResultTyped<TOOLS, OUTPUT>>;

  streamText<TOOLS extends ToolSet = {}, OUTPUT extends OutputSpec = DefaultOutput>(
    params: StreamTextParams<TOOLS, OUTPUT>
  ): StreamTextResultTyped<TOOLS, OUTPUT>;

  // File Management
  readonly fileManager: FileManager;

  // Lifecycle Hook
  onDone(fn: () => Promise<void> | void): void;

  // Stream Control
  emit(event: EmittableEventInput<TEvent>): SessionEvent<TEvent>;
  done(data: ExtractResult<TEvent>): Promise<SessionEvent<TEvent>>;
  fail(error: Error, data?: ExtractResult<TEvent>): Promise<SessionEvent<TEvent>>;

  // Recording
  record(data: Record<string, unknown>): void;
  recordToolCall(summary: ToolCallSummary): void;
}
```

**Methods:**

| Method | Description |
|--------|-------------|
| `generateText(params)` | AI SDK wrapper with automatic usage tracking |
| `streamText(params)` | AI SDK streaming wrapper with usage tracking |
| `fileManager` | Upload/delete files with auto-cleanup |
| `onDone(fn)` | Register cleanup hook (LIFO order) |
| `emit(event)` | Emit intermediate event (reserved types excluded at type level) |
| `done(data)` | Signal successful completion (emits `CompletionEvent`) |
| `fail(error, data?)` | Signal failure (emits `ErrorEvent`) |
| `record(data)` | Record custom data for session summary |
| `recordToolCall(summary)` | Record a tool call for session summary |

**Example:**

```typescript
import { createGoogleProvider, type CompletionEvent } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

type AnalysisResult = { items: string[]; count: number };

// Define event types — CompletionEvent defines the result type
type AnalysisEvent =
  | { type: 'analyzing' }
  | { type: 'found'; data: { items: string[] } }
  | CompletionEvent<AnalysisResult>;

const execution = provider.streamingExecution<AnalysisEvent>(
  async function* (session) {
    // Register cleanup hook (runs in LIFO order)
    session.onDone(() => console.log('Session complete'));

    // Emit progress event
    yield session.emit({ type: 'analyzing' });

    // Use AI SDK wrapper (auto-tracked)
    const result = await session.generateText({
      prompt: 'List 3 programming languages.',
    });

    // Use different model for specific call
    const detailed = await session.generateText({
      model: 'gemini-2.5-pro',
      prompt: 'Explain TypeScript in detail.',
    });

    // Record custom data
    session.record({ analysisType: 'languages' });

    const items = result.text.split('\n').filter(Boolean);
    yield session.emit({ type: 'found', data: { items } });

    // Complete with result
    return session.done({ items, count: items.length });
  }
);
```

---

### SimpleSession

Session interface for non-streaming executions. Same as `StreamingSession` but without stream control methods (`emit`, `done`, `fail`).

```typescript
interface SimpleSession {
  // AI SDK Wrappers
  generateText<TOOLS extends ToolSet = {}, OUTPUT extends OutputSpec = DefaultOutput>(
    params: GenerateTextParams<TOOLS, OUTPUT>
  ): Promise<GenerateTextResultTyped<TOOLS, OUTPUT>>;

  streamText<TOOLS extends ToolSet = {}, OUTPUT extends OutputSpec = DefaultOutput>(
    params: StreamTextParams<TOOLS, OUTPUT>
  ): StreamTextResultTyped<TOOLS, OUTPUT>;

  // File Management
  readonly fileManager: FileManager;

  // Lifecycle Hook
  onDone(fn: () => Promise<void> | void): void;

  // Recording
  record(data: Record<string, unknown>): void;
  recordToolCall(summary: ToolCallSummary): void;

  // Additional Cost Tracking
  recordAdditionalCost(cost: Omit<AdditionalCost, 'timestamp'>): void;

  // Metadata
  setMetadata(key: string, value: unknown): void;
  setMetadata(data: Record<string, unknown>): void;
}
```

**Methods:**

| Method | Description |
|--------|-------------|
| `generateText(params)` | AI SDK wrapper with automatic usage tracking |
| `streamText(params)` | AI SDK streaming wrapper with usage tracking |
| `fileManager` | Upload/delete files with auto-cleanup |
| `onDone(fn)` | Register cleanup hook (LIFO order) |
| `record(data)` | Record custom data for session summary |
| `recordToolCall(summary)` | Record a tool call for session summary |
| `recordAdditionalCost(cost)` | Record non-LLM cost (search, image gen, etc.) |
| `setMetadata(key, value)` | Set session metadata key-value pair |
| `setMetadata(data)` | Merge object into session metadata |

**Example:**

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  // Register cleanup
  session.onDone(() => console.log('Done!'));

  // Set session metadata
  session.setMetadata('userId', 'user123');
  session.setMetadata({ requestId: 'req456', source: 'api' });

  // Make LLM call
  const result = await session.generateText({
    prompt: 'What is 2 + 2?',
  });

  // Record additional cost (e.g., for search grounding)
  session.recordAdditionalCost({
    type: 'search_grounding',
    cost: 0.035,
    label: 'Google Search',
  });

  // Record custom data
  session.record({ question: 'math' });

  // Return result directly (no emit/done needed)
  return result.text;
});

const result = await execution.result();
if (result.status === 'succeeded') {
  console.log(result.value); // "4"
  console.log('LLM cost:', result.summary.llmCost);
  console.log('Additional costs:', result.summary.totalAdditionalCost);
  console.log('Total cost:', result.summary.totalCost);
  console.log('Metadata:', result.summary.metadata);
}
```

---

### SessionSummary

Aggregated summary of all activity within an execution session. This is an **immutable Value Object class**.

```typescript
class SessionSummary {
  /** Total duration from session start (computed dynamically) */
  get totalDuration(): number;

  /** Aggregated token usage across all LLM calls */
  readonly totalLLMUsage: LanguageModelUsage;

  /** Number of LLM calls made */
  readonly llmCallCount: number;

  /** Individual LLM call records (frozen array) */
  readonly llmCalls: readonly LLMCallRecord[];

  /** Tool call summaries (frozen array) */
  readonly toolCalls: readonly ToolCallSummary[];

  /** Custom records added via session.record() (frozen array) */
  readonly customRecords: readonly Record<string, unknown>[];

  /** LLM-only cost in USD */
  readonly llmCost: number;

  /** Additional costs (search grounding, image gen, etc.) */
  readonly additionalCosts: readonly AdditionalCost[];

  /** Custom metadata set via session.setMetadata() */
  readonly metadata: Readonly<Record<string, unknown>>;

  /** Cost breakdown by model (key: "provider/model") */
  readonly costByModel: Readonly<Record<string, number>>;

  /** Total cost of additional (non-LLM) operations (computed) */
  get totalAdditionalCost(): number;

  /** Total cost including LLM and additional costs (computed) */
  get totalCost(): number;

  /** Serialize to plain JSON object for database storage */
  toJSON(): SessionSummaryJSON;

  /** Create an empty SessionSummary */
  static empty(startTime: number): SessionSummary;
}
```

**Breaking Change (v2.0):** `totalCost` now includes additional costs. Use `llmCost` for LLM-only cost.

**Example:**

```typescript
// SessionSummary is included in the CompletionEvent from done()
for await (const event of execution.stream()) {
  if (event.type === 'complete') {
    console.log('Duration:', event.summary.totalDuration, 'ms');
    console.log('LLM calls:', event.summary.llmCallCount);
    console.log('Total tokens:', event.summary.totalLLMUsage.totalTokens);
    console.log('LLM cost: $', event.summary.llmCost.toFixed(4));
    console.log('Additional costs: $', event.summary.totalAdditionalCost.toFixed(4));
    console.log('Total cost: $', event.summary.totalCost.toFixed(4));
    console.log('Metadata:', event.summary.metadata);

    // Serialize for database storage
    const json = event.summary.toJSON();
    await db.save(json);
  }
}
```

---

### AdditionalCost

Record of a non-LLM cost (e.g., search grounding, image generation).

```typescript
interface AdditionalCost {
  /** Type of cost (e.g., 'search_grounding', 'image_generation') */
  type: string;

  /** Cost in USD */
  cost: number;

  /** Optional display label */
  label?: string;

  /** Optional additional metadata */
  metadata?: Record<string, unknown>;

  /** Unix timestamp when recorded */
  timestamp: number;
}
```

**Example:**

```typescript
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    // Record additional cost for search grounding
    session.recordAdditionalCost({
      type: 'search_grounding',
      cost: 0.035,
      label: 'Google Search API',
      metadata: { queries: 3 },
    });

    const result = await session.generateText({ prompt: 'What is the weather?' });
    return session.done(result.text);
  }
);
```

---

### LLMCallRecord

Record of a single LLM call within a session.

```typescript
interface LLMCallRecord {
  /** Unix timestamp when the call started */
  startTime: number;

  /** Unix timestamp when the call ended */
  endTime: number;

  /** Duration in milliseconds */
  duration: number;

  /** Token usage from the AI SDK */
  usage: LanguageModelUsage;

  /** Type of call: 'generateText' | 'streamText' | 'generateObject' | 'manual' */
  type: LLMCallType;

  /** Model identifier (e.g., 'gemini-2.5-flash') */
  model: string;

  /** Provider type (e.g., 'google', 'openai') */
  provider: ProviderType;
}
```

---

### ToolCallSummary

Summary of a tool/function call within a session.

```typescript
interface ToolCallSummary {
  /** Name of the tool */
  name: string;

  /** Duration in milliseconds (optional) */
  duration?: number;

  /** Whether the call succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;
}
```

**Example:**

```typescript
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    const startTime = Date.now();

    try {
      const result = await externalSearchTool('query');
      session.recordToolCall({
        name: 'externalSearch',
        duration: Date.now() - startTime,
        success: true,
      });
    } catch (error) {
      session.recordToolCall({
        name: 'externalSearch',
        duration: Date.now() - startTime,
        success: false,
        error: (error as Error).message,
      });
    }

    return session.done('Result');
  }
);
```

---

### EventMetrics

Timing information included in every event.

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

---

### GenerateTextParams\<TOOLS, OUTPUT\>

Parameters for `session.generateText()`. Mirrors AI SDK with optional model override.

```typescript
type GenerateTextParams<TOOLS, OUTPUT> = Omit<AISDKGenerateTextParams<TOOLS>, 'model' | 'output'> & {
  /** Optional model ID to override the default */
  model?: string;
  /** Output specification (e.g., Output.object({ schema })) */
  output?: OUTPUT;
};
```

---

### StreamTextParams\<TOOLS, OUTPUT\>

Parameters for `session.streamText()`. Mirrors AI SDK with optional model override.

```typescript
type StreamTextParams<TOOLS, OUTPUT> = Omit<AISDKStreamTextParams<TOOLS>, 'model' | 'output'> & {
  /** Optional model ID to override the default */
  model?: string;
  /** Output specification (e.g., Output.object({ schema })) */
  output?: OUTPUT;
};
```

## Examples

### Streaming Execution with Events

```typescript
import { createGoogleProvider, SessionSummary, type CompletionEvent } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// Define event types — CompletionEvent defines the result type
type TaskEvent =
  | { type: 'started'; message: string }
  | { type: 'progress'; message: string }
  | CompletionEvent<string>;

const execution = provider.streamingExecution<TaskEvent>(
  async function* (session) {
    yield session.emit({ type: 'started', message: 'Beginning task' });

    session.onDone(() => console.log('Cleanup complete'));

    const result = await session.generateText({
      prompt: 'Write a haiku about programming.',
    });

    yield session.emit({ type: 'progress', message: 'Generated haiku' });

    return session.done(result.text);
  }
);

for await (const event of execution.stream()) {
  switch (event.type) {
    case 'started':
    case 'progress':
      console.log(`[${event.metrics.elapsedMs}ms] ${event.type}: ${event.message}`);
      break;
    case 'complete':
      console.log('Result:', event.data);
      console.log('Cost: $' + event.summary.totalCost.toFixed(4));
      break;
    case 'error':
      console.error('Error:', event.error.message);
      break;
  }
}

await execution.cleanup();
```

### Simple Execution

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

async function translateText(text: string, targetLanguage: string): Promise<string> {
  await using execution = provider.simpleExecution(async (session) => {
    const result = await session.generateText({
      prompt: `Translate to ${targetLanguage}: ${text}`,
    });
    return result.text;
  });

  const result = await execution.result();
  if (result.status === 'succeeded') {
    return result.value;
  }
  throw result.status === 'failed' ? result.error : new Error('Canceled');
}

const translated = await translateText('Hello, world!', 'Spanish');
console.log(translated); // "Hola, mundo!"
```

### Multiple LLM Calls with Different Models

```typescript
import { createGoogleProvider, type CompletionEvent } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

type StepResult = { draft: string; refined: string };

// Define event types — CompletionEvent defines the result type
type StepEvent =
  | { type: 'step'; step: string }
  | CompletionEvent<StepResult>;

const execution = provider.streamingExecution<StepEvent>(
  async function* (session) {
    yield session.emit({ type: 'step', step: 'Drafting with fast model' });

    // Fast model for initial draft
    const draft = await session.generateText({
      prompt: 'Write a short story opening.',
    });

    yield session.emit({ type: 'step', step: 'Refining with pro model' });

    // Pro model for refinement
    const refined = await session.generateText({
      model: 'gemini-2.5-pro',
      prompt: `Improve this story opening:\n${draft.text}`,
    });

    return session.done({ draft: draft.text, refined: refined.text });
  }
);

for await (const event of execution.stream()) {
  if (event.type === 'step') {
    console.log('Step:', event.step);
  } else if (event.type === 'complete') {
    console.log('Draft:', event.data.draft);
    console.log('Refined:', event.data.refined);
  }
}

await execution.cleanup();
```

## See Also

- [Streaming Guide](../guides/streaming-guide.md) - Comprehensive guide to streaming
- [Provider Guide](../guides/provider-guide.md) - Configure providers and models
- [Getting Started](../getting-started.md) - Quick introduction
