/**
 * Mock factory functions for AI SDK testing.
 *
 * Provides convenient helpers to create MockLanguageModelV3 instances
 * with predefined responses for unit testing.
 *
 * @example
 * import { generateText } from 'ai';
 * import { mock } from '@agtlantis/core/testing';
 *
 * const result = await generateText({
 *   model: mock.text('Hello, world!'),
 *   prompt: 'Say hello',
 * });
 */
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import {
    MockProvider,
    createMockProvider,
    type MockProviderConfig,
    type ModelFactory,
} from './mock-provider';

type DoGenerateResult = Awaited<ReturnType<MockLanguageModelV3['doGenerate']>>;

export type ResponseOptions = Partial<Omit<DoGenerateResult, 'content'>>;

const DEFAULT_USAGE: DoGenerateResult['usage'] = {
    inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 0, text: 0, reasoning: undefined },
};

const DEFAULT_FINISH: DoGenerateResult['finishReason'] = {
    unified: 'stop',
    raw: undefined,
};

export const mock = {
    /**
     * Creates a MockLanguageModelV3 that returns text content.
     *
     * @param text - The text to return from generateText
     * @param options - Optional overrides for usage, finishReason, etc.
     *
     * @example
     * const model = mock.text('Hello, world!');
     *
     * @example
     * // With custom usage for cost calculation tests
     * const model = mock.text('Hello', {
     *   usage: {
     *     inputTokens: { total: 100 },
     *     outputTokens: { total: 50 },
     *   },
     * });
     */
    text(text: string, options?: ResponseOptions): MockLanguageModelV3 {
        return new MockLanguageModelV3({
            doGenerate: async () => ({
                content: [{ type: 'text', text }],
                finishReason: options?.finishReason ?? DEFAULT_FINISH,
                usage: options?.usage ?? DEFAULT_USAGE,
                warnings: options?.warnings ?? [],
                providerMetadata: options?.providerMetadata,
            }),
        });
    },

    /**
     * Creates a MockLanguageModelV3 that returns JSON content.
     *
     * Automatically stringifies the data. Use with generateObject or
     * generateText + Output.object.
     *
     * @param data - The object to return as JSON
     * @param options - Optional overrides for usage, finishReason, etc.
     *
     * @example
     * const model = mock.json({ name: 'Alice', age: 30 });
     */
    json<T>(data: T, options?: ResponseOptions): MockLanguageModelV3 {
        return mock.text(JSON.stringify(data), options);
    },

    /**
     * Creates a MockLanguageModelV3 that streams text chunks.
     *
     * @param chunks - Array of text strings to stream
     * @param options - Optional overrides for finishReason, usage, etc.
     *
     * @example
     * const model = mock.stream(['Hello', ', ', 'world!']);
     */
    stream(chunks: string[], options?: ResponseOptions): MockLanguageModelV3 {
        return new MockLanguageModelV3({
            doStream: async () => ({
                stream: simulateReadableStream({
                    chunks: [
                        { type: 'text-start', id: 'text-1' },
                        ...chunks.map((chunk) => ({
                            type: 'text-delta' as const,
                            id: 'text-1',
                            delta: chunk,
                        })),
                        { type: 'text-end', id: 'text-1' },
                        {
                            type: 'finish',
                            finishReason: options?.finishReason ?? DEFAULT_FINISH,
                            usage: options?.usage ?? DEFAULT_USAGE,
                            logprobs: undefined,
                        },
                    ],
                }),
            }),
        });
    },

    /**
     * Creates a MockLanguageModelV3 that throws an error.
     *
     * @param error - The error to throw
     *
     * @example
     * const model = mock.error(new Error('Rate limit exceeded'));
     *
     * await expect(generateText({ model, prompt: 'Hi' }))
     *   .rejects.toThrow('Rate limit exceeded');
     */
    error(error: Error): MockLanguageModelV3 {
        return new MockLanguageModelV3({
            doGenerate: async () => {
                throw error;
            },
            doStream: async () => {
                throw error;
            },
        });
    },

    /**
     * Creates a MockProvider with call tracking.
     *
     * Supports three input styles:
     * - Single model: `mock.provider(mock.text('Hello'))`
     * - Model factory: `mock.provider((modelId) => mock.text(modelId))`
     * - Full config: `mock.provider({ model, fileManager, logger })`
     *
     * @example
     * ```typescript
     * // Basic usage
     * const provider = mock.provider(mock.text('Hello!'));
     * const execution = provider.simpleExecution(async (session) => {
     *   const { text } = await session.generateText({ prompt: 'Say hi' });
     *   return text;
     * });
     * expect(await execution.toResult()).toBe('Hello!');
     * expect(provider.getCalls()).toHaveLength(1);
     *
     * // With model factory for different responses per model
     * const provider = mock.provider((modelId) => {
     *   if (modelId === 'gpt-4') return mock.text('GPT-4 response');
     *   return mock.text('Default response');
     * });
     * ```
     */
    provider(configOrModel: MockProviderConfig | MockLanguageModelV3 | ModelFactory): MockProvider {
        return createMockProvider(configOrModel);
    },
};
