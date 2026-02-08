import { describe, it, expect, vi } from 'vitest';

import type {
    StreamingExecution,
    SimpleExecution,
    CompletionEvent,
    ErrorEvent,
    SessionEvent,
    SimpleResult,
} from './types';
import {
    createTestExecution,
    createTestErrorExecution,
    createTestCanceledExecution,
} from '@/testing/test-execution';
import { SessionSummary } from '@/session/types';
import { mapExecution, mapExecutionResult } from './mapping';

// ============================================================================
// Test event types
// ============================================================================

type ProgressEvent = { type: 'progress'; step: number };
type TestEvent = ProgressEvent | CompletionEvent<string>;

type MappedProgressEvent = { type: 'mapped-progress'; value: number };
type MappedEvent = MappedProgressEvent | CompletionEvent<number>;

// ============================================================================
// Helpers
// ============================================================================

function createSimpleExecution<T>(value: T): SimpleExecution<T> {
    const summary = SessionSummary.forTest({});
    return {
        async result(): Promise<SimpleResult<T>> {
            return { status: 'succeeded', value, summary };
        },
        cancel() {},
        async cleanup() {},
        async [Symbol.asyncDispose]() {},
    };
}

function createFailedSimpleExecution<T>(error: Error): SimpleExecution<T> {
    const summary = SessionSummary.forTest({});
    return {
        async result(): Promise<SimpleResult<T>> {
            return { status: 'failed', error, summary };
        },
        cancel() {},
        async cleanup() {},
        async [Symbol.asyncDispose]() {},
    };
}

function createCanceledSimpleExecution<T>(): SimpleExecution<T> {
    const summary = SessionSummary.forTest({});
    return {
        async result(): Promise<SimpleResult<T>> {
            return { status: 'canceled', summary };
        },
        cancel() {},
        async cleanup() {},
        async [Symbol.asyncDispose]() {},
    };
}

async function collectStream<T extends { type: string }>(
    execution: StreamingExecution<T>,
): Promise<SessionEvent<T | ErrorEvent>[]> {
    const events: SessionEvent<T | ErrorEvent>[] = [];
    for await (const event of execution.stream()) {
        events.push(event);
    }
    return events;
}

// ============================================================================
// mapExecutionResult — Streaming
// ============================================================================

