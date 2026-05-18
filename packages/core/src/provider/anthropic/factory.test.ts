import { readFile } from 'node:fs/promises';

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnthropicFileManager } from './file-manager.js';
import { createAnthropicProvider } from './factory.js';

const mockModel = { modelId: 'claude-sonnet-4-6' };
const mockAnthropicFn = vi.fn().mockReturnValue(mockModel);

vi.mock('@ai-sdk/anthropic', () => ({
    anthropic: {
        tools: {
            webSearch_20250305: vi.fn().mockImplementation((options: unknown) => ({
                type: 'provider-defined',
                id: 'anthropic.web_search_20250305',
                args: options,
            })),
        },
    },
    createAnthropic: vi.fn().mockImplementation(() => mockAnthropicFn),
}));

vi.mock('./file-manager.js', () => ({
    ANTHROPIC_FILES_API_BETA: 'files-api-2025-04-14',
    AnthropicFileManager: vi.fn(function () {
        return {
            upload: vi.fn(),
            delete: vi.fn(),
            clear: vi.fn(),
            getUploadedFiles: vi.fn().mockReturnValue([]),
        };
    }),
}));

vi.mock('ai', () => ({
    generateText: vi.fn().mockImplementation(async (params: { output?: { responseFormat: PromiseLike<unknown> } }) => {
        if (params.output) {
            await params.output.responseFormat;
        }

        return {
            text: 'test response',
            usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        };
    }),
    streamText: vi.fn().mockImplementation((params: { output?: { responseFormat: PromiseLike<unknown> } }) => ({
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 20, totalTokens: 30 }),
        textStream: (async function* () {
            yield 'test';
        })(),
        output: params.output
            ? Promise.resolve(params.output.responseFormat).then(() => undefined)
            : Promise.resolve(undefined),
    })),
}));

function createJSONOutput(schema: unknown) {
    return {
        responseFormat: Promise.resolve({ type: 'json', schema }),
        parseCompleteOutput: vi.fn(),
        parsePartialOutput: vi.fn(),
    };
}

async function runGenerateText(provider: ReturnType<typeof createAnthropicProvider>): Promise<void> {
    const execution = provider.simpleExecution(async (session) => {
        await session.generateText({ prompt: 'Hello' });
        return 'ok';
    });

    const result = await execution.result();
    expect(result.status).toBe('succeeded');
}

