import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LanguageModel, LanguageModelUsage } from 'ai';
import type { EventMetrics } from '@/observability';
import type { FileManager } from '@/provider/types';
import { StreamingSession } from '../session/streaming-session';
import { StreamingExecutionHost } from './streaming-host';
import type { SessionStreamGeneratorFn } from './types';
import { ERRORS } from './constants';

vi.mock('ai', () => ({
    generateText: vi.fn(),
    streamText: vi.fn(),
}));

import { generateText, streamText } from 'ai';

const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
const mockStreamText = streamText as ReturnType<typeof vi.fn>;

interface TestEvent {
    type: string;
    metrics: EventMetrics;
    message?: string;
    data?: string;
    summary?: unknown;
    error?: Error;
}

function createMockModel(): LanguageModel {
    return {
        specificationVersion: 'v1',
        provider: 'test-provider',
        modelId: 'test-model',
        defaultObjectGenerationMode: 'json',
        doGenerate: vi.fn(),
        doStream: vi.fn(),
    } as unknown as LanguageModel;
}

function createMockFileManager(): FileManager {
    return {
        upload: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
        getUploadedFiles: vi.fn().mockReturnValue([]),
    };
}

function createMockUsage(overrides: Partial<LanguageModelUsage> = {}): LanguageModelUsage {
    return {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputTokenDetails: {
            noCacheTokens: 100,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {
            textTokens: 50,
            reasoningTokens: 0,
        },
        ...overrides,
    };
}

const TEST_PROVIDER_TYPE = 'google' as const;

function createSessionFactory(): () => StreamingSession<TestEvent, string> {
    return () =>
        new StreamingSession<TestEvent, string>({
            defaultLanguageModel: createMockModel(),
            providerType: TEST_PROVIDER_TYPE,
            fileManager: createMockFileManager(),
        });
}

async function collectEvents<T>(execution: AsyncIterable<T>): Promise<T[]> {
    const events: T[] = [];
    for await (const event of execution) {
        events.push(event);
    }
    return events;
}

async function consumeExecution<T>(execution: AsyncIterable<T>): Promise<void> {
    for await (const _ of execution) {
    }
}

describe('StreamingExecutionHost', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('construction', () => {
        it('should create with session factory and generator', () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'test' });
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            expect(execution).toBeInstanceOf(StreamingExecutionHost);
        });
    });

    describe('session creation', () => {
        it('should create a fresh session when iteration starts', async () => {
            let sessionCount = 0;
            const sessionFactory = () => {
                sessionCount++;
                return new StreamingSession<TestEvent, string>({
                    defaultLanguageModel: createMockModel(),
                    providerType: TEST_PROVIDER_TYPE,
                    fileManager: createMockFileManager(),
                });
            };

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(sessionFactory, generator);

            await consumeExecution(execution);

            expect(sessionCount).toBe(1);
        });

        it('should pass session to generator', async () => {
            let receivedSession: StreamingSession<TestEvent, string> | null = null;

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                receivedSession = session;
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            await consumeExecution(execution);

            expect(receivedSession).toBeInstanceOf(StreamingSession);
        });
    });

    describe('emit', () => {
        it('should yield events emitted by session', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'progress', message: 'Working...' });
                yield session.emit({ type: 'progress', message: 'Almost done...' });
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            expect(events).toHaveLength(3); // 2 progress + 1 complete
            expect(events[0].type).toBe('progress');
            expect(events[0].message).toBe('Working...');
            expect(events[1].type).toBe('progress');
            expect(events[1].message).toBe('Almost done...');
            expect(events[2].type).toBe('complete');
        });

        it('should have metrics on emitted events', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'progress' });
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            expect(events[0].metrics).toBeDefined();
            expect(events[0].metrics.timestamp).toBeGreaterThan(0);
            expect(events[0].metrics.elapsedMs).toBeGreaterThanOrEqual(0);
            expect(events[0].metrics.deltaMs).toBeGreaterThanOrEqual(0);
        });
    });

    describe('done', () => {
        it('should yield complete event with data', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.done('final-result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('complete');
            expect(events[0].data).toBe('final-result');
        });

        it('should await Promise<TEvent> from done()', async () => {
            // This test verifies that the host correctly awaits the Promise
            // returned by session.done()
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                // session.done() returns Promise<TEvent>
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            // If await wasn't working, we'd get [object Promise] or similar
            expect(events[0].type).toBe('complete');
            expect(events[0].data).toBe('result');
        });

        it('should include summary in complete event', async () => {
            mockGenerateText.mockResolvedValue({
                text: 'response',
                usage: createMockUsage({ inputTokens: 200, outputTokens: 100, totalTokens: 300 }),
            });

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                // Make an LLM call to populate summary
                await session.generateText({ prompt: 'test' });
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            const completeEvent = events.find((e) => e.type === 'complete');
            expect(completeEvent?.summary).toBeDefined();

            const summary = completeEvent?.summary as {
                llmCallCount: number;
                totalLLMUsage: { inputTokens: number };
            };
            expect(summary.llmCallCount).toBe(1);
            expect(summary.totalLLMUsage.inputTokens).toBe(200);
        });

        it('should set metadata from complete event', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            await consumeExecution(execution);

            const metadata = await execution.getSummary();

            expect(metadata.totalDuration).toBeGreaterThanOrEqual(0);
        });

        it('should make result available via toResult', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.done('my-result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const result = await execution.toResult();

            expect(result).toBe('my-result');
        });
    });

    describe('fail', () => {
        it('should yield error event with error', async () => {
            const testError = new Error('Test failure');
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.fail(testError);
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('error');
            expect(events[0].error).toBe(testError);
        });

        it('should await Promise<TEvent> from fail()', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.fail(new Error('Error'));
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            expect(events[0].type).toBe('error');
        });

        it('should include partial data in error event when provided', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.fail(new Error('Error'), 'partial-data');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            expect(events[0].type).toBe('error');
            expect(events[0].data).toBe('partial-data');
        });

        it('should throw error when toResult is called after fail', async () => {
            const testError = new Error('Expected failure');
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.fail(testError);
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            await expect(execution.toResult()).rejects.toThrow('Expected failure');
        });
    });

    describe('unhandled exceptions', () => {
        it('should auto-catch and call session.fail()', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* () {
                throw new Error('Unhandled!');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('error');
            expect(events[0].error?.message).toBe('Unhandled!');
        });

        it('should convert non-Error to Error', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* () {
                throw 'string error';
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            expect(events[0].error).toBeInstanceOf(Error);
            expect(events[0].error?.message).toBe('string error');
        });

        it('should set metadata with duration on exception', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* () {
                throw new Error('crash');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            await consumeExecution(execution);

            const metadata = await execution.getSummary();

            expect(metadata.totalDuration).toBeGreaterThanOrEqual(0);
        });
    });

    describe('onDone hooks', () => {
        it('should run session.runOnDoneHooks() on completion', async () => {
            const hookCalled: string[] = [];

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                session.onDone(() => {
                    hookCalled.push('hook1');
                });
                session.onDone(() => {
                    hookCalled.push('hook2');
                });
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            await consumeExecution(execution);

            // Hooks run in LIFO order
            expect(hookCalled).toEqual(['hook2', 'hook1']);
        });

        it('should run session.runOnDoneHooks() on error', async () => {
            const hookCalled: string[] = [];

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                session.onDone(() => {
                    hookCalled.push('cleanup');
                });
                throw new Error('Unhandled error');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            await consumeExecution(execution);

            expect(hookCalled).toEqual(['cleanup']);
        });

        it('should run hooks even on explicit fail()', async () => {
            const hookCalled: string[] = [];

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                session.onDone(() => {
                    hookCalled.push('cleanup');
                });
                return session.fail(new Error('Explicit error'));
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            await consumeExecution(execution);

            expect(hookCalled).toEqual(['cleanup']);
        });
    });

    describe('AsyncIterable protocol', () => {
        it('should work with for await...of', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'one' });
                yield session.emit({ type: 'two' });
                return session.done('done');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);
            const types = events.map((e) => e.type);

            expect(types).toEqual(['one', 'two', 'complete']);
        });

        it('should throw on second consumption', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.done('x');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            await consumeExecution(execution);

            await expect(async () => {
                await consumeExecution(execution);
            }).rejects.toThrow(ERRORS.ALREADY_CONSUMED);
        });
    });

    describe('cancel', () => {
        it('should stop iteration', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'first' });
                yield session.emit({ type: 'second' });
                yield session.emit({ type: 'third' });
                return session.done('complete');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            const events: TestEvent[] = [];
            for await (const event of execution) {
                events.push(event);
                if (event.type === 'first') {
                    execution.cancel();
                }
            }

            expect(events.length).toBeLessThanOrEqual(2);
        });
    });

    describe('cleanup', () => {
        it('should be idempotent', async () => {
            let cleanupCount = 0;
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                session.onDone(() => {
                    cleanupCount++;
                });
                return session.done('x');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            await consumeExecution(execution);

            // onDone hooks already ran during iteration
            // cleanup() should not run them again
            await execution.cleanup();
            await execution.cleanup();
            await execution.cleanup();

            // Hooks run once during iteration, cleanup is idempotent
            expect(cleanupCount).toBe(1);
        });

        it('should support Symbol.asyncDispose', async () => {
            let hookCalled = false;
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                session.onDone(() => {
                    hookCalled = true;
                });
                return session.done('x');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            await consumeExecution(execution);
            await execution[Symbol.asyncDispose]();

            expect(hookCalled).toBe(true);
        });
    });

    describe('getSummary', () => {
        it('should throw if called before completion', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.done('x');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            await expect(execution.getSummary()).rejects.toThrow(ERRORS.METADATA_NOT_AVAILABLE);
        });

        it('should return metadata after completion', async () => {
            mockGenerateText.mockResolvedValue({
                text: 'response',
                usage: createMockUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
            });

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                await session.generateText({ prompt: 'test' });
                return session.done('x');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            await consumeExecution(execution);

            const metadata = await execution.getSummary();

            expect(metadata.totalDuration).toBeGreaterThanOrEqual(0);
            expect(metadata.totalLLMUsage).toBeDefined();
            expect(metadata.totalLLMUsage.inputTokens).toBe(100);
        });
    });

    describe('toResult', () => {
        it('should consume iterator internally if not consumed', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'progress' });
                return session.done('final');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const result = await execution.toResult();

            expect(result).toBe('final');
        });

        it('should throw on failure', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.fail(new Error('Boom'));
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            await expect(execution.toResult()).rejects.toThrow('Boom');
        });

        it('should throw if no result available', async () => {
            const generatorWithoutResult = async function* (session: StreamingSession<TestEvent, string>) {
                yield session.emit({ type: 'only-this' });
            } as SessionStreamGeneratorFn<TestEvent, string>;

            const execution = new StreamingExecutionHost(createSessionFactory(), generatorWithoutResult);

            await expect(execution.toResult()).rejects.toThrow(ERRORS.NO_RESULT);
        });
    });

    describe('cleanup before iteration', () => {
        it('should do nothing if cleanup called before iteration', async () => {
            const hookCalled: string[] = [];
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                session.onDone(() => {
                    hookCalled.push('cleanup');
                });
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            // cleanup before iteration - should not throw, should not run hooks
            await execution.cleanup();
            await execution.cleanup(); // multiple calls safe

            expect(hookCalled).toEqual([]); // hooks never registered since session never created
        });

        it('should still allow iteration after cleanup called before iteration', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            await execution.cleanup(); // cleanup before iteration

            // Should still be able to iterate (cleanup didn't affect consumed state)
            const events = await collectEvents(execution);

            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('complete');
        });
    });

    describe('getSummary after cancel', () => {
        it('should have metadata available after cancel if some events were consumed', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'first' });
                yield session.emit({ type: 'second' });
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            // Consume one event then cancel
            for await (const event of execution) {
                if (event.type === 'first') {
                    execution.cancel();
                    break;
                }
            }

            // Metadata should be available with fallback duration
            const metadata = await execution.getSummary();
            expect(metadata.totalDuration).toBeGreaterThanOrEqual(0);
        });
    });

    describe('session.fail() throwing error', () => {
        it('should propagate error if session.fail() throws', async () => {
            // Create a session that throws on fail()
            const brokenSessionFactory = () => {
                const session = new StreamingSession<TestEvent, string>({
                    defaultLanguageModel: createMockModel(),
                    providerType: TEST_PROVIDER_TYPE,
                    fileManager: createMockFileManager(),
                });
                // Override fail to throw
                session.fail = async () => {
                    throw new Error('fail() is broken');
                };
                return session;
            };

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* () {
                throw new Error('Original error');
            };

            const execution = new StreamingExecutionHost(brokenSessionFactory, generator);

            // session.fail() throwing should propagate the error
            await expect(collectEvents(execution)).rejects.toThrow('fail() is broken');
        });
    });

    describe('edge cases', () => {
        it('should handle generator that returns done immediately without yielding', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.done('instant');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('complete');
            expect(events[0].data).toBe('instant');
        });

        it('should auto-catch exception thrown before first yield', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* () {
                throw new Error('Early crash');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('error');
            expect(events[0].error?.message).toBe('Early crash');
        });

        it('should handle multiple cancel calls safely', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'event' });
                return session.done('done');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            execution.cancel();
            execution.cancel();
            execution.cancel();

            const events = await collectEvents(execution);

            expect(events.length).toBeLessThanOrEqual(2);
        });

        it('should trigger generator finally block on normal completion', async () => {
            let finallyExecuted = false;
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                try {
                    return session.done('x');
                } finally {
                    finallyExecuted = true;
                }
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            await consumeExecution(execution);

            expect(finallyExecuted).toBe(true);
        });
    });

    describe('AI SDK integration', () => {
        it('should allow using session.generateText()', async () => {
            mockGenerateText.mockResolvedValue({
                text: 'AI response',
                usage: createMockUsage(),
            });

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                const result = await session.generateText({ prompt: 'Hello' });
                yield session.emit({ type: 'progress', message: result.text });
                return session.done(result.text);
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            expect(events[0].message).toBe('AI response');
            expect(events[1].data).toBe('AI response');
        });

        it('should allow using session.streamText()', async () => {
            mockStreamText.mockReturnValue({
                textStream: (async function* () {
                    yield 'chunk1';
                    yield 'chunk2';
                })(),
                usage: Promise.resolve(createMockUsage()),
            });

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                const result = session.streamText({ prompt: 'Hello' });
                const chunks: string[] = [];
                for await (const chunk of result.textStream) {
                    chunks.push(chunk);
                }
                return session.done(chunks.join(''));
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const result = await execution.toResult();

            expect(result).toBe('chunk1chunk2');
        });

        it('should allow file management through session', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                // Register cleanup
                session.onDone(() => session.fileManager.clear());

                // Upload files
                const files = await session.fileManager.upload([]);

                yield session.emit({ type: 'progress', message: `Uploaded ${files.length} files` });

                return session.done('complete');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            expect(events[0].message).toBe('Uploaded 0 files');
        });
    });

    describe('signal propagation', () => {
        it('should pass effective signal to session factory', async () => {
            const factorySpy = vi.fn().mockImplementation((signal?: AbortSignal) => {
                return new StreamingSession<TestEvent, string>({
                    defaultLanguageModel: createMockModel(),
                    providerType: TEST_PROVIDER_TYPE,
                    fileManager: createMockFileManager(),
                    signal,
                });
            });

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.done('result');
            };

            const userController = new AbortController();
            const execution = new StreamingExecutionHost(
                factorySpy,
                generator,
                userController.signal
            );

            await consumeExecution(execution);

            // Factory should have been called with a combined signal
            expect(factorySpy).toHaveBeenCalledWith(expect.any(Object));
            const passedSignal = factorySpy.mock.calls[0][0];
            expect(passedSignal).toBeDefined();
            expect(passedSignal).toHaveProperty('aborted');
        });

        it('should pass internal signal when no user signal provided', async () => {
            const factorySpy = vi.fn().mockImplementation((signal?: AbortSignal) => {
                return new StreamingSession<TestEvent, string>({
                    defaultLanguageModel: createMockModel(),
                    providerType: TEST_PROVIDER_TYPE,
                    fileManager: createMockFileManager(),
                    signal,
                });
            });

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(factorySpy, generator);

            await consumeExecution(execution);

            expect(factorySpy).toHaveBeenCalledWith(expect.any(Object));
            const passedSignal = factorySpy.mock.calls[0][0];
            expect(passedSignal).toBeDefined();
        });
    });

    describe('user signal cancellation', () => {
        it('should respect user-provided AbortSignal', async () => {
            const userController = new AbortController();

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'first' });

                // Simulate long operation
                await new Promise((_, reject) => {
                    const timeoutId = setTimeout(() => {}, 10000);
                    if (userController.signal.aborted) {
                        clearTimeout(timeoutId);
                        reject(new DOMException('Aborted by user', 'AbortError'));
                    }
                    userController.signal.addEventListener('abort', () => {
                        clearTimeout(timeoutId);
                        reject(new DOMException('Aborted by user', 'AbortError'));
                    });
                });

                return session.done('result');
            };

            const execution = new StreamingExecutionHost(
                createSessionFactory(),
                generator,
                userController.signal
            );

            const events: TestEvent[] = [];
            for await (const event of execution) {
                events.push(event);
                if (event.type === 'first') {
                    userController.abort();
                }
            }

            // Should exit gracefully without error event (AbortError is handled)
            expect(events.length).toBeLessThanOrEqual(2);
            const hasErrorEvent = events.some((e) => e.type === 'error');
            expect(hasErrorEvent).toBe(false);
        });

        it('should work with already aborted signal', async () => {
            const userController = new AbortController();
            userController.abort(); // Abort before creating execution

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                // Check if already aborted
                if (userController.signal.aborted) {
                    throw new DOMException('Already aborted', 'AbortError');
                }
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(
                createSessionFactory(),
                generator,
                userController.signal
            );

            const events = await collectEvents(execution);

            // Should exit gracefully without error event
            const hasErrorEvent = events.some((e) => e.type === 'error');
            expect(hasErrorEvent).toBe(false);
        });

        it('should allow both cancel() and user signal to trigger abort', async () => {
            const userController = new AbortController();
            let receivedSignal: AbortSignal | undefined;

            const factorySpy = vi.fn().mockImplementation((signal?: AbortSignal) => {
                receivedSignal = signal;
                return new StreamingSession<TestEvent, string>({
                    defaultLanguageModel: createMockModel(),
                    providerType: TEST_PROVIDER_TYPE,
                    fileManager: createMockFileManager(),
                    signal,
                });
            });

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'first' });

                // Wait on the combined signal (passed to session)
                await new Promise((_, reject) => {
                    const timeoutId = setTimeout(() => {}, 10000);
                    const checkAbort = () => {
                        clearTimeout(timeoutId);
                        reject(new DOMException('Aborted', 'AbortError'));
                    };
                    if (receivedSignal?.aborted) {
                        checkAbort();
                    }
                    receivedSignal?.addEventListener('abort', checkAbort);
                });

                return session.done('result');
            };

            const execution = new StreamingExecutionHost(
                factorySpy,
                generator,
                userController.signal
            );

            const events: TestEvent[] = [];
            for await (const event of execution) {
                events.push(event);
                if (event.type === 'first') {
                    // Use internal cancel() - should trigger combined signal
                    execution.cancel();
                }
            }

            // Should exit gracefully
            expect(events.length).toBeLessThanOrEqual(2);
        });
    });

    describe('AbortError handling', () => {
        it('should treat AbortError as normal cancellation', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'progress' });
                throw new DOMException('Aborted', 'AbortError');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            // Should not have error event for AbortError
            expect(events.some((e) => e.type === 'error')).toBe(false);
        });

        it('should have metadata available after AbortError', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'progress' });
                throw new DOMException('Aborted', 'AbortError');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            await consumeExecution(execution);

            const metadata = await execution.getSummary();
            expect(metadata.totalDuration).toBeGreaterThanOrEqual(0);
        });

        it('should distinguish AbortError from other errors', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'progress' });
                throw new Error('Regular error');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            // Regular error should still produce error event
            expect(events.some((e) => e.type === 'error')).toBe(true);
        });

        it('should handle AbortError from signal abort check', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'first' });
                // Simulate signal.aborted being true during iteration
                throw new DOMException('Signal aborted', 'AbortError');
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            // Cancel before iteration starts
            execution.cancel();

            const events = await collectEvents(execution);

            // Should exit gracefully without error event
            expect(events.filter((e) => e.type === 'error').length).toBe(0);
        });
    });

    describe('auto-abort on terminal events', () => {
        it('should abort after complete event (via return)', async () => {
            let signalReceived: AbortSignal | undefined;

            const sessionFactory = (signal?: AbortSignal) => {
                signalReceived = signal;
                return new StreamingSession<TestEvent, string>({
                    defaultLanguageModel: createMockModel(),
                    providerType: TEST_PROVIDER_TYPE,
                    fileManager: createMockFileManager(),
                    signal,
                });
            };

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'progress', message: 'working' });
                return session.done('result');
            };

            const execution = new StreamingExecutionHost(sessionFactory, generator);
            const events = await collectEvents(execution);

            expect(events.map((e) => e.type)).toEqual(['progress', 'complete']);
            // Signal should be aborted after complete event
            expect(signalReceived?.aborted).toBe(true);
        });

        it('should abort after error event (via return)', async () => {
            let signalReceived: AbortSignal | undefined;

            const sessionFactory = (signal?: AbortSignal) => {
                signalReceived = signal;
                return new StreamingSession<TestEvent, string>({
                    defaultLanguageModel: createMockModel(),
                    providerType: TEST_PROVIDER_TYPE,
                    fileManager: createMockFileManager(),
                    signal,
                });
            };

            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'progress', message: 'working' });
                // Throw error to trigger catch block which calls session.fail()
                throw new Error('Something went wrong');
            };

            const execution = new StreamingExecutionHost(sessionFactory, generator);
            const events = await collectEvents(execution);

            expect(events.map((e) => e.type)).toEqual(['progress', 'error']);
            // Signal should be aborted after error event
            expect(signalReceived?.aborted).toBe(true);
        });

        it('should not lose complete event when aborting', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'first' });
                const completeEvent = await session.done('my-result');
                yield completeEvent;
                // This yield should not be reached due to auto-abort
                yield session.emit({ type: 'should-not-reach' });
                return completeEvent;
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            // Complete event should be yielded before abort
            expect(events.some((e) => e.type === 'complete')).toBe(true);
            expect(events.some((e) => e.type === 'should-not-reach')).toBe(false);

            // Result should be accessible via getSummary (not toResult which re-iterates)
            const summary = await execution.getSummary();
            expect(summary).toBeDefined();
        });

        it('should extract result and metadata from yielded complete event', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                const completeEvent = await session.done('extracted-result');
                yield completeEvent;
                return completeEvent;
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);

            // Collect events and check the complete event has correct data
            const events = await collectEvents(execution);
            const completeEvent = events.find((e) => e.type === 'complete');

            expect(completeEvent).toBeDefined();
            expect((completeEvent as TestEvent & { data: string }).data).toBe('extracted-result');

            // Summary should be available after iteration
            const summary = await execution.getSummary();
            expect(summary).toBeDefined();
        });

        it('should stop yielding events after terminal event', async () => {
            const generator: SessionStreamGeneratorFn<TestEvent, string> = async function* (
                session
            ) {
                yield session.emit({ type: 'progress' });
                const completeEvent = await session.done('result');
                yield completeEvent;
                // These yields should not be collected due to auto-abort + break
                yield session.emit({ type: 'after-done-1' });
                yield session.emit({ type: 'after-done-2' });
                return completeEvent;
            };

            const execution = new StreamingExecutionHost(createSessionFactory(), generator);
            const events = await collectEvents(execution);

            // Only progress and complete should be collected
            expect(events.map((e) => e.type)).toEqual(['progress', 'complete']);
            expect(events.some((e) => e.type === 'after-done-1')).toBe(false);
            expect(events.some((e) => e.type === 'after-done-2')).toBe(false);
        });
    });
});
