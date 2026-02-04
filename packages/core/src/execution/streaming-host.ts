import { SessionSummary } from '../session/types';
import type { StreamingSession } from '../session/streaming-session';
import type { SessionEvent, SessionStreamGeneratorFn, StreamingExecution, StreamingResult } from './types';
import { ERRORS } from './constants';
import { combineSignals, Deferred } from './utils';
import { isAbortError, normalizeError, createHookRunner, type HookRunner } from './shared';

/**
 * Internal result structure for tracking streaming execution outcome.
 */
type InternalStreamingResult<T> =
    | { success: true; result: T; summary: SessionSummary }
    | { success: false; error: Error; aborted: boolean; summary: SessionSummary };

/**
 * Streaming execution host that uses StreamingSession.
 * Starts execution eagerly on construction - events are buffered automatically.
 *
 * @typeParam TEvent - User's pure domain event type with required `type` field (metrics added automatically)
 * @typeParam TResult - Final result type
 *
 * @example
 * ```typescript
 * const execution = new StreamingExecutionHost(
 *   () => new StreamingSession({
 *     defaultLanguageModel: provider.model,
 *     fileManager: new GoogleFileManager(apiKey),
 *   }),
 *   async function* (session) {
 *     session.onDone(() => session.fileManager.clear());
 *     const result = await session.generateText({ prompt: 'Hello' });
 *     yield session.emit({ type: 'progress', message: 'Working...' });
 *     return session.done(result.text);
 *   }
 * );
 * // ↑ Execution already started, events being buffered
 *
 * // Option 1: Stream events (buffered + real-time)
 * for await (const event of execution.stream()) {
 *   console.log(event.type, event.metrics.elapsedMs);
 * }
 * const result = await execution.result();
 *
 * // Option 2: Skip streaming, events available in result
 * const result = await execution.result();
 * console.log(`Received ${result.events.length} events`);
 *
 * if (result.status === 'succeeded') {
 *   console.log(result.value);
 * }
 * ```
 */
export class StreamingExecutionHost<
    TEvent extends { type: string },
    TResult,
