/**
 * Agent execution types for @agtlantis/core.
 * Provides abstractions for streaming and non-streaming agent execution.
 */

import type { EventMetrics } from '@/observability';
import type { SessionSummary } from '../session/types';
import type { StreamingSession } from '../session/streaming-session';

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Distributive version of Omit that properly handles union types.
 *
 * Standard `Omit<A | B, K>` loses unique properties from union members.
 * `DistributiveOmit<A | B, K>` preserves them by distributing over the union.
 *
 * @example
 * ```typescript
 * type A = { type: 'a'; foo: string; metrics: EventMetrics };
 * type B = { type: 'b'; bar: number; metrics: EventMetrics };
 * type Union = A | B;
 *
 * // ❌ Standard Omit - loses foo and bar
 * type Bad = Omit<Union, 'metrics'>;
 * // Result: { type: 'a' | 'b' }
 *
 * // ✅ DistributiveOmit - preserves unique properties
 * type Good = DistributiveOmit<Union, 'metrics'>;
 * // Result: { type: 'a'; foo: string } | { type: 'b'; bar: number }
 * ```
 */
export type DistributiveOmit<T, K extends keyof any> = T extends any
    ? Omit<T, K>
    : never;

/**
 * Adds `metrics: EventMetrics` to event types.
 * Use this to define streaming events without manually adding metrics to each variant.
 *
 * @example
 * ```typescript
 * // Define events without metrics
 * type ProgressEvent = { type: 'progress'; step: string; message: string };
 * type CompleteEvent = { type: 'complete'; data: AnalysisResult };
 * type ErrorEvent = { type: 'error'; error: Error };
 *
 * // SessionEvent adds metrics to all variants
 * type MyAgentEvent = SessionEvent<ProgressEvent | CompleteEvent | ErrorEvent>;
 * // Result: Each variant now includes { metrics: EventMetrics }
 * ```
 */
export type SessionEvent<T extends { type: string }> = T & {
    metrics: EventMetrics;
};

/**
 * Input type for session.emit() - removes metrics from event types.
 * Uses DistributiveOmit to properly handle union types.
 *
 * @example
 * ```typescript
 * type MyAgentEvent = SessionEvent<ProgressEvent | CompleteEvent | ErrorEvent>;
 *
 * // For emit input, metrics is not required
 * type EmitInput = SessionEventInput<MyAgentEvent>;
 *
 * // Usage in session.emit()
 * session.emit({ type: 'progress', step: 'reading', message: 'Loading...' });
 * // No casting needed!
 * ```
 */
export type SessionEventInput<T extends { type: string; metrics: EventMetrics }> =
    DistributiveOmit<T, 'metrics'>;


// ============================================================================
// Reserved Event Types
// ============================================================================

/**
 * Reserved event types that cannot be emitted directly via session.emit().
 * These types are controlled internally by session.done() and session.fail().
 */
export type ReservedEventType = 'complete' | 'error';

/**
 * Input type for session.emit() - excludes reserved types ('complete', 'error').
 *
 * These terminal event types are reserved for internal use:
 * - `'complete'` - Emitted automatically by `session.done(result)`
 * - `'error'` - Emitted automatically by `session.fail(error)`
 *
 * **TypeScript Protection:**
 * Only works when TEvent uses literal types in a discriminated union.
 * If TEvent has `type: string`, the type check is bypassed but runtime check still applies.
 *
 * @example
 * ```typescript
 * // ✅ TypeScript protection works (discriminated union)
 * type MyEvent =
 *   | { type: 'progress'; step: number; metrics: EventMetrics }
 *   | { type: 'complete'; data: string; metrics: EventMetrics };
 *
 * session.emit({ type: 'progress', step: 1 }); // ✅ OK
 * session.emit({ type: 'complete', data: 'x' }); // ❌ TypeScript error
 *
 * // ❌ TypeScript protection bypassed (loose string type)
 * interface LooseEvent { type: string; metrics: EventMetrics; }
 * session.emit({ type: 'complete' }); // TypeScript allows, but throws at runtime!
 * ```
 */
export type EmittableEventInput<T extends { type: string; metrics: EventMetrics }> =
    T extends { type: infer Type }
        ? Type extends ReservedEventType
            ? never
            : DistributiveOmit<T, 'metrics'>
        : never;

/**
 * Options for execution.
 * Used by both simpleExecution and streamingExecution.
 */
export interface ExecutionOptions {
    /**
     * AbortSignal for cancellation.
     * Combined with internal AbortController - both can trigger cancellation.
     *
     * @example
     * ```typescript
     * const controller = new AbortController();
     *
     * // Pass signal to execution
     * const execution = provider.simpleExecution(fn, { signal: controller.signal });
     *
     * // Cancel externally
     * setTimeout(() => controller.abort(), 5000);
     *
     * // Or use execution.cancel() directly
     * execution.cancel();
     * ```
     */
    signal?: AbortSignal;
}

