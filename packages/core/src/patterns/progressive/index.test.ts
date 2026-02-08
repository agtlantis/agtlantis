import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { defineProgressivePattern, ProgressivePattern } from './index';
import type { CompletionEvent } from '@/execution/types';
import type { EventMetrics } from '@/observability';
import type { StreamingSession } from '@/session/streaming-session';

type TestProgress = { stage: string; message: string } | { stage: string; progress: number };
type TestResult = { summary: string; score: number };

interface TestBaseEvent {
    type: string;
    data?: unknown;
    metrics: EventMetrics;
}

type TestEvent = TestBaseEvent | CompletionEvent<TestResult>;

const testProgressSchema = z.discriminatedUnion('stage', [
    z.object({ stage: z.literal('analyzing'), message: z.string() }),
    z.object({ stage: z.literal('processing'), progress: z.number() }),
]);

const testResultSchema = z.object({
    summary: z.string(),
    score: z.number(),
});

function createMockMetrics(): EventMetrics {
    return {
        timestamp: Date.now(),
        elapsedMs: 100,
        deltaMs: 50,
    };
}

function createMockFullStream(
    toolCalls: Array<{ toolName: string; input: unknown }>
): AsyncIterable<{ type: string; toolName?: string; input?: unknown }> {
    return {
        async *[Symbol.asyncIterator]() {
            for (const call of toolCalls) {
                yield {
                    type: 'tool-call',
                    toolName: call.toolName,
                    input: call.input,
                };
            }
        },
    };
}

function createMockSession(
    fullStreamEvents: Array<{ toolName: string; input: unknown }>
): StreamingSession<TestEvent> & {
    _emittedEvents: TestEvent[];
    _doneResult: () => TestResult | null;
} {
    const emittedEvents: TestEvent[] = [];
    let doneResult: TestResult | null = null;

    const mockFullStream = createMockFullStream(fullStreamEvents);

    return {
        emit: vi.fn((event: Omit<TestEvent, 'metrics'>) => {
            const fullEvent = { ...event, metrics: createMockMetrics() } as TestEvent;
            emittedEvents.push(fullEvent);
            return fullEvent;
        }),
        done: vi.fn((result: TestResult) => {
            doneResult = result;
            return Promise.resolve({
                type: 'complete',
                data: result,
                metrics: createMockMetrics(),
            } as TestEvent);
        }),
        streamText: vi.fn(() => ({
            fullStream: mockFullStream,
        })),
        _emittedEvents: emittedEvents,
        _doneResult: () => doneResult,
    } as unknown as StreamingSession<TestEvent> & {
        _emittedEvents: TestEvent[];
        _doneResult: () => TestResult | null;
    };
}

async function collectEvents<T>(generator: AsyncGenerator<T>): Promise<T[]> {
    const events: T[] = [];
    for await (const event of generator) {
        events.push(event);
    }
    return events;
}

function wrapData(data: unknown): { data: string } {
    return { data: JSON.stringify(data) };
}

describe('defineProgressivePattern', () => {
    it('should create pattern with schemas', () => {
        const pattern = defineProgressivePattern({
            progressSchema: testProgressSchema,
            resultSchema: testResultSchema,
        });

        expect(pattern).toBeInstanceOf(ProgressivePattern);
        expect(pattern.progressSchema).toBe(testProgressSchema);
        expect(pattern.resultSchema).toBe(testResultSchema);
    });
});

