import { describe, it, expect, vi } from 'vitest';
import { mock } from './mock';
import { MockProvider, createMockProvider } from './mock-provider';
import { collectEvents } from './helpers';
import type { TestEvent } from './fixtures';

describe('MockProvider', () => {
    describe('simpleExecution', () => {
        it('should execute with mock text response', async () => {
            const provider = mock.provider(mock.text('Hello, world!'));

            const execution = provider.simpleExecution(async (session) => {
                const result = await session.generateText({ prompt: 'Say hello' });
                return result.text;
            });

            expect(await execution.toResult()).toBe('Hello, world!');
        });

        it('should execute with mock json response', async () => {
            const provider = mock.provider(mock.json({ name: 'Alice', age: 30 }));

            const execution = provider.simpleExecution(async (session) => {
                const result = await session.generateText({ prompt: 'Get user' });
                return JSON.parse(result.text);
            });

            expect(await execution.toResult()).toEqual({ name: 'Alice', age: 30 });
        });

        it('should throw on mock error', async () => {
            const provider = mock.provider(mock.error(new Error('API Error')));

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'Test' });
            });

            await expect(execution.toResult()).rejects.toThrow('API Error');
        });
    });

    describe('streamingExecution', () => {
        it('should execute streaming with mock stream response', async () => {
            const provider = mock.provider(mock.stream(['Hello', ', ', 'world!']));

            const execution = provider.streamingExecution<TestEvent, string>(
                async function* (session) {
                    const result = session.streamText({ prompt: 'Say hello' });
                    let text = '';
                    for await (const chunk of result.textStream) {
                        text += chunk;
                    }
                    return session.done(text);
                }
            );

            const events = await collectEvents(execution);
            const completeEvent = events.find((e) => e.type === 'complete');
            expect(completeEvent?.data).toBe('Hello, world!');
        });

        it('should emit intermediate events', async () => {
            const provider = mock.provider(mock.text('Done!'));

            const execution = provider.streamingExecution<TestEvent, string>(
                async function* (session) {
                    yield session.emit({ type: 'progress', data: 'Working...' });
                    await session.generateText({ prompt: 'Test' });
                    return session.done('Completed');
                }
            );

            const events = await collectEvents(execution);
            const progressEvents = events.filter((e) => e.type === 'progress');
            expect(progressEvents).toHaveLength(1);
            expect(progressEvents[0].data).toBe('Working...');
        });
    });

    describe('getCalls()', () => {
        it('should track single generateText call', async () => {
            const provider = mock.provider(mock.text('Response'));

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'Test prompt' });
            });
            await execution.toResult();

            const calls = provider.getCalls();
            expect(calls).toHaveLength(1);
            expect(calls[0].type).toBe('generate');
            expect(calls[0].modelId).toBe('default');
            expect(calls[0].timestamp).toBeGreaterThan(0);
        });

        it('should track multiple calls', async () => {
            const provider = mock.provider(mock.text('Response'));

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'First' });
                await session.generateText({ prompt: 'Second' });
                await session.generateText({ prompt: 'Third' });
            });
            await execution.toResult();

            expect(provider.getCalls()).toHaveLength(3);
        });

        it('should track streamText calls', async () => {
            const provider = mock.provider(mock.stream(['Hello']));

            const execution = provider.streamingExecution<TestEvent, string>(
                async function* (session) {
                    const result = session.streamText({ prompt: 'Test' });
                    for await (const _ of result.textStream) {
                        // consume stream
                    }
                    return session.done('done');
                }
            );

            await collectEvents(execution);

            const calls = provider.getCalls();
            expect(calls).toHaveLength(1);
            expect(calls[0].type).toBe('stream');
        });

        it('should return a copy of calls array', async () => {
            const provider = mock.provider(mock.text('Response'));

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'Test' });
            });
            await execution.toResult();

            const calls1 = provider.getCalls();
            const calls2 = provider.getCalls();
            expect(calls1).not.toBe(calls2);
            expect(calls1).toEqual(calls2);
        });

        it('should record prompt content in params', async () => {
            const provider = mock.provider(mock.text('Response'));

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'What is the meaning of life?' });
            });
            await execution.toResult();

            const calls = provider.getCalls();
            expect(calls).toHaveLength(1);

            const params = calls[0].params as { prompt: Array<{ role: string; content: unknown }> };
            expect(params.prompt).toBeDefined();
            expect(params.prompt[0].role).toBe('user');
        });

        it('should record system prompt in params', async () => {
            const provider = mock.provider(mock.text('Response'));

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({
                    system: 'You are a helpful assistant.',
                    prompt: 'Hello',
                });
            });
            await execution.toResult();

            const calls = provider.getCalls();
            const params = calls[0].params as {
                prompt: Array<{ role: string; content: unknown }>;
            };

            const systemMessage = params.prompt.find((m) => m.role === 'system');
            expect(systemMessage).toBeDefined();
            expect(systemMessage?.content).toContain('You are a helpful assistant.');
        });

        it('should track call even when error occurs', async () => {
            const provider = mock.provider(mock.error(new Error('API Error')));

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'This will fail' });
            });

            try {
                await execution.toResult();
            } catch {
                // Expected to throw
            }

            const calls = provider.getCalls();
            expect(calls).toHaveLength(1);
            expect(calls[0].type).toBe('generate');
        });

        it('should track multiple calls before error', async () => {
            let callCount = 0;
            const factory = () => {
                callCount++;
                if (callCount === 2) {
                    return mock.error(new Error('Second call fails'));
                }
                return mock.text('Success');
            };

            const provider = mock.provider(factory);

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'First' });
                await session.generateText({ prompt: 'Second - will fail' });
            });

            try {
                await execution.toResult();
            } catch {
                // Expected to throw
            }

            const calls = provider.getCalls();
            expect(calls).toHaveLength(2);
            expect(calls[0].modelId).toBe('default');
            expect(calls[1].modelId).toBe('default');
        });
    });

    describe('clearCalls()', () => {
        it('should clear all tracked calls', async () => {
            const provider = mock.provider(mock.text('Response'));

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'Test' });
            });
            await execution.toResult();

            expect(provider.getCalls()).toHaveLength(1);

            provider.clearCalls();

            expect(provider.getCalls()).toHaveLength(0);
        });
    });

    describe('model factory mode', () => {
        it('should use factory to create different models per call', async () => {
            const factory = vi.fn((modelId: string) => {
                if (modelId === 'gpt-4') {
                    return mock.text('GPT-4 response');
                }
                return mock.text('Default response');
            });

            const provider = mock.provider(factory);

            const execution = provider.simpleExecution(async (session) => {
                const result1 = await session.generateText({ model: 'gpt-4', prompt: 'Test' });
                const result2 = await session.generateText({ model: 'other', prompt: 'Test' });
                return { r1: result1.text, r2: result2.text };
            });
            await execution.toResult();

            expect(factory).toHaveBeenCalledWith('gpt-4');
            expect(factory).toHaveBeenCalledWith('other');

            const calls = provider.getCalls();
            expect(calls).toHaveLength(2);
            expect(calls[0].modelId).toBe('gpt-4');
            expect(calls[1].modelId).toBe('other');
        });
    });

    describe('fluent API', () => {
        it('should support withDefaultModel', async () => {
            const provider = mock
                .provider(mock.text('Response'))
                .withDefaultModel('gemini-2.5-flash');

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'Test' });
            });
            await execution.toResult();

            const calls = provider.getCalls();
            expect(calls).toHaveLength(1);
            expect(calls[0].modelId).toBe('gemini-2.5-flash');
        });

        it('should support withLogger', () => {
            const mockLogger = {
                log: vi.fn(),
                error: vi.fn(),
                warn: vi.fn(),
                info: vi.fn(),
                debug: vi.fn(),
            };

            const provider = mock.provider(mock.text('Response')).withLogger(mockLogger);

            expect(provider).toBeDefined();
        });

        it('should support withPricing', () => {
            const provider = mock.provider(mock.text('Response')).withPricing({
                'test-model': {
                    inputPricePerMillion: 1.0,
                    outputPricePerMillion: 2.0,
                },
            });

            expect(provider).toBeDefined();
        });

        it('should share call tracking across fluent API calls', async () => {
            const baseProvider = mock.provider(mock.text('Response'));
            const configuredProvider = baseProvider.withDefaultModel('test-model').withLogger({});

            const execution = configuredProvider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'Test' });
            });
            await execution.toResult();

            expect(baseProvider.getCalls()).toHaveLength(1);
            expect(configuredProvider.getCalls()).toHaveLength(1);
        });
    });

    describe('createMockProvider factory', () => {
        it('should create provider from MockLanguageModelV3', () => {
            const provider = createMockProvider(mock.text('Hello'));
            expect(provider).toBeInstanceOf(MockProvider);
        });

        it('should create provider from model factory', () => {
            const provider = createMockProvider(() => mock.text('Hello'));
            expect(provider).toBeInstanceOf(MockProvider);
        });

        it('should create provider from config object', () => {
            const provider = createMockProvider({
                model: mock.text('Hello'),
            });
            expect(provider).toBeInstanceOf(MockProvider);
        });

        it('should throw if neither model nor modelFactory provided', () => {
            expect(() => createMockProvider({} as any)).toThrow(
                'MockProvider requires either model or modelFactory'
            );
        });
    });

    describe('mock.provider() integration', () => {
        it('should work with mock.text()', async () => {
            const provider = mock.provider(mock.text('Test response'));

            const execution = provider.simpleExecution(async (session) => {
                return (await session.generateText({ prompt: 'Test' })).text;
            });

            expect(await execution.toResult()).toBe('Test response');
        });

        it('should work with mock.json()', async () => {
            const data = { items: [1, 2, 3], total: 3 };
            const provider = mock.provider(mock.json(data));

            const execution = provider.simpleExecution(async (session) => {
                const result = await session.generateText({ prompt: 'Get items' });
                return JSON.parse(result.text);
            });

            expect(await execution.toResult()).toEqual(data);
        });

        it('should work with mock.stream()', async () => {
            const provider = mock.provider(mock.stream(['a', 'b', 'c']));

            const execution = provider.streamingExecution<TestEvent, string>(
                async function* (session) {
                    const result = session.streamText({ prompt: 'Test' });
                    const chunks: string[] = [];
                    for await (const chunk of result.textStream) {
                        chunks.push(chunk);
                    }
                    return session.done(chunks.join(''));
                }
            );

            const events = await collectEvents(execution);
            const completeEvent = events.find((e) => e.type === 'complete');
            expect(completeEvent?.data).toBe('abc');
        });

        it('should work with mock.error()', async () => {
            const provider = mock.provider(mock.error(new Error('Test error')));

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'Test' });
            });

            await expect(execution.toResult()).rejects.toThrow('Test error');
        });
    });
});
