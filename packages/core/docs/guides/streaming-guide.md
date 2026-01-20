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
import { createGoogleProvider, SessionEvent } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// Define your event type using SessionEvent (metrics added automatically)
type MyEvent = SessionEvent<
  | { type: 'progress'; message: string }
  | { type: 'complete'; data: string }
  | { type: 'error'; error: Error }
>;

// Create a streaming execution
const execution = provider.streamingExecution<MyEvent, string>(
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

// Consume events with for-await-of
for await (const event of execution) {
  console.log(`[${event.metrics.elapsedMs}ms] ${event.type}:`, event.message || event.data);
}

// Cleanup resources
await execution.cleanup();
```

## Basic Usage

### Creating Streaming Executions

Use `provider.streamingExecution()` to create executions that yield events:

```typescript
import { createGoogleProvider, SessionEvent } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// Define event variants, wrap with SessionEvent (metrics added automatically)
type AnalysisEvent = SessionEvent<
  | { type: 'analyzing' }
  | { type: 'found'; data: { findings: string[] } }
  | { type: 'complete'; data: AnalysisResult }
  | { type: 'error'; error: Error }
>;

type AnalysisResult = { findings: string[]; summary: string };

const execution = provider.streamingExecution<AnalysisEvent, AnalysisResult>(
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
const execution = provider.streamingExecution<MyEvent, string>(
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
const execution = provider.streamingExecution<MyEvent, string>(
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

Use `for await...of` to consume streaming events:

```typescript
const execution = provider.streamingExecution<MyEvent, string>(
  async function* (session) {
    yield session.emit({ type: 'progress', message: 'Working...' });
    return session.done('Result');
  }
);

// Option 1: Stream events
for await (const event of execution) {
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

// Option 2: Skip to result (consumes events internally)
const result = await execution.toResult();
```

### Simple Execution

When you don't need streaming events, use `provider.simpleExecution()`:

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// simpleExecution returns Promise<Execution<TResult>>
const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({
    prompt: 'What is the capital of France?',
  });
  return result.text;
});

// Get the result
const text = await execution.toResult();
console.log(text); // "Paris"

// Get metadata (token usage, costs, etc.)
const summary = await execution.getSummary();
console.log('Tokens used:', summary.totalLLMUsage.totalTokens);

// Cleanup
await execution.cleanup();
```

## Advanced Usage

### Session Lifecycle Hooks

Register cleanup functions with `session.onDone()`. They run in LIFO order (last registered, first executed):

```typescript
const execution = provider.streamingExecution<MyEvent, string>(
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
const execution = provider.streamingExecution<MyEvent, string>(
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
const execution = provider.streamingExecution<MyEvent, string>(
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
const execution = provider.streamingExecution<MyEvent, string>(
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
const execution = provider.streamingExecution<MyEvent, string>(
  async function* (session) {
    for (let i = 0; i < 100; i++) {
      yield session.emit({ type: 'progress', step: i });
      await processStep(i);
    }
    return session.done('Complete');
  }
);

// Start consuming
const consumer = (async () => {
  for await (const event of execution) {
    console.log(event);
    if (event.step === 5) {
      // Request cancellation
      execution.cancel();
    }
  }
})();

await consumer;
```

Note: Cancellation is cooperative. The generator must check for cancellation and stop gracefully.

### Using await using (TypeScript 5.2+)

For automatic cleanup, use the `await using` syntax:

```typescript
async function processDocument() {
  // Cleanup runs automatically when scope exits
  await using execution = provider.simpleExecution(async (session) => {
    const result = await session.generateText({ prompt: 'Analyze this.' });
    return result.text;
  });

  const text = await execution.toResult();
  return text;
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
  for await (const event of execution) {
    // Process events
  }
} finally {
  await execution.cleanup();
}

// Option 2: Automatic cleanup with await using (preferred)
await using execution = provider.streamingExecution(...);
for await (const event of execution) {
  // Process events
}
// cleanup() called automatically
```

### Error Handling in Generators

Handle errors inside your generator to emit proper error events:

```typescript
const execution = provider.streamingExecution<MyEvent, string>(
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

Define explicit event types for better type safety. Use `SessionEvent` to add metrics automatically:

```typescript
import { SessionEvent } from '@agtlantis/core';

type MyResult = { answer: string; confidence: number };

type MyEvent = SessionEvent<
  | { type: 'progress'; message: string }
  | { type: 'complete'; data: MyResult }
  | { type: 'error'; error: Error }
>;

const execution = provider.streamingExecution<MyEvent, MyResult>(
  async function* (session) {
    yield session.emit({ type: 'progress', message: 'Working...' });
    return session.done({ answer: 'Yes', confidence: 0.95 });
  }
);
```

### Use File Manager for Uploads

The session's file manager handles uploads and automatic cleanup:

```typescript
const execution = provider.streamingExecution<MyEvent, string>(
  async function* (session) {
    // Upload files (auto-cleaned on session end)
    const files = await session.fileManager.upload([
      { type: 'file', source: 'path', path: './document.pdf' },
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
