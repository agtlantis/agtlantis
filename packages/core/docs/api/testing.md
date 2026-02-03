# Testing API Reference

> Complete API documentation for the @agtlantis/core/testing module.

## Overview

The testing module provides utilities for writing fast, deterministic tests for AI-powered applications. It includes mock model factories, a test provider with call tracking, and helper functions for common test patterns.

## Import

```typescript
import {
  // Mock factory
  mock,
  type ResponseOptions,

  // MockProvider
  MockProvider,
  createMockProvider,
  type MockProviderConfig,
  type ModelFactory,
  type MockCall,

  // Helpers
  collectEvents,
  consumeExecution,
  expectFileManagerInterface,

  // Fixtures
  TEST_API_KEY,
  createMockUsage,
  createMockSessionSummary,
  createTestEvent,
  type TestEvent,
  type TestResult,

  // Re-exports from AI SDK
  MockLanguageModelV3,
  simulateReadableStream,

  // Execution Host Testing (framework-agnostic)
  createStreamingSessionFactory,
  createSimpleSessionFactory,
  createStreamingSessionFactoryWithSignal,
  createMockModel,
  createMockFileManager,
  createMockLogger,
  createMockLanguageModelUsage,
  createSimpleGenerator,
  createErrorGenerator,
  createSlowGenerator,
  createNeverEndingGenerator,
  createCancelableGenerator,
  createCancelableFunction,
  createDelayedGenerator,
  createAbortScenario,
  createAlreadyAbortedSignal,
  collectStreamAsync,
  collectExecutionEvents,
  createControllablePromise,
  createOrderTrackingLogger,
  type AbortScenario,
  type MockFn,
  type MockFnFactory,
  type CreateMockModelOptions,
  type CreateSessionFactoryOptions,
  type LoggerEventType,
} from '@agtlantis/core/testing';
```

## Types

### MockCall

Record of an LLM call made through MockProvider.

```typescript
interface MockCall {
  modelId: string;           // Model ID used (or 'default')
  type: 'generate' | 'stream'; // Call type
  timestamp: number;          // When the call was made
  params: unknown;            // Raw params passed to LLM
}
```

### MockProviderConfig

Configuration options for creating a MockProvider.

```typescript
interface MockProviderConfig {
  model?: MockLanguageModelV3;      // Single mock model for all calls
  modelFactory?: ModelFactory;       // Factory for different models per call
  fileManager?: FileManager;         // Custom file manager
  logger?: Logger;                   // Logger (defaults to noopLogger)
  providerType?: string;             // Provider type identifier
}
```

### ModelFactory

Factory function type for creating models dynamically.

```typescript
type ModelFactory = (modelId: string) => MockLanguageModelV3;
```

### ResponseOptions

Options for customizing mock response metadata (usage, finishReason, warnings, providerMetadata).

```typescript
type ResponseOptions = Partial<Omit<DoGenerateResult, 'content'>>;
```

### TestEvent

Generic test event interface for streaming execution tests.

```typescript
interface TestEvent {
  type: string;
  metrics: EventMetrics;  // { timestamp, elapsedMs, deltaMs }
  message?: string;
  data?: unknown;
  error?: Error;
}
```

> **Note:** `EventMetrics` is imported from `@agtlantis/core`. See [Observability API](./observability.md).

## mock Factory

### mock.text()

Creates a MockLanguageModelV3 that returns text content.

```typescript
function text(text: string, options?: ResponseOptions): MockLanguageModelV3;
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | `string` | The text to return |
| `options` | `ResponseOptions` | Optional metadata overrides |

**Example:**

```typescript
import { mock } from '@agtlantis/core/testing';
import { generateText } from 'ai';

const result = await generateText({
  model: mock.text('Hello, world!'),
  prompt: 'Say hello',
});
```

### mock.json()

Creates a MockLanguageModelV3 that returns JSON content (auto-stringified).

```typescript
function json<T>(data: T, options?: ResponseOptions): MockLanguageModelV3;
```

**Example:**

```typescript
import { mock } from '@agtlantis/core/testing';

