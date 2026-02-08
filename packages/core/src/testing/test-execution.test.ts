import { describe, it, expect } from 'vitest';

import type { CompletionEvent, ErrorEvent, SessionEvent } from '@/execution/types';

import { createTestExecution, createTestErrorExecution, createTestCanceledExecution } from './test-execution';

type TestEvent = { type: 'progress'; step: number } | CompletionEvent<string>;

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const items: T[] = [];
    for await (const item of iterable) {
        items.push(item);
    }
    return items;
}

describe('createTestExecution', () => {
    it('yields user events followed by completion event', async () => {
        const execution = createTestExecution<TestEvent>('done', [
            { type: 'progress', step: 1 },
            { type: 'progress', step: 2 },
        ]);

        const events = await collect(execution.stream());

        expect(events).toHaveLength(3);
        expect(events[0].type).toBe('progress');
        expect(events[1].type).toBe('progress');
        expect(events[2].type).toBe('complete');
        expect((events[2] as SessionEvent<CompletionEvent<string>>).data).toBe('done');
    });

    it('result returns succeeded with correct value', async () => {
        const execution = createTestExecution<TestEvent>('hello', [
            { type: 'progress', step: 1 },
        ]);

        const result = await execution.result();

        expect(result.status).toBe('succeeded');
        if (result.status === 'succeeded') {
            expect(result.value).toBe('hello');
        }
    });

    it('yields only completion event when no intermediate events given', async () => {
        const execution = createTestExecution<TestEvent>('only-complete');

        const events = await collect(execution.stream());

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('complete');
    });
});

describe('createTestErrorExecution', () => {
    it('yields user events followed by error event', async () => {
        const error = new Error('test failure');
        const execution = createTestErrorExecution<TestEvent>(error, {
            events: [{ type: 'progress', step: 1 }],
        });

        const events = await collect(execution.stream());

        expect(events).toHaveLength(2);
        expect(events[0].type).toBe('progress');
        expect(events[1].type).toBe('error');
        expect((events[1] as SessionEvent<ErrorEvent>).error).toBe(error);
    });

    it('result returns failed with correct error', async () => {
        const error = new Error('boom');
        const execution = createTestErrorExecution<TestEvent>(error);

        const result = await execution.result();

        expect(result.status).toBe('failed');
        if (result.status === 'failed') {
            expect(result.error).toBe(error);
        }
    });

    it('yields only error event when no intermediate events given', async () => {
        const execution = createTestErrorExecution<TestEvent>(new Error('fail'));

        const events = await collect(execution.stream());

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('error');
    });
});

describe('stream/result consistency', () => {
    it('result().events contains the same events as stream()', async () => {
        const execution = createTestExecution<TestEvent>('value', [
            { type: 'progress', step: 1 },
            { type: 'progress', step: 2 },
        ]);

        const streamed = await collect(execution.stream());
        const result = await execution.result();

        expect(result.events).toHaveLength(streamed.length);
        for (let i = 0; i < streamed.length; i++) {
            expect(result.events[i]).toBe(streamed[i]);
        }
    });
});

describe('terminal event includes summary', () => {
    it('CompletionEvent carries summary matching result summary', async () => {
        const execution = createTestExecution<TestEvent>('val');

        const events = await collect(execution.stream());
        const result = await execution.result();
        const terminal = events[events.length - 1] as SessionEvent<CompletionEvent<string>>;

        expect(terminal.summary).toBeDefined();
        expect(result.summary).toBe(terminal.summary);
    });

    it('ErrorEvent carries summary matching result summary', async () => {
        const execution = createTestErrorExecution<TestEvent>(new Error('err'));

        const events = await collect(execution.stream());
        const result = await execution.result();
        const terminal = events[events.length - 1] as SessionEvent<ErrorEvent>;

        expect(terminal.summary).toBeDefined();
        expect(result.summary).toBe(terminal.summary);
    });
});

describe('EventMetrics shape', () => {
    it('all events have valid metrics with timestamp, elapsedMs, deltaMs', async () => {
        const execution = createTestExecution<TestEvent>('r', [{ type: 'progress', step: 1 }]);

        const events = await collect(execution.stream());

        for (const event of events) {
            expect(event.metrics).toBeDefined();
            expect(typeof event.metrics.timestamp).toBe('number');
            expect(typeof event.metrics.elapsedMs).toBe('number');
            expect(typeof event.metrics.deltaMs).toBe('number');
        }
    });
});