describe('mapExecutionResult (Streaming)', () => {
    it('transforms result value with sync fn', async () => {
        const execution = createTestExecution<TestEvent>('hello');
        const mapped = mapExecutionResult(execution, (value) => value.length);

        const result = await mapped.result();
        expect(result.status).toBe('succeeded');
        if (result.status === 'succeeded') {
            expect(result.value).toBe(5);
        }
    });

    it('transforms result value with async fn', async () => {
        const execution = createTestExecution<TestEvent>('hello');
        const mapped = mapExecutionResult(execution, async (value) => value.length);

        const result = await mapped.result();
        expect(result.status).toBe('succeeded');
        if (result.status === 'succeeded') {
            expect(result.value).toBe(5);
        }
    });

    it('passes through failed result unchanged', async () => {
        const error = new Error('test error');
        const execution = createTestErrorExecution<TestEvent>(error);
        const mapped = mapExecutionResult(execution, (value) => value.length);

        const result = await mapped.result();
        expect(result.status).toBe('failed');
        if (result.status === 'failed') {
            expect(result.error).toBe(error);
        }
    });

    it('passes through canceled result unchanged', async () => {
        const execution = createTestCanceledExecution<TestEvent>();
        const mapped = mapExecutionResult(execution, (value) => value.length);

        const result = await mapped.result();
        expect(result.status).toBe('canceled');
    });

    it('returns failed result when fn throws', async () => {
        const execution = createTestExecution<TestEvent>('hello');
        const mapped = mapExecutionResult(execution, () => {
            throw new Error('transform failed');
        });

        const result = await mapped.result();
        expect(result.status).toBe('failed');
        if (result.status === 'failed') {
            expect(result.error.message).toBe('transform failed');
        }
    });

    it('maps CompletionEvent.data in stream while keeping other events untouched', async () => {
        const execution = createTestExecution<TestEvent>('hello', [
            { type: 'progress', step: 1 },
            { type: 'progress', step: 2 },
        ]);
        const mapped = mapExecutionResult(execution, (value) => value.length);

        const events = await collectStream(mapped);
        expect(events).toHaveLength(3);

        expect(events[0].type).toBe('progress');
        expect((events[0] as any).step).toBe(1);
        expect(events[0].metrics).toBeDefined();

        expect(events[1].type).toBe('progress');
        expect((events[1] as any).step).toBe(2);

        expect(events[2].type).toBe('complete');
        expect((events[2] as any).data).toBe(5);
    });

    it('passes through ErrorEvent in stream', async () => {
        const error = new Error('stream error');
        const execution = createTestErrorExecution<TestEvent>(error, {
            events: [{ type: 'progress', step: 1 }],
        });
        const mapped = mapExecutionResult(execution, (value) => value.length);

        const events = await collectStream(mapped);
        const errorEvent = events.find(e => e.type === 'error');
        expect(errorEvent).toBeDefined();
        expect((errorEvent as any).error).toBe(error);
    });

    it('supports multiple stream() calls (replay)', async () => {
        const execution = createTestExecution<TestEvent>('ab', [
            { type: 'progress', step: 1 },
        ]);
        const mapped = mapExecutionResult(execution, (value) => value.length);

        const first = await collectStream(mapped);
        const second = await collectStream(mapped);

        expect(first).toHaveLength(2);
        expect(second).toHaveLength(2);
        expect((first[1] as any).data).toBe(2);
        expect((second[1] as any).data).toBe(2);
    });

    it('delegates lifecycle methods to original', async () => {
        const cancelSpy = vi.fn();
        const cleanupSpy = vi.fn();
        const disposeSpy = vi.fn();

        const execution = createTestExecution<TestEvent>('hello');
        execution.cancel = cancelSpy;
        execution.cleanup = cleanupSpy;
        execution[Symbol.asyncDispose] = disposeSpy;

        const mapped = mapExecutionResult(execution, (value) => value.length);

        mapped.cancel();
        await mapped.cleanup();
        await mapped[Symbol.asyncDispose]();

        expect(cancelSpy).toHaveBeenCalledOnce();
        expect(cleanupSpy).toHaveBeenCalledOnce();
        expect(disposeSpy).toHaveBeenCalledOnce();
    });
});

// ============================================================================
// mapExecution — Streaming
// ============================================================================

describe('mapExecution (Streaming)', () => {
    it('maps all events and extracts result from mapped CompletionEvent', async () => {
        const execution = createTestExecution<TestEvent>('hello', [
            { type: 'progress', step: 1 },
        ]);

        const mapped = mapExecution(execution, (event): MappedEvent => {
            if (event.type === 'progress') {
                return { type: 'mapped-progress', value: event.step * 10 };
            }
            if (event.type === 'complete') {
                return { type: 'complete', data: event.data.length, summary: event.summary };
            }
            return event as any;
        }) as StreamingExecution<MappedEvent>;

        const result = await mapped.result();
        expect(result.status).toBe('succeeded');
        if (result.status === 'succeeded') {
            expect(result.value).toBe(5);
            expect(result.events).toHaveLength(2);
        }
    });

    it('passes through failed/canceled results', async () => {
        const error = new Error('fail');
        const failedExec = createTestErrorExecution<TestEvent>(error);
        const mappedFailed = mapExecution(failedExec, (event) => event);

        const failedResult = await mappedFailed.result();
        expect(failedResult.status).toBe('failed');

        const canceledExec = createTestCanceledExecution<TestEvent>();
        const mappedCanceled = mapExecution(canceledExec, (event) => event);

        const canceledResult = await mappedCanceled.result();
        expect(canceledResult.status).toBe('canceled');
    });

    it('yields ErrorEvent in stream and returns failed result when fn throws', async () => {
        const execution = createTestExecution<TestEvent>('hello', [
            { type: 'progress', step: 1 },
        ]);

        const mapped = mapExecution(execution, () => {
            throw new Error('mapping failed');
        });

        const events = await collectStream(mapped);
        const errorEvent = events.find(e => e.type === 'error');
        expect(errorEvent).toBeDefined();
        expect((errorEvent as any).error.message).toBe('mapping failed');

        const result = await mapped.result();
        expect(result.status).toBe('failed');
        if (result.status === 'failed') {
            expect(result.error.message).toBe('mapping failed');
        }
    });

    it('transforms intermediate event types', async () => {
        const execution = createTestExecution<TestEvent>('hello', [
            { type: 'progress', step: 3 },
        ]);

        const mapped = mapExecution(execution, (event) => {
            if (event.type === 'progress') {
                return { type: 'mapped-progress', value: event.step * 10 } as MappedProgressEvent;
            }
            if (event.type === 'complete') {
                return { type: 'complete', data: event.data.length, summary: event.summary } as CompletionEvent<number>;
            }
            return event as any;
        }) as StreamingExecution<MappedEvent>;

        const events = await collectStream(mapped);
        expect(events[0].type).toBe('mapped-progress');
        expect((events[0] as any).value).toBe(30);
        expect(events[0].metrics).toBeDefined();
    });

    it('passes through ErrorEvent without calling fn', async () => {
        const error = new Error('original error');
        const execution = createTestErrorExecution<TestEvent>(error, {
            events: [{ type: 'progress', step: 1 }],
        });

        const fn = vi.fn((event: any) => event);
        const mapped = mapExecution(execution, fn);

        const events = await collectStream(mapped);
        const errorEvent = events.find(e => e.type === 'error');
        expect(errorEvent).toBeDefined();

        const fnCallTypes = fn.mock.calls.map(([event]) => event.type);
        expect(fnCallTypes).not.toContain('error');
    });
});