describe('ProgressivePattern.runInSession()', () => {
    let pattern: ProgressivePattern<typeof testProgressSchema, typeof testResultSchema>;

    beforeEach(() => {
        pattern = defineProgressivePattern({
            progressSchema: testProgressSchema,
            resultSchema: testResultSchema,
        });
    });

    it('should emit progress events for reportProgress tool calls', async () => {
        const session = createMockSession([
            {
                toolName: 'reportProgress',
                input: wrapData({ stage: 'analyzing', message: 'Starting...' }),
            },
            {
                toolName: 'reportProgress',
                input: wrapData({ stage: 'processing', progress: 50 }),
            },
            {
                toolName: 'submitResult',
                input: wrapData({ summary: 'Done', score: 100 }),
            },
        ]);

        const events = (await collectEvents(
            pattern.runInSession(session, { prompt: 'Test prompt' })
        )) as TestEvent[];

        expect(events.length).toBe(3);
        expect(events[0].type).toBe('progress');
        expect(events[0].data).toEqual({
            stage: 'analyzing',
            message: 'Starting...',
        });
        expect(events[1].type).toBe('progress');
        expect(events[1].data).toEqual({
            stage: 'processing',
            progress: 50,
        });
        expect(events[2].type).toBe('complete');
        expect(session.done).toHaveBeenCalledWith({ summary: 'Done', score: 100 });
    });

    it('should throw error if no submitResult tool call received', async () => {
        const session = createMockSession([
            {
                toolName: 'reportProgress',
                input: wrapData({ stage: 'analyzing', message: 'Starting...' }),
            },
        ]);

        await expect(
            collectEvents(pattern.runInSession(session, { prompt: 'Test prompt' }))
        ).rejects.toThrow('No result received');
    });

    it('should work with no progress events (only result)', async () => {
        const session = createMockSession([
            {
                toolName: 'submitResult',
                input: wrapData({ summary: 'Quick result', score: 42 }),
            },
        ]);

        const events = await collectEvents(
            pattern.runInSession(session, { prompt: 'Test prompt' })
        );

        expect(events.length).toBe(1);
        expect(events[0].type).toBe('complete');
        expect(session.done).toHaveBeenCalledWith({
            summary: 'Quick result',
            score: 42,
        });
    });

    it('should call streamText with correct parameters', async () => {
        const session = createMockSession([
            { toolName: 'submitResult', input: wrapData({ summary: 'Test', score: 1 }) },
        ]);

        await collectEvents(
            pattern.runInSession(session, {
                prompt: 'My prompt',
                system: 'My system prompt',
            })
        );

        expect(session.streamText).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: 'My prompt',
                toolChoice: 'required',
            })
        );

        const callArgs = (session.streamText as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(callArgs.system).toContain('My system prompt');
        expect(callArgs.system).toContain('CRITICAL');
        expect(callArgs.system).toContain('reportProgress');
        expect(callArgs.system).toContain('submitResult');
    });

    it('should include internal tools in streamText call', async () => {
        const session = createMockSession([
            { toolName: 'submitResult', input: wrapData({ summary: 'Test', score: 1 }) },
        ]);

        await collectEvents(pattern.runInSession(session, { prompt: 'Test' }));

        const callArgs = (session.streamText as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(callArgs.tools).toBeDefined();
        expect(callArgs.tools.reportProgress).toBeDefined();
        expect(callArgs.tools.submitResult).toBeDefined();
    });

    it('should merge user tools with internal tools', async () => {
        const session = createMockSession([
            { toolName: 'submitResult', input: wrapData({ summary: 'Test', score: 1 }) },
        ]);

        const customTool = {
            description: 'Custom tool',
            inputSchema: z.object({ query: z.string() }),
            execute: async () => ({ result: 'test' }),
        };

        await collectEvents(
            pattern.runInSession(session, {
                prompt: 'Test',
                tools: { customTool } as any,
            })
        );

        const callArgs = (session.streamText as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(callArgs.tools.customTool).toBeDefined();
        expect(callArgs.tools.reportProgress).toBeDefined();
        expect(callArgs.tools.submitResult).toBeDefined();
    });

    it('should ignore unknown tool calls (user-defined tools)', async () => {
        const session = createMockSession([
            {
                toolName: 'reportProgress',
                input: wrapData({ stage: 'analyzing', message: 'Step 1' }),
            },
            { toolName: 'customUserTool', input: { query: 'search' } },
            {
                toolName: 'submitResult',
                input: wrapData({ summary: 'Done', score: 100 }),
            },
        ]);

        const events = await collectEvents(pattern.runInSession(session, { prompt: 'Test' }));

        expect(events.length).toBe(2);
        expect(events[0].type).toBe('progress');
        expect(events[1].type).toBe('complete');
    });
});

