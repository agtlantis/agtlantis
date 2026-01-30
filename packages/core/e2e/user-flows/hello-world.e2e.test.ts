import {
    E2E_CONFIG,
    createInvalidTestProvider,
    createTestProvider,
    describeEachProvider,
} from '@e2e/helpers';
import { describe, expect, it } from 'vitest';

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

                const result = await execution.result();

                expect(result.status).toBe('succeeded');
                if (result.status === 'succeeded') {
                    expect(result.value.text).toBeTruthy();
                    expect(result.value.text.length).toBeGreaterThan(0);
                }
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Model Override', () => {
        it(
            'should generate text with different model via withDefaultModel()',
            async ({ task }) => {
                const provider = createTestProvider(providerType, { task });
                const alternativeModel = providerType === 'openai' ? 'gpt-4o' : 'gemini-2.5-flash';

                const overriddenProvider = provider.withDefaultModel(alternativeModel);

                const execution = overriddenProvider.simpleExecution(async (session) => {
                    return session.generateText({ prompt: 'Count to 3 briefly' });
                });

                const result = await execution.result();

                expect(result.status).toBe('succeeded');
                if (result.status === 'succeeded') {
                    expect(result.value.text).toBeTruthy();
                    expect(result.value.text.length).toBeGreaterThan(0);
                }
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Error Cases', () => {
        it(
            'should return failed status for invalid API key',
            async () => {
                const invalidProvider = createInvalidTestProvider(providerType);

                const execution = invalidProvider.simpleExecution(async (session) => {
                    return session.generateText({ prompt: 'Hello' });
                });

                const result = await execution.result();

                expect(result.status).toBe('failed');
                if (result.status === 'failed') {
                    expect(result.error).toBeInstanceOf(Error);
                }
            },
            E2E_CONFIG.timeout
        );

        it(
            'should handle empty prompt gracefully',
            async ({ task }) => {
                const provider = createTestProvider(providerType, { task });

                const execution = provider.simpleExecution(async (session) => {
                    return session.generateText({ prompt: '' });
                });

                const result = await execution.result();

                // Either succeeds or fails, but always returns a result
                expect(['succeeded', 'failed']).toContain(result.status);
                if (result.status === 'succeeded') {
                    expect(result.value).toBeDefined();
                    expect(result.value).toHaveProperty('text');
                } else if (result.status === 'failed') {
                    expect(result.error).toBeInstanceOf(Error);
                    expect(result.error.name).toBeTruthy();
                    expect(result.error.message).toBeTruthy();
                }
            },
            E2E_CONFIG.timeout
        );
    });
});
