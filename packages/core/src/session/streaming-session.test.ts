import type { LanguageModelUsage } from 'ai';
import { generateText, streamText } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StreamingSession, createStreamingSession } from './streaming-session';
import {
    TEST_PROVIDER_TYPE,
    createMockFileManager,
    createMockLogger,
    createMockModel,
    createMockUsage,
} from './test-utils';

vi.mock('ai', () => ({
    generateText: vi.fn(),
    streamText: vi.fn(),
}));

const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
const mockStreamText = streamText as ReturnType<typeof vi.fn>;

/**
 * Test event type - pure domain event without metrics.
 * Framework automatically wraps with SessionEvent<TestEvent> at runtime.
 */
interface TestEvent {
    type: string;
    message?: string;
    data?: string;
    summary?: unknown;
    error?: Error;
}

describe('createStreamingSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('factory', () => {
        it('should create a session with all required methods', () => {
            const model = createMockModel();
            const fileManager = createMockFileManager();
            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: model,
                providerType: TEST_PROVIDER_TYPE,
                fileManager,
            });

            expect(session).toBeDefined();

            expect(typeof session.generateText).toBe('function');
            expect(typeof session.streamText).toBe('function');
            expect(session.fileManager).toBe(fileManager);
            expect(typeof session.onDone).toBe('function');
            expect(typeof session.emit).toBe('function');
            expect(typeof session.done).toBe('function');
            expect(typeof session.fail).toBe('function');
            expect(typeof session.record).toBe('function');
            expect(typeof session.recordToolCall).toBe('function');
            expect(typeof session.runOnDoneHooks).toBe('function');
            expect(typeof session.getSummary).toBe('function');
        });
    });

    describe('AI SDK delegation', () => {
        it('should delegate generateText to ExecutionSession', async () => {
            const model = createMockModel();
            const mockResult = { text: 'Hello!', usage: createMockUsage() };
            mockGenerateText.mockResolvedValue(mockResult);

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: model,
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            const result = await session.generateText({ prompt: 'Hi' });

            expect(mockGenerateText).toHaveBeenCalledWith({ prompt: 'Hi', model });
            expect(result.text).toBe('Hello!');
        });

        it('should delegate streamText to ExecutionSession', () => {
            const model = createMockModel();
            const mockResult = {
                textStream: (async function* () {
                    yield 'data';
                })(),
                usage: Promise.resolve(createMockUsage()),
            };
            mockStreamText.mockReturnValue(mockResult);

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: model,
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            const result = session.streamText({ prompt: 'Hi' });

            expect(mockStreamText).toHaveBeenCalledWith({ prompt: 'Hi', model });
            expect(result).toBe(mockResult);
        });
    });

    describe('emit', () => {
        it('should add metrics to emitted event', () => {
            vi.useFakeTimers();
            const startTime = 1000000;
            vi.setSystemTime(startTime);

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
                startTime,
            });

            vi.advanceTimersByTime(100);

            const event = session.emit({ type: 'progress', message: 'Working...' });

            expect(event.type).toBe('progress');
            expect(event.message).toBe('Working...');
            expect(event.metrics).toBeDefined();
            expect(event.metrics.timestamp).toBe(startTime + 100);
            expect(event.metrics.elapsedMs).toBe(100);
        });

        it('should calculate deltaMs between events', () => {
            vi.useFakeTimers();
            const startTime = 1000000;
            vi.setSystemTime(startTime);

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
                startTime,
            });

            vi.advanceTimersByTime(100);
            const event1 = session.emit({ type: 'event1' });

            vi.advanceTimersByTime(50);
            const event2 = session.emit({ type: 'event2' });

            vi.advanceTimersByTime(150);
            const event3 = session.emit({ type: 'event3' });

            expect(event1.metrics.deltaMs).toBe(100);
            expect(event2.metrics.deltaMs).toBe(50);
            expect(event3.metrics.deltaMs).toBe(150);

            expect(event1.metrics.elapsedMs).toBe(100);
            expect(event2.metrics.elapsedMs).toBe(150);
            expect(event3.metrics.elapsedMs).toBe(300);
        });

        describe('reserved type prevention', () => {
            it('should throw when emitting "complete" type at runtime', () => {
                const session = createStreamingSession<TestEvent, string>({
                    defaultLanguageModel: createMockModel(),
                    providerType: TEST_PROVIDER_TYPE,
                    fileManager: createMockFileManager(),
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(() => session.emit({ type: 'complete' } as any)).toThrow(
                    'Cannot emit reserved type "complete". Use session.done() for completion or session.fail() for errors.'
                );
            });

            it('should throw when emitting "error" type at runtime', () => {
                const session = createStreamingSession<TestEvent, string>({
                    defaultLanguageModel: createMockModel(),
                    providerType: TEST_PROVIDER_TYPE,
                    fileManager: createMockFileManager(),
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(() => session.emit({ type: 'error' } as any)).toThrow(
                    'Cannot emit reserved type "error". Use session.done() for completion or session.fail() for errors.'
                );
            });

            it('should allow emitting normal event types', () => {
                const session = createStreamingSession<TestEvent, string>({
                    defaultLanguageModel: createMockModel(),
                    providerType: TEST_PROVIDER_TYPE,
                    fileManager: createMockFileManager(),
                });

                expect(() => session.emit({ type: 'progress', message: 'test' })).not.toThrow();
            });

            it('should still allow done() to emit complete events internally', async () => {
                const session = createStreamingSession<TestEvent, string>({
                    defaultLanguageModel: createMockModel(),
                    providerType: TEST_PROVIDER_TYPE,
                    fileManager: createMockFileManager(),
                });

                const event = await session.done('result');
                expect(event.type).toBe('complete');
            });

            it('should still allow fail() to emit error events internally', async () => {
                const session = createStreamingSession<TestEvent, string>({
                    defaultLanguageModel: createMockModel(),
                    providerType: TEST_PROVIDER_TYPE,
                    fileManager: createMockFileManager(),
                });

                const event = await session.fail(new Error('test'));
                expect(event.type).toBe('error');
            });
        });
    });

    describe('done', () => {
        it('should return complete event with data and metrics', async () => {
            vi.useFakeTimers();
            const startTime = 1000000;
            vi.setSystemTime(startTime);

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
                startTime,
            });

            vi.advanceTimersByTime(500);

            const event = await session.done('result-data');

            expect(event.type).toBe('complete');
            expect(event.data).toBe('result-data');
            expect(event.metrics.elapsedMs).toBe(500);
        });

        it('should include session summary in complete event', async () => {
            const model = createMockModel();
            mockGenerateText.mockResolvedValue({
                text: 'response',
                usage: createMockUsage({ inputTokens: 200, outputTokens: 100, totalTokens: 300 }),
            });

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: model,
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            await session.generateText({ prompt: 'test' });

            const event = await session.done('result');

            expect(event.summary).toBeDefined();
            const summary = event.summary as {
                llmCallCount: number;
                totalLLMUsage: { inputTokens: number; outputTokens: number };
            };
            expect(summary.llmCallCount).toBe(1);
            expect(summary.totalLLMUsage.inputTokens).toBe(200);
            expect(summary.totalLLMUsage.outputTokens).toBe(100);
        });
    });

    describe('fail', () => {
        it('should return error event with error and metrics', async () => {
            vi.useFakeTimers();
            const startTime = 1000000;
            vi.setSystemTime(startTime);

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
                startTime,
            });

            vi.advanceTimersByTime(200);

            const testError = new Error('Test error');
            const event = await session.fail(testError);

            expect(event.type).toBe('error');
            expect(event.error).toBe(testError);
            expect(event.metrics.elapsedMs).toBe(200);
        });

        it('should include optional data in error event', async () => {
            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            const event = await session.fail(new Error('Error'), 'partial-result');

            expect(event.type).toBe('error');
            expect(event.data).toBe('partial-result');
        });

        it('should include summary in error event when available', async () => {
            const model = createMockModel();
            mockGenerateText.mockResolvedValue({
                text: 'response',
                usage: createMockUsage(),
            });

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: model,
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            await session.generateText({ prompt: 'test' });

            const event = await session.fail(new Error('Error'));

            expect(event.summary).toBeDefined();
        });
    });

    describe('onDone', () => {
        it('should execute hooks in LIFO order (last registered = first executed)', async () => {
            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            const executionOrder: number[] = [];

            session.onDone(() => {
                executionOrder.push(1);
            });
            session.onDone(() => {
                executionOrder.push(2);
            });
            session.onDone(() => {
                executionOrder.push(3);
            });

            await session.runOnDoneHooks();

            expect(executionOrder).toEqual([3, 2, 1]);
        });

        it('should handle async hooks', async () => {
            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            const executionOrder: number[] = [];

            session.onDone(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                executionOrder.push(1);
            });
            session.onDone(async () => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                executionOrder.push(2);
            });

            await session.runOnDoneHooks();

            expect(executionOrder).toEqual([2, 1]);
        });

        it('should continue executing other hooks when one throws', async () => {
            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const executed: string[] = [];

            session.onDone(() => {
                executed.push('first');
            });
            session.onDone(() => {
                throw new Error('Hook error');
            });
            session.onDone(() => {
                executed.push('third');
            });

            await session.runOnDoneHooks();

            expect(executed).toEqual(['third', 'first']);
            expect(consoleErrorSpy).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });

        it('should continue executing when async hook rejects', async () => {
            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const executed: string[] = [];

            session.onDone(() => {
                executed.push('first');
            });
            session.onDone(async () => {
                await Promise.reject(new Error('Async error'));
            });
            session.onDone(() => {
                executed.push('third');
            });

            await session.runOnDoneHooks();

            expect(executed).toEqual(['third', 'first']);
            expect(consoleErrorSpy).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });

        it('should work with no hooks registered', async () => {
            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            await expect(session.runOnDoneHooks()).resolves.toBeUndefined();
        });
    });

    describe('fileManager', () => {
        it('should expose fileManager from options', () => {
            const fileManager = createMockFileManager();

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager,
            });

            expect(session.fileManager).toBe(fileManager);
        });

        it('should allow file operations through session', async () => {
            const fileManager = createMockFileManager();
            (fileManager.upload as ReturnType<typeof vi.fn>).mockResolvedValue([
                {
                    id: '123',
                    part: {
                        type: 'file',
                        data: 'gs://bucket/file.pdf',
                        mimeType: 'application/pdf',
                    },
                },
            ]);

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager,
            });

            const files = await session.fileManager.upload([
                { source: 'path', path: '/tmp/file.pdf', mediaType: 'application/pdf' },
            ]);

            expect(files).toHaveLength(1);
            expect(files[0].part).toEqual({
                type: 'file',
                data: 'gs://bucket/file.pdf',
                mimeType: 'application/pdf',
            });
        });
    });

    describe('record and recordToolCall', () => {
        it('should record custom data via record()', async () => {
            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            session.record({ step: 'preprocessing', duration: 100 });

            const summary = await session.getSummary();

            expect(summary.customRecords).toHaveLength(1);
            expect(summary.customRecords[0]).toEqual({ step: 'preprocessing', duration: 100 });
        });

        it('should record tool calls via recordToolCall()', async () => {
            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            session.recordToolCall({ name: 'search', success: true, duration: 150 });

            const summary = await session.getSummary();

            expect(summary.toolCalls).toHaveLength(1);
            expect(summary.toolCalls[0].name).toBe('search');
            expect(summary.toolCalls[0].success).toBe(true);
        });
    });

    describe('getSummary', () => {
        it('should return aggregated session summary', async () => {
            const model = createMockModel();
            mockGenerateText.mockResolvedValue({
                text: 'response',
                usage: createMockUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
            });

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: model,
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            await session.generateText({ prompt: 'test1' });
            await session.generateText({ prompt: 'test2' });
            session.recordToolCall({ name: 'tool1', success: true });

            const summary = await session.getSummary();

            expect(summary.llmCallCount).toBe(2);
            expect(summary.totalLLMUsage.inputTokens).toBe(200);
            expect(summary.totalLLMUsage.outputTokens).toBe(100);
            expect(summary.toolCalls).toHaveLength(1);
        });

        it('should wait for pending streaming usage', async () => {
            const model = createMockModel();
            let resolveUsage: (usage: LanguageModelUsage) => void;
            const usagePromise = new Promise<LanguageModelUsage>((resolve) => {
                resolveUsage = resolve;
            });

            mockStreamText.mockReturnValue({
                textStream: (async function* () {
                    yield 'data';
                })(),
                usage: usagePromise,
            });

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: model,
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            session.streamText({ prompt: 'test' });

            const summaryPromise = session.getSummary();

            resolveUsage!(createMockUsage({ inputTokens: 75, outputTokens: 25, totalTokens: 100 }));

            const summary = await summaryPromise;

            expect(summary.llmCallCount).toBe(1);
            expect(summary.totalLLMUsage.inputTokens).toBe(75);
        });
    });

    describe('integration', () => {
        it('should work in a realistic streaming execution flow', async () => {
            vi.useFakeTimers();
            const startTime = 1000000;
            vi.setSystemTime(startTime);

            const model = createMockModel();
            mockGenerateText.mockResolvedValue({
                text: 'AI response',
                usage: createMockUsage({ inputTokens: 500, outputTokens: 200, totalTokens: 700 }),
            });

            const fileManager = createMockFileManager();
            (fileManager.upload as ReturnType<typeof vi.fn>).mockResolvedValue([
                {
                    id: 'file-1',
                    uri: 'gs://test/file.pdf',
                    mediaType: 'application/pdf',
                    name: 'file.pdf',
                },
            ]);

            const session = createStreamingSession<TestEvent, string>({
                defaultLanguageModel: model,
                providerType: TEST_PROVIDER_TYPE,
                fileManager,
                startTime,
            });

            const cleanupOrder: string[] = [];

            session.onDone(() => {
                cleanupOrder.push('fileManager.clear');
            });
            session.onDone(() => {
                cleanupOrder.push('database.close');
            });

            vi.advanceTimersByTime(100);
            await session.fileManager.upload([
                { source: 'path', path: '/tmp/doc.pdf', mediaType: 'application/pdf' },
            ]);

            vi.advanceTimersByTime(50);
            const progressEvent = session.emit({ type: 'progress', message: 'Processing...' });

            expect(progressEvent.metrics.elapsedMs).toBe(150);

            vi.advanceTimersByTime(300);
            const result = await session.generateText({ prompt: 'Analyze document' });

            vi.advanceTimersByTime(50);
            const completeEvent = await session.done(result.text);

            expect(completeEvent.type).toBe('complete');
            expect(completeEvent.data).toBe('AI response');
            expect(completeEvent.metrics.elapsedMs).toBe(500);

            const summary = completeEvent.summary as {
                llmCallCount: number;
                totalLLMUsage: { totalTokens: number };
            };
            expect(summary.llmCallCount).toBe(1);
            expect(summary.totalLLMUsage.totalTokens).toBe(700);

            await session.runOnDoneHooks();

            expect(cleanupOrder).toEqual(['database.close', 'fileManager.clear']);
        });
    });

    describe('Logger integration', () => {
        it('should call onExecutionStart when session is created', () => {
            const logger = createMockLogger();

            new StreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
                logger,
            });

            expect(logger.onExecutionStart).toHaveBeenCalledTimes(1);
            expect(logger.onExecutionStart).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'execution_start',
                    timestamp: expect.any(Number),
                })
            );
        });

        it('should call onExecutionEmit when emit() is called', () => {
            const logger = createMockLogger();

            const session = new StreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
                logger,
            });

            const event = session.emit({ type: 'progress', message: 'Working...' });

            expect(logger.onExecutionEmit).toHaveBeenCalledTimes(1);
            expect(logger.onExecutionEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'execution_emit',
                    event,
                })
            );
        });

        it('should call onExecutionDone when done() is called', async () => {
            const logger = createMockLogger();

            const session = new StreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
                logger,
            });

            await session.done('result');

            expect(logger.onExecutionDone).toHaveBeenCalledTimes(1);
            expect(logger.onExecutionDone).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'execution_done',
                    data: 'result',
                    timestamp: expect.any(Number),
                    duration: expect.any(Number),
                    summary: expect.any(Object),
                })
            );
        });

        it('should call onExecutionError when fail() is called', async () => {
            const logger = createMockLogger();

            const session = new StreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
                logger,
            });

            const error = new Error('Test error');
            await session.fail(error, 'partial-result');

            expect(logger.onExecutionError).toHaveBeenCalledTimes(1);
            expect(logger.onExecutionError).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'execution_error',
                    error,
                    data: 'partial-result',
                    timestamp: expect.any(Number),
                    duration: expect.any(Number),
                })
            );
        });

        it('should inherit LLM call logging from SimpleSession', async () => {
            const logger = createMockLogger();
            mockGenerateText.mockResolvedValue({ text: 'response', usage: createMockUsage() });

            const session = new StreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
                logger,
            });

            await session.generateText({ prompt: 'test' });

            expect(logger.onLLMCallStart).toHaveBeenCalledTimes(1);
            expect(logger.onLLMCallEnd).toHaveBeenCalledTimes(1);
        });

        it('should work with createStreamingSession factory', () => {
            const logger = createMockLogger();

            createStreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
                logger,
            });

            expect(logger.onExecutionStart).toHaveBeenCalledTimes(1);
        });
    });

    describe('inheritance', () => {
        it('should extend SimpleSession', () => {
            const session = new StreamingSession<TestEvent, string>({
                defaultLanguageModel: createMockModel(),
                providerType: TEST_PROVIDER_TYPE,
                fileManager: createMockFileManager(),
            });

            expect(typeof session.generateText).toBe('function');
            expect(typeof session.streamText).toBe('function');
            expect(typeof session.onDone).toBe('function');
            expect(typeof session.record).toBe('function');
            expect(typeof session.recordToolCall).toBe('function');
            expect(typeof session.runOnDoneHooks).toBe('function');
            expect(typeof session.getSummary).toBe('function');

            expect(typeof session.emit).toBe('function');
            expect(typeof session.done).toBe('function');
            expect(typeof session.fail).toBe('function');
        });
    });
});
