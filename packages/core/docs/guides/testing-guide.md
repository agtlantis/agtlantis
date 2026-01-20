# Testing Guide

> Write reliable, isolated tests for your AI-powered applications with @agtlantis/core.

## Overview

Testing AI applications presents unique challenges: LLM responses are non-deterministic, API calls are slow and costly, and rate limits can break your CI pipeline. The `@agtlantis/core/testing` module solves these problems by providing:

- **Mock factory functions**: Create mock models with predictable responses
- **MockProvider**: A fully-featured test provider with call tracking
- **Helper utilities**: Simplify common testing patterns
- **Test fixtures**: Reusable data for consistent tests

## Quick Start

Here's a minimal example that tests a function using the Provider API:

```typescript
import { describe, it, expect } from 'vitest';
import { mock, collectEvents } from '@agtlantis/core/testing';

describe('my AI feature', () => {
  it('should generate a greeting', async () => {
    const provider = mock.provider(mock.text('Hello, world!'));

    const execution = provider.simpleExecution(async (session) => {
      const result = await session.generateText({ prompt: 'Say hello' });
      return result.text;
    });

    expect(await execution.toResult()).toBe('Hello, world!');
    expect(provider.getCalls()).toHaveLength(1);
  });
});
```

No API keys needed. No network requests. Just fast, deterministic tests.

## Basic Usage

### The mock Factory

The `mock` object provides factory functions for creating mock models. Each function returns a `MockLanguageModelV3` instance that you can use directly with the AI SDK or wrap in a `MockProvider`.

**mock.text() - Simple Text Response**

The most common mock. Returns a fixed text string:

```typescript
import { generateText } from 'ai';
import { mock } from '@agtlantis/core/testing';

const result = await generateText({
  model: mock.text('Hello, world!'),
  prompt: 'Say hello',
});
expect(result.text).toBe('Hello, world!');
```

**mock.json() - JSON Response**

Returns a JSON-stringified object. Useful for testing structured output:

```typescript
import { generateText } from 'ai';
import { mock } from '@agtlantis/core/testing';

const data = { name: 'Alice', age: 30 };
const result = await generateText({
  model: mock.json(data),
  prompt: 'Get user info',
});
expect(JSON.parse(result.text)).toEqual(data);
```

You can pass any JSON-serializable data - objects, arrays, or primitives:

```typescript
import { mock } from '@agtlantis/core/testing';

// Nested objects
const nestedModel = mock.json({
  user: { name: 'Alice' },
  items: [{ id: 1 }, { id: 2 }],
});

// Arrays
const arrayModel = mock.json([1, 2, 3]);
```

**mock.stream() - Streaming Chunks**

Returns text in chunks for testing streaming scenarios:

```typescript
import { streamText } from 'ai';
import { mock } from '@agtlantis/core/testing';

const result = streamText({
  model: mock.stream(['Hello', ', ', 'world!']),
  prompt: 'Say hello',
});
expect(await result.text).toBe('Hello, world!');
```

You can also verify individual chunks as they arrive:

```typescript
import { streamText } from 'ai';
import { mock } from '@agtlantis/core/testing';

const chunks: string[] = [];
const result = streamText({
  model: mock.stream(['A', 'B', 'C']),
  prompt: 'test',
});

for await (const chunk of result.textStream) {
  chunks.push(chunk);
}
expect(chunks).toEqual(['A', 'B', 'C']);
```

**mock.error() - Error Simulation**

Simulates API errors for testing error handling paths:

```typescript
import { generateText } from 'ai';
import { mock } from '@agtlantis/core/testing';

await expect(
  generateText({
    model: mock.error(new Error('Rate limit exceeded')),
    prompt: 'test',
  })
).rejects.toThrow('Rate limit exceeded');
```

You can also preserve custom error properties:

