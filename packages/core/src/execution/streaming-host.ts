import type { EventMetrics } from '@/observability';
import { SessionSummary } from '../session/types';
import type { StreamingSession } from '../session/streaming-session';
import type { SessionStreamGeneratorFn, StreamingExecution } from './types';
import { ERRORS } from './constants';
import { combineSignals } from './utils';

/**
 * Streaming execution host that uses StreamingSession.
 *
 * @typeParam TEvent - Event type with required `type` and `metrics` fields
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
 *
 * for await (const event of execution) {
 *   console.log(event.type, event.metrics.elapsedMs);
 * }
 * ```
 */
export class StreamingExecutionHost<
    TEvent extends { type: string; metrics: EventMetrics },
    TResult,
> implements StreamingExecution<TEvent, TResult> {
    private readonly abortController = new AbortController();
    private readonly effectiveSignal: AbortSignal;
    private metadata: SessionSummary | null = null;
    private result: TResult | null = null;
    private hasResult = false;
    private consumed = false;
    private cleaned = false;
    private hooksRan = false;
    private readonly startTime = Date.now();

    private currentSession: StreamingSession<TEvent, TResult> | null = null;

    constructor(
        private readonly createSession: (signal?: AbortSignal) => StreamingSession<TEvent, TResult>,
        private readonly generator: SessionStreamGeneratorFn<TEvent, TResult>,
        userSignal?: AbortSignal
    ) {
        // Combine user signal with internal controller for dual cancellation support
        this.effectiveSignal = userSignal
            ? combineSignals(userSignal, this.abortController.signal)
            : this.abortController.signal;
    }

    private hasDataField(event: TEvent): event is TEvent & { data: TResult } {
        return 'data' in event && (event as { data?: unknown }).data !== undefined;
    }

    private hasSummaryField(event: TEvent): event is TEvent & { summary: SessionSummary } {
        return 'summary' in event && (event as { summary?: unknown }).summary !== undefined;
    }

    private extractResultAndMetadata(event: TEvent): void {
        const isCompleteOrError = event.type === 'complete' || event.type === 'error';

        if (!isCompleteOrError) {
            if (!this.metadata) {
                this.metadata = this.createFallbackSummary();
            }
            return;
        }

        if (this.hasDataField(event)) {
            this.result = event.data;
            this.hasResult = true;
        }

        if (this.hasSummaryField(event)) {
            this.metadata = event.summary;
        } else {
            this.metadata = this.createFallbackSummary();
        }
    }

    private createFallbackSummary(): SessionSummary {
        return SessionSummary.empty(this.startTime);
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<TEvent> {
        if (this.consumed) {
            throw new Error(ERRORS.ALREADY_CONSUMED);
        }
        this.consumed = true;

        // Pass the effective signal to session for AI SDK cancellation
        const session = this.createSession(this.effectiveSignal);
        this.currentSession = session;
        const gen = this.generator(session);

        try {
            let next = await gen.next();

            while (!next.done) {
                yield next.value;

                // Auto-abort after terminal events to prevent further AI calls
                const isTerminal = next.value.type === 'complete' || next.value.type === 'error';
                if (isTerminal) {
                    this.extractResultAndMetadata(next.value);
                    this.abortController.abort();
                    break;
                }

                if (this.abortController.signal.aborted) {
                    if (!this.metadata) {
                        this.metadata = this.createFallbackSummary();
                    }
                    break;
                }

                next = await gen.next();
            }

            if (next.done && next.value !== undefined) {
                const finalEvent = await Promise.resolve(next.value);
                this.extractResultAndMetadata(finalEvent);
                yield finalEvent;

                // Auto-abort after terminal event from return statement
                const isTerminal = finalEvent.type === 'complete' || finalEvent.type === 'error';
                if (isTerminal) {
                    this.abortController.abort();
                }
            }

            if (!this.metadata) {
                this.metadata = this.createFallbackSummary();
            }
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));

            // AbortError is treated as normal cancellation, not an error
            // This happens when AI SDK request is aborted via signal
            if (errorObj.name === 'AbortError' || this.abortController.signal.aborted) {
                if (!this.metadata) {
                    this.metadata = this.createFallbackSummary();
                }
                return; // Exit gracefully without yielding error event
            }

            // If session.fail() throws, let it propagate - something is seriously wrong
            const errorEvent = await session.fail(errorObj);
            this.extractResultAndMetadata(errorEvent);
            yield errorEvent;

            // Auto-abort after error event from catch block
            this.abortController.abort();
        } finally {
            if (!this.metadata) {
                this.metadata = this.createFallbackSummary();
            }

            if (!this.hooksRan) {
                this.hooksRan = true;
                await session.runOnDoneHooks();
            }

            await gen.return(undefined);
        }
    }

    cancel(): void {
        this.abortController.abort();
    }

    async cleanup(): Promise<void> {
        if (this.cleaned) {
            return;
        }
        this.cleaned = true;

        if (this.currentSession && !this.hooksRan) {
            this.hooksRan = true;
            await this.currentSession.runOnDoneHooks();
        }
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.cleanup();
    }

    async getSummary(): Promise<SessionSummary> {
        if (!this.metadata) {
            throw new Error(ERRORS.METADATA_NOT_AVAILABLE);
        }
        return this.metadata;
    }

    async toResult(): Promise<TResult> {
        for await (const event of this) {
            if (event.type === 'error' && 'error' in event) {
                const errorEvent = event as { error: unknown };
                if (errorEvent.error instanceof Error) {
                    throw errorEvent.error;
                }
                throw new Error(ERRORS.UNKNOWN_ERROR);
            }
        }

        if (!this.hasResult) {
            throw new Error(ERRORS.NO_RESULT);
        }
        return this.result as TResult;
    }
}
