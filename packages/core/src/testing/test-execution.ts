import type {
    StreamingExecution,
    SessionEvent,
    StreamingResult,
    ExtractResult,
    EmittableEventInput,
    ErrorEvent,
} from '@/execution/types';
import type { EventMetrics } from '@/observability';
import { SessionSummary } from '@/session/types';

function createTestMetrics(): EventMetrics {
    return { timestamp: Date.now(), elapsedMs: 0, deltaMs: 0 };
}

export function createTestExecution<TEvent extends { type: string }>(
    result: ExtractResult<TEvent>,
    events: EmittableEventInput<TEvent>[] = [],
): StreamingExecution<TEvent> {
    const summary = SessionSummary.forTest({});

    const completionEvent = {
        type: 'complete' as const,
        data: result,
        summary,
        metrics: createTestMetrics(),
    } as SessionEvent<TEvent | ErrorEvent>;

    const allEvents: SessionEvent<TEvent | ErrorEvent>[] = [
        ...events.map(
            (e) => ({ ...e, metrics: createTestMetrics() }) as SessionEvent<TEvent | ErrorEvent>,
        ),
        completionEvent,
    ];

    return {
        stream(): AsyncIterable<SessionEvent<TEvent | ErrorEvent>> {
            return {
                [Symbol.asyncIterator]() {
                    let index = 0;
                    return {
                        async next() {
                            if (index < allEvents.length) {
                                return { value: allEvents[index++], done: false };
                            }
                            return { value: undefined, done: true };
                        },
                    };
                },
            };
        },

        async result(): Promise<
            StreamingResult<SessionEvent<TEvent | ErrorEvent>, ExtractResult<TEvent>>
        > {
            return { status: 'succeeded', value: result, events: allEvents, summary };
        },

        cancel() {},
        async cleanup() {},
        async [Symbol.asyncDispose]() {},
    };
}

export function createTestErrorExecution<TEvent extends { type: string }>(
    error: Error,
    options: { events?: EmittableEventInput<TEvent>[]; data?: ExtractResult<TEvent> } = {},
): StreamingExecution<TEvent> {
    const summary = SessionSummary.forTest({});

    const errorEvent: Record<string, unknown> = {
        type: 'error' as const,
        error,
        summary,
        metrics: createTestMetrics(),
    };

    if (options.data !== undefined) {
        errorEvent.data = options.data;
    }

    const typedErrorEvent = errorEvent as SessionEvent<TEvent | ErrorEvent>;

    const allEvents: SessionEvent<TEvent | ErrorEvent>[] = [
        ...(options.events ?? []).map(
            (e) => ({ ...e, metrics: createTestMetrics() }) as SessionEvent<TEvent | ErrorEvent>,
        ),
        typedErrorEvent,
    ];

    return {
        stream(): AsyncIterable<SessionEvent<TEvent | ErrorEvent>> {
            return {
                [Symbol.asyncIterator]() {
                    let index = 0;
                    return {
                        async next() {
                            if (index < allEvents.length) {
                                return { value: allEvents[index++], done: false };
                            }
                            return { value: undefined, done: true };
                        },
                    };
                },
            };
        },

        async result(): Promise<
            StreamingResult<SessionEvent<TEvent | ErrorEvent>, ExtractResult<TEvent>>
        > {
            return { status: 'failed', error, events: allEvents, summary };
        },

        cancel() {},
        async cleanup() {},
        async [Symbol.asyncDispose]() {},
    };
}

export function createTestCanceledExecution<TEvent extends { type: string }>(
    events: EmittableEventInput<TEvent>[] = [],
): StreamingExecution<TEvent> {
    const summary = SessionSummary.forTest({});

    const allEvents: SessionEvent<TEvent | ErrorEvent>[] = events.map(
        (e) => ({ ...e, metrics: createTestMetrics() }) as SessionEvent<TEvent | ErrorEvent>,
    );

    return {
        stream(): AsyncIterable<SessionEvent<TEvent | ErrorEvent>> {
            return {
                [Symbol.asyncIterator]() {
                    let index = 0;
                    return {
                        async next() {
                            if (index < allEvents.length) {
                                return { value: allEvents[index++], done: false };
                            }
                            return { value: undefined, done: true };
                        },
                    };
                },
            };
        },

        async result(): Promise<
            StreamingResult<SessionEvent<TEvent | ErrorEvent>, ExtractResult<TEvent>>
        > {
            return { status: 'canceled', events: allEvents, summary };
        },

        cancel() {},
        async cleanup() {},
        async [Symbol.asyncDispose]() {},
    };
}
