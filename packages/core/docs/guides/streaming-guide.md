# Streaming Guide

> Learn how to create streaming and simple executions with real-time events and automatic resource management.

## Table of contents

- [Overview](#overview)
- [Quick start](#quick-start)
- [Basic usage](#basic-usage)
  - [Creating streaming executions](#creating-streaming-executions)
  - [Event emission](#event-emission)
  - [Completion and failure](#completion-and-failure)
  - [Consuming events](#consuming-events)
  - [Simple execution](#simple-execution)
- [Advanced usage](#advanced-usage)
  - [Session lifecycle hooks](#session-lifecycle-hooks)
  - [AI SDK wrappers](#ai-sdk-wrappers)
  - [Custom recording](#custom-recording)
  - [Cancellation](#cancellation)
  - [Execution mapping](#execution-mapping)
  - [Using await using (TypeScript 5.2+)](#using-await-using-typescript-52)
- [Best practices](#best-practices)
  - [Resource cleanup](#resource-cleanup)
  - [Error handling in generators](#error-handling-in-generators)
  - [Type your events](#type-your-events)
  - [Use file manager for uploads](#use-file-manager-for-uploads)
- [See also](#see-also)

---

## Overview

@agtlantis/core provides two execution modes for AI operations:

| Mode | Use Case | Events | API |
|------|----------|--------|-----|
| **Streaming** | Real-time UI, progress updates | Yes | `provider.streamingExecution()` |
| **Simple** | Background jobs, simple requests | No | `provider.simpleExecution()` |

Both modes give you:
- Automatic session management
- AI SDK wrappers with usage tracking
- Lifecycle hooks for cleanup
- File management with auto-cleanup

Choose streaming when you need to show progress to users. Choose simple when you just need the final result.

## Quick Start

Here's a minimal streaming execution that emits progress events:

```typescript
import { createGoogleProvider, type CompletionEvent } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// Define your event types — CompletionEvent defines the result type
type MyEvent =
  | { type: 'progress'; message: string }
  | CompletionEvent<string>;

// Create a streaming execution
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    // Emit progress
    yield session.emit({ type: 'progress', message: 'Starting...' });

    // Make an LLM call
    const result = await session.generateText({
      prompt: 'Tell me a short joke.',
    });

    // Complete with the result
    return session.done(result.text);
  }
);

// Consume events with for-await-of via stream() method
for await (const event of execution.stream()) {
  console.log(`[${event.metrics.elapsedMs}ms] ${event.type}:`, event.message || event.data);
}

// Get result with all events
const result = await execution.result();
if (result.status === 'succeeded') {
  console.log('Final value:', result.value);
}

// Cleanup resources
await execution.cleanup();
```

## Basic Usage

### Creating Streaming Executions

Use `provider.streamingExecution()` to create executions that yield events:

```typescript
import { createGoogleProvider, type CompletionEvent } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// Define your event variants — CompletionEvent defines the result type
type AnalysisResult = { findings: string[]; summary: string };

type AnalysisEvent =
  | { type: 'analyzing' }
  | { type: 'found'; data: { findings: string[] } }
  | CompletionEvent<AnalysisResult>;

const execution = provider.streamingExecution<AnalysisEvent>(
  async function* (session) {
    yield session.emit({ type: 'analyzing' });

    const result = await session.generateText({
      prompt: 'List 3 interesting facts about TypeScript.',
    });

    const findings = result.text.split('\n').filter(Boolean);

    yield session.emit({ type: 'found', data: { findings } });

    return session.done({ findings, summary: 'Analysis complete' });
  }
);
```

### Event Emission

Use `session.emit()` to create intermediate events. The `metrics` field is added automatically with timing information:

```typescript
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    // emit() returns the complete event with metrics automatically attached
    yield session.emit({ type: 'progress', message: 'Step 1' });

    yield session.emit({ type: 'progress', message: 'Step 2' });

    // done() returns a complete event with the result
    return session.done('All done!');
  }
);
```

### Completion and Failure

Use `session.done()` for success and `session.fail()` for errors:

```typescript
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    try {
      const result = await session.generateText({ prompt: 'Hello' });
      // done() returns a Promise<TEvent> with type 'complete'
      return session.done(result.text);
    } catch (error) {
      // fail() returns a Promise<TEvent> with type 'error'
      return session.fail(error as Error);
    }
  }
);
```

The `done()` method automatically includes the session summary (LLM usage, costs, etc.) in the final event.

> **Note: Auto-abort on Terminal Events**
>
> After a `complete` or `error` event is emitted, the execution automatically aborts the signal. This prevents accidental AI calls after the execution is logically complete. Always `return` after calling `done()` or `fail()` for clarity, but the system will protect against forgotten returns. See the [Cancellation Guide](./cancellation.md#automatic-termination-on-terminal-events) for details.

### Consuming Events

Use `for await...of` with `stream()` to consume streaming events:

```typescript
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    yield session.emit({ type: 'progress', message: 'Working...' });
    return session.done('Result');
  }
);

// Option 1: Stream events
for await (const event of execution.stream()) {
  switch (event.type) {
    case 'progress':
      console.log('Progress:', event.message);
      break;
    case 'complete':
      console.log('Complete:', event.data);
      break;
    case 'error':
      console.error('Error:', event.error);
      break;
  }
}

// Option 2: Skip to result (events still available)
const result = await execution.result();
if (result.status === 'succeeded') {
  console.log('Value:', result.value);
  console.log('Events:', result.events);
}
```

### Simple Execution

When you don't need streaming events, use `provider.simpleExecution()`:

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// simpleExecution returns SimpleExecution<TResult> (sync, no await)
const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({
    prompt: 'What is the capital of France?',
  });
  return result.text;
});

// Get the result
const result = await execution.result();
if (result.status === 'succeeded') {
  console.log(result.value); // "Paris"
}

// Metadata always available (even on failure/cancellation)
console.log('Tokens used:', result.summary.totalLLMUsage.totalTokens);

// Cleanup
await execution.cleanup();
```

## Advanced Usage

### Session Lifecycle Hooks

Register cleanup functions with `session.onDone()`. They run in LIFO order (last registered, first executed):

```typescript
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    // Register cleanup hooks
    const connection = await database.connect();
    session.onDone(() => {
      console.log('Closing database connection');
      connection.close();
    });

    const tempFile = await createTempFile();
    session.onDone(() => {
      console.log('Removing temp file');
      tempFile.remove();
    });
    // tempFile.remove() runs FIRST, then connection.close()

    const result = await session.generateText({ prompt: 'Hello' });
    return session.done(result.text);
  }
);

// Cleanup runs all onDone hooks in LIFO order
await execution.cleanup();
```

### AI SDK Wrappers

The session provides `generateText()` and `streamText()` wrappers that automatically track usage:

```typescript
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    // generateText - non-streaming, waits for full response
    const result = await session.generateText({
      prompt: 'Summarize this document.',
      maxTokens: 500,
    });

    // streamText - streaming, returns immediately
    const stream = session.streamText({
      prompt: 'Write a long story.',
      maxTokens: 2000,
    });

    // Consume the stream
    for await (const chunk of stream.textStream) {
      yield session.emit({ type: 'chunk', text: chunk });
    }

    // Get final result after stream completes
    const text = await stream.text;
    return session.done(text);
  }
);
```

You can override the model for specific calls:

```typescript
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    // Use default model (gemini-2.5-flash)
    const quick = await session.generateText({ prompt: 'Quick answer?' });

    // Use a different model for this call
    const detailed = await session.generateText({
      model: 'gemini-2.5-pro',
      prompt: 'Give a detailed analysis.',
    });

    return session.done(detailed.text);
  }
);
```

### Custom Recording

Track custom data and tool calls for the session summary:

```typescript
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    // Record custom data
    session.record({ customField: 'value', count: 42 });

    // Record a tool call
    const startTime = Date.now();
    const searchResult = await externalSearch('query');
    session.recordToolCall({
      name: 'externalSearch',
      duration: Date.now() - startTime,
      success: true,
    });

    const result = await session.generateText({
      prompt: `Based on: ${searchResult}`,
    });

    return session.done(result.text);
  }
);
```

### Cancellation

Streaming executions support cooperative cancellation:

```typescript
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    for (let i = 0; i < 100; i++) {
      yield session.emit({ type: 'progress', step: i });
      await processStep(i);
    }
    return session.done('Complete');
  }
);

// Stream and cancel on condition
for await (const event of execution.stream()) {
  console.log(event);
  if (event.step === 5) {
    execution.cancel();
  }
}

// Check result status
const result = await execution.result();
// result.status === 'canceled'
```

Note: Cancellation is cooperative. The generator must check for cancellation and stop gracefully.

### Execution Mapping

When your service layer wraps an agent, the agent's execution often has internal types (e.g., `RawOutput`) that need to be mapped to public domain types (e.g., `DomainOutput`). Instead of manually reconstructing the `StreamingExecution` object, use the mapping utilities.

**Result-only mapping (most common):**

Use `mapExecutionResult()` when intermediate events stay the same and only the completion result changes:

```typescript
import { mapExecutionResult } from '@agtlantis/core';

// Agent returns StreamingExecution<AgentEvent> where AgentEvent includes CompletionEvent<RawOutput>
const agentExecution = agent.execute(input);

// Map only the result — intermediate events pass through unchanged
const serviceExecution = mapExecutionResult(agentExecution, (raw) => ({
  question: raw.question,
  options: raw.options.map(toOption),
}));
// serviceExecution is StreamingExecution<ReplaceResult<AgentEvent, DomainOutput>>
```

**Full event mapping:**

Use `mapExecution()` when you need to transform the entire event union:

```typescript
import { mapExecution } from '@agtlantis/core';

const publicExecution = mapExecution(internalExecution, (event) => {
  switch (event.type) {
    case 'internal-step':
      return { type: 'progress', message: event.detail };
    case 'complete':
      return { type: 'complete', data: transformResult(event.data) };
  }
});
```

**Error handling:** If the mapping function throws, the execution result becomes `{ status: 'failed' }` — honoring the "never throws" contract of executions.

See the [Execution API Reference](../api/execution.md#execution-mapping) for full type signatures and behavior tables.

### Using await using (TypeScript 5.2+)

For automatic cleanup, use the `await using` syntax:

```typescript
async function processDocument() {
  // Cleanup runs automatically when scope exits
  await using execution = provider.simpleExecution(async (session) => {
    const result = await session.generateText({ prompt: 'Analyze this.' });
    return result.text;
  });

  const result = await execution.result();
  if (result.status === 'succeeded') {
    return result.value;
  }
  throw new Error('Processing failed');
  // execution.cleanup() called automatically here
}
```

## Best Practices

### Resource Cleanup

Always clean up executions, either with `cleanup()` or `await using`:

```typescript
// Option 1: Manual cleanup with try/finally
const execution = provider.streamingExecution(...);
try {
  for await (const event of execution.stream()) {
    // Process events
  }
  const result = await execution.result();
} finally {
  await execution.cleanup();
}

// Option 2: Automatic cleanup with await using (preferred)
await using execution = provider.streamingExecution(...);
for await (const event of execution.stream()) {
  // Process events
}
const result = await execution.result();
// cleanup() called automatically
```

### Error Handling in Generators

Handle errors inside your generator to emit proper error events:

```typescript
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    try {
      yield session.emit({ type: 'progress', message: 'Starting' });
      const result = await session.generateText({ prompt: 'Hello' });
      return session.done(result.text);
    } catch (error) {
      // Emit an error event instead of throwing
      return session.fail(error as Error);
    }
  }
);
```

### Type Your Events

Define explicit event types with `CompletionEvent<T>` for type-safe results. The framework automatically adds `metrics` to each event and `ErrorEvent` to the stream:

```typescript
type MyResult = { answer: string; confidence: number };

// Use CompletionEvent<T> to define the result type in your event union
type MyEvent =
  | { type: 'progress'; message: string }
  | CompletionEvent<MyResult>;
// ErrorEvent is auto-included in stream() — no need to add it

const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    yield session.emit({ type: 'progress', message: 'Working...' });
    return session.done({ answer: 'Yes', confidence: 0.95 });
  }
);
```

> **Note on ErrorEvent:** `ErrorEvent` is automatically included in the return types of `stream()` and `result()`.
> You do **not** need to add it to your event union. The default recommendation is to omit it.
> Include `ErrorEvent` in your union only when you need `Extract<YourEvent, { type: 'error' }>` aliases
> for downstream typing (e.g., re-exporting types for API consumers).

### Use File Manager for Uploads

The session's file manager handles uploads and automatic cleanup:

```typescript
const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    // Upload files (auto-cleaned on session end)
    const files = await session.fileManager.upload([
      {  source: 'path', path: './document.pdf' },
    ]);

    const result = await session.generateText({
      prompt: 'Summarize this document.',
      // Use file URIs in your prompt content
    });

    return session.done(result.text);
    // Files cleaned up automatically
  }
);
```

## See Also

- [Provider Guide](./provider-guide.md) - Configure providers and models
- [Patterns Guide](./patterns-guide.md) - Use progressive streaming patterns
- [Session API Reference](../api/session.md) - Detailed type documentation
- [Getting Started](../getting-started.md) - Quick introduction