const model = mock.json({ name: 'Alice', age: 30 });
```

### mock.stream()

Creates a MockLanguageModelV3 that streams text chunks.

```typescript
function stream(chunks: string[], options?: ResponseOptions): MockLanguageModelV3;
```

**Example:**

```typescript
import { mock } from '@agtlantis/core/testing';

const model = mock.stream(['Hello', ', ', 'world!']);
```

### mock.error()

Creates a MockLanguageModelV3 that throws an error.

```typescript
function error(error: Error): MockLanguageModelV3;
```

**Example:**

```typescript
import { mock } from '@agtlantis/core/testing';

const model = mock.error(new Error('Rate limit exceeded'));
```

### mock.provider()

Creates a MockProvider with call tracking.

```typescript
function provider(
  configOrModel: MockProviderConfig | MockLanguageModelV3 | ModelFactory
): MockProvider;
```

**Example:**

```typescript
import { mock } from '@agtlantis/core/testing';

// From model
const provider = mock.provider(mock.text('Hello!'));

// From factory
const provider = mock.provider((modelId) => mock.text(`Response from ${modelId}`));

// From config
const provider = mock.provider({ model: mock.text('Hello'), logger: customLogger });
```

## MockProvider Class

Test provider that extends BaseProvider with call tracking.

### Constructor

```typescript
constructor(config: MockProviderConfig)
```

Throws if neither `model` nor `modelFactory` is provided.

### getCalls()

Returns all recorded LLM calls (returns a copy).

```typescript
getCalls(): MockCall[]
```

**Example:**

```typescript
import { mock } from '@agtlantis/core/testing';

const provider = mock.provider(mock.text('Response'));
provider.simpleExecution(async (session) => {
  await session.generateText({ prompt: 'Test' });
});

const calls = provider.getCalls();
expect(calls).toHaveLength(1);
```

### clearCalls()

Clears all recorded calls.

```typescript
clearCalls(): void
```

### withDefaultModel()

Sets the default model ID. Returns a new MockProvider instance.

```typescript
withDefaultModel(modelId: string): MockProvider
```

### withLogger()

Sets the logger. Returns a new MockProvider instance.

```typescript
withLogger(logger: Logger): MockProvider
```

### withPricing()

Sets custom pricing configuration. Returns a new MockProvider instance.

```typescript
withPricing(pricing: ProviderPricing): MockProvider
```

### simpleExecution()

Creates a simple Promise-based execution (inherited from BaseProvider).

```typescript
simpleExecution<TResult>(
  fn: (session: SimpleSession) => Promise<TResult>
): Promise<Execution<TResult>>
```

### streamingExecution()

Creates a streaming execution with event emission (inherited from BaseProvider).

```typescript
streamingExecution<TEvent, TResult>(
  generator: (session: StreamingSession<TEvent, TResult>) => AsyncGenerator<TEvent, TEvent>
): StreamingExecution<TEvent, TResult>
```

## createMockProvider()

Factory function to create a MockProvider from various input types.

```typescript
function createMockProvider(
  configOrModel: MockProviderConfig | MockLanguageModelV3 | ModelFactory
): MockProvider
```

## Helper Functions

### collectEvents()

Collects all events from a streaming execution into an array.

```typescript
function collectEvents<T>(execution: AsyncIterable<T>): Promise<T[]>
```

**Example:**

```typescript
import { collectEvents } from '@agtlantis/core/testing';