describe('ProgressivePattern constructor', () => {
    it('should store schemas correctly', () => {
        const pattern = new ProgressivePattern(testProgressSchema, testResultSchema);

        expect(pattern.progressSchema).toBe(testProgressSchema);
        expect(pattern.resultSchema).toBe(testResultSchema);
    });
});

describe('ProgressivePattern system prompt', () => {
    let pattern: ProgressivePattern<typeof testProgressSchema, typeof testResultSchema>;

    beforeEach(() => {
        pattern = defineProgressivePattern({
            progressSchema: testProgressSchema,
            resultSchema: testResultSchema,
        });
    });

    it('should include protocol instructions when user provides system prompt', async () => {
        const session = createMockSession([
            { toolName: 'submitResult', input: wrapData({ summary: 'Test', score: 1 }) },
        ]);

        await collectEvents(
            pattern.runInSession(session, {
                prompt: 'Test',
                system: 'You are an expert analyzer.',
            })
        );

        const callArgs = (session.streamText as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(callArgs.system).toContain('You are an expert analyzer.');
        expect(callArgs.system).toContain('CRITICAL');
    });

    it('should work without user system prompt', async () => {
        const session = createMockSession([
            { toolName: 'submitResult', input: wrapData({ summary: 'Test', score: 1 }) },
        ]);

        await collectEvents(pattern.runInSession(session, { prompt: 'Test' }));

        const callArgs = (session.streamText as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(callArgs.system).toContain('CRITICAL');
        expect(callArgs.system).not.toContain('undefined');
    });
});

describe('ProgressivePattern with multiple progress events', () => {
    it('should handle many progress events correctly', async () => {
        const pattern = defineProgressivePattern({
            progressSchema: testProgressSchema,
            resultSchema: testResultSchema,
        });

        const progressCalls = Array.from({ length: 10 }, (_, i) => ({
            toolName: 'reportProgress',
            input: wrapData({ stage: 'processing', progress: (i + 1) * 10 }),
        }));

        const session = createMockSession([
            ...progressCalls,
            {
                toolName: 'submitResult',
                input: wrapData({ summary: 'All done', score: 100 }),
            },
        ]);

        const events = (await collectEvents(
            pattern.runInSession(session, { prompt: 'Test' })
        )) as TestEvent[];

        expect(events.length).toBe(11);

        for (let i = 0; i < 10; i++) {
            expect(events[i].type).toBe('progress');
            expect((events[i].data as { progress: number }).progress).toBe((i + 1) * 10);
        }

        expect(events[10].type).toBe('complete');
    });
});

describe('ProgressivePattern edge cases', () => {
    let pattern: ProgressivePattern<typeof testProgressSchema, typeof testResultSchema>;

    beforeEach(() => {
        pattern = defineProgressivePattern({
            progressSchema: testProgressSchema,
            resultSchema: testResultSchema,
        });
    });

    it('should handle empty fullStream', async () => {
        const session = createMockSession([]);

        await expect(
            collectEvents(pattern.runInSession(session, { prompt: 'Test' }))
        ).rejects.toThrow('No result received');
    });

    it('should only use the last submitResult if called multiple times', async () => {
        const session = createMockSession([
            { toolName: 'submitResult', input: wrapData({ summary: 'First', score: 1 }) },
            {
                toolName: 'submitResult',
                input: wrapData({ summary: 'Second', score: 2 }),
            },
        ]);

        await collectEvents(pattern.runInSession(session, { prompt: 'Test' }));

        expect(session.done).toHaveBeenCalledWith({ summary: 'Second', score: 2 });
    });
});
