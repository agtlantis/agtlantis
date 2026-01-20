import path from 'path';
import { describe, it, expect } from 'vitest';
import { describeEachProvider, createTestProvider, E2E_CONFIG } from '@e2e/helpers';
import { createFilePromptRepository } from '@/prompt/file-prompt-repository';
import {
    PromptNotFoundError,
    PromptInvalidFormatError,
    PromptTemplateError,
} from '@/prompt/errors';

const fixturesPath = path.join(__dirname, 'fixtures/prompts');

describeEachProvider('Prompt Template', (providerType) => {
    describe('Happy Path', () => {
        it(
            'should load prompt, apply variables, and execute successfully',
            async ({ task }) => {
                const repo = createFilePromptRepository({ directory: fixturesPath });
                const prompt = await repo.read<{ name: string }>('greeting');

                const userMessage = prompt.buildUserPrompt({ name: 'World' });

                const provider = createTestProvider(providerType, { task });
                const execution = provider.simpleExecution(async (session) => {
                    return session.generateText({
                        system: prompt.system,
                        prompt: userMessage,
                    });
                });

                const result = await execution.toResult();

                expect(result.text).toBeTruthy();
                expect(result.text.length).toBeGreaterThan(0);
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Multi-version', () => {
        it(
            'should automatically select the latest version when version is not specified',
            async () => {
                const repo = createFilePromptRepository({ directory: fixturesPath });

                const prompt = await repo.read<{ name: string }>('greeting');

                expect(prompt.version).toBe('2.0.0');
                expect(prompt.system).toContain('enthusiastic');

                const userMessage = prompt.buildUserPrompt({ name: 'Tester' });
                expect(userMessage).toContain('Tester');
            },
            E2E_CONFIG.timeout
        );

        it(
            'should load specific version when explicitly requested',
            async () => {
                const repo = createFilePromptRepository({ directory: fixturesPath });

                const prompt = await repo.read<{ name: string }>('greeting', '1.0.0');

                expect(prompt.version).toBe('1.0.0');
                expect(prompt.system).toContain('friendly greeter');

                const userMessage = prompt.buildUserPrompt({ name: 'Alice' });
                expect(userMessage).toContain('Alice');
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Error Cases', () => {
        it(
            'should throw PromptNotFoundError for non-existent prompt',
            async () => {
                const repo = createFilePromptRepository({ directory: fixturesPath });

                await expect(repo.read('nonexistent-prompt')).rejects.toThrow(PromptNotFoundError);
            },
            E2E_CONFIG.timeout
        );

        it(
            'should throw PromptNotFoundError for non-existent version',
            async () => {
                const repo = createFilePromptRepository({ directory: fixturesPath });

                await expect(repo.read('greeting', '99.0.0')).rejects.toThrow(PromptNotFoundError);
            },
            E2E_CONFIG.timeout
        );

        it(
            'should throw PromptInvalidFormatError for invalid YAML content',
            async () => {
                const repo = createFilePromptRepository({ directory: fixturesPath });

                await expect(repo.read('broken', '1.0.0')).rejects.toThrow(
                    PromptInvalidFormatError
                );
            },
            E2E_CONFIG.timeout
        );

        it(
            'should throw PromptTemplateError when required variable is missing',
            async () => {
                const repo = createFilePromptRepository({ directory: fixturesPath });
                const prompt = await repo.read<{ name: string }>('greeting');

                expect(() => {
                    prompt.buildUserPrompt({} as { name: string });
                }).toThrow(PromptTemplateError);
            },
            E2E_CONFIG.timeout
        );
    });
});
