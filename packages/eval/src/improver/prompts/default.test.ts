import { describe, expect, it } from 'vitest';

import type { SingleTurnResult } from '@/core/types';

import type { ImproverContext } from '../types';
import { defaultImproverPrompt } from './default';

describe('defaultImproverPrompt', () => {
    describe('static properties', () => {
        it('should have correct id', () => {
            expect(defaultImproverPrompt.id).toBe('default-improver');
        });

        it('should have version 2.0.0', () => {
            expect(defaultImproverPrompt.version).toBe('2.0.0');
        });

        it('should have system prompt with improvement principles', () => {
            expect(defaultImproverPrompt.system).toContain('Improvement Principles');
            expect(defaultImproverPrompt.system).toContain('Focus on Impact');
            expect(defaultImproverPrompt.system).toContain('Priority');
        });

        it('should specify JSON response format in system prompt', () => {
            expect(defaultImproverPrompt.system).toContain('suggestions');
            expect(defaultImproverPrompt.system).toContain('type');
            expect(defaultImproverPrompt.system).toContain('priority');
            expect(defaultImproverPrompt.system).toContain('currentValue');
            expect(defaultImproverPrompt.system).toContain('suggestedValue');
            expect(defaultImproverPrompt.system).toContain('reasoning');
            expect(defaultImproverPrompt.system).toContain('expectedImprovement');
        });

        it('should specify valid suggestion types', () => {
            expect(defaultImproverPrompt.system).toContain('system_prompt');
            expect(defaultImproverPrompt.system).toContain('user_prompt');
            expect(defaultImproverPrompt.system).toContain('parameters');
        });

        it('should specify valid priority values', () => {
            expect(defaultImproverPrompt.system).toContain('high');
            expect(defaultImproverPrompt.system).toContain('medium');
            expect(defaultImproverPrompt.system).toContain('low');
        });

        it('should include trade-off considerations', () => {
            expect(defaultImproverPrompt.system).toContain('Trade-offs');
            expect(defaultImproverPrompt.system).toContain('side effects');
        });
    });

    describe('renderUserPrompt', () => {
        const createTestResult = (
            overrides: Partial<SingleTurnResult<any, any>> = {}
        ): SingleTurnResult<any, any> => ({
            kind: 'single-turn',
            testCase: { id: 'test-1', input: { query: 'test' } },
            output: { answer: 'response' },
            metrics: {
                latencyMs: 100,
                tokenUsage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
            },
            verdicts: [
                { criterionId: 'accuracy', score: 85, reasoning: 'Good accuracy', passed: true },
            ],
            overallScore: 85,
            passed: true,
            ...overrides,
        });

        const baseContext: ImproverContext = {
            agentPrompt: {
                id: 'test-agent',
                version: '1.0.0',
                system: 'You are a helpful assistant.',
                renderUserPrompt: () => 'test prompt',
            },
            evaluatedResults: [createTestResult()],
            aggregatedMetrics: {
                avgLatencyMs: 150,
                totalTokens: 1000,
            },
        };

        it('should include agent system prompt', () => {
            const prompt = defaultImproverPrompt.renderUserPrompt(baseContext);
            expect(prompt).toContain('You are a helpful assistant.');
        });

        it('should include test result summary', () => {
            const prompt = defaultImproverPrompt.renderUserPrompt(baseContext);
            expect(prompt).toContain('Total tests: 1');
            expect(prompt).toContain('Passed: 1');
        });

        it('should include performance metrics', () => {
            const prompt = defaultImproverPrompt.renderUserPrompt(baseContext);
            expect(prompt).toContain('150ms');
            expect(prompt).toContain('1000');
        });

        it('should include failed test details', () => {
            const failedResult = createTestResult({
                testCase: { id: 'failed-test', input: { query: 'hard question' } },
                overallScore: 45,
                passed: false,
                verdicts: [
                    {
                        criterionId: 'accuracy',
                        score: 45,
                        reasoning: 'Poor accuracy',
                        passed: false,
                    },
                ],
            });

            const context: ImproverContext = {
                ...baseContext,
                evaluatedResults: [failedResult],
            };

            const prompt = defaultImproverPrompt.renderUserPrompt(context);
            expect(prompt).toContain('failed-test');
            expect(prompt).toContain('Score: 45');
            expect(prompt).toContain('Poor accuracy');
        });

        it('should include low score test details even if passed', () => {
            const lowScoreResult = createTestResult({
                testCase: { id: 'low-score', input: { query: 'borderline' } },
                overallScore: 65, // Below 70 threshold
                passed: false, // Judge determined failure
                verdicts: [
                    { criterionId: 'accuracy', score: 65, reasoning: 'Borderline', passed: false },
                ],
            });

            const context: ImproverContext = {
                ...baseContext,
                evaluatedResults: [lowScoreResult],
            };

            const prompt = defaultImproverPrompt.renderUserPrompt(context);
            expect(prompt).toContain('low-score');
            expect(prompt).toContain('Score: 65');
        });

        it('should show message when no failed or low-score cases', () => {
            const goodResult = createTestResult({
                overallScore: 90,
                passed: true,
            });

            const context: ImproverContext = {
                ...baseContext,
                evaluatedResults: [goodResult],
            };

            const prompt = defaultImproverPrompt.renderUserPrompt(context);
            expect(prompt).toContain('None - all tests passed');
        });

        it('should handle multiple failed results', () => {
            const failedResults = [
                createTestResult({
                    testCase: { id: 'fail-1', input: { query: 'q1' } },
                    overallScore: 40,
                    passed: false,
                }),
                createTestResult({
                    testCase: { id: 'fail-2', input: { query: 'q2' } },
                    overallScore: 55,
                    passed: false,
                }),
            ];

            const context: ImproverContext = {
                ...baseContext,
                evaluatedResults: failedResults,
            };

            const prompt = defaultImproverPrompt.renderUserPrompt(context);
            expect(prompt).toContain('fail-1');
            expect(prompt).toContain('fail-2');
            expect(prompt).toContain('Passed: 0');
            expect(prompt).toContain('Failed: 2');
        });

        it('should handle unnamed test cases', () => {
            const unnamedResult = createTestResult({
                testCase: { input: { query: 'no id' } }, // No id
                overallScore: 50,
                passed: false,
            });

            const context: ImproverContext = {
                ...baseContext,
                evaluatedResults: [unnamedResult],
            };

            const prompt = defaultImproverPrompt.renderUserPrompt(context);
            expect(prompt).toContain('unnamed');
        });

        it('should truncate long input/output in details', () => {
            const longInputResult = createTestResult({
                testCase: { id: 'long-input', input: { text: 'x'.repeat(500) } },
                output: { response: 'y'.repeat(500) },
                overallScore: 50,
                passed: false,
            });

            const context: ImproverContext = {
                ...baseContext,
                evaluatedResults: [longInputResult],
            };

            const prompt = defaultImproverPrompt.renderUserPrompt(context);
            expect(prompt).toContain('...');
            // Should truncate to ~200 chars
            expect(prompt.length).toBeLessThan(2000);
        });

        it('should include all verdict details for failed cases', () => {
            const multiVerdictResult = createTestResult({
                testCase: { id: 'multi-verdict', input: {} },
                overallScore: 50,
                passed: false,
                verdicts: [
                    {
                        criterionId: 'accuracy',
                        score: 40,
                        reasoning: 'Low accuracy',
                        passed: false,
                    },
                    {
                        criterionId: 'consistency',
                        score: 60,
                        reasoning: 'Average consistency',
                        passed: false,
                    },
                ],
            });

            const context: ImproverContext = {
                ...baseContext,
                evaluatedResults: [multiVerdictResult],
            };

            const prompt = defaultImproverPrompt.renderUserPrompt(context);
            expect(prompt).toContain('accuracy: 40/100 - Low accuracy');
            expect(prompt).toContain('consistency: 60/100 - Average consistency');
        });

        it('should handle empty results array', () => {
            const context: ImproverContext = {
                ...baseContext,
                evaluatedResults: [],
            };

            const prompt = defaultImproverPrompt.renderUserPrompt(context);
            expect(prompt).toContain('Total tests: 0');
            expect(prompt).toContain('Passed: 0');
            expect(prompt).toContain('None - all tests passed');
        });
    });
});
