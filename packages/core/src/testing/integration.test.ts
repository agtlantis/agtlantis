import { describe, expect, it, vi } from 'vitest';
import type { EventMetrics } from '@/observability';
import { mock } from './mock';

interface ProgressEvent {
    type: 'progress';
    message: string;
    metrics: EventMetrics;
}

interface CompleteEvent {
    type: 'complete';
    data: string;
    metrics: EventMetrics;
}

type TestEvent = ProgressEvent | CompleteEvent;

describe('Multi-Model Integration', () => {
    it('should track calls to different models in sequence', async () => {
        const provider = mock.provider((modelId) => {
            if (modelId === 'gpt-4') return mock.text('GPT-4 response');
            if (modelId === 'claude') return mock.text('Claude response');
            return mock.text('Default response');
        });

        const execution = provider.simpleExecution(async (session) => {
            const gpt4 = await session.generateText({
                model: 'gpt-4',
                prompt: 'Hello GPT-4',
            });
            const claude = await session.generateText({
                model: 'claude',
                prompt: 'Hello Claude',
            });
            return { gpt4: gpt4.text, claude: claude.text };
        });

        const result = await execution.result();
        expect(result.status).toBe('succeeded');
        if (result.status === 'succeeded') {
            expect(result.value.gpt4).toBe('GPT-4 response');
            expect(result.value.claude).toBe('Claude response');
        }

        const calls = provider.getCalls();
        expect(calls).toHaveLength(2);
        expect(calls[0]!.modelId).toBe('gpt-4');
        expect(calls[0]!.type).toBe('generate');
        expect(calls[1]!.modelId).toBe('claude');
        expect(calls[1]!.type).toBe('generate');
    });

    it('should accumulate usage across multiple model calls', async () => {
        const provider = mock.provider((modelId) => {
            if (modelId === 'expensive') {
                return mock.text('Expensive result', {
                    usage: {
                        inputTokens: {
                            total: 1000,
                            noCache: 1000,
                            cacheRead: undefined,
                            cacheWrite: undefined,
                        },
                        outputTokens: { total: 500, text: 500, reasoning: undefined },
                    },
                });
            }
            return mock.text('Cheap result', {
                usage: {
                    inputTokens: {
                        total: 100,
                        noCache: 100,
                        cacheRead: undefined,
                        cacheWrite: undefined,
                    },
                    outputTokens: { total: 50, text: 50, reasoning: undefined },
                },
            });
        });

        const execution = provider.simpleExecution(async (session) => {
            await session.generateText({
                model: 'expensive',
                prompt: 'Expensive query',
            });
            await session.generateText({
                model: 'cheap',
                prompt: 'Cheap query',
            });
            return 'done';
        });

        const result = await execution.result();
        expect(result.summary.totalLLMUsage.inputTokens).toBe(1100);
        expect(result.summary.totalLLMUsage.outputTokens).toBe(550);
    });

    it('should support default model with override per call', async () => {
        const provider = mock
            .provider((modelId) => mock.text(`Response from ${modelId}`))
            .withDefaultModel('gpt-3.5');

        const execution = provider.simpleExecution(async (session) => {
            const defaultResult = await session.generateText({ prompt: 'Use default' });
            const overrideResult = await session.generateText({
                model: 'gpt-4-turbo',
                prompt: 'Use override',
            });
            return { default: defaultResult.text, override: overrideResult.text };
        });

        const result = await execution.result();
        expect(result.status).toBe('succeeded');
        if (result.status === 'succeeded') {
            expect(result.value.default).toBe('Response from gpt-3.5');
            expect(result.value.override).toBe('Response from gpt-4-turbo');
        }

        const calls = provider.getCalls();
        expect(calls).toHaveLength(2);
        expect(calls[0]!.modelId).toBe('gpt-3.5');
        expect(calls[1]!.modelId).toBe('gpt-4-turbo');
    });
});

describe('Error Recovery Integration', () => {
    it('should track calls made before error occurred', async () => {
        const provider = mock.provider((modelId) => {
            if (modelId === 'failing-model') {
                return mock.error(new Error('Second call failed'));
            }
            return mock.text(`Success from ${modelId}`);
        });

        const execution = provider.simpleExecution(async (session) => {
            await session.generateText({ model: 'model-1', prompt: 'First' });
            await session.generateText({ model: 'failing-model', prompt: 'Second' });
            await session.generateText({ model: 'model-3', prompt: 'Third' });
            return 'done';
        });

        const result = await execution.result();
        expect(result.status).toBe('failed');
        if (result.status === 'failed') {
            expect(result.error.message).toBe('Second call failed');
        }

        const calls = provider.getCalls();
        expect(calls).toHaveLength(2);
        expect(calls[0]!.modelId).toBe('model-1');
        expect(calls[1]!.modelId).toBe('failing-model');
    });

    it('should execute onDone hooks even when LLM call fails', async () => {
        const provider = mock.provider(mock.error(new Error('LLM error')));
        const cleanupFn = vi.fn();

        const execution = provider.simpleExecution(async (session) => {
            session.onDone(cleanupFn);
            await session.generateText({ prompt: 'This will fail' });
            return 'never reached';
        });

        await execution.result();

        expect(cleanupFn).toHaveBeenCalledTimes(1);
    });

    it('should preserve call params for debugging failed requests', async () => {
        const provider = mock.provider(mock.error(new Error('API Error')));

        const execution = provider.simpleExecution(async (session) => {
            await session.generateText({
                prompt: 'Debug this prompt',
                system: 'You are a helpful assistant',
            });
            return 'never reached';
        });

        await execution.result();

        const calls = provider.getCalls();
        expect(calls).toHaveLength(1);
        expect(calls[0]!.params).toBeDefined();

        const params = calls[0]!.params as { prompt?: unknown };
        expect(params.prompt).toBeDefined();
    });
});