describe('no-op methods', () => {
    it('cancel(), cleanup(), [Symbol.asyncDispose]() are callable without error', async () => {
        const execution = createTestExecution<TestEvent>('x');

        expect(() => execution.cancel()).not.toThrow();
        await expect(execution.cleanup()).resolves.toBeUndefined();
        await expect(execution[Symbol.asyncDispose]()).resolves.toBeUndefined();
    });
});

describe('stream replay', () => {
    it('stream() can be called multiple times with identical results', async () => {
        const execution = createTestExecution<TestEvent>('value', [
            { type: 'progress', step: 1 },
            { type: 'progress', step: 2 },
        ]);

        const first = await collect(execution.stream());
        const second = await collect(execution.stream());

        expect(first).toEqual(second);
    });
});

describe('CompletionEvent<void>', () => {
    type VoidEvent = { type: 'progress' } | CompletionEvent<void>;

    it('supports void result type', async () => {
        const execution = createTestExecution<VoidEvent>(undefined);

        const events = await collect(execution.stream());

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('complete');
        expect((events[0] as SessionEvent<CompletionEvent<void>>).data).toBeUndefined();
    });

    it('result returns succeeded with undefined value', async () => {
        const execution = createTestExecution<VoidEvent>(undefined);

        const result = await execution.result();

        expect(result.status).toBe('succeeded');
        if (result.status === 'succeeded') {
            expect(result.value).toBeUndefined();
        }
    });
});

describe('createTestCanceledExecution', () => {
    it('stream yields only intermediate events', async () => {
        const execution = createTestCanceledExecution<TestEvent>([
            { type: 'progress', step: 1 },
            { type: 'progress', step: 2 },
        ]);

        const events = await collect(execution.stream());

        expect(events).toHaveLength(2);
        expect(events[0].type).toBe('progress');
        expect(events[1].type).toBe('progress');
    });

    it('result returns canceled status', async () => {
        const execution = createTestCanceledExecution<TestEvent>();

        const result = await execution.result();

        expect(result.status).toBe('canceled');
    });

    it('no-op methods are callable without error', async () => {
        const execution = createTestCanceledExecution<TestEvent>();

        expect(() => execution.cancel()).not.toThrow();
        await expect(execution.cleanup()).resolves.toBeUndefined();
        await expect(execution[Symbol.asyncDispose]()).resolves.toBeUndefined();
    });

    it('yields no events when none provided', async () => {
        const execution = createTestCanceledExecution<TestEvent>();

        const events = await collect(execution.stream());

        expect(events).toHaveLength(0);
    });
});

describe('createTestErrorExecution with data', () => {
    it('includes data in error event when provided', async () => {
        const error = new Error('partial failure');
        const execution = createTestErrorExecution<TestEvent>(error, {
            data: 'partial-result',
        });

        const events = await collect(execution.stream());
        const errorEvent = events[events.length - 1] as SessionEvent<ErrorEvent>;

        expect(errorEvent.type).toBe('error');
        expect(errorEvent.data).toBe('partial-result');
    });

    it('works with both events and data', async () => {
        const error = new Error('mid-stream failure');
        const execution = createTestErrorExecution<TestEvent>(error, {
            events: [{ type: 'progress', step: 1 }],
            data: 'partial',
        });

        const events = await collect(execution.stream());

        expect(events).toHaveLength(2);
        expect(events[0].type).toBe('progress');
        expect(events[1].type).toBe('error');
        expect((events[1] as SessionEvent<ErrorEvent>).data).toBe('partial');
    });

    it('works without data (backwards compatible)', async () => {
        const error = new Error('no data');
        const execution = createTestErrorExecution<TestEvent>(error);

        const events = await collect(execution.stream());
        const errorEvent = events[0] as SessionEvent<ErrorEvent>;

        expect(errorEvent.type).toBe('error');
        expect(errorEvent.data).toBeUndefined();
    });
});