/**
 * Base interface for all execution types.
 * Both streaming and non-streaming executions implement this interface,
 * enabling unified handling at outer layers.
 *
 * @typeParam TResult - The final result type
 *
 * @example
 * ```typescript
 * // Option 1: Automatic cleanup with await using (recommended)
 * await using execution = await agent.execute(input);
 * const result = await execution.toResult();
 * const metadata = await execution.getSummary();
 * // cleanup() called automatically on scope exit
 *
 * // Option 2: Manual cleanup with try/finally
 * const execution = await agent.execute(input);
 * try {
 *   const result = await execution.toResult();
 * } finally {
 *   await execution.cleanup();
 * }
 * ```
 */
export interface Execution<TResult> extends AsyncDisposable {
    /**
     * Consume the execution and return the final result.
     * For streaming executions, this consumes all events first.
     *
     * @throws Error if execution fails
     */
    toResult(): Promise<TResult>;

    /**
     * Get execution summary (token usage, duration, costs, call records, etc.).
     * Only available after execution completes.
     *
     * @throws Error if called before completion
     */
    getSummary(): Promise<SessionSummary>;

    /**
     * Cleanup resources (uploaded files, connections, etc.).
     * Should always be called after execution, even on error.
     * Safe to call multiple times.
     */
    cleanup(): Promise<void>;

    /**
     * Async disposal for `await using` syntax (TS 5.2+).
     * Delegates to cleanup().
     */
    [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Simple (non-streaming) execution with cancellation support.
 * Extends base Execution with a cancel() method.
 *
 * @typeParam TResult - The final result type
 *
 * @example
 * ```typescript
 * // Start execution (sync - no await)
 * const execution = provider.simpleExecution(async (session) => {
 *   const response = await session.generateText({ prompt: 'Hello' });
 *   return response.text;
 * });
 *
 * // Cancel if needed
 * setTimeout(() => execution.cancel(), 5000);
 *
 * // Wait for result
 * try {
 *   const result = await execution.toResult();
 *   console.log(result);
 * } catch (error) {
 *   if (error.name === 'AbortError') {
 *     console.log('Cancelled');
 *   }
 * }
 * ```
 */
export interface SimpleExecution<TResult> extends Execution<TResult> {
    /**
     * Request cancellation of the execution.
     * Aborts the current LLM call if in progress.
     * Works even if custom signal was provided (signals are combined).
     *
     * No-op if execution already completed.
     */
    cancel(): void;
}

/**
 * Streaming execution that yields events during execution.
 * Extends AsyncIterable for `for await...of` consumption.
 *
 * @typeParam TEvent - Event type yielded during streaming
 * @typeParam TResult - Final result type
 *
 * @example
 * ```typescript
 * const execution = agent.execute(input);
 *
 * // Option 1: Stream events
 * for await (const event of execution) {
 *   console.log(`[${event.metrics.elapsedMs}ms] ${event.type}`);
 * }
 *
 * // Option 2: Get result directly (consumes events internally)
 * const result = await execution.toResult();
 *
 * // Always cleanup
 * await execution.cleanup();
 * ```
 */
export interface StreamingExecution<TEvent, TResult>
    extends Execution<TResult>, AsyncIterable<TEvent> {
    /**
     * Request cancellation (cooperative).
     *
     * Cancellation is **not** automatic - the generator must check the abort signal
     * and stop gracefully. If the generator doesn't check, cancellation is ignored.
     *
     * @example
     * ```typescript
     * // In your generator, check for cancellation:
     * async function* myGenerator({ emit, done }) {
     *   const controller = new AbortController();
     *
     *   while (!controller.signal.aborted) {
     *     yield emit({ type: 'progress', ... });
     *     await doSomeWork();
     *   }
     *
     *   return done(result, usage);
     * }
     *
     * // The consumer can request cancellation:
     * execution.cancel();
     * ```
     */
    cancel(): void;
}

/**
 * Generator function type for session-based StreamingExecutionHost.
 * Receives a StreamingSession instead of control object, providing access to:
 * - AI SDK wrappers (generateText, streamText)
 * - File management
 * - Lifecycle hooks (onDone)
 * - Stream control (emit, done, fail)
 *
 * @typeParam TEvent - Event type with required `type` and `metrics` fields
 * @typeParam TResult - Final result type
 *
 * @example
 * ```typescript
 * const generator: SessionStreamGeneratorFn<AnalyzerEvent, AnalysisResult> =
 *   async function* (session) {
 *     // Register cleanup
 *     session.onDone(() => session.fileManager.clear());
 *
 *     // Emit progress
 *     yield session.emit({ type: 'progress', phase: 'uploading' });
 *
 *     // Use AI SDK through session
 *     const result = await session.generateText({ prompt: 'Hello' });
 *
 *     // Complete (async - returns Promise<TEvent>)
 *     return session.done(result.text);
 *   };
 * ```
 */
export type SessionStreamGeneratorFn<
    TEvent extends { type: string; metrics: EventMetrics },
    TResult,
> = (
    session: StreamingSession<TEvent, TResult>
) => AsyncGenerator<TEvent, TEvent | Promise<TEvent> | undefined, unknown>;
