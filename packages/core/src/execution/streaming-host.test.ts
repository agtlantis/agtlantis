import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamingSession } from '../session/streaming-session';
import { StreamingExecutionHost } from './streaming-host';
import type { SessionStreamGeneratorFn } from './types';
import { SessionSummary } from '../session/types';
import {
  TEST_PROVIDER_TYPE,
  TestEvent,
  createMockModel,
  createMockFileManager,
  createMockUsage,
  createStreamingSessionFactory,
  collectEvents,
  createAbortScenario,
  createSlowGenerator,
  collectStreamAsync,
  createNeverEndingGenerator,
} from './testing/fixtures';

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

import { generateText, streamText } from 'ai';

const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
const mockStreamText = streamText as ReturnType<typeof vi.fn>;

/**
 * StreamingExecutionHost-specific tests.
 * Contract tests (cancel, onDone hooks, signal propagation, user signal, cleanup)
 * are covered in testing/contract.test.ts
 */
describe('StreamingExecutionHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('construction (eager start)', () => {
    it('should create with session factory and generator', () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'test' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      expect(execution).toBeInstanceOf(StreamingExecutionHost);
    });

    it('should start consuming immediately (eager start)', async () => {
      let started = false;
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        started = true;
        yield session.emit({ type: 'start' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      // stream()이나 result() 안 불러도 이미 시작됨
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(started).toBe(true);

      await execution.result(); // cleanup
    });

    it('should buffer events even without stream() call', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'a' });
        yield session.emit({ type: 'b' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      // result()만 호출해도 events 접근 가능
      const result = await execution.result();

      expect(result.events).toHaveLength(3); // a, b, complete
    });
  });

  describe('session creation', () => {
    it('should create a session on construction (eager)', async () => {
      let sessionCount = 0;
      const sessionFactory = () => {
        sessionCount++;
        return new StreamingSession<TestEvent, string>({
          defaultLanguageModel: createMockModel(),
          providerType: TEST_PROVIDER_TYPE,
          fileManager: createMockFileManager(),
        });
      };

      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(sessionFactory, generator);

      // Wait for eager start
      await execution.result();

      expect(sessionCount).toBe(1);
    });

    it('should pass session to generator', async () => {
      let receivedSession: StreamingSession<TestEvent, string> | null = null;

      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        receivedSession = session;
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      await execution.result();

      expect(receivedSession).toBeInstanceOf(StreamingSession);
    });
  });

  describe('stream()', () => {
    it('should yield events emitted by session', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'progress', message: 'Working...' });
        yield session.emit({ type: 'progress', message: 'Almost done...' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const events = await collectEvents(execution.stream());

      expect(events).toHaveLength(3); // 2 progress + 1 complete
      expect(events[0].type).toBe('progress');
      expect(events[0].message).toBe('Working...');
      expect(events[1].type).toBe('progress');
      expect(events[1].message).toBe('Almost done...');
      expect(events[2].type).toBe('complete');
    });

    it('should have metrics on emitted events', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'progress' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const events = await collectEvents(execution.stream());

      expect(events[0].metrics).toBeDefined();
      expect(events[0].metrics.timestamp).toBeGreaterThan(0);
      expect(events[0].metrics.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(events[0].metrics.deltaMs).toBeGreaterThanOrEqual(0);
    });

    it('should allow multiple stream() calls (replay)', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'a' });
        yield session.emit({ type: 'b' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      // First call
      const events1 = await collectEvents(execution.stream());

      // Second call - should replay all events
      const events2 = await collectEvents(execution.stream());

      expect(events1).toHaveLength(3);
      expect(events2).toHaveLength(3);
      expect(events1.map((e) => e.type)).toEqual(events2.map((e) => e.type));
    });
  });

  describe('result()', () => {
    it('should yield complete event with data', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        return session.done('final-result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      expect(result.status).toBe('succeeded');
      if (result.status === 'succeeded') {
        expect(result.value).toBe('final-result');
      }
    });

    it('should include events in result', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'progress' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      expect(result.events).toHaveLength(2); // progress + complete
      expect(result.events[0].type).toBe('progress');
      expect(result.events[1].type).toBe('complete');
    });

    it('should include summary in result', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage({ inputTokens: 200, outputTokens: 100, totalTokens: 300 }),
      });

      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        // Make an LLM call to populate summary
        await session.generateText({ prompt: 'test' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      expect(result.summary).toBeInstanceOf(SessionSummary);
      expect(result.summary.totalLLMUsage.inputTokens).toBe(200);
    });

    it('should return failed status on error via fail()', async () => {
      const testError = new Error('Test failure');
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        return session.fail(testError);
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.error).toBe(testError);
      }
    });

    it('should return failed status on thrown error', async () => {
      const testError = new Error('Unhandled!');
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* () {
        throw testError;
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.error.message).toBe('Unhandled!');
      }
    });

    it('should provide summary even on failure', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        return session.fail(new Error('Error'));
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      expect(result.status).toBe('failed');
      expect(result.summary).toBeInstanceOf(SessionSummary);
    });
  });

  describe('stream() and result() ordering', () => {
    it('should allow stream -> result pattern', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'a' });
        yield session.emit({ type: 'b' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      // Pattern 1: stream -> result
      const events = await collectEvents(execution.stream());
      const result = await execution.result();

      expect(events).toHaveLength(3);
      expect(result.status).toBe('succeeded');
      expect(result.events).toEqual(events);
    });

    it('should allow result only pattern (events in result)', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'a' });
        yield session.emit({ type: 'b' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      // Pattern 2: result only
      const result = await execution.result();

      expect(result.status).toBe('succeeded');
      expect(result.events).toHaveLength(3);
    });

    it('should allow concurrent stream and result', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'a' });
        yield session.emit({ type: 'b' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      // Pattern 3: concurrent
      const resultPromise = execution.result();
      const events = await collectEvents(execution.stream());
      const result = await resultPromise;

      expect(events).toEqual(result.events);
    });
  });

  describe('AbortError handling', () => {
    it('should treat AbortError as normal cancellation', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'progress' });
        throw new DOMException('Aborted', 'AbortError');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      expect(result.status).toBe('canceled');
      // Should have events before abort
      expect(result.events.some((e) => e.type === 'progress')).toBe(true);
      // Should not have error event for AbortError
      expect(result.events.some((e) => e.type === 'error')).toBe(false);
    });

    it('should distinguish AbortError from other errors', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'progress' });
        throw new Error('Regular error');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      expect(result.status).toBe('failed');
      // Regular error should produce error event
      expect(result.events.some((e) => e.type === 'error')).toBe(true);
    });
  });

  describe('AI SDK integration', () => {
    it('should allow using session.generateText()', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'AI response',
        usage: createMockUsage(),
      });

      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        const result = await session.generateText({ prompt: 'Hello' });
        yield session.emit({ type: 'progress', message: result.text });
        return session.done(result.text);
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const events = await collectEvents(execution.stream());

      expect(events[0].message).toBe('AI response');
      expect(events[1].data).toBe('AI response');
    });

    it('should allow using session.streamText()', async () => {
      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield 'chunk1';
          yield 'chunk2';
        })(),
        usage: Promise.resolve(createMockUsage()),
      });

      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        const result = session.streamText({ prompt: 'Hello' });
        const chunks: string[] = [];
        for await (const chunk of result.textStream) {
          chunks.push(chunk);
        }
        return session.done(chunks.join(''));
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      expect(result.status).toBe('succeeded');
      if (result.status === 'succeeded') {
        expect(result.value).toBe('chunk1chunk2');
      }
    });

    it('should allow file management through session', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        // Register cleanup
        session.onDone(() => session.fileManager.clear());

        // Upload files
        const files = await session.fileManager.upload([]);

        yield session.emit({ type: 'progress', message: `Uploaded ${files.length} files` });

        return session.done('complete');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const events = await collectEvents(execution.stream());

      expect(events[0].message).toBe('Uploaded 0 files');
    });
  });

  describe('edge cases', () => {
    it('should handle generator that returns done immediately without yielding', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        return session.done('instant');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      expect(result.status).toBe('succeeded');
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('complete');
      if (result.status === 'succeeded') {
        expect(result.value).toBe('instant');
      }
    });

    it('should auto-catch exception thrown before first yield', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* () {
        throw new Error('Early crash');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      expect(result.status).toBe('failed');
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('error');
    });

    it('should handle multiple cancel calls safely', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'event' });
        return session.done('done');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      execution.cancel();
      execution.cancel();
      execution.cancel();

      const result = await execution.result();

      expect(['succeeded', 'canceled']).toContain(result.status);
    });

    it('should trigger generator finally block on normal completion', async () => {
      let finallyExecuted = false;
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        try {
          return session.done('x');
        } finally {
          finallyExecuted = true;
        }
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      await execution.result();

      expect(finallyExecuted).toBe(true);
    });
  });

  describe('auto-abort on terminal events', () => {
    it('should abort after complete event (via return)', async () => {
      let signalReceived: AbortSignal | undefined;

      const sessionFactory = (signal?: AbortSignal) => {
        signalReceived = signal;
        return new StreamingSession<TestEvent, string>({
          defaultLanguageModel: createMockModel(),
          providerType: TEST_PROVIDER_TYPE,
          fileManager: createMockFileManager(),
          signal,
        });
      };

      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'progress', message: 'working' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(sessionFactory, generator);
      await execution.result();

      // Signal should be aborted after complete event
      expect(signalReceived?.aborted).toBe(true);
    });

    it('should abort after error event (via throw)', async () => {
      let signalReceived: AbortSignal | undefined;

      const sessionFactory = (signal?: AbortSignal) => {
        signalReceived = signal;
        return new StreamingSession<TestEvent, string>({
          defaultLanguageModel: createMockModel(),
          providerType: TEST_PROVIDER_TYPE,
          fileManager: createMockFileManager(),
          signal,
        });
      };

      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'progress', message: 'working' });
        throw new Error('Something went wrong');
      };

      const execution = new StreamingExecutionHost(sessionFactory, generator);
      await execution.result();

      // Signal should be aborted after error event
      expect(signalReceived?.aborted).toBe(true);
    });
  });

  // ==========================================================================
  // Race Condition Tests
  // ==========================================================================

  describe('race conditions', () => {
    it('should support multiple concurrent stream() consumers', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'a' });
        yield session.emit({ type: 'b' });
        yield session.emit({ type: 'c' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      // Start 3 concurrent consumers
      const [events1, events2, events3] = await Promise.all([
        collectStreamAsync(execution.stream()),
        collectStreamAsync(execution.stream()),
        collectStreamAsync(execution.stream()),
      ]);

      // All should receive the same events (4 = 3 progress + 1 complete)
      expect(events1).toHaveLength(4);
      expect(events2).toHaveLength(4);
      expect(events3).toHaveLength(4);

      // All should have the same event types
      expect(events1.map((e) => e.type)).toEqual(events2.map((e) => e.type));
      expect(events2.map((e) => e.type)).toEqual(events3.map((e) => e.type));
    });

    it('should handle immediate stream() during eager start', async () => {
      let generatorStarted = false;
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        generatorStarted = true;
        yield session.emit({ type: 'a' });
        // Small delay to simulate real work
        await new Promise((r) => setTimeout(r, 5));
        yield session.emit({ type: 'b' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      // Immediately call stream() - generator should have started
      const events = await collectStreamAsync(execution.stream());

      expect(generatorStarted).toBe(true);
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.type)).toEqual(['a', 'b', 'complete']);
    });

    it('should handle abandoned stream() iterator without memory leak', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'a' });
        yield session.emit({ type: 'b' });
        yield session.emit({ type: 'c' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      // Start stream but break early (abandon)
      const stream = execution.stream();
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next(); // Get first event only
      // Don't consume the rest - abandon the iterator

      // Wait for execution to complete naturally
      const result = await execution.result();
      expect(result.status).toBe('succeeded');

      // Cleanup after completion should still work (idempotent)
      await execution.cleanup();
      await execution.cleanup(); // Multiple calls should be safe
    });

    it('should handle cleanup() during active stream()', async () => {
      const abortScenario = createAbortScenario();
      const generator = createSlowGenerator<TestEvent>(
        [
          { type: 'a' },
          { type: 'b' },
          { type: 'c' },
        ],
        20,
        abortScenario
      );

      const execution = new StreamingExecutionHost(
        createStreamingSessionFactory(),
        generator,
        abortScenario.signal
      );

      // Start consuming stream
      const streamPromise = collectStreamAsync(execution.stream());

      // Cleanup mid-iteration (after first event delay)
      await new Promise((r) => setTimeout(r, 30));
      await execution.cleanup();

      // Stream should terminate gracefully (may have partial events)
      const events = await streamPromise;
      expect(events.length).toBeLessThanOrEqual(4);
    });

    it('should handle concurrent cleanup() and result() calls', async () => {
      const onDoneHook = vi.fn();
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        session.onDone(onDoneHook);
        yield session.emit({ type: 'a' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      // Call both concurrently
      const [cleanupResult, result] = await Promise.all([
        execution.cleanup(),
        execution.result(),
      ]);

      // cleanup returns void
      expect(cleanupResult).toBeUndefined();

      // Result should be available
      expect(['succeeded', 'canceled']).toContain(result.status);

      // onDone hook should run exactly once
      expect(onDoneHook).toHaveBeenCalledTimes(1);
    });

    it('should handle cancel() before first event emitted', async () => {
      const abortScenario = createAbortScenario();
      const generator = createSlowGenerator<TestEvent>(
        [{ type: 'a' }, { type: 'b' }],
        50,
        abortScenario
      );

      const execution = new StreamingExecutionHost(
        createStreamingSessionFactory(),
        generator,
        abortScenario.signal
      );

      // Cancel immediately (before any events)
      abortScenario.abort();

      const result = await execution.result();
      expect(result.status).toBe('canceled');
      // No events should have been emitted
      expect(result.events.length).toBe(0);
    });

    it('should handle cancel() during event emission', async () => {
      const abortScenario = createAbortScenario();
      const generator = createSlowGenerator<TestEvent>(
        [
          { type: 'a' },
          { type: 'b' },
          { type: 'c' },
        ],
        20,
        abortScenario
      );

      const execution = new StreamingExecutionHost(
        createStreamingSessionFactory(),
        generator,
        abortScenario.signal
      );

      // Wait for first event, then cancel
      await new Promise((r) => setTimeout(r, 25));
      abortScenario.abort();

      const result = await execution.result();
      expect(result.status).toBe('canceled');
      // Should have partial events (1 event before cancel)
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.events.length).toBeLessThan(4);
    });
  });

  // ==========================================================================
  // Memory Management Tests
  // ==========================================================================

  describe('memory management', () => {
    it('should buffer all events for replay support', async () => {
      const eventCount = 100;
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        for (let i = 0; i < eventCount; i++) {
          yield session.emit({ type: 'progress', message: `Event ${i}` });
        }
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      // Buffer should contain all events (100 progress + 1 complete)
      expect(result.events).toHaveLength(eventCount + 1);

      // Events should be frozen (immutable)
      expect(Object.isFrozen(result.events)).toBe(true);
    });

    it('should clear subscribers after completion', async () => {
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'a' });
        yield session.emit({ type: 'b' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);

      // Create multiple stream consumers
      const stream1 = collectStreamAsync(execution.stream());
      const stream2 = collectStreamAsync(execution.stream());

      await Promise.all([stream1, stream2]);

      // After completion, cleanup should be safe
      await execution.cleanup();
      await execution.cleanup(); // Multiple calls should be safe

      // Result should still be accessible
      const result = await execution.result();
      expect(result.status).toBe('succeeded');
    });

    it('should handle cleanup on never-ending generator', async () => {
      // Use a generator that listens to the session's internal signal
      let signalReceived: AbortSignal | undefined;
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        yield session.emit({ type: 'initial' });

        // Wait forever unless aborted via the internal signal
        await new Promise<void>((_, reject) => {
          // Access the signal that was passed to the session factory
          if (signalReceived?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          signalReceived?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
        return session.done('should-not-reach');
      };

      const sessionFactory = (signal?: AbortSignal) => {
        signalReceived = signal;
        return new StreamingSession<TestEvent, string>({
          defaultLanguageModel: createMockModel(),
          providerType: TEST_PROVIDER_TYPE,
          fileManager: createMockFileManager(),
          signal,
        });
      };

      const execution = new StreamingExecutionHost(sessionFactory, generator);

      // Wait for initial event to be emitted
      await new Promise((r) => setTimeout(r, 10));

      // Cleanup should terminate the execution by calling cancel()
      await execution.cleanup();

      const result = await execution.result();
      expect(result.status).toBe('canceled');
    });

    it('should maintain session reference for summary access', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage({ inputTokens: 500, outputTokens: 250 }),
      });

      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        await session.generateText({ prompt: 'test' });
        yield session.emit({ type: 'progress' });
        return session.done('result');
      };

      const execution = new StreamingExecutionHost(createStreamingSessionFactory(), generator);
      const result = await execution.result();

      // Summary should be accessible
      expect(result.summary).toBeInstanceOf(SessionSummary);
      expect(result.summary.totalLLMUsage.inputTokens).toBe(500);

      // After cleanup, result should still be cached
      await execution.cleanup();
      const cachedResult = await execution.result();
      expect(cachedResult.summary.totalLLMUsage.inputTokens).toBe(500);
    });

    it('should cleanup without error when no events were emitted', async () => {
      const abortScenario = createAbortScenario();

      // Generator that gets aborted before emitting
      const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
        session
      ) {
        await new Promise<void>((_, reject) => {
          abortScenario.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
        yield session.emit({ type: 'never-reached' });
        return undefined;
      };

      const execution = new StreamingExecutionHost(
        createStreamingSessionFactory(),
        generator,
        abortScenario.signal
      );

      // Abort immediately
      abortScenario.abort();

      // Should cleanup without error
      await expect(execution.cleanup()).resolves.toBeUndefined();

      const result = await execution.result();
      expect(result.status).toBe('canceled');
      expect(result.events).toHaveLength(0);
    });
  });
});
