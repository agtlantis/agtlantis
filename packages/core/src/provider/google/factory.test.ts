import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createGoogleProvider,
    type GoogleProviderConfig,
    type SafetySetting,
    type HarmCategory,
    type HarmBlockThreshold,
} from './factory';
import { GoogleFileManager } from './file-manager';

// Mock @ai-sdk/google
const mockModel = { modelId: 'gemini-2.5-flash' };
const mockGoogleFn = vi.fn().mockReturnValue(mockModel);
vi.mock('@ai-sdk/google', () => ({
    createGoogleGenerativeAI: vi.fn().mockImplementation(() => mockGoogleFn),
}));

// Mock GoogleFileManager (Vitest 4.x requires function keyword for constructor mocks)
vi.mock('./file-manager', () => ({
    GoogleFileManager: vi.fn(function () {
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

describe('createGoogleProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('fluent API', () => {
        it('should create provider and allow fluent configuration', () => {
            const provider = createGoogleProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('gemini-2.5-flash')
                .withLogger({});

            expect(provider).toBeDefined();
            expect(provider.withDefaultModel).toBeTypeOf('function');
            expect(provider.withLogger).toBeTypeOf('function');
            expect(provider.streamingExecution).toBeTypeOf('function');
            expect(provider.simpleExecution).toBeTypeOf('function');
        });

        it('should return new instance on withDefaultModel()', () => {
            const provider1 = createGoogleProvider({ apiKey: 'test-api-key' });
            const provider2 = provider1.withDefaultModel('gemini-2.5-flash');

            expect(provider1).not.toBe(provider2);
        });

        it('should return new instance on withLogger()', () => {
            const provider1 = createGoogleProvider({ apiKey: 'test-api-key' });
            const provider2 = provider1.withLogger({});

            expect(provider1).not.toBe(provider2);
        });

        it('should return new instance on withPricing()', () => {
            const provider1 = createGoogleProvider({ apiKey: 'test-api-key' });
            const provider2 = provider1.withPricing({
                'gemini-2.5-flash': { inputPricePerMillion: 0.5, outputPricePerMillion: 3.0 },
            });

            expect(provider1).not.toBe(provider2);
        });

        it('should allow chaining fluent methods', () => {
            const logger = { onLLMCallStart: vi.fn() };
            const provider = createGoogleProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('gemini-2.5-flash')
                .withLogger(logger);

            expect(provider).toBeDefined();
        });

        it('should allow chaining withPricing with other fluent methods', () => {
            const logger = { onLLMCallStart: vi.fn() };
            const provider = createGoogleProvider({ apiKey: 'test-api-key' })
                .withDefaultModel('gemini-2.5-flash')
                .withLogger(logger)
                .withPricing({
                    'gemini-2.5-flash': { inputPricePerMillion: 0.5, outputPricePerMillion: 3.0 },
                });

            expect(provider).toBeDefined();
            expect(provider.withPricing).toBeTypeOf('function');
        });

        it('should throw on negative pricing in withPricing()', () => {
            const provider = createGoogleProvider({ apiKey: 'test-api-key' });

            expect(() =>
                provider.withPricing({
                    'gemini-2.5-flash': { inputPricePerMillion: -1, outputPricePerMillion: 3.0 },
                })
            ).toThrow('google/gemini-2.5-flash: inputPricePerMillion cannot be negative');
        });

        it('should throw on NaN pricing in withPricing()', () => {
            const provider = createGoogleProvider({ apiKey: 'test-api-key' });

            expect(() =>
                provider.withPricing({
                    'gemini-2.5-flash': { inputPricePerMillion: 0.5, outputPricePerMillion: NaN },
                })
            ).toThrow('google/gemini-2.5-flash: outputPricePerMillion must be a finite number');
        });

        it('should throw on Infinity pricing in withPricing()', () => {
            const provider = createGoogleProvider({ apiKey: 'test-api-key' });

            expect(() =>
                provider.withPricing({
                    'gemini-2.5-pro': {
                        inputPricePerMillion: Infinity,
                        outputPricePerMillion: 10.0,
                    },
                })
            ).toThrow('google/gemini-2.5-pro: inputPricePerMillion must be a finite number');
        });
    });

    describe('streamingExecution', () => {
        it('should create StreamingExecution with AsyncIterable interface', () => {
            const provider = createGoogleProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gemini-2.5-flash'
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
            const provider = createGoogleProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gemini-2.5-flash'
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
            const provider = createGoogleProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gemini-2.5-flash'
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
            const provider = createGoogleProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gemini-2.5-flash'
            );

            const execution = provider.simpleExecution(async () => {
                return 'simple-result';
            });

            const result = await execution.toResult();
            expect(result).toBe('simple-result');
        });

        it('should have metadata after completion', async () => {
            const provider = createGoogleProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gemini-2.5-flash'
            );

            const execution = provider.simpleExecution(async () => {
                return 'result';
            });

            const metadata = await execution.getSummary();
            expect(metadata).toBeDefined();
            expect(metadata.totalDuration).toBeTypeOf('number');
        });

        it('should run onDone hooks and rethrow on error', async () => {
            const provider = createGoogleProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gemini-2.5-flash'
            );

            const testError = new Error('Test error');

            const execution = provider.simpleExecution(async () => {
                throw testError;
            });

            await expect(execution.toResult()).rejects.toThrow('Test error');
        });

        it('should run onDone hooks on error path', async () => {
            const provider = createGoogleProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gemini-2.5-flash'
            );

            const onDoneHook = vi.fn();

            const execution = provider.simpleExecution(async (session) => {
                session.onDone(onDoneHook);
                throw new Error('Test error');
            });

            try {
                await execution.toResult();
            } catch {
                // Expected
            }

            expect(onDoneHook).toHaveBeenCalledOnce();
        });
    });

    describe('GoogleFileManager integration', () => {
        it('should create GoogleFileManager with apiKey', () => {
            const provider = createGoogleProvider({ apiKey: 'test-api-key' }).withDefaultModel(
                'gemini-2.5-flash'
            );

            // Trigger session creation
            const execution = provider.streamingExecution(async function* (session) {
                return session.done('test');
            });

            // Consume to trigger session creation
            execution.toResult().catch(() => {});

            // GoogleFileManager should be created when session is created
            expect(GoogleFileManager).toHaveBeenCalled();
        });
    });

    describe('safetySettings', () => {
        it('should accept safetySettings in config', () => {
            const settings: SafetySetting[] = [
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
            ];

            // Should not throw
            const provider = createGoogleProvider({
                apiKey: 'test-api-key',
                safetySettings: settings,
            });

            expect(provider).toBeDefined();
        });
    });
});

describe('SafetySetting types', () => {
    it('should accept valid HarmCategory values', () => {
        const categories: HarmCategory[] = [
            'HARM_CATEGORY_HATE_SPEECH',
            'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            'HARM_CATEGORY_DANGEROUS_CONTENT',
            'HARM_CATEGORY_HARASSMENT',
            'HARM_CATEGORY_CIVIC_INTEGRITY',
        ];

        expect(categories).toHaveLength(5);
    });

    it('should accept valid HarmBlockThreshold values', () => {
        const thresholds: HarmBlockThreshold[] = [
            'BLOCK_NONE',
            'BLOCK_ONLY_HIGH',
            'BLOCK_MEDIUM_AND_ABOVE',
            'BLOCK_LOW_AND_ABOVE',
            'OFF',
        ];

        expect(thresholds).toHaveLength(5);
    });

    it('should create type-safe SafetySetting', () => {
        const setting: SafetySetting = {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_ONLY_HIGH',
        };

        expect(setting.category).toBe('HARM_CATEGORY_DANGEROUS_CONTENT');
        expect(setting.threshold).toBe('BLOCK_ONLY_HIGH');
    });
});
