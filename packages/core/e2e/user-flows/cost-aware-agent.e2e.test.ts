import { describe, it, expect, afterEach } from 'vitest';
import {
    describeEachProvider,
    createTestProvider,
    E2E_CONFIG,
    type ProviderType,
} from '@e2e/helpers';
import {
    calculateCost,
    calculateCostFromUsage,
    calculateTotalCost,
    configurePricing,
    resetPricingConfig,
    getEffectivePricing,
    OPENAI_PRICING,
    GOOGLE_PRICING,
} from '@/pricing';
import { createLogger } from '@/observability/logger';
import type { LLMCallEndEvent } from '@/observability';

const CUSTOM_INPUT_PRICE_PER_MILLION = 100.0;
const CUSTOM_OUTPUT_PRICE_PER_MILLION = 200.0;

describeEachProvider('Cost-Aware Agent', (providerType) => {
    afterEach(() => {
        resetPricingConfig();
    });

    describe('Cost Calculation', () => {
        it(
            'should calculate cost from execution usage metadata',
            async ({ task }) => {
                const provider = createTestProvider(providerType, { task });

                const execution = provider.simpleExecution(async (session) => {
                    return session.generateText({ prompt: 'Count to 5' });
                });

                await execution.toResult();
                const metadata = await execution.getSummary();

                expect(metadata.totalLLMUsage).toBeDefined();
                expect(metadata.totalLLMUsage.inputTokens).toBeGreaterThan(0);
                expect(metadata.totalLLMUsage.outputTokens).toBeGreaterThan(0);

                const model = E2E_CONFIG[providerType].model;
                const cost = calculateCostFromUsage(metadata.totalLLMUsage, model, providerType);

                expect(cost.inputCost).toBeGreaterThanOrEqual(0);
                expect(cost.outputCost).toBeGreaterThanOrEqual(0);
                expect(cost.total).toBeGreaterThan(0);
                expect(cost.total).toBeCloseTo(
                    cost.inputCost + cost.outputCost + cost.cachedInputCost,
                    10
                );
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Provider-specific Pricing', () => {
        it(
            'should resolve pricing from built-in tables or fallback',
            async ({ task }) => {
                const model = E2E_CONFIG[providerType].model;
                const effectivePricing = getEffectivePricing(model, providerType);

                expect(effectivePricing.pricing).toBeDefined();
                expect(effectivePricing.pricing.inputPricePerMillion).toBeGreaterThan(0);
                expect(effectivePricing.pricing.outputPricePerMillion).toBeGreaterThan(0);
                expect(['default', 'fallback', 'global']).toContain(effectivePricing.source);

                const providerPricing = providerType === 'openai' ? OPENAI_PRICING : GOOGLE_PRICING;
                const hasExplicitPricing = model in providerPricing;

                if (hasExplicitPricing) {
                    expect(effectivePricing.source).toBe('default');
                    expect(effectivePricing.pricing.inputPricePerMillion).toBe(
                        providerPricing[model].inputPricePerMillion
                    );
                } else {
                    expect(effectivePricing.source).toBe('fallback');
                }

                const provider = createTestProvider(providerType, { task });
                const execution = provider.simpleExecution(async (session) => {
                    return session.generateText({ prompt: 'Say hello' });
                });

                await execution.toResult();
                const metadata = await execution.getSummary();
                const usage = metadata.totalLLMUsage;

                const resolvedPricing = effectivePricing.pricing;
                const expectedInputCost =
                    (usage.inputTokens / 1_000_000) * resolvedPricing.inputPricePerMillion;
                const expectedOutputCost =
                    (usage.outputTokens / 1_000_000) * resolvedPricing.outputPricePerMillion;

                const actualCost = calculateCostFromUsage(usage, model, providerType);

                expect(actualCost.inputCost).toBeCloseTo(expectedInputCost, 10);
                expect(actualCost.outputCost).toBeCloseTo(expectedOutputCost, 10);
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Custom Pricing', () => {
        it(
            'should apply configurePricing() overrides',
            async ({ task }) => {
                const model = E2E_CONFIG[providerType].model;

                configurePricing({
                    providers: {
                        [providerType]: {
                            [model]: {
                                inputPricePerMillion: CUSTOM_INPUT_PRICE_PER_MILLION,
                                outputPricePerMillion: CUSTOM_OUTPUT_PRICE_PER_MILLION,
                            },
                        },
                    },
                });

                const effectivePricing = getEffectivePricing(model, providerType);
                expect(effectivePricing.source).toBe('global');
                expect(effectivePricing.pricing.inputPricePerMillion).toBe(
                    CUSTOM_INPUT_PRICE_PER_MILLION
                );

                const provider = createTestProvider(providerType, { task });
                const execution = provider.simpleExecution(async (session) => {
                    return session.generateText({ prompt: 'Hi' });
                });

                await execution.toResult();
                const metadata = await execution.getSummary();
                const usage = metadata.totalLLMUsage;

                const customCost = calculateCostFromUsage(usage, model, providerType);

                const expectedInputCost =
                    (usage.inputTokens / 1_000_000) * CUSTOM_INPUT_PRICE_PER_MILLION;
                const expectedOutputCost =
                    (usage.outputTokens / 1_000_000) * CUSTOM_OUTPUT_PRICE_PER_MILLION;

                expect(customCost.inputCost).toBeCloseTo(expectedInputCost, 10);
                expect(customCost.outputCost).toBeCloseTo(expectedOutputCost, 10);
                expect(customCost.total).toBeGreaterThan(0);
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Error Cases', () => {
        it('should throw error for negative token counts', () => {
            const model = E2E_CONFIG[providerType].model;

            expect(() =>
                calculateCost({
                    inputTokens: -100,
                    outputTokens: 50,
                    model,
                    provider: providerType,
                })
            ).toThrow('Token counts must be non-negative');

            expect(() =>
                calculateCost({
                    inputTokens: 100,
                    outputTokens: -50,
                    model,
                    provider: providerType,
                })
            ).toThrow('Token counts must be non-negative');
        });

        it('should throw error when cachedInputTokens exceeds inputTokens', () => {
            const model = E2E_CONFIG[providerType].model;

            expect(() =>
                calculateCost({
                    inputTokens: 100,
                    outputTokens: 50,
                    cachedInputTokens: 200,
                    model,
                    provider: providerType,
                })
            ).toThrow('cachedInputTokens cannot exceed inputTokens');
        });

        it('should return zero cost for zero tokens', () => {
            const model = E2E_CONFIG[providerType].model;

            const cost = calculateCost({
                inputTokens: 0,
                outputTokens: 0,
                model,
                provider: providerType,
            });

            expect(cost.inputCost).toBe(0);
            expect(cost.outputCost).toBe(0);
            expect(cost.total).toBe(0);
        });
    });

    describe('Multiple Calls Total', () => {
        it(
            'should calculate accumulated cost for multiple LLM calls',
            async ({ task }) => {
                const model = E2E_CONFIG[providerType].model;
                const llmEndEvents: LLMCallEndEvent[] = [];

                const logger = createLogger({
                    onLLMCallEnd: (event) => {
                        llmEndEvents.push(event);
                    },
                });

                const provider = createTestProvider(providerType, {
                    logging: false,
                    task,
                }).withLogger(logger);

                const execution = provider.simpleExecution(async (session) => {
                    const first = await session.generateText({ prompt: 'Say 1' });
                    const second = await session.generateText({ prompt: 'Say 2' });
                    const third = await session.generateText({ prompt: 'Say 3' });

                    return { first: first.text, second: second.text, third: third.text };
                });

                await execution.toResult();

                expect(llmEndEvents.length).toBe(3);

                const calls = llmEndEvents.map((event) => ({
                    usage: {
                        inputTokens: event.response.usage?.inputTokens ?? 0,
                        outputTokens: event.response.usage?.outputTokens ?? 0,
                    },
                    model,
                    provider: providerType as ProviderType,
                }));

                for (const call of calls) {
                    expect(call.usage.inputTokens).toBeGreaterThan(0);
                    expect(call.usage.outputTokens).toBeGreaterThan(0);
                }

                const result = calculateTotalCost(calls);

                expect(result.totalCost).toBeGreaterThan(0);
                expect(result.costByModel).toBeDefined();

                const modelKey = `${providerType}/${model}`;
                expect(result.costByModel[modelKey]).toBeDefined();
                expect(result.costByModel[modelKey]).toBeCloseTo(result.totalCost, 10);

                let manualTotal = 0;
                for (const call of calls) {
                    const cost = calculateCostFromUsage(call.usage, call.model, call.provider);
                    manualTotal += cost.total;
                }
                expect(result.totalCost).toBeCloseTo(manualTotal, 10);
            },
            E2E_CONFIG.timeout
        );
    });
});
