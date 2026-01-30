import type { AgentPrompt, EvalTestResult, ImproverMetadata, EvalTokenUsage } from '@/core/types';
import type {
    Improver,
    ImproverConfig,
    ImproverContext,
    ImproveResult,
    Suggestion,
    AggregatedMetrics,
} from './types';
import { EvalError, EvalErrorCode } from '@/core/errors';
import { Output, type LanguageModelUsage, type ModelMessage } from 'ai';
import { defaultImproverPrompt } from './prompts/default';
import { z } from 'zod';

function toEvalTokenUsage(usage: LanguageModelUsage): EvalTokenUsage {
    return {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
    };
}

const ImproverResponseSchema = z.object({
    suggestions: z.array(
        z.object({
            type: z.enum(['system_prompt', 'user_prompt', 'parameters']),
            priority: z.enum(['high', 'medium', 'low']),
            currentValue: z.string(),
            suggestedValue: z.string(),
            reasoning: z.string(),
            expectedImprovement: z.string(),
        })
    ),
});

type ImproverResponse = z.infer<typeof ImproverResponseSchema>;

function aggregateMetrics(results: EvalTestResult<unknown, unknown>[]): AggregatedMetrics {
    if (results.length === 0) {
        return {
            avgLatencyMs: 0,
            totalTokens: 0,
        };
    }

    let totalLatency = 0;
    let totalTokens = 0;

    for (const result of results) {
        totalLatency += result.metrics.latencyMs;
        totalTokens += result.metrics.tokenUsage.totalTokens;
    }

    return {
        avgLatencyMs: Math.round(totalLatency / results.length),
        totalTokens,
    };
}

/**
 * Creates an LLM-based prompt improver.
 *
 * Analyzes test results and suggests improvements to the agent's prompt,
 * focusing on low-scoring criteria with actionable suggestions.
 *
 * @example
 * ```typescript
 * import { createImprover, defaultImproverPrompt } from '@agtlantis/eval'
 * import { createGoogleProvider } from '@agtlantis/core'
 *
 * const provider = createGoogleProvider({ apiKey }).withDefaultModel('gemini-2.5-flash')
 *
 * const improver = createImprover({
 *   provider,
 *   prompt: defaultImproverPrompt,
 * })
 *
 * const { suggestions } = await improver.improve(agent.prompt, evaluatedResults)
 *
 * for (const suggestion of suggestions) {
 *   console.log(suggestionDiff(suggestion))
 *   suggestion.approved = true
 * }
 *
 * const newPrompt = applyPromptSuggestions(agent.prompt, suggestions)
 * ```
 */
export function createImprover(config: ImproverConfig): Improver {
    const { provider, prompt = defaultImproverPrompt, model } = config;

    return {
        async improve(
            agentPrompt: AgentPrompt<any>,
            results: EvalTestResult<any, any>[]
        ): Promise<ImproveResult> {
            const context: ImproverContext = {
                agentPrompt,
                evaluatedResults: results,
                aggregatedMetrics: aggregateMetrics(results),
            };

            const messages: ModelMessage[] = [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.buildUserPrompt(context) },
            ];

            let response: ImproverResponse;
            let llmUsage: LanguageModelUsage | undefined;

            try {
                const execution = provider.simpleExecution(async (session) => {
                    const result = await session.generateText({
                        messages,
                        output: Output.object({ schema: ImproverResponseSchema }),
                    });
                    return result.output!;
                });

                const executionResult = await execution.result();

                if (executionResult.status !== 'succeeded') {
                    throw executionResult.status === 'failed'
                        ? executionResult.error
                        : new Error('Execution was canceled');
                }

                response = executionResult.value;
                llmUsage = executionResult.summary.totalLLMUsage;
            } catch (cause) {
                throw EvalError.from(cause, EvalErrorCode.LLM_API_ERROR, {
                    promptId: prompt.id,
                    promptVersion: prompt.version,
                });
            }

            const suggestions: Suggestion[] = response.suggestions.map((s) => ({
                ...s,
                approved: undefined,
                modified: undefined,
            }));

            const metadata: ImproverMetadata | undefined = llmUsage
                ? { tokenUsage: toEvalTokenUsage(llmUsage), model }
                : undefined;

            return { suggestions, metadata };
        },
    };
}