const events = await collectEvents(execution);
expect(events).toHaveLength(3);
```

### consumeExecution()

Consumes all events without storing them.

```typescript
function consumeExecution<T>(execution: AsyncIterable<T>): Promise<void>
```

### expectFileManagerInterface()

Asserts that an object implements the FileManager interface.

```typescript
function expectFileManagerInterface(obj: unknown): asserts obj is FileManager
```

## Fixtures

### TEST_API_KEY

Standard test API key constant.

```typescript
const TEST_API_KEY = 'test-api-key';
```

### createMockUsage()

Creates mock LanguageModelUsage with sensible defaults.

```typescript
function createMockUsage(overrides?: Partial<LanguageModelUsage>): LanguageModelUsage
```

Default: 10 input, 5 output, 15 total tokens.

**Example:**

```typescript
import { createMockUsage } from '@agtlantis/core/testing';

const usage = createMockUsage({ inputTokens: 100, outputTokens: 50 });
```

### createMockSessionSummary()

Creates mock SessionSummary with sensible defaults.

```typescript
function createMockSessionSummary(overrides?: Partial<SessionSummary>): SessionSummary
```

Default: 1000ms duration, 1 LLM call, 0 cost.

### createTestEvent()

Creates a test event with default metrics.

```typescript
function createTestEvent(
  type: string,
  overrides?: Partial<Omit<TestEvent, 'type'>>
): TestEvent
```

**Example:**

```typescript
import { createTestEvent } from '@agtlantis/core/testing';

const event = createTestEvent('progress', { message: 'Working...' });
```

## Re-exports

### MockLanguageModelV3

The AI SDK's mock language model class for advanced custom mocking.

```typescript
import { MockLanguageModelV3 } from '@agtlantis/core/testing';

const customModel = new MockLanguageModelV3({
  doGenerate: async (params) => ({
    content: [{ type: 'text', text: 'Custom response' }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } },
    warnings: [],
  }),
});
```

### simulateReadableStream

Utility for creating mock readable streams.

## Examples

### Testing Simple Execution

```typescript
import { describe, it, expect } from 'vitest';
import { mock } from '@agtlantis/core/testing';

describe('generateGreeting', () => {
  it('should return greeting from LLM', async () => {
    const provider = mock.provider(mock.text('Hello, Alice!'));

    const execution = provider.simpleExecution(async (session) => {
      const result = await session.generateText({ prompt: 'Greet Alice' });
      return result.text;
    });

    expect(await execution.toResult()).toBe('Hello, Alice!');
  });
});
```

### Testing Streaming Execution

```typescript
import { describe, it, expect } from 'vitest';
import { mock, collectEvents } from '@agtlantis/core/testing';
import type { EventMetrics } from '@agtlantis/core';

interface ProcessEvent {
  type: string;
  metrics: EventMetrics;
  data?: string;
}

describe('streamingProcessor', () => {
  it('should emit progress events', async () => {
    const provider = mock.provider(mock.text('Done!'));

    const execution = provider.streamingExecution<ProcessEvent, string>(
      async function* (session) {
        yield session.emit({ type: 'progress', data: 'Working...' });
        await session.generateText({ prompt: 'Test' });
        return session.done('Completed');
      }
    );

    const events = await collectEvents(execution);
    const progressEvents = events.filter((e) => e.type === 'progress');
    expect(progressEvents).toHaveLength(1);
  });
});
```

### Testing Multi-Model Workflows

```typescript
import { describe, it, expect } from 'vitest';
import { mock } from '@agtlantis/core/testing';

describe('multiModelWorkflow', () => {
  it('should use different models for different tasks', async () => {
    const provider = mock.provider((modelId) => {
      if (modelId === 'fast-model') return mock.text('Quick result');
      return mock.text('Detailed analysis');
    });

    provider.simpleExecution(async (session) => {
      await session.generateText({ model: 'fast-model', prompt: 'Quick task' });
      await session.generateText({ model: 'smart-model', prompt: 'Complex task' });
    });

    const calls = provider.getCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].modelId).toBe('fast-model');
    expect(calls[1].modelId).toBe('smart-model');
  });
});
```

### Testing Error Handling

```typescript
import { describe, it, expect } from 'vitest';
import { mock } from '@agtlantis/core/testing';