```typescript
import { mock } from '@agtlantis/core/testing';

const error = new Error('Rate limit exceeded');
(error as Error & { code: string; retryAfter: number }).code = 'RATE_LIMIT';
(error as Error & { code: string; retryAfter: number }).retryAfter = 60;

const model = mock.error(error);
```

### Using MockProvider

While mock models work directly with the AI SDK, `MockProvider` lets you test code that uses the @agtlantis/core Provider API. It extends `BaseProvider` with full call tracking, so you can verify exactly what calls were made.

**Creating a MockProvider**

Use `mock.provider()` to create a provider. You can pass a single model, a model factory, or a full configuration object:

```typescript
import { mock } from '@agtlantis/core/testing';

// From a mock model - all calls use this model
const provider = mock.provider(mock.text('Hello!'));

// From a model factory - different response per model ID
const provider = mock.provider((modelId) => {
  if (modelId === 'gpt-4') return mock.text('GPT-4 response');
  return mock.text('Default response');
});

// With full configuration
const provider = mock.provider({
  model: mock.text('Hello!'),
  fileManager: customFileManager,
  logger: customLogger,
});
```

**Simple Execution**

Test functions that use `simpleExecution()`:

```typescript
import { mock } from '@agtlantis/core/testing';

const provider = mock.provider(mock.text('The answer is 42'));
const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({
    prompt: 'What is the meaning of life?',
  });
  return result.text;
});

expect(await execution.toResult()).toBe('The answer is 42');
```

**Streaming Execution**

Test functions that use `streamingExecution()`:

> **Note:** `EventMetrics` is imported from the main package (`@agtlantis/core`), not the testing module. See [Observability API](../api/observability.md) for details.

```typescript
import { mock, collectEvents } from '@agtlantis/core/testing';
import type { EventMetrics } from '@agtlantis/core';

interface MyEvent {
  type: string;
  metrics: EventMetrics;  // { timestamp, elapsedMs, deltaMs }
  data?: unknown;
}

const provider = mock.provider(mock.stream(['Hello', ', ', 'world!']));
const execution = provider.streamingExecution<MyEvent, string>(
  async function* (session) {
    const result = session.streamText({ prompt: 'Say hello' });
    let text = '';
    for await (const chunk of result.textStream) {
      text += chunk;
    }
    return session.done(text);
  }
);

const events = await collectEvents(execution);
const completeEvent = events.find((e) => e.type === 'complete');
expect(completeEvent?.data).toBe('Hello, world!');
```

### Call Tracking

MockProvider tracks all LLM calls made during execution. This lets you verify that your code makes the expected calls in the expected order.

**Get All Calls**

```typescript
import { mock } from '@agtlantis/core/testing';

const provider = mock.provider(mock.text('Response'));

const execution = provider.simpleExecution(async (session) => {
  await session.generateText({ prompt: 'First' });
  await session.generateText({ prompt: 'Second' });
});
await execution.toResult(); // Wait for execution to complete

const calls = provider.getCalls();
expect(calls).toHaveLength(2);
expect(calls[0].type).toBe('generate');
expect(calls[0].modelId).toBe('default');
expect(calls[0].timestamp).toBeGreaterThan(0);
```

**Clear Calls Between Tests**

```typescript
import { mock } from '@agtlantis/core/testing';

const provider = mock.provider(mock.text('Response'));

// First execution
const execution = provider.simpleExecution(async (session) => {
  await session.generateText({ prompt: 'Test' });
});
await execution.toResult();
expect(provider.getCalls()).toHaveLength(1);

// Clear for next test
provider.clearCalls();
expect(provider.getCalls()).toHaveLength(0);
```

### Helper Functions

**collectEvents()**

Collects all events from a streaming execution into an array. This replaces the common pattern of manually iterating:

```typescript
import { mock, collectEvents } from '@agtlantis/core/testing';

const execution = provider.streamingExecution(async function* (session) {
  yield session.emit({ type: 'progress', message: 'Working...' });
  return session.done('Complete');
});

const events = await collectEvents(execution);
expect(events).toHaveLength(2); // progress + complete
```