describe('Provider Configuration Integration', () => {
    it('should share call tracking across fluent API chain', async () => {
        const baseProvider = mock.provider(mock.text('Hello'));
        const configuredProvider = baseProvider.withDefaultModel('gpt-4');

        const execution = configuredProvider.simpleExecution(async (session) => {
            await session.generateText({ prompt: 'Test' });
            return 'done';
        });
        await execution.result();

        expect(baseProvider.getCalls()).toHaveLength(1);
        expect(configuredProvider.getCalls()).toHaveLength(1);
        expect(baseProvider.getCalls()[0]).toBe(configuredProvider.getCalls()[0]);
    });

    it('should apply logger configuration', async () => {
        const logEvents: string[] = [];
        const logger = {
            debug: vi.fn(),
            info: (msg: string) => logEvents.push(`info: ${msg}`),
            warn: vi.fn(),
            error: vi.fn(),
            onLLMCallStart: () => logEvents.push('llm:start'),
            onLLMCallEnd: () => logEvents.push('llm:end'),
            onExecutionStart: () => logEvents.push('exec:start'),
            onExecutionComplete: () => logEvents.push('exec:complete'),
            onExecutionError: vi.fn(),
            onProgressEvent: () => logEvents.push('progress'),
        };

        const provider = mock.provider(mock.text('Logged response')).withLogger(logger);

        const execution = provider.simpleExecution(async (session) => {
            await session.generateText({ prompt: 'Log this' });
            return 'done';
        });
        await execution.result();

        expect(logEvents).toContain('llm:start');
        expect(logEvents).toContain('llm:end');
    });
});

describe('Streaming Lifecycle Integration', () => {
    it('should emit progress events while tracking calls', async () => {
        const provider = mock.provider(mock.text('Final answer'));
        const emittedEvents: TestEvent[] = [];

        const execution = provider.streamingExecution<TestEvent, string>(async function* (session) {
            yield session.emit({
                type: 'progress',
                message: 'Starting...',
            } as ProgressEvent);

            const { text } = await session.generateText({ prompt: 'Generate' });

            yield session.emit({
                type: 'progress',
                message: 'LLM call complete',
            } as ProgressEvent);

            return session.done(text);
        });

        for await (const event of execution.stream()) {
            emittedEvents.push(event);
        }

        expect(emittedEvents).toHaveLength(3);
        expect(emittedEvents[0]!.type).toBe('progress');
        expect(emittedEvents[1]!.type).toBe('progress');
        expect(emittedEvents[2]!.type).toBe('complete');

        expect(provider.getCalls()).toHaveLength(1);
        const completeEvent = emittedEvents[2] as CompleteEvent;
        expect(completeEvent.data).toBe('Final answer');
    });

    it('should execute onDone hooks after streaming completes', async () => {
        const provider = mock.provider(mock.text('Done'));
        const hookOrder: string[] = [];

        const execution = provider.streamingExecution<TestEvent, string>(async function* (session) {
            session.onDone(() => {
                hookOrder.push('hook1');
            });
            session.onDone(() => {
                hookOrder.push('hook2');
            });

            yield session.emit({ type: 'progress', message: 'Working' } as ProgressEvent);
            hookOrder.push('after-emit');

            await session.generateText({ prompt: 'Test' });

            return session.done('result');
        });

        for await (const _event of execution.stream()) {
            // drain the iterator
        }

        expect(hookOrder).toEqual(['after-emit', 'hook2', 'hook1']);
    });

    it('should provide complete summary after stream consumption', async () => {
        const provider = mock.provider(
            mock.text('Answer', {
                usage: {
                    inputTokens: {
                        total: 50,
                        noCache: 50,
                        cacheRead: undefined,
                        cacheWrite: undefined,
                    },
                    outputTokens: { total: 25, text: 25, reasoning: undefined },
                },
            })
        );

        const execution = provider.streamingExecution<TestEvent, string>(async function* (session) {
            yield session.emit({ type: 'progress', message: 'Step 1' } as ProgressEvent);
            await session.generateText({ prompt: 'Query' });
            yield session.emit({ type: 'progress', message: 'Step 2' } as ProgressEvent);
            return session.done('final');
        });

        for await (const _event of execution.stream()) {
            // drain the iterator
        }

        const result = await execution.result();
        expect(result.summary.totalLLMUsage.inputTokens).toBe(50);
        expect(result.summary.totalLLMUsage.outputTokens).toBe(25);
        expect(result.summary.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it('should track streaming LLM calls with mock.stream()', async () => {
        const provider = mock.provider(mock.stream(['Hello', ', ', 'world', '!']));

        const execution = provider.simpleExecution(async (session) => {
            const result = await session.streamText({ prompt: 'Stream test' });
            let text = '';
            for await (const chunk of result.textStream) {
                text += chunk;
            }
            return text;
        });

        const result = await execution.result();
        expect(result.status).toBe('succeeded');
        if (result.status === 'succeeded') {
            expect(result.value).toBe('Hello, world!');
        }
        expect(provider.getCalls()).toHaveLength(1);
        expect(provider.getCalls()[0]!.type).toBe('stream');
    });
});
