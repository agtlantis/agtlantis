import type {
    StreamingExecution,
    SimpleExecution,
    SessionEvent,
    StreamingResult,
    SimpleResult,
    CompletionEvent,
    ErrorEvent,
    ExtractResult,
} from './types';
import { normalizeError } from './shared';

export type ReplaceResult<TEvent extends { type: string }, U> =
    | Exclude<TEvent, { type: 'complete' }>
    | CompletionEvent<U>;

// ============================================================================
// mapExecution
// ============================================================================

export function mapExecution<TEvent extends { type: string }, UEvent extends { type: string }>(
    execution: StreamingExecution<TEvent>,
    fn: (event: TEvent) => UEvent | Promise<UEvent>,
): StreamingExecution<UEvent>;

export function mapExecution<A, B>(
    execution: SimpleExecution<A>,
    fn: (result: A) => B | Promise<B>,
): SimpleExecution<B>;

export function mapExecution(
    execution: StreamingExecution<any> | SimpleExecution<any>,
    fn: (input: any) => any,
): any {
    if ('stream' in execution) {
        return mapStreamingExecution(execution, fn);
    }
    return mapSimpleExecution(execution, fn);
}

// ============================================================================
// mapExecutionResult
// ============================================================================

export function mapExecutionResult<TEvent extends { type: string }, U>(
    execution: StreamingExecution<TEvent>,
    fn: (result: ExtractResult<TEvent>) => U | Promise<U>,
): StreamingExecution<ReplaceResult<TEvent, U>>;

export function mapExecutionResult<A, B>(
    execution: SimpleExecution<A>,
    fn: (result: A) => B | Promise<B>,
): SimpleExecution<B>;

export function mapExecutionResult(
    execution: StreamingExecution<any> | SimpleExecution<any>,
    fn: (input: any) => any,
): any {
    if ('stream' in execution) {
        return mapStreamingExecutionResult(execution, fn);
    }
    return mapSimpleExecution(execution, fn);
}

// ============================================================================
// Internal: Streaming — full event mapping
// ============================================================================

function mapStreamingExecution<TEvent extends { type: string }, UEvent extends { type: string }>(
    execution: StreamingExecution<TEvent>,
    fn: (event: TEvent) => UEvent | Promise<UEvent>,
): StreamingExecution<UEvent> {
    return {
        stream(): AsyncIterable<SessionEvent<UEvent | ErrorEvent>> {
            const original = execution.stream();
            return {
                [Symbol.asyncIterator](): AsyncIterator<SessionEvent<UEvent | ErrorEvent>> {
                    const iter = original[Symbol.asyncIterator]();
                    return {
                        async next() {
                            const { value, done } = await iter.next();
                            if (done) return { value: undefined, done: true };

                            const event = value as SessionEvent<TEvent | ErrorEvent>;
                            if (event.type === 'error') {
                                return { value: event as SessionEvent<UEvent | ErrorEvent>, done: false };
                            }

                            const { metrics, ...pureEvent } = event;
                            try {
                                const mapped = await fn(pureEvent as unknown as TEvent);
                                return {
                                    value: { ...mapped, metrics } as SessionEvent<UEvent | ErrorEvent>,
                                    done: false,
                                };
                            } catch (err) {
                                const errorEvent: SessionEvent<ErrorEvent> = {
                                    type: 'error',
                                    error: normalizeError(err),
                                    metrics,
                                };
                                return { value: errorEvent as SessionEvent<UEvent | ErrorEvent>, done: false };
                            }
                        },
                    };
                },
            };
        },

        async result(): Promise<StreamingResult<SessionEvent<UEvent | ErrorEvent>, ExtractResult<UEvent>>> {
            const original = await execution.result();
            if (original.status !== 'succeeded') {
                return original as unknown as StreamingResult<SessionEvent<UEvent | ErrorEvent>, ExtractResult<UEvent>>;
            }

            try {
                const mappedEvents: SessionEvent<UEvent | ErrorEvent>[] = [];
                for (const event of original.events) {
                    if ((event as any).type === 'error') {
                        mappedEvents.push(event as unknown as SessionEvent<UEvent | ErrorEvent>);
                        continue;
                    }
                    const { metrics, ...pureEvent } = event as any;
                    const mapped = await fn(pureEvent as TEvent);
                    mappedEvents.push({ ...mapped, metrics } as SessionEvent<UEvent | ErrorEvent>);
                }

                const completionEvent = mappedEvents.find(e => (e as any).type === 'complete') as
                    | SessionEvent<CompletionEvent<ExtractResult<UEvent>>>
                    | undefined;

                return {
                    status: 'succeeded',
                    value: completionEvent!.data as ExtractResult<UEvent>,
                    events: mappedEvents,
                    summary: original.summary,
                };
            } catch (err) {
                return {
                    status: 'failed',
                    error: normalizeError(err),
                    events: original.events as unknown as SessionEvent<UEvent | ErrorEvent>[],
                    summary: original.summary,
                };
            }
        },

        cancel: () => execution.cancel(),
        cleanup: () => execution.cleanup(),
        [Symbol.asyncDispose]: () => execution[Symbol.asyncDispose](),
    };
}