// ============================================================================
// mapExecution — Simple
// ============================================================================

describe('mapExecution (Simple)', () => {
    it('transforms succeeded value', async () => {
        const execution = createSimpleExecution('hello');
        const mapped = mapExecution(execution, (value) => value.length);

        const result = await mapped.result();
        expect(result.status).toBe('succeeded');
        if (result.status === 'succeeded') {
            expect(result.value).toBe(5);
        }
    });

    it('passes through failed result', async () => {
        const error = new Error('fail');
        const execution = createFailedSimpleExecution<string>(error);
        const mapped = mapExecution(execution, (value) => value.length);

        const result = await mapped.result();
        expect(result.status).toBe('failed');
        if (result.status === 'failed') {
            expect(result.error).toBe(error);
        }
    });

    it('passes through canceled result', async () => {
        const execution = createCanceledSimpleExecution<string>();
        const mapped = mapExecution(execution, (value) => value.length);

        const result = await mapped.result();
        expect(result.status).toBe('canceled');
    });

    it('returns failed result when fn throws', async () => {
        const execution = createSimpleExecution('hello');
        const mapped = mapExecution(execution, () => {
            throw new Error('transform failed');
        });

        const result = await mapped.result();
        expect(result.status).toBe('failed');
        if (result.status === 'failed') {
            expect(result.error.message).toBe('transform failed');
        }
    });
});

// ============================================================================
// mapExecutionResult — Simple
// ============================================================================

describe('mapExecutionResult (Simple)', () => {
    it('transforms succeeded value', async () => {
        const execution = createSimpleExecution('hello');
        const mapped = mapExecutionResult(execution, (value) => value.length);

        const result = await mapped.result();
        expect(result.status).toBe('succeeded');
        if (result.status === 'succeeded') {
            expect(result.value).toBe(5);
        }
    });

    it('passes through failed result', async () => {
        const error = new Error('fail');
        const execution = createFailedSimpleExecution<string>(error);
        const mapped = mapExecutionResult(execution, (value) => value.length);

        const result = await mapped.result();
        expect(result.status).toBe('failed');
        if (result.status === 'failed') {
            expect(result.error).toBe(error);
        }
    });

    it('passes through canceled result', async () => {
        const execution = createCanceledSimpleExecution<string>();
        const mapped = mapExecutionResult(execution, (value) => value.length);

        const result = await mapped.result();
        expect(result.status).toBe('canceled');
    });

    it('returns failed result when fn throws', async () => {
        const execution = createSimpleExecution('hello');
        const mapped = mapExecutionResult(execution, () => {
            throw new Error('transform failed');
        });

        const result = await mapped.result();
        expect(result.status).toBe('failed');
        if (result.status === 'failed') {
            expect(result.error.message).toBe('transform failed');
        }
    });
});
