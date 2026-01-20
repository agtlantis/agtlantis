import { describe, it, expect, vi } from 'vitest';
import type { Execution, StreamingExecution } from './types';
import type { EventMetrics } from '@/observability';
import { createMockSessionSummary, collectEvents } from '@/testing';

const mockSummary = createMockSessionSummary({ totalDuration: 100 });

describe('Agent Types', () => {
    describe('Execution', () => {
        it('should work with complex result types', async () => {
            interface AnalysisResult {
                score: number;
                feedback: string[];
            }

            const execution: Execution<AnalysisResult> = {
                toResult: async () => ({ score: 85, feedback: ['Good work'] }),
                getSummary: async () => mockSummary,
                cleanup: async () => {},
                [Symbol.asyncDispose]: async () => {},
            };

            const result = await execution.toResult();
            expect(result.score).toBe(85);
            expect(result.feedback).toContain('Good work');
        });

        it('should support unified handling for any execution type', async () => {
            async function runAgent<T>(execution: Execution<T>) {
                try {
                    const result = await execution.toResult();
                    const metadata = await execution.getSummary();
                    return { result, metadata };
                } finally {
                    await execution.cleanup();
                }
            }

            const mockExecution: Execution<number> = {
                toResult: vi.fn().mockResolvedValue(42),
                getSummary: vi.fn().mockResolvedValue(mockSummary),
                cleanup: vi.fn().mockResolvedValue(undefined),
                [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
            };

            const { result, metadata } = await runAgent(mockExecution);
            expect(result).toBe(42);
            // totalDuration is computed dynamically, so it will be >= the specified duration
            expect(metadata.totalDuration).toBeGreaterThanOrEqual(100);
            expect(mockExecution.cleanup).toHaveBeenCalled();
        });
    });

    describe('StreamingExecution', () => {
        it('should be iterable with for await...of', async () => {
            interface ProgressEvent {
                type: 'progress' | 'complete';
                message: string;
                metrics: EventMetrics;
            }

            const streamingExecution: StreamingExecution<ProgressEvent, string> = {
                toResult: async () => 'done',
                getSummary: async () => mockSummary,
                cleanup: async () => {},
                [Symbol.asyncDispose]: async () => {},
                cancel: () => {},
                [Symbol.asyncIterator]: async function* () {
                    yield {
                        type: 'progress',
                        message: 'Step 1',
                        metrics: { timestamp: 1000, elapsedMs: 0, deltaMs: 0 },
                    };
                    yield {
                        type: 'complete',
                        message: 'Done',
                        metrics: { timestamp: 1100, elapsedMs: 100, deltaMs: 100 },
                    };
                },
            };

            const events = await collectEvents(streamingExecution);

            expect(events).toHaveLength(2);
            expect(events[0].type).toBe('progress');
            expect(events[1].type).toBe('complete');
        });
    });
});
