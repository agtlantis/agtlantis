import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOpenAIProvider, type OpenAIProviderConfig } from './factory';
import { NoOpFileManager } from '../noop-file-manager';

// Mock @ai-sdk/openai
const mockModel = { modelId: 'gpt-4o' };
const mockOpenAIFn = vi.fn().mockReturnValue(mockModel);
vi.mock('@ai-sdk/openai', () => ({
    createOpenAI: vi.fn().mockImplementation(() => mockOpenAIFn),
}));

// Mock NoOpFileManager (Vitest 4.x requires function keyword for constructor mocks)
vi.mock('../noop-file-manager', () => ({
    NoOpFileManager: vi.fn(function () {
        return {
            upload: vi.fn(),
            delete: vi.fn(),
            clear: vi.fn(),
            getUploadedFiles: vi.fn().mockReturnValue([]),
        };
    }),
}));

// Mock AI SDK generateText/streamText
vi.mock('ai', () => ({
    generateText: vi.fn().mockResolvedValue({
        text: 'test response',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    }),
    streamText: vi.fn().mockReturnValue({
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 20, totalTokens: 30 }),
        textStream: (async function* () {
            yield 'test';
        })(),
    }),
}));

describe('createOpenAIProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('fluent API', () => {
        it('should create provider and allow fluent configuration', () => {
            const provider = createOpenAIProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('gpt-4o')
                .withLogger({});

            expect(provider).toBeDefined();
            expect(provider.withDefaultModel).toBeTypeOf('function');
            expect(provider.withLogger).toBeTypeOf('function');
            expect(provider.streamingExecution).toBeTypeOf('function');
            expect(provider.simpleExecution).toBeTypeOf('function');
        });

        it('should return new instance on withDefaultModel()', () => {
            const provider1 = createOpenAIProvider({ apiKey: 'test-api-key' });
            const provider2 = provider1.withDefaultModel('gpt-4o');

            expect(provider1).not.toBe(provider2);
        });

        it('should return new instance on withLogger()', () => {
            const provider1 = createOpenAIProvider({ apiKey: 'test-api-key' });
            const provider2 = provider1.withLogger({});

            expect(provider1).not.toBe(provider2);
        });

        it('should return new instance on withPricing()', () => {
            const provider1 = createOpenAIProvider({ apiKey: 'test-api-key' });
            const provider2 = provider1.withPricing({
                'gpt-4o': { inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 },
            });

            expect(provider1).not.toBe(provider2);
        });

        it('should allow chaining fluent methods', () => {
            const logger = { onLLMCallStart: vi.fn() };
            const provider = createOpenAIProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('gpt-4o')
                .withLogger(logger);

            expect(provider).toBeDefined();
        });

        it('should allow chaining withPricing with other fluent methods', () => {
            const logger = { onLLMCallStart: vi.fn() };
            const provider = createOpenAIProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('gpt-4o')
                .withLogger(logger)
                .withPricing({
                    'gpt-4o': { inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 },
                });

            expect(provider).toBeDefined();
            expect(provider.withPricing).toBeTypeOf('function');
        });

        it('should throw on negative pricing in withPricing()', () => {
            const provider = createOpenAIProvider({ apiKey: 'test-api-key' });

            expect(() =>
                provider.withPricing({
                    'gpt-4o': { inputPricePerMillion: -1, outputPricePerMillion: 10.0 },
                })
            ).toThrow('openai/gpt-4o: inputPricePerMillion cannot be negative');
        });

        it('should throw on NaN pricing in withPricing()', () => {
            const provider = createOpenAIProvider({ apiKey: 'test-api-key' });

            expect(() =>
                provider.withPricing({
                    'gpt-4o': { inputPricePerMillion: 2.5, outputPricePerMillion: NaN },
                })
            ).toThrow('openai/gpt-4o: outputPricePerMillion must be a finite number');
        });

        it('should throw on Infinity pricing in withPricing()', () => {
            const provider = createOpenAIProvider({ apiKey: 'test-api-key' });

            expect(() =>
                provider.withPricing({
                    'gpt-4o-mini': { inputPricePerMillion: Infinity, outputPricePerMillion: 5.0 },
                })
            ).toThrow('openai/gpt-4o-mini: inputPricePerMillion must be a finite number');
        });
    });

    describe('streamingExecution', () => {
        it('should create StreamingExecution with AsyncIterable interface', () => {
            const provider = createOpenAIProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gpt-4o'
            );

            const execution = provider.streamingExecution(async function* (session) {
                return session.done('test');
            });

            expect(execution).toBeDefined();
            expect(execution[Symbol.asyncIterator]).toBeTypeOf('function');
            expect(execution.toResult).toBeTypeOf('function');
            expect(execution.getSummary).toBeTypeOf('function');
            expect(execution.cleanup).toBeTypeOf('function');
            expect(execution.cancel).toBeTypeOf('function');
        });

        it('should iterate through events and complete', async () => {
            const provider = createOpenAIProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gpt-4o'
            );

            const events: unknown[] = [];
            const execution = provider.streamingExecution(async function* (session) {
                yield session.emit({ type: 'progress', step: 1 } as never);
                yield session.emit({ type: 'progress', step: 2 } as never);
                return session.done('result');
            });

            for await (const event of execution) {
                events.push(event);
            }

            expect(events.length).toBeGreaterThanOrEqual(2);
            expect(events.some((e: any) => e.type === 'progress')).toBe(true);
            expect(events.some((e: any) => e.type === 'complete')).toBe(true);
        });

        it('should return result via toResult()', async () => {
            const provider = createOpenAIProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gpt-4o'
            );

            const execution = provider.streamingExecution(async function* (session) {
                return session.done('my-result');
            });

            const result = await execution.toResult();
            expect(result).toBe('my-result');
        });
    });

    describe('simpleExecution', () => {
        it('should create Execution and return result', async () => {
            const provider = createOpenAIProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gpt-4o'
            );

            const execution = provider.simpleExecution(async () => {
                return 'simple-result';
            });

            const result = await execution.toResult();
            expect(result).toBe('simple-result');
        });

        it('should have metadata after completion', async () => {
            const provider = createOpenAIProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gpt-4o'
            );

            const execution = provider.simpleExecution(async () => {
                return 'result';
            });

            const metadata = await execution.getSummary();
            expect(metadata).toBeDefined();
            expect(metadata.totalDuration).toBeTypeOf('number');
        });
    });

    describe('NoOpFileManager integration', () => {
        it('should use NoOpFileManager (OpenAI does not support file upload)', () => {
            const provider = createOpenAIProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gpt-4o'
            );

            // Trigger session creation
            const execution = provider.streamingExecution(async function* (session) {
                return session.done('test');
            });

            // Consume to trigger session creation
            execution.toResult().catch(() => {});

            // NoOpFileManager should be created when session is created
            expect(NoOpFileManager).toHaveBeenCalled();
        });
    });

    describe('optional config', () => {
        it('should accept baseURL in config', () => {
            // Should not throw
            const provider = createOpenAIProvider({
                apiKey: 'test-api-key',
                baseURL: 'https://custom-api.example.com',
            });

            expect(provider).toBeDefined();
        });

        it('should accept organization in config', () => {
            // Should not throw
            const provider = createOpenAIProvider({
                apiKey: 'test-api-key',
                organization: 'org-123',
            });

            expect(provider).toBeDefined();
        });
    });
});
