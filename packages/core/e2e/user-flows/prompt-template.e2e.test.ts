import { E2E_CONFIG, createTestProvider, describeEachProvider } from '@e2e/helpers';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
    PromptInvalidFormatError,
    PromptNotFoundError,
    PromptTemplateError,
} from '@/prompt/errors';
import { createFilePromptRepository } from '@/prompt/file-prompt-repository';
import { PromptTemplate } from '@/prompt/prompt-template';

const fixturesPath = path.join(__dirname, 'fixtures/prompts');

describeEachProvider('Prompt Template', (providerType) => {
    describe('Happy Path', () => {
        it(
            'should load prompt, apply variables, and execute successfully',
            async ({ task }) => {
                const repo = createFilePromptRepository({ directory: fixturesPath });
                const data = await repo.read('greeting');
                const builder = PromptTemplate.from(data).compile<unknown, { name: string }>();

                const userMessage = builder.renderUserPrompt({ name: 'World' });

                const provider = createTestProvider(providerType, { task });
                const execution = provider.simpleExecution(async (session) => {
                    return session.generateText({
                        system: data.system,
                        prompt: userMessage,
                    });
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

    describe('Multi-version', () => {
        it(
            'should automatically select the latest version when version is not specified',
            async () => {
                const repo = createFilePromptRepository({ directory: fixturesPath });

                const data = await repo.read('greeting');

                expect(data.version).toBe('2.0.0');
                expect(data.system).toContain('enthusiastic');

                const builder = PromptTemplate.from(data).compile<unknown, { name: string }>();
                const userMessage = builder.renderUserPrompt({ name: 'Tester' });
                expect(userMessage).toContain('Tester');
            },
            E2E_CONFIG.timeout
        );

        it(
            'should load specific version when explicitly requested',
            async () => {
                const repo = createFilePromptRepository({ directory: fixturesPath });

                const data = await repo.read('greeting', '1.0.0');

                expect(data.version).toBe('1.0.0');
                expect(data.system).toContain('friendly greeter');

                const builder = PromptTemplate.from(data).compile<unknown, { name: string }>();
                const userMessage = builder.renderUserPrompt({ name: 'Alice' });
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
                const data = await repo.read('greeting');
                const builder = PromptTemplate.from(data).compile<unknown, { name: string }>();

                expect(() => {
                    builder.renderUserPrompt({} as { name: string });
                }).toThrow(PromptTemplateError);
            },
            E2E_CONFIG.timeout
        );
    });
});
