/**
 * Test helpers for execution module tests.
 * Provides reusable utilities for abort scenarios, generator creation,
 * and logger tracking.
 *
 * These helpers are framework-agnostic (no vitest/jest dependency).
 */

import type { EventMetrics } from '@/observability';
import type { Logger } from '@/observability/logger';
import type { SimpleSession } from '../../session/simple-session';

// ============================================================================
// Types
// ============================================================================

export type LoggerEventType = 'start' | 'emit' | 'done' | 'error';

// ============================================================================
// Abort/Signal Helpers
// ============================================================================

/**
 * Abort scenario helper for testing cancellation flows.
 */
export interface AbortScenario {
  /** The AbortController instance */
  controller: AbortController;
  /** The AbortSignal to pass to execution */
  signal: AbortSignal;
  /** Call to abort with optional reason */
  abort: (reason?: string) => void;
  /** Check if signal is aborted */
  isAborted: () => boolean;
}

/**
 * Create an abort scenario for testing cancellation.
 *
 * @example
 * ```typescript
 * const { signal, abort, isAborted } = createAbortScenario();
 * const execution = new SimpleExecutionHost(factory, fn, signal);
 *
 * abort('User canceled');
 * expect(isAborted()).toBe(true);
 *
 * const result = await execution.result();
 * expectCanceledResult(result);
 * ```
 */
export function createAbortScenario(): AbortScenario {
  const controller = new AbortController();
  return {
    controller,
    signal: controller.signal,
    abort: (reason?: string) => controller.abort(reason),
    isAborted: () => controller.signal.aborted,
  };
}

/**
 * Create an already-aborted signal for testing pre-aborted scenarios.
 *
 * @example
 * ```typescript
 * const signal = createAlreadyAbortedSignal('Pre-aborted');
 * const execution = new SimpleExecutionHost(factory, fn, signal);
 *
 * const result = await execution.result();
 * expectCanceledResult(result);
 * ```
 */
export function createAlreadyAbortedSignal(reason = 'Already aborted'): AbortSignal {
  const controller = new AbortController();
  controller.abort(reason);
  return controller.signal;
}

// ============================================================================
// Generator Helpers (for StreamingExecutionHost)
// ============================================================================

/**
 * Create a simple generator that emits specified events and returns the result.
 *
 * @example
 * ```typescript
 * const generator = createSimpleGenerator('result-value', [
 *   { type: 'progress', message: 'step 1' },
 *   { type: 'progress', message: 'step 2' },
 * ]);
 * const execution = new StreamingExecutionHost(factory, generator);
 * ```
 */
export function createSimpleGenerator<
  TEvent extends { type: string; metrics: EventMetrics },
  TResult,
>(
  result: TResult,
  events: Array<Omit<TEvent, 'metrics'>> = []
): (session: {
  emit: (event: Omit<TEvent, 'metrics'>) => TEvent;
  done: (value: TResult) => Promise<TEvent>;
}) => AsyncGenerator<TEvent, TEvent | Promise<TEvent>, unknown> {
  return async function* (session) {
    for (const event of events) {
      yield session.emit(event);
    }
    return session.done(result);
  };
}

/**
 * Create a generator that throws an error.
 *
 * @example
 * ```typescript
 * const generator = createErrorGenerator(new Error('Test error'));
 * const execution = new StreamingExecutionHost(factory, generator);
 *
 * const result = await execution.result();
 * expectFailedResult(result, 'Test error');
 * ```
 */
export function createErrorGenerator<
  TEvent extends { type: string; metrics: EventMetrics },
>(
  error: Error,
  eventsBeforeError: Array<Omit<TEvent, 'metrics'>> = []
): (session: {
  emit: (event: Omit<TEvent, 'metrics'>) => TEvent;
}) => AsyncGenerator<TEvent, never, unknown> {
  return async function* (session) {
    for (const event of eventsBeforeError) {
      yield session.emit(event);
    }
    throw error;
  };
}

/**
 * Create a generator that waits for cancellation using closure pattern.
 * Uses the provided AbortScenario to detect when to abort.
 *
 * @example
 * ```typescript
 * const abortScenario = createAbortScenario();
 * const onCancelCalled = vi.fn();
 * const generator = createCancelableGenerator(abortScenario, onCancelCalled);
 *
 * const execution = new StreamingExecutionHost(factory, generator, abortScenario.signal);
 * abortScenario.abort();
 *
 * const result = await execution.result();
 * expectCanceledResult(result);
 * expect(onCancelCalled).toHaveBeenCalled();
 * ```
 */
export function createCancelableGenerator<
  TEvent extends { type: string; metrics: EventMetrics },
