import { describe, it, expect } from 'vitest';
import {
    describeEachProvider,
    createTestProvider,
    createInvalidTestProvider,
    E2E_CONFIG,
} from '@e2e/helpers';

describeEachProvider('Hello World', (providerType) => {
    describe('Happy Path', () => {
        it(
            'should generate text with basic prompt',
            async ({ task }) => {
                // Pass { task } to enable cost tracking (see E2E_SHOW_COSTS env var)
                const provider = createTestProvider(providerType, { task });

                const execution = provider.simpleExecution(async (session) => {
                    return session.generateText({ prompt: 'Say hello briefly' });
                });

                const result = await execution.toResult();

                expect(result.text).toBeTruthy();
                expect(result.text.length).toBeGreaterThan(0);
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Model Override', () => {
        it(
            'should generate text with different model via withDefaultModel()',
            async ({ task }) => {
                const provider = createTestProvider(providerType, { task });
                const alternativeModel =
                    providerType === 'openai' ? 'gpt-4o' : 'gemini-2.0-flash-exp';

                const overriddenProvider = provider.withDefaultModel(alternativeModel);

                const execution = overriddenProvider.simpleExecution(async (session) => {
                    return session.generateText({ prompt: 'Count to 3 briefly' });
                });

                const result = await execution.toResult();

                expect(result.text).toBeTruthy();
                expect(result.text.length).toBeGreaterThan(0);
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Error Cases', () => {
        it(
            'should throw API error for invalid API key',
            async () => {
                const invalidProvider = createInvalidTestProvider(providerType);

                const execution = invalidProvider.simpleExecution(async (session) => {
                    return session.generateText({ prompt: 'Hello' });
                });
                await expect(execution.toResult()).rejects.toThrow();
            },
            E2E_CONFIG.timeout
        );

        it(
            'should handle empty prompt gracefully',
            async ({ task }) => {
                const provider = createTestProvider(providerType, { task });

                try {
                    const execution = provider.simpleExecution(async (session) => {
                        return session.generateText({ prompt: '' });
                    });

                    const result = await execution.toResult();
                    expect(result).toBeDefined();
                    expect(result).toHaveProperty('text');
                } catch (error: unknown) {
                    expect(error).toBeInstanceOf(Error);
                    expect((error as Error).name).toBeTruthy();
                    expect((error as Error).message).toBeTruthy();
                }
            },
            E2E_CONFIG.timeout
        );
    });
});