describe('createAnthropicProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAnthropicFn.mockReturnValue(mockModel);
    });

    describe('fluent API', () => {
        it('creates provider and allows fluent configuration', () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('claude-sonnet-4-6')
                .withLogger({});

            expect(provider).toBeDefined();
            expect(provider.withDefaultModel).toBeTypeOf('function');
            expect(provider.withLogger).toBeTypeOf('function');
            expect(provider.withDefaultOptions).toBeTypeOf('function');
            expect(provider.withReasoningEffort).toBeTypeOf('function');
            expect(provider.withReasoningBudget).toBeTypeOf('function');
            expect(provider.withAdaptiveReasoning).toBeTypeOf('function');
            expect(provider.withSendReasoning).toBeTypeOf('function');
            expect(provider.streamingExecution).toBeTypeOf('function');
            expect(provider.simpleExecution).toBeTypeOf('function');
        });

        it('returns new instances from fluent methods', () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' });

            expect(provider.withDefaultModel('claude-sonnet-4-6')).not.toBe(provider);
            expect(provider.withLogger({})).not.toBe(provider);
            expect(provider.withDefaultOptions({ sendReasoning: true })).not.toBe(provider);
            expect(provider.withDefaultGenerationOptions({ maxOutputTokens: 1024 })).not.toBe(provider);
            expect(provider.withFileCache()).not.toBe(provider);
            expect(provider.withWebSearch({ maxUses: 1 })).not.toBe(provider);
            expect(provider.withReasoningEffort('high')).not.toBe(provider);
            expect(provider.withReasoningBudget(1024)).not.toBe(provider);
            expect(provider.withAdaptiveReasoning()).not.toBe(provider);
            expect(provider.withSendReasoning(false)).not.toBe(provider);
        });

        it('validates Anthropic pricing overrides', () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' });

            expect(() =>
                provider.withPricing({
                    'claude-sonnet-4-6': {
                        inputPricePerMillion: -1,
                        outputPricePerMillion: 15,
                    },
                })
            ).toThrow('anthropic/claude-sonnet-4-6: inputPricePerMillion cannot be negative');
        });
    });

    describe('session defaults', () => {
        it('injects structuredOutputMode=outputFormat by default', async () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'claude-sonnet-4-6'
            );

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'Hello' });
                return 'ok';
            });

            const result = await execution.result();

            expect(result.status).toBe('succeeded');
            expect(generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerOptions: {
                        anthropic: { structuredOutputMode: 'outputFormat' },
                    },
                })
            );
        });

        it('lets per-call providerOptions override structuredOutputMode to jsonTool fallback', async () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'claude-sonnet-4-6'
            );

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({
                    prompt: 'Hello',
                    providerOptions: {
                        anthropic: { structuredOutputMode: 'jsonTool' },
                    },
                });
                return 'ok';
            });

            const result = await execution.result();

            expect(result.status).toBe('succeeded');
            expect(generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerOptions: {
                        anthropic: { structuredOutputMode: 'jsonTool' },
                    },
                })
            );
        });

        it('preserves explicit default options while applying outputFormat default', async () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('claude-sonnet-4-6')
                .withDefaultOptions({
                    thinking: { type: 'enabled', budgetTokens: 1024 },
                    sendReasoning: true,
                });

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({ prompt: 'Hello' });
                return 'ok';
            });

            const result = await execution.result();

            expect(result.status).toBe('succeeded');
            expect(generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerOptions: {
                        anthropic: {
                            structuredOutputMode: 'outputFormat',
                            thinking: { type: 'enabled', budgetTokens: 1024 },
                            sendReasoning: true,
                        },
                    },
                })
            );
        });

        it('passes provider-level web search through default tools', async () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('claude-sonnet-4-6')
                .withWebSearch({ maxUses: 1 });

            await runGenerateText(provider);

            expect(generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    tools: expect.objectContaining({
                        web_search: expect.objectContaining({
                            id: 'anthropic.web_search_20250305',
                            args: { maxUses: 1 },
                        }),
                    }),
                })
            );
        });

        it('withReasoningEffort sets effort and sendReasoning while preserving default options', async () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('claude-sonnet-4-6')
                .withDefaultOptions({ speed: 'fast' })
                .withReasoningEffort('high');

            await runGenerateText(provider);

            expect(generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerOptions: {
                        anthropic: {
                            structuredOutputMode: 'outputFormat',
                            speed: 'fast',
                            effort: 'high',
                            sendReasoning: true,
                        },
                    },
                })
            );
        });

        it('withReasoningBudget enables thinking with a budget and sendReasoning', async () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('claude-sonnet-4-6')
                .withReasoningBudget(1024);

            await runGenerateText(provider);

            expect(generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerOptions: {
                        anthropic: {
                            structuredOutputMode: 'outputFormat',
                            thinking: { type: 'enabled', budgetTokens: 1024 },
                            sendReasoning: true,
                        },
                    },
                })
            );
        });

        it('withAdaptiveReasoning enables adaptive thinking and sendReasoning', async () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('claude-sonnet-4-6')
                .withAdaptiveReasoning();

            await runGenerateText(provider);

            expect(generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerOptions: {
                        anthropic: {
                            structuredOutputMode: 'outputFormat',
                            thinking: { type: 'adaptive' },
                            sendReasoning: true,
                        },
                    },
                })
            );
        });

        it('withSendReasoning can override reasoning helpers without clearing thinking', async () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('claude-sonnet-4-6')
                .withReasoningBudget(1024)
                .withSendReasoning(false);

            await runGenerateText(provider);

            expect(generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerOptions: {
                        anthropic: {
                            structuredOutputMode: 'outputFormat',
                            thinking: { type: 'enabled', budgetTokens: 1024 },
                            sendReasoning: false,
                        },
                    },
                })
            );
        });

        it('lets later thinking helpers win when chained', async () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('claude-sonnet-4-6')
                .withReasoningBudget(1024)
                .withAdaptiveReasoning();

            await runGenerateText(provider);

            expect(generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerOptions: {
                        anthropic: {
                            structuredOutputMode: 'outputFormat',
                            thinking: { type: 'adaptive' },
                            sendReasoning: true,
                        },
                    },
                })
            );
        });

        it('lets withSendReasoning win after withReasoningEffort', async () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('claude-sonnet-4-6')
                .withReasoningEffort('high')
                .withSendReasoning(false);

            await runGenerateText(provider);

            expect(generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerOptions: {
                        anthropic: {
                            structuredOutputMode: 'outputFormat',
                            effort: 'high',
                            sendReasoning: false,
                        },
                    },
                })
            );
        });
    });

    describe('Anthropic integration plumbing', () => {
        it('passes base config to @ai-sdk/anthropic and uses AnthropicFileManager', async () => {
            const fetchImpl = vi.fn() as unknown as typeof fetch;
            const provider = createAnthropicProvider({
                apiKey: 'test-api-key',
                baseURL: 'https://anthropic.example.test/v1',
                headers: { 'x-test': 'yes' },
                fetch: fetchImpl,
            }).withDefaultModel('claude-sonnet-4-6');

            const execution = provider.simpleExecution(async () => 'ok');
            await execution.result();

            expect(createAnthropic).toHaveBeenCalledWith(
                expect.objectContaining({
                    apiKey: 'test-api-key',
                    baseURL: 'https://anthropic.example.test/v1',
                    headers: { 'x-test': 'yes' },
                    fetch: expect.any(Function),
                })
            );
            expect(AnthropicFileManager).toHaveBeenCalledWith(
                'test-api-key',
                expect.objectContaining({
                    baseURL: 'https://anthropic.example.test/v1',
                    filesBeta: 'files-api-2025-04-14',
                    fetch: fetchImpl,
                })
            );
        });

        // Detailed schema rejection cases live in `schema-validator.test.ts`.
        // These tests only verify that the factory wires the guard into both
        // session entry points and that guard failures surface as execution
        // failures.

        it('routes guard rejection through to execution failure on generateText', async () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'claude-sonnet-4-6'
            );

            const execution = provider.simpleExecution(async (session) => {
                await session.generateText({
                    prompt: 'Hello',
                    output: createJSONOutput({
                        oneOf: [
                            { type: 'object', properties: { kind: { const: 'a' } } },
                            { type: 'object', properties: { kind: { const: 'b' } } },
                        ],
                    }),
                });
            });

            const result = await execution.result();
            expect(result.status).toBe('failed');
        });

        it('wires the guard into streamText', async () => {
            const provider = createAnthropicProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'claude-sonnet-4-6'
            );

            const execution = provider.simpleExecution(async (session) => {
                const result = session.streamText({
                    prompt: 'Hello',
                    output: createJSONOutput({ type: 'object', properties: { ok: { type: 'boolean' } } }),
                });
                await result.output;
                return 'ok';
            });

            const result = await execution.result();
            expect(result.status).toBe('succeeded');
            expect(streamText).toHaveBeenCalledWith(
                expect.objectContaining({
                    output: expect.objectContaining({
                        responseFormat: expect.any(Promise),
                    }),
                })
            );
        });
    });

    describe('package metadata', () => {
        it('keeps @ai-sdk/anthropic as an optional peer dependency', async () => {
            const packageJSON = JSON.parse(
                await readFile(new URL('../../../package.json', import.meta.url), 'utf8')
            ) as {
                peerDependencies?: Record<string, string>;
                peerDependenciesMeta?: Record<string, { optional?: boolean }>;
            };

            expect(packageJSON.peerDependencies?.['@ai-sdk/anthropic']).toMatch(/^\^3\./);
            expect(packageJSON.peerDependenciesMeta?.['@ai-sdk/anthropic']).toEqual({
                optional: true,
            });
        });
    });
});
