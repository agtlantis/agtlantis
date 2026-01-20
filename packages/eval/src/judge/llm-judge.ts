import type {
    Criterion,
    Verdict,
    ValidatorCriterion,
    JudgeMetadata,
    EvalTokenUsage,
} from '@/core/types.js';
import { EvalError, EvalErrorCode } from '@/core/errors.js';
import { SCORE } from '@/core/constants.js';
import { Output, type LanguageModelUsage, type ModelMessage } from 'ai';
import type { EvalContext, Judge, JudgeConfig, JudgeContext, JudgeResult } from './types.js';
import { defaultJudgePrompt } from './prompts/default.js';
import { z } from 'zod';

function toEvalTokenUsage(usage: LanguageModelUsage): EvalTokenUsage {
    return {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
    };
}

function hasValidator(criterion: Criterion): criterion is ValidatorCriterion {
    return (
        'validator' in criterion &&
        typeof (criterion as ValidatorCriterion).validator === 'function'
    );
}

const JudgeResponseSchema = z.object({
    verdicts: z.array(
        z.object({
            criterionId: z.string(),
            score: z.number().min(SCORE.MIN).max(SCORE.MAX),
            reasoning: z.string(),
            passed: z.boolean().optional(),
        })
    ),
});

type JudgeResponse = z.infer<typeof JudgeResponseSchema>;

function validateAllCriteriaHaveVerdicts(
    verdicts: JudgeResponse['verdicts'],
    criteriaIds: string[]
): void {
    const providedIds = new Set(verdicts.map((v) => v.criterionId));
    const missingIds = criteriaIds.filter((id) => !providedIds.has(id));

    if (missingIds.length > 0) {
        throw new EvalError('Judge response missing verdicts for some criteria', {
            code: EvalErrorCode.VERDICT_PARSE_ERROR,
            context: { missingCriteriaIds: missingIds, providedIds: [...providedIds] },
        });
    }
}

function calculateOverallScore(verdicts: Verdict[], criteriaWeights: Map<string, number>): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const verdict of verdicts) {
        const weight = criteriaWeights.get(verdict.criterionId) ?? 1;
        weightedSum += verdict.score * weight;
        totalWeight += weight;
    }

    if (totalWeight === 0) {
        return 0;
    }

    return Math.round((weightedSum / totalWeight) * 100) / 100;
}

function runValidatorCriteria(validatorCriteria: ValidatorCriterion[], output: unknown): Verdict[] {
    return validatorCriteria.map((criterion) => {
        const result = criterion.validator!(output);

        if (result.valid) {
            return {
                criterionId: criterion.id,
                score: 100,
                reasoning: `${criterion.name} 통과`,
                passed: true,
            };
        }

        return {
            criterionId: criterion.id,
            score: 0,
            reasoning: `${criterion.name} 실패:\n${result.errorSummary ?? '유효성 검증 오류'}`,
            passed: false,
        };
    });
}

async function runLLMEvaluation(
    provider: JudgeConfig['provider'],
    prompt: NonNullable<JudgeConfig['prompt']>,
    context: JudgeContext,
    llmCriteriaIds: string[],
    passThreshold: number
): Promise<{ verdicts: Verdict[]; usage?: LanguageModelUsage }> {
    const messages: ModelMessage[] = [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.buildUserPrompt(context) },
    ];

    let response: JudgeResponse;
    let usage: LanguageModelUsage | undefined;

    try {
        const execution = provider.simpleExecution(async (session) => {
            const result = await session.generateText({
                messages,
                output: Output.object({ schema: JudgeResponseSchema }),
            });
            return result.output!;
        });

        response = await execution.toResult();
        const metadata = await execution.getSummary();
        usage = metadata.totalLLMUsage;
    } catch (cause) {
        throw EvalError.from(cause, EvalErrorCode.LLM_API_ERROR, {
            promptId: prompt.id,
            promptVersion: prompt.version,
        });
    }

    validateAllCriteriaHaveVerdicts(response.verdicts, llmCriteriaIds);

    const verdicts: Verdict[] = response.verdicts.map((v) => ({
        criterionId: v.criterionId,
        score: v.score,
        reasoning: v.reasoning,
        passed: v.passed ?? v.score >= passThreshold,
    }));

    return { verdicts, usage };
}

/**
 * Creates an LLM-as-Judge evaluator.
 *
 * @example
 * ```typescript
 * import { createJudge, defaultJudgePrompt, accuracy, consistency } from 'agent-eval'
 * import { createGoogleProvider } from '@agtlantis/core'
 *
 * const provider = createGoogleProvider({ apiKey }).withDefaultModel('gemini-2.5-flash')
 *
 * const judge = createJudge({
 *   provider,
 *   prompt: defaultJudgePrompt,
 *   criteria: [accuracy(), consistency()],
 *   passThreshold: 70,
 * })
 *
 * const result = await judge.evaluate({
 *   input: { query: 'What is 2+2?' },
 *   output: { answer: '4' },
 *   agentDescription: 'A math tutor agent',
 *   files: [{ path: 'reference.md', content: '...' }],
 * })
 *
 * console.log(result.overallScore) // e.g., 85
 * console.log(result.passed)       // true
 * ```
 */
export function createJudge(config: JudgeConfig): Judge {
    const {
        provider,
        prompt = defaultJudgePrompt,
        criteria,
        passThreshold = SCORE.DEFAULT_PASS_THRESHOLD,
        model,
    } = config;

    const validatorCriteria: ValidatorCriterion[] = [];
    const llmCriteria: Criterion[] = [];
    const criteriaWeights = new Map<string, number>();
    const llmCriteriaIds: string[] = [];

    for (const c of criteria) {
        criteriaWeights.set(c.id, c.weight ?? 1);

        if (hasValidator(c)) {
            validatorCriteria.push(c);
        } else {
            llmCriteria.push(c);
            llmCriteriaIds.push(c.id);
        }
    }

    return {
        async evaluate(evalContext: EvalContext): Promise<JudgeResult> {
            const { input, output, agentDescription, files } = evalContext;

            const validatorVerdicts = runValidatorCriteria(validatorCriteria, output);

            let llmVerdicts: Verdict[] = [];
            let llmUsage: LanguageModelUsage | undefined;

            if (llmCriteria.length > 0) {
                const context: JudgeContext = {
                    agentDescription,
                    input,
                    output,
                    criteria: llmCriteria,
                    files,
                };

                const llmResult = await runLLMEvaluation(
                    provider,
                    prompt,
                    context,
                    llmCriteriaIds,
                    passThreshold
                );
                llmVerdicts = llmResult.verdicts;
                llmUsage = llmResult.usage;
            }

            const allVerdicts: Verdict[] = [...validatorVerdicts, ...llmVerdicts];
            const overallScore = calculateOverallScore(allVerdicts, criteriaWeights);
            const passed = overallScore >= passThreshold;

            const metadata: JudgeMetadata | undefined = llmUsage
                ? { tokenUsage: toEvalTokenUsage(llmUsage), model }
                : undefined;

            return {
                verdicts: allVerdicts,
                overallScore,
                passed,
                metadata,
            };
        },
    };
}
