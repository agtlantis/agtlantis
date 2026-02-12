/**
 * Shared E2E Test Setup
 *
 * Common setup utilities for running actual LLM-based E2E tests.
 * These tests use real API calls (no mocking) and are skipped by default.
 *
 * Enable with: REAL_E2E=true GOOGLE_API_KEY=... pnpm test e2e
 */
import {
    GOOGLE_PRICING,
    PromptTemplate,
    type Provider,
    createFilePromptRepository,
    createGoogleProvider,
} from '@agtlantis/core';
import { describe } from 'vitest';

import type { AgentPrompt, AgentResult, Criterion, EvalAgent, EvalTokenUsage } from '@/core/types';
import { maxCost, maxRounds, targetScore } from '@/improvement-cycle/conditions';
import type { CycleTerminationCondition } from '@/improvement-cycle/types';
import { createImprover } from '@/improver/llm-improver';
import { defaultImproverPrompt } from '@/improver/prompts/default';
import type { Improver } from '@/improver/types';
import { accuracy, relevance } from '@/judge/criteria';
import { createJudge } from '@/judge/llm-judge';
import { defaultJudgePrompt } from '@/judge/prompts/default';
import type { Judge } from '@/judge/types';
// PromptRenderer is used via PromptTemplate.from().compile()
import type { EvalPricingConfig } from '@/reporter/cost-helpers';
import { extractJson } from '@/utils/json';

import { E2E_CONFIG, validateE2EConfig } from './config';

const DEFAULT_MODEL = E2E_CONFIG.defaultModel;

/** Converts AI SDK LanguageModelUsage to EvalTokenUsage, defaulting optional fields to 0. */
export function toEvalTokenUsage(
    usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined
): EvalTokenUsage | undefined {
    if (!usage) return undefined;
    return {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
    };
}

export { E2E_CONFIG } from './config';

/**
 * Returns `describe` or `describe.skip` based on E2E_CONFIG.enabled.
 *
 * @example
 * const describeE2E = skipIfNoRealE2E()
 * describeE2E('my e2e test', () => { ... })
 */
export function skipIfNoRealE2E(): typeof describe.skip | typeof describe {
    if (!E2E_CONFIG.enabled) {
        return describe.skip;
    }
    return describe;
}

/** Validates E2E configuration. Throws if GOOGLE_API_KEY is missing when enabled. */
export function validateEnvironment(): void {
    validateE2EConfig();
}

/** Creates a Google provider for E2E tests with optional model override. */
export function createTestProvider(model?: string): Provider {
    validateEnvironment();

    return createGoogleProvider({
        apiKey: E2E_CONFIG.googleApiKey!,
    }).withDefaultModel(model ?? E2E_CONFIG.defaultModel);
}

export const createTestLLMClient = createTestProvider;

/** Default evaluation criteria: accuracy and relevance only (for cost control). */
export const DEFAULT_CRITERIA: Criterion[] = [accuracy(), relevance()];

/** Creates a judge with defaultJudgePrompt and 70% pass threshold. */
export function createTestJudge(
    provider: Provider,
    criteria?: Criterion[],
    model: string = DEFAULT_MODEL
): Judge {
    return createJudge({
        provider,
        prompt: defaultJudgePrompt,
        criteria: criteria ?? DEFAULT_CRITERIA,
        passThreshold: 70,
        model,
    });
}

/** Creates an improver with defaultImproverPrompt. */
export function createTestImprover(provider: Provider, model: string = DEFAULT_MODEL): Improver {
    return createImprover({
        provider,
        prompt: defaultImproverPrompt,
        model,
    });
}

/**
 * Creates an EvalAgent that executes prompts via the Provider.
 *
 * @param parseJson - If true, parses LLM response as JSON for schema validation tests.
 */
export function createProviderAgent<TInput, TOutput = string>(
    provider: Provider,
    prompt: AgentPrompt<TInput>,
    config?: { name?: string; description?: string; parseJson?: boolean }
): EvalAgent<TInput, TOutput> {
    return {
        config: {
            name: config?.name ?? prompt.id,
            description: config?.description ?? `Agent using prompt: ${prompt.id}`,
        },
        prompt,
        execute: async (input: TInput): Promise<AgentResult<TOutput>> => {
            const startTime = Date.now();

            const execution = provider.simpleExecution(async (session) => {
                const result = await session.generateText({
                    messages: [
                        { role: 'system', content: prompt.system },
                        { role: 'user', content: prompt.renderUserPrompt(input) },
                    ],
                });
                return result.text;
            });

            const executionResult = await execution.result();

            if (executionResult.status !== 'succeeded') {
                throw executionResult.status === 'failed'
                    ? executionResult.error
                    : new Error('Execution was canceled');
            }

            const content = executionResult.value;
            const latencyMs = Date.now() - startTime;

            const tokenUsage = toEvalTokenUsage(executionResult.summary.totalLLMUsage);

            let result: TOutput;
            if (config?.parseJson) {
                try {
                    const jsonStr = extractJson(content);
                    result = JSON.parse(jsonStr) as TOutput;
                } catch {
                    result = content as TOutput;
                }
            } else {
                result = content as TOutput;
            }

            return {
                result,
                metadata: {
                    tokenUsage,
                    latencyMs,
                },
            };
        },
    };
}

export const createLLMAgent = createProviderAgent;

/** Max 2 rounds OR max $0.10 cost. */
export const DEFAULT_TERMINATION: CycleTerminationCondition[] = [maxRounds(2), maxCost(0.1)];

/** Max 1 round OR max $0.05 cost. */
export const SINGLE_ROUND_TERMINATION: CycleTerminationCondition[] = [maxRounds(1), maxCost(0.05)];

/** Target 85% score OR max 3 rounds OR max $0.15 cost. */
export const TARGET_SCORE_TERMINATION: CycleTerminationCondition[] = [
    targetScore(85),
    maxRounds(3),
    maxCost(0.15),
];

/** Google (Gemini) pricing configuration for E2E tests. */
export const TEST_PRICING_CONFIG: EvalPricingConfig = {
    providerPricing: {
        google: GOOGLE_PRICING,
    },
};

export const TEST_TIMEOUTS = {
    singleRound: 30_000,
    fullCycle: 120_000,
    multiTurn: 180_000,
    /** Higher due to subprocess spawning overhead */
    cli: 180_000,
    resume: 90_000,
} as const;

/**
 * Creates a prompt loader for a fixtures directory.
 *
 * @example
 * ```typescript
 * const loadPromptFixture = createPromptLoader(FIXTURES_DIR)
 * const prompt = await loadPromptFixture<MyInput>('my-agent')
 * ```
 */
export function createPromptLoader(fixturesDir: string) {
    return async function loadPromptFixture<TInput>(name: string): Promise<AgentPrompt<TInput>> {
        const repo = createFilePromptRepository({ directory: fixturesDir });
        const data = await repo.read(name);
        const builder = PromptTemplate.from(data).compile<unknown, TInput>();
        return {
            id: data.id,
            version: data.version,
            system: data.system,
            userTemplate: data.userTemplate,
            renderUserPrompt: builder.renderUserPrompt,
        } as AgentPrompt<TInput>;
    };
}
