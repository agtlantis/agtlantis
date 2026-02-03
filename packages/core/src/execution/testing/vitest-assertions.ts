/**
 * Vitest-specific assertion helpers for execution module tests.
 * These helpers depend on vitest and should only be used in internal tests.
 */

import { vi, expect } from 'vitest';
import type { ExecutionResult, StreamingResult } from '../types';
import type { Logger } from '@/observability/logger';

// ============================================================================
// Types
// ============================================================================

export type MockLogger = Logger & {
  onLLMCallStart: ReturnType<typeof vi.fn>;
  onLLMCallEnd: ReturnType<typeof vi.fn>;
  onExecutionStart: ReturnType<typeof vi.fn>;
  onExecutionEmit: ReturnType<typeof vi.fn>;
  onExecutionDone: ReturnType<typeof vi.fn>;
  onExecutionError: ReturnType<typeof vi.fn>;
};

// ============================================================================
// Result Assertion Helpers
// ============================================================================

/**
 * Assert that an execution result is successful and optionally check the value.
 *
 * @example
 * ```typescript
 * const result = await execution.result();
 * expectSuccessResult(result, 'expected-value');
 * // result is now narrowed to succeeded type
 * console.log(result.value);
 * ```
 */
export function expectSuccessResult<T>(
  result: ExecutionResult<T>,
  expectedValue?: T
): asserts result is Extract<ExecutionResult<T>, { status: 'succeeded' }> {
  expect(result.status).toBe('succeeded');
  if (result.status !== 'succeeded') {
    throw new Error('Result is not succeeded');
  }
  if (expectedValue !== undefined) {
    expect(result.value).toBe(expectedValue);
  }
}

/**
 * Assert that an execution result is failed and optionally check the error.
 *
 * @example
 * ```typescript
 * const result = await execution.result();
 * expectFailedResult(result, 'Expected error message');
 * // or with regex
 * expectFailedResult(result, /timeout/i);
 * ```
 */
export function expectFailedResult<T>(
  result: ExecutionResult<T>,
  errorMatcher?: string | RegExp | Error
): asserts result is Extract<ExecutionResult<T>, { status: 'failed' }> {
  expect(result.status).toBe('failed');
  if (result.status !== 'failed') {
    throw new Error('Result is not failed');
  }
  if (errorMatcher !== undefined) {
    if (typeof errorMatcher === 'string') {
      expect(result.error.message).toBe(errorMatcher);
    } else if (errorMatcher instanceof RegExp) {
      expect(result.error.message).toMatch(errorMatcher);
    } else {
      expect(result.error).toBe(errorMatcher);
    }
  }
}

/**
 * Assert that an execution result is canceled.
 *
 * @example
 * ```typescript
 * const result = await execution.result();
 * expectCanceledResult(result);
 * ```
 */
export function expectCanceledResult<T>(
  result: ExecutionResult<T>
): asserts result is Extract<ExecutionResult<T>, { status: 'canceled' }> {
  expect(result.status).toBe('canceled');
}

/**
 * Assert streaming result status and optionally check events count.
 *
 * @example
 * ```typescript
 * const result = await execution.result();
 * expectStreamingSuccessResult(result, 'value', 3);
 * ```
 */
export function expectStreamingSuccessResult<TEvent, T>(
  result: StreamingResult<TEvent, T>,
  expectedValue?: T,
  expectedEventCount?: number
): asserts result is Extract<StreamingResult<TEvent, T>, { status: 'succeeded' }> {
  expectSuccessResult(result, expectedValue);
  if (expectedEventCount !== undefined) {
    expect(result.events).toHaveLength(expectedEventCount);
  }
}

// ============================================================================
// Logger Verification Helpers
// ============================================================================

type LoggerEventType = 'start' | 'emit' | 'done' | 'error';

/**
 * Verify that logger was called in the expected sequence.
 *
 * @example
 * ```typescript
 * const logger = createMockLogger();
 * // ... run execution ...
 *
 * verifyLoggerSequence(logger, ['start', 'emit', 'emit', 'done']);
 * ```
 */
export function verifyLoggerSequence(
  logger: MockLogger,
  expectedSequence: LoggerEventType[]
): void {
  const eventMap: Record<LoggerEventType, keyof MockLogger> = {
    start: 'onExecutionStart',
    emit: 'onExecutionEmit',
    done: 'onExecutionDone',
    error: 'onExecutionError',
  };

  // Count expected occurrences
  const expectedCounts = expectedSequence.reduce(
    (acc, event) => {
      acc[event] = (acc[event] || 0) + 1;
      return acc;
    },
    {} as Record<LoggerEventType, number>
  );

  // Verify each event type was called the expected number of times
  for (const [event, count] of Object.entries(expectedCounts)) {
    const methodName = eventMap[event as LoggerEventType];
    expect(logger[methodName]).toHaveBeenCalledTimes(count);
  }
}

/**
 * Create a vitest mock logger.
 */
export function createVitestMockLogger(): MockLogger {
  return {
    onLLMCallStart: vi.fn(),
    onLLMCallEnd: vi.fn(),
    onExecutionStart: vi.fn(),
    onExecutionEmit: vi.fn(),
    onExecutionDone: vi.fn(),
    onExecutionError: vi.fn(),
  } as MockLogger;
}

/**
 * @deprecated Use createVitestMockLogger instead
 */
export const createMockLogger = createVitestMockLogger;

/**
 * Get vitest's vi.fn for use with framework-agnostic fixtures.
 *
 * @example
 * ```typescript
 * import { vitestMockFn } from './vitest-assertions';
 * import { createStreamingSessionFactory } from './fixtures';
 *
 * const factory = createStreamingSessionFactory({ mockFn: vitestMockFn });
 * ```
 */
export const vitestMockFn: () => (...args: unknown[]) => unknown = () => vi.fn();
