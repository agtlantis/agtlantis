/**
 * Agent execution types for @agtlantis/core.
 * Provides abstractions for streaming and non-streaming agent execution.
 */
import type { EventMetrics } from '@/observability';
import type { SessionSummary, StreamingSession } from '@/session';

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
export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

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
export type SessionEventInput<T extends { type: string; metrics: EventMetrics }> = DistributiveOmit<
    T,
    'metrics'
>;

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
export type EmittableEventInput<T extends { type: string; metrics: EventMetrics }> = T extends {
    type: infer Type;
}
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

// ============================================================================
// Execution Result Types (Breaking Change)
// ============================================================================

/**
 * Status of an execution after completion.
 * - `succeeded`: Execution completed normally with a result
 * - `failed`: Execution threw an error
 * - `canceled`: Execution was canceled via cancel() or AbortSignal
 */
export type ExecutionStatus = 'succeeded' | 'failed' | 'canceled';

/**
 * Discriminated union representing the outcome of an execution.
 * Summary is always available, regardless of execution status.
 *
 * @typeParam T - The result type on success
 *
 * @example
 * ```typescript
 * const result = await execution.result();
 *
 * if (result.status === 'succeeded') {
 *   console.log(result.value);
 * } else if (result.status === 'failed') {
 *   console.error(result.error);
 * }
 *
 * // Summary always available
 * console.log(`Cost: $${result.summary.totalCost}`);
 * ```
 */
export type ExecutionResult<T> =
    | { status: 'succeeded'; value: T; summary: SessionSummary }
    | { status: 'failed'; error: Error; summary: SessionSummary }
    | { status: 'canceled'; summary: SessionSummary };

/**
 * Result type for SimpleExecution.
 * Alias for ExecutionResult for clarity in type annotations.
 */
export type SimpleResult<T> = ExecutionResult<T>;

/**
 * Result type for StreamingExecution.
 * Extends ExecutionResult with readonly events array.
 * Events are always available, even on failure or cancellation.
 *
 * @typeParam TEvent - Event type
 * @typeParam T - Result type on success
 *
 * @example
 * ```typescript
 * const result = await execution.result();
 *
 * // Events always available, regardless of status
 * console.log(`Received ${result.events.length} events`);
 *
 * if (result.status === 'succeeded') {
 *   console.log(result.value);
 * }
 * ```
 */
export type StreamingResult<TEvent, T> = ExecutionResult<T> & {
    readonly events: readonly TEvent[];
};

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
 * await using execution = agent.execute(input);
 * const result = await execution.result();
 * if (result.status === 'succeeded') {
 *   console.log(result.value, result.summary.totalCost);
 * }
 * // cleanup() called automatically on scope exit
 *
 * // Option 2: Manual cleanup with try/finally
 * const execution = agent.execute(input);
 * try {
 *   const result = await execution.result();
 * } finally {
 *   await execution.cleanup();
 * }
 * ```
 */
export interface Execution<TResult> extends AsyncDisposable {
    /**
     * Get the execution result with status and summary.
     * Returns a discriminated union that always includes the summary,
     * regardless of whether execution succeeded, failed, or was canceled.
     *
     * For streaming executions, this waits for all events to complete.
     *
     * @example
     * ```typescript
     * const result = await execution.result();
     *
     * if (result.status === 'succeeded') {
     *   console.log(result.value);
     * } else if (result.status === 'failed') {
     *   console.error(result.error);
     * }
     *
     * // Summary always available
     * console.log(`Cost: $${result.summary.totalCost}`);
     * ```
     */
    result(): Promise<ExecutionResult<TResult>>;

    /**
     * Request cancellation of the execution.
     * Aborts the current operation if in progress.
     * Works even if custom signal was provided (signals are combined).
     *
     * No-op if execution already completed.
     */
    cancel(): void;

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
 * Simple (non-streaming) execution.
 * Starts eagerly on construction - execution begins immediately.
 *
 * @typeParam TResult - The final result type
 *
 * @example
 * ```typescript
 * // Start execution (sync - no await, starts immediately)
 * const execution = provider.simpleExecution(async (session) => {
 *   const response = await session.generateText({ prompt: 'Hello' });
 *   return response.text;
 * });
 *
 * // Cancel if needed
 * setTimeout(() => execution.cancel(), 5000);
 *
 * // Get result (status-based, never throws)
 * const result = await execution.result();
 *
 * if (result.status === 'succeeded') {
 *   console.log(result.value);
 * } else if (result.status === 'canceled') {
 *   console.log('Execution was canceled');
 * }
 *
 * // Summary always available
 * console.log(`Cost: $${result.summary.totalCost}`);
 * ```
 */
export interface SimpleExecution<TResult> extends Execution<TResult> {
    /**
     * Get the execution result with status and summary.
     *
     * @example
     * ```typescript
     * const execution = provider.simpleExecution(async (session) => {
     *   const response = await session.generateText({ prompt: 'Hello' });
     *   return response.text;
     * });
     *
     * const result = await execution.result();
     *
     * if (result.status === 'succeeded') {
     *   console.log(result.value);
     * } else if (result.status === 'failed') {
     *   console.error(result.error);
     * }
     *
     * // Summary always available
     * console.log(`Cost: $${result.summary.totalCost}`);
     * ```
     */
    result(): Promise<SimpleResult<TResult>>;
}

/**
 * Streaming execution that yields events via stream() method.
 * Starts eagerly on construction - execution and event buffering begin immediately.
 *
 * @typeParam TEvent - Event type yielded during streaming
 * @typeParam TResult - Final result type
 *
 * @example
 * ```typescript
 * const execution = agent.execute(input);
 * // ↑ Already executing, events being buffered
 *
 * // Option 1: Stream events (buffered + real-time)
 * for await (const event of execution.stream()) {
 *   console.log(`[${event.metrics.elapsedMs}ms] ${event.type}`);
 * }
 * const result = await execution.result();
 *
 * // Option 2: Get result only (events available in result.events)
 * const result = await execution.result();
 * console.log(`Received ${result.events.length} events`);
 *
 * // Always cleanup
 * await execution.cleanup();
 * ```
 */
export interface StreamingExecution<TEvent, TResult> extends Execution<TResult> {
    /**
     * Get the event stream.
     * Returns an AsyncIterable that yields all events:
     * - Events already in the buffer (from eager execution)
     * - Real-time events as they occur
     *
     * Can be called multiple times - each call replays buffered events.
     * After execution completes, replays all events from buffer.
     *
     * @example
     * ```typescript
     * const execution = provider.streamingExecution(...);
     *
     * // Stream events
     * for await (const event of execution.stream()) {
     *   console.log(`[${event.metrics.elapsedMs}ms] ${event.type}`);
     * }
     *
     * // Get final result
     * const result = await execution.result();
     * ```
     */
    stream(): AsyncIterable<TEvent>;

    /**
     * Get the execution result with status, summary, and all events.
     *
     * @example
     * ```typescript
     * const result = await execution.result();
     *
     * // Events always available
     * console.log(`Received ${result.events.length} events`);
     *
     * if (result.status === 'succeeded') {
     *   console.log(result.value);
     * }
     *
     * console.log(`Cost: $${result.summary.totalCost}`);
     * ```
     */
    result(): Promise<StreamingResult<TEvent, TResult>>;
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