**consumeExecution()**

Consumes all events without storing them. Useful when you only care about side effects or final state:

```typescript
import { consumeExecution } from '@agtlantis/core/testing';

const execution = provider.streamingExecution(async function* (session) {
  yield session.emit({ type: 'progress' });
  return session.done('result');
});

await consumeExecution(execution);
// Events consumed but not stored
```

## Advanced Usage

### Custom Response Options

Mock models accept optional parameters to customize metadata:

```typescript
import { mock } from '@agtlantis/core/testing';

// Custom token usage for cost calculations
const model = mock.text('Hello', {
  usage: {
    inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 50, text: 50, reasoning: undefined },
  },
});

// Custom finish reason
const truncatedModel = mock.text('Truncated...', {
  finishReason: { unified: 'length', raw: 'max_tokens' },
});
```

### Model Factory Pattern

Use a factory function for different responses per model:

```typescript
import { mock } from '@agtlantis/core/testing';

const provider = mock.provider((modelId: string) => {
  switch (modelId) {
    case 'gpt-4': return mock.text('GPT-4 response');
    case 'gpt-3.5-turbo': return mock.text('GPT-3.5 response');
    default: return mock.text('Default response');
  }
});

const execution = provider.simpleExecution(async (session) => {
  await session.generateText({ model: 'gpt-4', prompt: 'Complex task' });
  await session.generateText({ model: 'gpt-3.5-turbo', prompt: 'Simple task' });
});
await execution.toResult();

const calls = provider.getCalls();
expect(calls[0].modelId).toBe('gpt-4');
expect(calls[1].modelId).toBe('gpt-3.5-turbo');
```

### Conditional Responses

Create mocks that behave differently over time:

```typescript
import { mock } from '@agtlantis/core/testing';

let callCount = 0;
const provider = mock.provider(() => {
  callCount++;
  if (callCount === 1) return mock.error(new Error('Temporary failure'));
  return mock.text('Success on retry');
});
```

### Fluent Configuration

MockProvider supports the same fluent API as production providers:

```typescript
import { mock } from '@agtlantis/core/testing';

const provider = mock
  .provider(mock.text('Response'))
  .withDefaultModel('gemini-2.5-flash')
  .withPricing({
    'gemini-2.5-flash': { inputPricePerMillion: 0.5, outputPricePerMillion: 3.0 },
  });

// Call tracking is shared across fluent instances
const baseProvider = mock.provider(mock.text('Response'));
const configured = baseProvider.withDefaultModel('test-model');
// Both see the same calls after execution
```

### Inspecting Prompt Content

Verify what prompts were sent to the LLM:

```typescript
import { mock } from '@agtlantis/core/testing';

const provider = mock.provider(mock.text('Response'));
const execution = provider.simpleExecution(async (session) => {
  await session.generateText({
    system: 'You are a helpful assistant.',
    prompt: 'What is the meaning of life?',
  });
});
await execution.toResult();

const calls = provider.getCalls();
const params = calls[0].params as { prompt: Array<{ role: string; content: unknown }> };
const systemMessage = params.prompt.find((m) => m.role === 'system');
expect(systemMessage?.content).toContain('You are a helpful assistant.');
```

### Test Fixtures

**TEST_API_KEY** - Constant for tests needing an API key placeholder:

```typescript
import { TEST_API_KEY } from '@agtlantis/core/testing';
const config = { apiKey: TEST_API_KEY };
```

**createMockUsage()** - Creates mock token usage data:

```typescript
import { createMockUsage } from '@agtlantis/core/testing';
const usage = createMockUsage({ inputTokens: 100, outputTokens: 50 });
```

**createMockSessionSummary()** - Creates mock session summary:

```typescript
import { createMockSessionSummary } from '@agtlantis/core/testing';
const summary = createMockSessionSummary({ totalDuration: 2000, llmCallCount: 3 });
```

**createTestEvent()** - Creates test events with default metrics:

```typescript
import { createTestEvent } from '@agtlantis/core/testing';
const event = createTestEvent('progress', { message: 'Working...' });
```

## Best Practices

### Isolate Tests with Fresh Providers

Create a new provider for each test to avoid cross-test contamination:

```typescript
import { describe, beforeEach } from 'vitest';
import { mock, MockProvider } from '@agtlantis/core/testing';

describe('MyFeature', () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = mock.provider(mock.text('Default response'));
  });
});
```

### Test Both Success and Failure Paths

Always test how your code handles errors and edge cases:

```typescript
import { describe, it, expect } from 'vitest';
import { mock } from '@agtlantis/core/testing';
import { myFunction } from './my-function';

describe('myFunction', () => {
  it('should handle successful response', async () => {
    const provider = mock.provider(mock.text('Success'));
    const result = await myFunction(provider);
    expect(result).toBe('Success');
  });

  it('should handle errors gracefully', async () => {
    const provider = mock.provider(mock.error(new Error('API Error')));
    await expect(myFunction(provider)).rejects.toThrow('API Error');
  });

  it('should handle empty responses', async () => {
    const provider = mock.provider(mock.text(''));
    const result = await myFunction(provider);
    expect(result).toBe('');
  });
});
```

### Verify Call Counts and Order

Use call tracking to ensure your code makes the expected API calls in the expected order:

```typescript
import { describe, it, expect } from 'vitest';
import { mock } from '@agtlantis/core/testing';

describe('multi-step workflow', () => {
  it('should make calls in correct order', async () => {
    const provider = mock.provider((modelId) => {
      if (modelId === 'fast-model') return mock.text('Quick');
      return mock.text('Detailed');
    });

    const execution = provider.simpleExecution(async (session) => {
      // First: quick analysis
      await session.generateText({ model: 'fast-model', prompt: 'Quick task' });

      // Then: detailed processing
      await session.generateText({ model: 'detailed-model', prompt: 'Complex task' });
    });
    await execution.toResult();

    const calls = provider.getCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].modelId).toBe('fast-model');
    expect(calls[1].modelId).toBe('detailed-model');
  });
});
```

### Use Meaningful Mock Responses

Make mock responses realistic enough to test your parsing logic:

```typescript
import { mock } from '@agtlantis/core/testing';

// Good: Response matches expected format
const provider = mock.provider(mock.json({
  analysis: { sentiment: 'positive', confidence: 0.95 },
}));
```

### Keep Tests Fast

Mock tests should be instant. Avoid artificial delays and unnecessary setup:

```typescript
// Bad: Adds artificial delay
await new Promise((r) => setTimeout(r, 100));

// Good: Test immediately
const result = await execution.toResult();
expect(result).toBe('expected');
```

### Document Test Intent

Use descriptive test names and comments for complex test scenarios:

```typescript
import { describe, it } from 'vitest';
import { mock } from '@agtlantis/core/testing';

describe('UserProfileGenerator', () => {
  it('should generate profile from multiple LLM calls with different models', async () => {
    // This test verifies that:
    // 1. Fast model is used for quick extraction
    // 2. Pro model is used for detailed generation
    // 3. Results are properly combined

    const provider = mock.provider((modelId) => {
      if (modelId === 'fast') return mock.json({ name: 'Alice' });
      return mock.text('Alice is a software engineer...');
    });

    // ... test implementation
  });
});
```

## See Also

- [API Reference: Testing](../api/testing.md) - Complete API documentation
- [Provider Guide](./provider-guide.md) - Understanding the Provider API
- [Streaming Guide](./streaming-guide.md) - Working with streaming executions
- [Patterns Guide](./patterns-guide.md) - Advanced usage patterns