describe('errorHandling', () => {
  it('should track calls even when errors occur', async () => {
    const provider = mock.provider(mock.error(new Error('API Error')));

    try {
      provider.simpleExecution(async (session) => {
        await session.generateText({ prompt: 'This will fail' });
      });
    } catch (e) {
      expect((e as Error).message).toBe('API Error');
    }

    expect(provider.getCalls()).toHaveLength(1);
  });
});
```

### Testing with Fluent Configuration

```typescript
import { describe, it, expect } from 'vitest';
import { mock } from '@agtlantis/core/testing';

describe('fluentConfiguration', () => {
  it('should share call tracking across fluent API', async () => {
    const baseProvider = mock.provider(mock.text('Response'));
    const configuredProvider = baseProvider.withDefaultModel('test-model');

    await configuredProvider.simpleExecution(async (session) => {
      await session.generateText({ prompt: 'Test' });
    });

    // Both providers see the same calls
    expect(baseProvider.getCalls()).toHaveLength(1);
    expect(configuredProvider.getCalls()).toHaveLength(1);
    expect(configuredProvider.getCalls()[0].modelId).toBe('test-model');
  });
});
```

## Execution Host Testing

These helpers are **framework-agnostic** and work with any test framework (vitest, Jest, etc.).

### Types

#### MockFn

```typescript
type MockFn = (...args: unknown[]) => unknown;
```

#### MockFnFactory

```typescript
type MockFnFactory = () => MockFn;
```

#### AbortScenario

```typescript
interface AbortScenario {
  controller: AbortController;
  signal: AbortSignal;
  abort: (reason?: string) => void;
  isAborted: () => boolean;
}
```

#### CreateMockModelOptions

```typescript
interface CreateMockModelOptions {
  mockFn?: MockFnFactory;  // e.g., () => vi.fn() or () => jest.fn()
}
```

#### CreateSessionFactoryOptions

```typescript
interface CreateSessionFactoryOptions {
  mockFn?: MockFnFactory;
  logger?: Logger;
}
```

### Session Factories

#### createStreamingSessionFactory()

Creates a factory function for StreamingSession instances.

```typescript
function createStreamingSessionFactory<TEvent, TResult>(
  options?: CreateSessionFactoryOptions
): () => StreamingSession<TEvent, TResult>
```

**Example:**

```typescript
import { createStreamingSessionFactory } from '@agtlantis/core/testing';

// Basic usage (noop mocks)
const factory = createStreamingSessionFactory();

// With vitest mocks
import { vi } from 'vitest';
const factory = createStreamingSessionFactory({ mockFn: vi.fn });

