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
  // Type helpers for event definitions
  type SessionEvent,
  type SessionEventInput,
  type DistributiveOmit,
} from '@agtlantis/core';
```

## Type Helpers

@agtlantis/core provides type helpers that improve DX when working with streaming events.

### DistributiveOmit<T, K>

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

### SessionEvent<T>

Adds `metrics: EventMetrics` to event types. Define events without metrics, then wrap with `SessionEvent`:

```typescript
// Step 1: Define events WITHOUT metrics
type ProgressEvent = { type: 'progress'; step: string; message: string };
type CompleteEvent = { type: 'complete'; data: AnalysisResult };
type ErrorEvent = { type: 'error'; error: Error };

// Step 2: Wrap with SessionEvent - metrics added automatically
type AnalyzerEvent = SessionEvent<ProgressEvent | CompleteEvent | ErrorEvent>;

// Step 3: Extract individual types if needed
type AnalyzerProgressEvent = Extract<AnalyzerEvent, { type: 'progress' }>;
```

### SessionEventInput<T>

Input type for `session.emit()` - removes metrics from event types using `DistributiveOmit`:

```typescript
yield session.emit({
  type: 'progress',
  step: 'reading',
  message: 'Loading documents...',
});
```

---

## Types

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
  const text = await execution.toResult();
  const summary = await execution.getSummary();
  console.log('Tokens:', summary.totalLLMUsage.totalTokens);
} finally {
  await execution.cleanup();
}

// Option 2: Automatic cleanup with await using
await using execution2 = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello' });
  return result.text;
});
const text = await execution2.toResult();
// cleanup() called automatically
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

// Or skip to result
const result = await execution.toResult();

// Cancel if needed
execution.cancel();

// Always cleanup
await execution.cleanup();
```

---

### StreamingSession<TEvent, TResult>

Session interface for streaming executions. Provides AI SDK wrappers, file management, lifecycle hooks, and stream control.

```typescript
interface StreamingSession<
  TEvent extends { type: string; metrics: EventMetrics },
  TResult,
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
  emit(event: SessionEventInput<TEvent>): TEvent;
  done(data: TResult): Promise<TEvent>;
  fail(error: Error, data?: TResult): Promise<TEvent>;

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
| `emit(event)` | Create intermediate event with metrics |
| `done(data)` | Signal successful completion |
| `fail(error, data?)` | Signal failure with optional partial result |
| `record(data)` | Record custom data for session summary |
| `recordToolCall(summary)` | Record a tool call for session summary |

**Example:**

```typescript
import { createGoogleProvider, SessionEvent } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

type AnalysisEvent = SessionEvent<
  | { type: 'analyzing' }
  | { type: 'found'; data: { items: string[] } }
  | { type: 'complete'; data: AnalysisResult }
  | { type: 'error'; error: Error }
>;

type AnalysisResult = { items: string[]; count: number };

const execution = provider.streamingExecution<AnalysisEvent, AnalysisResult>(
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

const answer = await execution.toResult();
const summary = await execution.getSummary();

console.log(answer); // "4"
console.log('LLM cost:', summary.llmCost);
console.log('Additional costs:', summary.totalAdditionalCost);
console.log('Total cost:', summary.totalCost);
console.log('Metadata:', summary.metadata);
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
// SessionSummary is included in the 'complete' event from done()
for await (const event of execution) {
  if (event.type === 'complete' && event.summary) {
    const summary = event.summary as SessionSummary;
    console.log('Duration:', summary.totalDuration, 'ms');
    console.log('LLM calls:', summary.llmCallCount);
    console.log('Total tokens:', summary.totalLLMUsage.totalTokens);
    console.log('LLM cost: $', summary.llmCost.toFixed(4));
    console.log('Additional costs: $', summary.totalAdditionalCost.toFixed(4));
    console.log('Total cost: $', summary.totalCost.toFixed(4));
    console.log('Metadata:', summary.metadata);

    // Serialize for database storage
    const json = summary.toJSON();
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
const execution = provider.streamingExecution<MyEvent, string>(
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
const execution = provider.streamingExecution<MyEvent, string>(
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

### GenerateTextParams<TOOLS, OUTPUT>

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

### StreamTextParams<TOOLS, OUTPUT>

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
import { createGoogleProvider, SessionEvent, SessionSummary } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

type TaskEvent = SessionEvent<
  | { type: 'started'; message: string }
  | { type: 'progress'; message: string }
  | { type: 'complete'; data: string; summary: SessionSummary }
  | { type: 'error'; error: Error }
>;

const execution = provider.streamingExecution<TaskEvent, string>(
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

for await (const event of execution) {
  console.log(`[${event.metrics.elapsedMs}ms] ${event.type}: ${event.message || event.data || ''}`);

  if (event.type === 'complete' && event.summary) {
    console.log('Cost: $' + event.summary.totalCost.toFixed(4));
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

  return execution.toResult();
}

const translated = await translateText('Hello, world!', 'Spanish');
console.log(translated); // "Hola, mundo!"
```

### Multiple LLM Calls with Different Models

```typescript
import { createGoogleProvider, SessionEvent } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

type StepResult = { draft: string; refined: string };

type StepEvent = SessionEvent<
  | { type: 'step'; step: string }
  | { type: 'complete'; data: StepResult }
  | { type: 'error'; error: Error }
>;

const execution = provider.streamingExecution<StepEvent, StepResult>(
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

for await (const event of execution) {
  if (event.type === 'step') {
    console.log('Step:', event.step);
  } else if (event.type === 'complete') {
    console.log('Draft:', event.data?.draft);
    console.log('Refined:', event.data?.refined);
  }
}

await execution.cleanup();
```

## See Also

- [Streaming Guide](../guides/streaming-guide.md) - Comprehensive guide to streaming
- [Provider Guide](../guides/provider-guide.md) - Configure providers and models
- [Getting Started](../getting-started.md) - Quick introduction
