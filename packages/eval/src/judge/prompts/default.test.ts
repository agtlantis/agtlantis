import { describe, expect, it } from 'vitest';

import type { JudgeContext } from '../types';
import { defaultJudgePrompt } from './default';

describe('defaultJudgePrompt', () => {
    describe('static properties', () => {
        it('should have correct id', () => {
            expect(defaultJudgePrompt.id).toBe('default-judge');
        });

        it('should have version 2.0.0', () => {
            expect(defaultJudgePrompt.version).toBe('2.0.0');
        });

        it('should have system prompt with evaluation principles', () => {
            expect(defaultJudgePrompt.system).toContain('Evaluation Principles');
            expect(defaultJudgePrompt.system).toContain('0-100');
            expect(defaultJudgePrompt.system).toContain('JSON');
        });

        it('should specify JSON response format in system prompt', () => {
            expect(defaultJudgePrompt.system).toContain('verdicts');
            expect(defaultJudgePrompt.system).toContain('criterionId');
            expect(defaultJudgePrompt.system).toContain('reasoning');
        });

        it('should include scoring rubric', () => {
            expect(defaultJudgePrompt.system).toContain('90-100');
            expect(defaultJudgePrompt.system).toContain('Exceptional');
            expect(defaultJudgePrompt.system).toContain('70-89');
            expect(defaultJudgePrompt.system).toContain('Good');
        });
    });

    describe('renderUserPrompt', () => {
        const baseContext: JudgeContext = {
            agentDescription: 'Test agent that summarizes text',
            input: { text: 'Hello world' },
            output: { summary: 'A greeting' },
            criteria: [
                { id: 'accuracy', name: 'Accuracy', description: 'Evaluates accuracy' },
                {
                    id: 'relevance',
                    name: 'Relevance',
                    description: 'Evaluates relevance',
                    weight: 2,
                },
            ],
        };

        it('should include agent description', () => {
            const prompt = defaultJudgePrompt.renderUserPrompt(baseContext);
            expect(prompt).toContain('Test agent that summarizes text');
        });

        it('should include input as JSON', () => {
            const prompt = defaultJudgePrompt.renderUserPrompt(baseContext);
            expect(prompt).toContain('"text": "Hello world"');
        });

        it('should include output as JSON', () => {
            const prompt = defaultJudgePrompt.renderUserPrompt(baseContext);
            expect(prompt).toContain('"summary": "A greeting"');
        });

        it('should include all criteria with names and descriptions', () => {
            const prompt = defaultJudgePrompt.renderUserPrompt(baseContext);
            expect(prompt).toContain('Accuracy');
            expect(prompt).toContain('Evaluates accuracy');
            expect(prompt).toContain('Relevance');
            expect(prompt).toContain('Evaluates relevance');
        });

        it('should include criterion id', () => {
            const prompt = defaultJudgePrompt.renderUserPrompt(baseContext);
            expect(prompt).toContain('id: accuracy');
            expect(prompt).toContain('id: relevance');
        });

        it('should include criterion weight', () => {
            const prompt = defaultJudgePrompt.renderUserPrompt(baseContext);
            expect(prompt).toContain('weight: 1'); // default weight
            expect(prompt).toContain('weight: 2'); // custom weight
        });

        it('should handle complex nested input/output', () => {
            const complexContext: JudgeContext = {
                agentDescription: 'Complex agent',
                input: {
                    user: { name: 'Alice', preferences: ['A', 'B'] },
                    metadata: { timestamp: 123456 },
                },
                output: {
                    recommendations: [{ id: 1, score: 0.9 }],
                },
                criteria: [{ id: 'test', name: 'Test', description: 'Test criterion' }],
            };

            const prompt = defaultJudgePrompt.renderUserPrompt(complexContext);
            expect(prompt).toContain('"name": "Alice"');
            expect(prompt).toContain('"preferences"');
            expect(prompt).toContain('"recommendations"');
        });

        it('should handle empty criteria array', () => {
            const emptyContext: JudgeContext = {
                agentDescription: 'Test agent',
                input: 'test',
                output: 'result',
                criteria: [],
            };

            const prompt = defaultJudgePrompt.renderUserPrompt(emptyContext);
            expect(prompt).toContain('## Evaluation Criteria');
        });

        it('should include reference files when provided', () => {
            const contextWithFiles: JudgeContext = {
                ...baseContext,
                files: [{ path: 'test.txt', content: 'file content here' }],
            };

            const prompt = defaultJudgePrompt.renderUserPrompt(contextWithFiles);
            expect(prompt).toContain('## Reference Files');
            expect(prompt).toContain('test.txt');
            expect(prompt).toContain('file content here');
        });
    });
});