// ============================================================================
// Internal: Streaming — result-only mapping
// ============================================================================

function mapStreamingExecutionResult<TEvent extends { type: string }, U>(
    execution: StreamingExecution<TEvent>,
    fn: (result: ExtractResult<TEvent>) => U | Promise<U>,
): StreamingExecution<ReplaceResult<TEvent, U>> {
    type OutEvent = ReplaceResult<TEvent, U>;

    return {
        stream(): AsyncIterable<SessionEvent<OutEvent | ErrorEvent>> {
            const original = execution.stream();
            return {
                [Symbol.asyncIterator](): AsyncIterator<SessionEvent<OutEvent | ErrorEvent>> {
                    const iter = original[Symbol.asyncIterator]();
                    return {
                        async next() {
                            const { value, done } = await iter.next();
                            if (done) return { value: undefined, done: true };

                            const event = value as SessionEvent<TEvent | ErrorEvent>;
                            if (event.type === 'complete') {
                                const { metrics, ...rest } = event as any;
                                try {
                                    const mapped = await fn(rest.data);
                                    return {
                                        value: { type: 'complete', data: mapped, summary: rest.summary, metrics } as SessionEvent<OutEvent | ErrorEvent>,
                                        done: false,
                                    };
                                } catch (err) {
                                    const errorEvent: SessionEvent<ErrorEvent> = {
                                        type: 'error',
                                        error: normalizeError(err),
                                        metrics,
                                    };
                                    return { value: errorEvent as SessionEvent<OutEvent | ErrorEvent>, done: false };
                                }
                            }

                            return { value: event as SessionEvent<OutEvent | ErrorEvent>, done: false };
                        },
                    };
                },
            };
        },

        async result(): Promise<StreamingResult<SessionEvent<OutEvent | ErrorEvent>, ExtractResult<OutEvent>>> {
            type Result = StreamingResult<SessionEvent<OutEvent | ErrorEvent>, ExtractResult<OutEvent>>;
            const original = await execution.result();
            if (original.status !== 'succeeded') {
                return original as unknown as Result;
            }

            try {
                const mapped = await fn(original.value);
                const mappedEvents = original.events.map(event => {
                    if ((event as any).type === 'complete') {
                        return { ...event, data: mapped } as unknown as SessionEvent<OutEvent | ErrorEvent>;
                    }
                    return event as SessionEvent<OutEvent | ErrorEvent>;
                });

                return {
                    status: 'succeeded',
                    value: mapped as ExtractResult<OutEvent>,
                    events: mappedEvents,
                    summary: original.summary,
                };
            } catch (err) {
                return {
                    status: 'failed',
                    error: normalizeError(err),
                    events: original.events as unknown as SessionEvent<OutEvent | ErrorEvent>[],
                    summary: original.summary,
                } as Result;
            }
        },

        cancel: () => execution.cancel(),
        cleanup: () => execution.cleanup(),
        [Symbol.asyncDispose]: () => execution[Symbol.asyncDispose](),
    };
}

// ============================================================================
// Internal: Simple execution mapping (shared by both mapExecution and mapExecutionResult)
// ============================================================================

function mapSimpleExecution<A, B>(
    execution: SimpleExecution<A>,
    fn: (result: A) => B | Promise<B>,
): SimpleExecution<B> {
    return {
        async result(): Promise<SimpleResult<B>> {
            const original = await execution.result();
            if (original.status !== 'succeeded') {
                return original as SimpleResult<B>;
            }

            try {
                const mapped = await fn(original.value);
                return {
                    status: 'succeeded',
                    value: mapped,
                    summary: original.summary,
                };
            } catch (err) {
                return {
                    status: 'failed',
                    error: normalizeError(err),
                    summary: original.summary,
                };
            }
        },

        cancel: () => execution.cancel(),
        cleanup: () => execution.cleanup(),
        [Symbol.asyncDispose]: () => execution[Symbol.asyncDispose](),
    };
}