> implements StreamingExecution<TEvent, TResult> {
    private readonly abortController = new AbortController();
    private readonly effectiveSignal: AbortSignal;
    private readonly consumerPromise: Promise<InternalStreamingResult<TResult>>;
    private readonly eventBuffer: SessionEvent<TEvent>[] = [];
    private readonly subscribers = new Set<(event: SessionEvent<TEvent>) => void>();
    private completed = false;
    private cleaned = false;
    private hookRunner: HookRunner | null = null;
    private cancelRequested = false;

    private extractedOutcome:
        | { type: 'result'; value: TResult }
        | { type: 'error'; error: Error }
        | null = null;
    private extractedSummary: SessionSummary | null = null;

    constructor(
        private readonly createSession: (signal?: AbortSignal) => StreamingSession<TEvent, TResult>,
        private readonly generator: SessionStreamGeneratorFn<TEvent, TResult>,
        userSignal?: AbortSignal
    ) {
        // Combine user signal with internal controller for dual cancellation support
        this.effectiveSignal = userSignal
            ? combineSignals(userSignal, this.abortController.signal)
            : this.abortController.signal;

        // Eager start! Begin consuming immediately
        this.consumerPromise = this.startConsuming();
    }

    private hasDataField(event: SessionEvent<TEvent>): event is SessionEvent<TEvent> & { data: TResult } {
        return 'data' in event && (event as { data?: unknown }).data !== undefined;
    }

    private hasSummaryField(event: SessionEvent<TEvent>): event is SessionEvent<TEvent> & { summary: SessionSummary } {
        return 'summary' in event && (event as { summary?: unknown }).summary !== undefined;
    }

    private hasErrorField(event: SessionEvent<TEvent>): event is SessionEvent<TEvent> & { error: Error } {
        return 'error' in event && (event as { error?: unknown }).error instanceof Error;
    }

    private extractResultAndMetadata(event: SessionEvent<TEvent>): void {
        const isCompleteOrError = event.type === 'complete' || event.type === 'error';

        if (!isCompleteOrError) {
            return;
        }

        // Extract outcome (error takes precedence if both present)
        if (this.hasErrorField(event)) {
            this.extractedOutcome = { type: 'error', error: event.error };
        } else if (this.hasDataField(event)) {
            this.extractedOutcome = { type: 'result', value: event.data };
        }

        if (this.hasSummaryField(event)) {
            this.extractedSummary = event.summary;
        }
    }

    private notifySubscribers(event: SessionEvent<TEvent>): void {
        this.subscribers.forEach(fn => fn(event));
    }

    private async startConsuming(): Promise<InternalStreamingResult<TResult>> {
        // Pass the effective signal to session for AI SDK cancellation
        const session = this.createSession(this.effectiveSignal);
        this.hookRunner = createHookRunner(() => session.runOnDoneHooks());
        const gen = this.generator(session);

        try {
            let next = await gen.next();

            while (!next.done) {
                // Buffer and notify
                this.eventBuffer.push(next.value);
                this.notifySubscribers(next.value);

                // Auto-abort after terminal events to prevent further AI calls
                const isTerminal = next.value.type === 'complete' || next.value.type === 'error';
                if (isTerminal) {
                    this.extractResultAndMetadata(next.value);
                    this.abortController.abort();
                    break;
                }

                if (this.abortController.signal.aborted) {
                    break;
                }

                next = await gen.next();
            }

            // Handle return value from generator
            if (next.done && next.value !== undefined) {
                const finalEvent = await Promise.resolve(next.value);
                this.eventBuffer.push(finalEvent);
                this.notifySubscribers(finalEvent);
                this.extractResultAndMetadata(finalEvent);

                // Auto-abort after terminal event from return statement
                const isTerminal = finalEvent.type === 'complete' || finalEvent.type === 'error';
                if (isTerminal) {
                    this.abortController.abort();
                }
            }

            return this.buildResult(session);
        } catch (error) {
            const errorObj = normalizeError(error);

            // AbortError is treated as normal cancellation
            if (isAbortError(error, this.abortController.signal)) {
                return {
                    success: false,
                    aborted: true,
                    error: errorObj,
                    summary: await session.getSummary(),
                };
            }

            // Generate error event via session.fail()
            const errorEvent = await session.fail(errorObj);
            this.eventBuffer.push(errorEvent);
            this.notifySubscribers(errorEvent);
            this.extractResultAndMetadata(errorEvent);

            // Auto-abort after error event
            this.abortController.abort();

            return this.buildResult(session);
        } finally {
            this.completed = true;
            // Note: Don't clear subscribers here - each stream() consumer
            // cleans up its own subscriber in its finally block to avoid orphaning

            await this.hookRunner?.ensureRun();

            await gen.return(undefined);
        }
    }

    private async buildResult(session: StreamingSession<TEvent, TResult>): Promise<InternalStreamingResult<TResult>> {
        const summary = this.extractedSummary ?? await session.getSummary();

        // Use discriminated union for clean pattern matching
        if (this.extractedOutcome?.type === 'error') {
            return {
                success: false,
                aborted: false,
                error: this.extractedOutcome.error,
                summary,
            };
        }

        if (this.extractedOutcome?.type === 'result') {
            return {
                success: true,
                result: this.extractedOutcome.value,
                summary,
            };
        }

        // No result extracted - likely canceled or abnormal termination
        return {
            success: false,
            aborted: true,
            error: new Error(ERRORS.NO_RESULT),
            summary,
        };
    }

    /**
     * Get the event stream.
     * Returns buffered events first, then real-time events.
     * Can be called multiple times - replays buffer each time.
     */
    async *stream(): AsyncIterable<SessionEvent<TEvent>> {
        // 1. Yield buffered events first
        let index = 0;
        while (index < this.eventBuffer.length) {
            yield this.eventBuffer[index++];
        }

        // 2. If completed, we're done
        if (this.completed) {
            return;
        }

        // 3. Subscribe for real-time events using Deferred for clean async coordination
        const queue: SessionEvent<TEvent>[] = [];
        let pending = new Deferred<void>();

        const subscriber = (event: SessionEvent<TEvent>) => {
            queue.push(event);
            pending.resolve();
        };
        this.subscribers.add(subscriber);

        try {
            while (!this.completed || queue.length > 0) {
                if (queue.length > 0) {
                    yield queue.shift()!;
                } else if (!this.completed) {
                    await pending.promise;
                    pending = new Deferred<void>(); // Reset for next wait
                }
            }
        } finally {
            this.subscribers.delete(subscriber);
        }
    }

    cancel(): void {
        this.cancelRequested = true;
        this.abortController.abort();
    }

    async cleanup(): Promise<void> {
        if (this.cleaned) {
            return;
        }
        this.cleaned = true;

        // Cancel if still running
        if (!this.completed) {
            this.cancel();
            await this.consumerPromise.catch(() => {});
        }

        // Clean up resources
        this.subscribers.clear();

        await this.hookRunner?.ensureRun();
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.cleanup();
    }

    /**
     * Get the execution result with status, summary, and all events.
     * Never throws - returns a discriminated union with status.
     */
    async result(): Promise<StreamingResult<SessionEvent<TEvent>, TResult>> {
        const internal = await this.consumerPromise;
        const events = Object.freeze([...this.eventBuffer]) as readonly SessionEvent<TEvent>[];

        // Success state
        if (internal.success) {
            return {
                status: 'succeeded',
                value: internal.result,
                summary: internal.summary,
                events,
            };
        }

        // Canceled state
        if (this.cancelRequested || internal.aborted) {
            return {
                status: 'canceled',
                summary: internal.summary,
                events,
            };
        }

        // Failed state
        return {
            status: 'failed',
            error: internal.error,
            summary: internal.summary,
            events,
        };
    }
}