// With logger
const factory = createStreamingSessionFactory({ logger: myLogger });
```

#### createSimpleSessionFactory()

Creates a factory function for SimpleSession instances.

```typescript
function createSimpleSessionFactory(
  options?: CreateSessionFactoryOptions
): (signal?: AbortSignal) => SimpleSession
```

#### createStreamingSessionFactoryWithSignal()

Creates a factory that captures the signal passed to it.

```typescript
function createStreamingSessionFactoryWithSignal<TEvent, TResult>(
  options?: CreateStreamingSessionFactoryWithSignalOptions
): (signal?: AbortSignal) => StreamingSession<TEvent, TResult>
```

### Mock Factories

#### createMockModel()

Creates a mock LanguageModel.

```typescript
function createMockModel(options?: CreateMockModelOptions): LanguageModel
```

#### createMockFileManager()

Creates a mock FileManager.

```typescript
function createMockFileManager(options?: CreateMockFileManagerOptions): FileManager
```

#### createMockLogger()

Creates a mock Logger.

```typescript
function createMockLogger(options?: CreateMockLoggerOptions): Logger
```

### Generator Helpers

#### createSimpleGenerator()

Creates a generator that emits events and returns a result.

```typescript
function createSimpleGenerator<TEvent, TResult>(
  result: TResult,
  events?: Array<Omit<TEvent, 'metrics'>>
): SessionStreamGeneratorFn<TEvent, TResult>
```

**Example:**

```typescript
const generator = createSimpleGenerator('final result', [
  { type: 'progress', message: 'Step 1' },
  { type: 'progress', message: 'Step 2' },
]);
```

#### createErrorGenerator()

Creates a generator that throws an error after emitting optional events.

```typescript
function createErrorGenerator<TEvent>(
  error: Error,
  eventsBeforeError?: Array<Omit<TEvent, 'metrics'>>
): SessionStreamGeneratorFn<TEvent, never>
```

#### createSlowGenerator()

Creates a generator with delays between events.

```typescript
function createSlowGenerator<TEvent>(
  events: Array<Omit<TEvent, 'metrics'>>,
  delayBetweenEventsMs: number,
  abortScenario?: AbortScenario
): SessionStreamGeneratorFn<TEvent, undefined>
```

#### createNeverEndingGenerator()

Creates a generator that waits forever (for cancel/cleanup tests).

```typescript
function createNeverEndingGenerator<TEvent>(
  eventsBeforeWait?: Array<Omit<TEvent, 'metrics'>>,
  abortScenario?: AbortScenario
): SessionStreamGeneratorFn<TEvent, undefined>
```

#### createCancelableGenerator()

Creates a generator that responds to abort signals.

```typescript
function createCancelableGenerator<TEvent>(
  abortScenario: AbortScenario,
  onCancel?: () => void,
  eventsBeforeWait?: Array<Omit<TEvent, 'metrics'>>
): SessionStreamGeneratorFn<TEvent, void>
```

#### createCancelableFunction()

Creates a function that responds to abort signals (for SimpleExecutionHost).

```typescript
function createCancelableFunction(
  abortScenario: AbortScenario,
  onCancel?: () => void
): (session: SimpleSession) => Promise<unknown>
```

#### createDelayedGenerator()

Creates a generator with an initial delay before returning result.

```typescript
function createDelayedGenerator<TEvent, TResult>(
  delayMs: number,
  result: TResult,
  abortScenario?: AbortScenario
): SessionStreamGeneratorFn<TEvent, TResult>
```

### Abort Helpers

#### createAbortScenario()

Creates an abort controller with convenience methods.

```typescript
function createAbortScenario(): AbortScenario
```

**Example:**

```typescript
const { signal, abort, isAborted } = createAbortScenario();

// Pass signal to execution
const execution = new StreamingExecutionHost(factory, generator, signal);

// Cancel later
abort('User canceled');
expect(isAborted()).toBe(true);
```

#### createAlreadyAbortedSignal()

Creates a pre-aborted signal for testing immediate cancellation.

```typescript
function createAlreadyAbortedSignal(reason?: string): AbortSignal
```

### Utility Functions

#### collectStreamAsync()

Collects all events from an async iterable.

```typescript
function collectStreamAsync<T>(stream: AsyncIterable<T>): Promise<T[]>
```

#### createControllablePromise()

Creates a promise with external resolve/reject controls.

```typescript
function createControllablePromise<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}
```

#### createOrderTrackingLogger()

Creates a logger that tracks the order of calls.

```typescript
function createOrderTrackingLogger(): {
  logger: Logger;
  getCallOrder: () => LoggerEventType[];
}
```

**Example:**

```typescript
const { logger, getCallOrder } = createOrderTrackingLogger();
// ... run execution with logger
expect(getCallOrder()).toEqual(['start', 'emit', 'done']);
```

## See Also

- [Testing Guide](../guides/testing-guide.md) - Comprehensive testing guide with best practices
- [Provider API Reference](./provider.md) - Provider API documentation
- [Session API Reference](./session.md) - Session API documentation