>(
  abortScenario: AbortScenario,
  onCancel?: () => void,
  eventsBeforeWait: Array<Omit<TEvent, 'metrics'>> = []
): (session: {
  emit: (event: Omit<TEvent, 'metrics'>) => TEvent;
}) => AsyncGenerator<TEvent, void, unknown> {
  return async function* (session) {
    for (const event of eventsBeforeWait) {
      yield session.emit(event);
    }

    // Wait indefinitely, checking for abort via closure
    await new Promise<void>((_, reject) => {
      const signal = abortScenario.signal;
      if (signal.aborted) {
        onCancel?.();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      signal.addEventListener('abort', () => {
        onCancel?.();
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  };
}

/**
 * Create a function that waits for cancellation using closure pattern.
 * Uses the provided AbortScenario to detect when to abort.
 * Equivalent of createCancelableGenerator for SimpleExecutionHost.
 *
 * @example
 * ```typescript
 * const abortScenario = createAbortScenario();
 * const onCancelCalled = vi.fn();
 * const fn = createCancelableFunction(abortScenario, onCancelCalled);
 *
 * const execution = new SimpleExecutionHost(factory, fn, abortScenario.signal);
 * abortScenario.abort();
 *
 * const result = await execution.result();
 * expectCanceledResult(result);
 * expect(onCancelCalled).toHaveBeenCalled();
 * ```
 */
export function createCancelableFunction(
  abortScenario: AbortScenario,
  onCancel?: () => void
): (session: SimpleSession) => Promise<unknown> {
  return async () => {
    // Wait indefinitely, checking for abort via closure
    await new Promise<void>((_, reject) => {
      const signal = abortScenario.signal;
      if (signal.aborted) {
        onCancel?.();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      signal.addEventListener('abort', () => {
        onCancel?.();
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
    return 'should-not-reach';
  };
}

/**
 * Create a generator with delay, useful for timing-related tests.
 *
 * @example
 * ```typescript
 * const generator = createDelayedGenerator(100, 'result');
 * const execution = new StreamingExecutionHost(factory, generator);
 *
 * // Cancel before delay completes
 * setTimeout(() => execution.cancel(), 50);
 * ```
 */
export function createDelayedGenerator<
  TEvent extends { type: string; metrics: EventMetrics },
  TResult,
>(
  delayMs: number,
  result: TResult,
  abortScenario?: AbortScenario
): (session: {
  emit: (event: Omit<TEvent, 'metrics'>) => TEvent;
  done: (value: TResult) => Promise<TEvent>;
}) => AsyncGenerator<TEvent, TEvent | Promise<TEvent>, unknown> {
  return async function* (session) {
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(resolve, delayMs);
      if (abortScenario) {
        abortScenario.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }
    });
    return session.done(result);
  };
}

// ============================================================================
// Race Condition & Concurrency Test Helpers
// ============================================================================

/**
 * Create a generator that yields events with a configurable delay between each.
 * Useful for race condition testing where timing control is needed.
 *
 * @example
 * ```typescript
 * const generator = createSlowGenerator([
 *   { type: 'chunk', content: 'A' },
 *   { type: 'chunk', content: 'B' },
 *   { type: 'complete', data: 'result' },
 * ], 10);
 * const execution = new StreamingExecutionHost(factory, generator);
 *
 * // Cancel mid-stream
 * setTimeout(() => execution.cancel(), 15);
 * ```
 */
export function createSlowGenerator<
  TEvent extends { type: string; metrics: EventMetrics },
>(
  events: Array<Omit<TEvent, 'metrics'>>,
  delayBetweenEventsMs: number,
  abortScenario?: AbortScenario
): (session: {
  emit: (event: Omit<TEvent, 'metrics'>) => TEvent;
}) => AsyncGenerator<TEvent, TEvent | undefined, unknown> {
  return async function* (session) {
    for (const event of events) {
      // Check abort before each event
      if (abortScenario?.isAborted()) {
        throw new DOMException('Aborted', 'AbortError');
      }

      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(resolve, delayBetweenEventsMs);
        if (abortScenario) {
          if (abortScenario.signal.aborted) {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          abortScenario.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timeoutId);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true }
          );
        }
      });

      yield session.emit(event);
    }
    return undefined;
  };
}

/**
 * Collect all events from an async iterable stream.
 * Useful for testing stream() output in race condition scenarios.
 *
 * @example
 * ```typescript
 * const events = await collectStreamAsync(execution.stream());
 * expect(events).toHaveLength(3);
 * ```
 */
export async function collectStreamAsync<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const event of stream) {
    collected.push(event);
  }
  return collected;
}

/**
 * Create a generator that never completes (infinite wait).
 * Useful for testing cleanup and cancellation behavior.
 *
 * @example
 * ```typescript
 * const generator = createNeverEndingGenerator([
 *   { type: 'chunk', content: 'A' },
 * ]);
 * const execution = new StreamingExecutionHost(factory, generator);
 *
 * // Must cancel to complete
 * execution.cancel();
 * ```
 */
export function createNeverEndingGenerator<
  TEvent extends { type: string; metrics: EventMetrics },
>(
  eventsBeforeWait: Array<Omit<TEvent, 'metrics'>> = [],
  abortScenario?: AbortScenario
): (session: {
  emit: (event: Omit<TEvent, 'metrics'>) => TEvent;
}) => AsyncGenerator<TEvent, TEvent | undefined, unknown> {
  return async function* (session) {
    for (const event of eventsBeforeWait) {
      yield session.emit(event);
    }

    // Wait forever unless aborted
    await new Promise<void>((_, reject) => {
      if (abortScenario) {
        if (abortScenario.signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        abortScenario.signal.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true }
        );
      }
      // Without abort scenario, this promise never settles
    });
    return undefined;
  };
}

// ============================================================================
// Logger Tracking Helpers (framework-agnostic)
// ============================================================================

/**
 * Create a logger that tracks call order for sequence verification.
 * This version is framework-agnostic (no vitest/jest dependency).
 *
 * @example
 * ```typescript
 * const { logger, getCallOrder } = createOrderTrackingLogger();
 * // ... run execution with logger ...
 *
 * expect(getCallOrder()).toEqual(['start', 'emit', 'done']);
 * ```
 */
export function createOrderTrackingLogger(): {
  logger: Logger;
  getCallOrder: () => LoggerEventType[];
} {
  const callOrder: LoggerEventType[] = [];

  const logger: Logger = {
    onLLMCallStart: () => {},
    onLLMCallEnd: () => {},
    onExecutionStart: () => {
      callOrder.push('start');
    },
    onExecutionEmit: () => {
      callOrder.push('emit');
    },
    onExecutionDone: () => {
      callOrder.push('done');
    },
    onExecutionError: () => {
      callOrder.push('error');
    },
  };

  return {
    logger,
    getCallOrder: () => [...callOrder],
  };
}
