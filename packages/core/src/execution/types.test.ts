import { describe, it, expect, vi } from 'vitest';
import type { Execution, StreamingExecution, ExecutionResult, StreamingResult } from './types';
import type { EventMetrics } from '@/observability';
import { createMockSessionSummary } from '@/testing';

const mockSummary = createMockSessionSummary({ totalDuration: 100 });

describe('Agent Types', () => {
    describe('Execution', () => {
        it('should work with complex result types', async () => {
            interface AnalysisResult {
                score: number;
                feedback: string[];
            }

            const execution: Execution<AnalysisResult> = {
                result: async () => ({
                    status: 'succeeded',
                    value: { score: 85, feedback: ['Good work'] },
                    summary: mockSummary,
                }),
                cancel: () => {},
                cleanup: async () => {},
                [Symbol.asyncDispose]: async () => {},
            };

            const result = await execution.result();
            expect(result.status).toBe('succeeded');
            if (result.status === 'succeeded') {
                expect(result.value.score).toBe(85);
                expect(result.value.feedback).toContain('Good work');
            }
        });

        it('should support unified handling for any execution type', async () => {
            async function runAgent<T>(execution: Execution<T>) {
                try {
                    const result = await execution.result();
                    return result;
                } finally {
                    await execution.cleanup();
                }
            }

            const mockExecution: Execution<number> = {
                result: vi.fn().mockResolvedValue({
                    status: 'succeeded',
                    value: 42,
                    summary: mockSummary,
                } satisfies ExecutionResult<number>),
                cancel: vi.fn(),
                cleanup: vi.fn().mockResolvedValue(undefined),
                [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
            };

            const result = await runAgent(mockExecution);
            expect(result.status).toBe('succeeded');
            if (result.status === 'succeeded') {
                expect(result.value).toBe(42);
            }
            // totalDuration is computed dynamically, so it will be >= the specified duration
            expect(result.summary.totalDuration).toBeGreaterThanOrEqual(100);
            expect(mockExecution.cleanup).toHaveBeenCalled();
        });

        it('should provide summary even on failure', async () => {
            const error = new Error('Test error');
            const execution: Execution<number> = {
                result: async () => ({
                    status: 'failed',
                    error,
                    summary: mockSummary,
                }),
                cancel: () => {},
                cleanup: async () => {},
                [Symbol.asyncDispose]: async () => {},
            };

            const result = await execution.result();
            expect(result.status).toBe('failed');
            if (result.status === 'failed') {
                expect(result.error).toBe(error);
            }
            expect(result.summary.totalDuration).toBeGreaterThanOrEqual(100);
        });

        it('should provide summary on cancellation', async () => {
            const execution: Execution<number> = {
                result: async () => ({
                    status: 'canceled',
                    summary: mockSummary,
                }),
                cancel: () => {},
                cleanup: async () => {},
                [Symbol.asyncDispose]: async () => {},
            };

            const result = await execution.result();
            expect(result.status).toBe('canceled');
            expect(result.summary.totalDuration).toBeGreaterThanOrEqual(100);
        });
    });

    describe('StreamingExecution', () => {
        it('should provide stream() method for event iteration', async () => {
            interface ProgressEvent {
                type: 'progress' | 'complete';
                message: string;
                metrics: EventMetrics;
            }

            const events: ProgressEvent[] = [
                {
                    type: 'progress',
                    message: 'Step 1',
                    metrics: { timestamp: 1000, elapsedMs: 0, deltaMs: 0 },
                },
                {
                    type: 'complete',
                    message: 'Done',
                    metrics: { timestamp: 1100, elapsedMs: 100, deltaMs: 100 },
                },
            ];

            const streamingExecution: StreamingExecution<ProgressEvent, string> = {
                stream: async function* () {
                    for (const event of events) {
                        yield event;
                    }
                },
                result: async () => ({
                    status: 'succeeded',
                    value: 'done',
                    summary: mockSummary,
                    events,
                } satisfies StreamingResult<ProgressEvent, string>),
                cancel: () => {},
                cleanup: async () => {},
                [Symbol.asyncDispose]: async () => {},
            };

            const collectedEvents: ProgressEvent[] = [];
            for await (const event of streamingExecution.stream()) {
                collectedEvents.push(event);
            }

            expect(collectedEvents).toHaveLength(2);
            expect(collectedEvents[0].type).toBe('progress');
            expect(collectedEvents[1].type).toBe('complete');
        });

        it('should include events in result', async () => {
            interface ProgressEvent {
                type: 'progress' | 'complete';
                message: string;
                metrics: EventMetrics;
            }

            const events: ProgressEvent[] = [
                {
                    type: 'progress',
                    message: 'Step 1',
                    metrics: { timestamp: 1000, elapsedMs: 0, deltaMs: 0 },
                },
                {
                    type: 'complete',
                    message: 'Done',
                    metrics: { timestamp: 1100, elapsedMs: 100, deltaMs: 100 },
                },
            ];

            const streamingExecution: StreamingExecution<ProgressEvent, string> = {
                stream: async function* () {
                    for (const event of events) {
                        yield event;
                    }
                },
                result: async () => ({
                    status: 'succeeded',
                    value: 'done',
                    summary: mockSummary,
                    events,
                }),
                cancel: () => {},
                cleanup: async () => {},
                [Symbol.asyncDispose]: async () => {},
            };

            // Skip stream(), directly get result
            const result = await streamingExecution.result();

            expect(result.status).toBe('succeeded');
            expect(result.events).toHaveLength(2);
            expect(result.events[0].type).toBe('progress');
            expect(result.events[1].type).toBe('complete');
        });
    });
});
