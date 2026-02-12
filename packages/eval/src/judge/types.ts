import type { Provider } from '@agtlantis/core';

import type { Criterion, FileContent, JudgeMetadata, Verdict } from '@/core/types';

/**
 * Context passed to JudgePrompt.renderUserPrompt().
 */
export interface JudgeContext {
    agentDescription: string;
    input: unknown;
    output: unknown;
    criteria: Criterion[];
    files?: FileContent[];
}

/**
 * Context for evaluating agent output.
 *
 * @example
 * ```typescript
 * const result = await judge.evaluate({
 *   input: { query: 'Hello' },
 *   output: { response: 'Hi there!' },
 *   agentDescription: 'A friendly chatbot',
 *   files: [{ path: 'context.md', content: '...' }],
 * })
 * ```
 */
export interface EvalContext {
    input: unknown;
    output: unknown;
    agentDescription: string;
    files?: FileContent[];
}

export interface JudgeResult {
    verdicts: Verdict[];
    overallScore: number;
    passed: boolean;
    metadata?: JudgeMetadata;
}

export interface JudgePrompt {
    id: string;
    version: string;
    system: string;
    renderUserPrompt: (context: JudgeContext) => string;
}

export interface JudgeConfig {
    provider: Provider;
    prompt?: JudgePrompt;
    criteria: Criterion[];
    passThreshold?: number;
    /** Model name for cost tracking (e.g., 'gpt-4o', 'gemini-2.5-flash') */
    model?: string;
}

/**
 * LLM-as-Judge evaluator interface.
 *
 * @example
 * ```typescript
 * const judge = createJudge({ llm, prompt, criteria })
 *
 * const result = await judge.evaluate({
 *   input: { query: 'What is 2+2?' },
 *   output: { answer: '4' },
 *   agentDescription: 'A math tutor agent',
 *   files: [{ path: 'reference.md', content: '...' }],
 * })
 * ```
 */
export interface Judge {
    evaluate(context: EvalContext): Promise<JudgeResult>;
}
