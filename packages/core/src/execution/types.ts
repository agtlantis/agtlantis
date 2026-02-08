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
 * The framework uses this internally to wrap user-defined events with timing info.
 *
 * **For most use cases, you don't need this type.** Simply define your events
 * without metrics, and the framework handles the wrapping automatically.
 *
 * **When you need SessionEvent:**
 * - Creating mock/stub streaming executions for testing
 * - Explicitly typing `StreamingResult.events` arrays
 *
 * @example
 * ```typescript
 * // User defines pure event types (recommended)
 * type MyEvent =
 *   | { type: 'progress'; step: string }
 *   | { type: 'complete'; data: string };
 *
 * // Framework internally wraps as SessionEvent<MyEvent>
 * // StreamingResult.events returns SessionEvent<MyEvent>[]
 *
 * // Testing: Create mock events with explicit metrics
 * const mockEvents: SessionEvent<MyEvent>[] = [
 *   { type: 'progress', step: 'loading', metrics: { timestamp: Date.now(), elapsedMs: 0, deltaMs: 0 } },
 * ];
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
/**
 * @deprecated TEvent no longer requires metrics constraint - use TEvent directly
 * This type is kept for backwards compatibility during migration
 */
export type SessionEventInput<T extends { type: string }> = T;

// ============================================================================
// Reserved Event Types
// ============================================================================

/**
 * Reserved event types that cannot be emitted directly via session.emit().
 * These types are controlled internally by session.done() and session.fail().
 */
export type ReservedEventType = 'complete' | 'error';

/**
 * Input type for emit() - excludes reserved event types.
 * Users define pure domain events; framework adds metrics wrapper.
 */
export type EmittableEventInput<T extends { type: string }> =
    T extends { type: ReservedEventType } ? never : T;

// ============================================================================
// Terminal Event Types
// ============================================================================

/**
 * Completion event emitted by session.done().
 * Include this in your event union to define the result type.
 *
 * @example
 * ```typescript
 * type MyEvent =
 *   | { type: 'progress'; step: string }
 *   | CompletionEvent<MyResult>;
 *
 * // session.done(result) emits { type: 'complete', data: result, summary }
 * ```
 */
export type CompletionEvent<TResult> = {
    type: 'complete';
    data: TResult;
    summary: SessionSummary;
};

/**
 * Error event emitted by session.fail().
 * Auto-added to stream() return type — users don't need to include this in their event union.
 *
 * @example
 * ```typescript
 * for await (const event of execution.stream()) {
 *   if (event.type === 'error') {
 *     console.error(event.error.message);
 *   }
 * }
 * ```
 */
export type ErrorEvent = {
    type: 'error';
    error: Error;
    summary?: SessionSummary;
    data?: unknown;
};

/**
 * Extract the result type from an event union containing CompletionEvent<T>.
 * Returns `never` if no CompletionEvent member exists (making session.done() uncallable).
 *
 * @example
 * ```typescript
 * type MyEvent =
 *   | { type: 'progress'; step: string }
 *   | CompletionEvent<{ answer: string }>;
 *
 * type Result = ExtractResult<MyEvent>;
 * // Result = { answer: string }
 * ```
 */
export type ExtractResult<TEvent extends { type: string }> =
    Extract<TEvent, { type: 'complete' }> extends { data: infer R } ? R : never;

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
 * Represents a streaming execution that emits events as they occur.
 * TEvent is the user's pure domain event type (without metrics).
 * stream() and result() return SessionEvent<TEvent> which includes metrics.
 */
export interface StreamingExecution<TEvent extends { type: string }> extends Execution<ExtractResult<TEvent>> {
    /**
     * Get the event stream.
     * Returns an AsyncIterable that yields all events with metrics:
     * - Events already in the buffer (from eager execution)
     * - Real-time events as they occur
     * - ErrorEvent is auto-included — no need to add it to your event union
     *
     * Can be called multiple times - each call replays buffered events.
     * After execution completes, replays all events from buffer.
     *
     * @example
     * ```typescript
     * type MyEvent =
     *   | { type: 'progress'; step: number }
     *   | CompletionEvent<MyResult>;
     *
     * const execution = provider.streamingExecution<MyEvent>(...);
     *
     * for await (const event of execution.stream()) {
     *   // event is SessionEvent<MyEvent | ErrorEvent>
     *   console.log(`[${event.metrics.elapsedMs}ms] ${event.type}`);
     * }
     * ```
     */
    stream(): AsyncIterable<SessionEvent<TEvent | ErrorEvent>>;

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
    result(): Promise<StreamingResult<SessionEvent<TEvent | ErrorEvent>, ExtractResult<TEvent>>>;
}

/**
 * Generator function type for streaming executions.
 * TEvent is the user's pure domain event type (without metrics).
 * The generator yields SessionEvent<TEvent> which includes metrics.
 */
export type SessionStreamGeneratorFn<
    TEvent extends { type: string },
> = (
    session: StreamingSession<TEvent>
) => AsyncGenerator<SessionEvent<TEvent>, SessionEvent<TEvent> | Promise<SessionEvent<TEvent>> | undefined, unknown>;
