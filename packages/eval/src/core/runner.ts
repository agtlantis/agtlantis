import { resolveFileSourcesInInput } from '@agtlantis/core';

import type { Judge } from '@/judge/types';
import {
    type MultiTurnTestResult,
    executeMultiTurnTestCase,
    isMultiTurnTestCase,
} from '@/multi-turn';
import { createSemaphore } from '@/utils/semaphore';

import { ZERO_TOKEN_USAGE } from './constants';
import { EvalError, EvalErrorCode } from './errors';
import type {
    EvalAgent,
    EvalTestResult,
    EvalTokenUsage,
    MetricsResult,
    MultiTurnResult,
    SingleTurnResult,
    TestCase,
    TestResult,
    TestResultWithVerdict,
} from './types';

/**
 * Options for running test cases.
 */
export interface RunOptions {
    /** Maximum number of concurrent test case executions. Defaults to 1 (sequential). */
    concurrency?: number;

    /** Stop execution after the first test failure. Defaults to false. */
    stopOnFirstFailure?: boolean;

    /** AbortSignal for cancelling execution */
    signal?: AbortSignal;

    /**
     * Number of times to run each test case. Defaults to 1.
     * When > 1, results include iteration statistics (mean, stdDev, passRate).
     */
    iterations?: number;
}

/**
 * Context required for executing a single test case.
 * @internal
 */
export interface ExecuteContext<TInput, TOutput> {
    agent: EvalAgent<TInput, TOutput>;
    judge: Judge;
    agentDescription: string;
}

/**
 * Executes a single test case and returns the result with verdict.
 *
 * Flow:
 * 1. Execute agent with test input
 * 2. Measure execution latency
 * 3. Collect token usage from agent metadata
 * 4. Evaluate output using Judge
 * 5. Return combined result with verdicts
 *
 * @example
 * ```typescript
 * const result = await executeTestCase(
 *   { id: 'test-1', input: { query: 'Hello' } },
 *   { agent: myAgent, judge: myJudge, agentDescription: 'A friendly bot' }
 * )
 *
 * console.log(result.passed)       // true/false
 * console.log(result.overallScore) // 0-100
 * console.log(result.verdicts)     // Verdict[]
 * ```
 */
export async function executeTestCase<TInput, TOutput>(
    testCase: TestCase<TInput>,
    context: ExecuteContext<TInput, TOutput>,
    signal?: AbortSignal
): Promise<SingleTurnResult<TInput, TOutput>> {
    const { agent, judge, agentDescription } = context;

    if (signal?.aborted) {
        throw new EvalError('Test execution aborted', {
            code: EvalErrorCode.AGENT_EXECUTION_ERROR,
            context: { testCaseId: testCase.id, reason: 'aborted' },
        });
    }

    let resolvedInput: TInput;
    try {
        resolvedInput = await resolveFileSourcesInInput(testCase.input, {
            basePath: process.cwd(),
        });
    } catch (e) {
        const error = EvalError.from(e, EvalErrorCode.FILE_READ_ERROR, {
            testCaseId: testCase.id,
            agentName: agent.config.name,
        });
        return createFailedResult(testCase, error);
    }

    const startTime = performance.now();
    let output: TOutput;
    let tokenUsage: EvalTokenUsage = ZERO_TOKEN_USAGE;
    let error: Error | undefined;

    try {
        const agentResult = await agent.execute(resolvedInput);
        output = agentResult.result;
        if (agentResult.metadata?.tokenUsage) {
            tokenUsage = agentResult.metadata.tokenUsage;
        }
    } catch (e) {
        error = EvalError.from(e, EvalErrorCode.AGENT_EXECUTION_ERROR, {
            testCaseId: testCase.id,
            agentName: agent.config.name,
        });
        output = undefined as TOutput;
    }

    const latencyMs = performance.now() - startTime;

    const metrics: MetricsResult = { latencyMs, tokenUsage };
    const testResult: TestResult<TInput, TOutput> = { testCase, output, metrics, error };

    if (error) {
        return {
            kind: 'single-turn',
            ...testResult,
            verdicts: [],
            overallScore: 0,
            passed: false,
            judgeMetadata: undefined,
        };
    }

    if (signal?.aborted) {
        throw new EvalError('Test execution aborted before evaluation', {
            code: EvalErrorCode.AGENT_EXECUTION_ERROR,
            context: { testCaseId: testCase.id, reason: 'aborted' },
        });
    }

    const judgeResult = await judge.evaluate({
        input: testCase.input,
        output,
        agentDescription,
        files: testCase.files,
    });

    return {
        kind: 'single-turn',
        ...testResult,
        verdicts: judgeResult.verdicts,
        overallScore: judgeResult.overallScore,
        passed: judgeResult.passed,
        judgeMetadata: judgeResult.metadata,
    };
}

function createFailedResult<TInput, TOutput>(
    testCase: TestCase<TInput>,
    error: Error
): SingleTurnResult<TInput, TOutput> {
    return {
        kind: 'single-turn',
        testCase,
        output: undefined as TOutput,
        metrics: { latencyMs: 0, tokenUsage: ZERO_TOKEN_USAGE },
        error,
        verdicts: [],
        overallScore: 0,
        passed: false,
        judgeMetadata: undefined,
    };
}

/**
 * Converts a MultiTurnTestResult to MultiTurnResult format.
 * This allows multi-turn results to flow through the same aggregation pipeline
 * as single-turn results while preserving multi-turn specific data.
 *
 * @internal
 */
function toMultiTurnResult<TInput, TOutput>(
    result: MultiTurnTestResult<TInput, TOutput>
): MultiTurnResult<TInput, TOutput> {
    return {
        kind: 'multi-turn',
        testCase: result.testCase,
        output: result.output as TOutput,
        metrics: result.metrics,
        verdicts: result.verdicts,
        overallScore: result.overallScore,
        passed: result.passed,
        judgeMetadata: result.judgeMetadata,
        conversationHistory: result.conversationHistory,
        totalTurns: result.totalTurns,
        terminationReason: result.termination.reason,
        termination: result.termination,
    };
}

/**
 * Runs multiple test cases with configurable concurrency.
 *
 * Features:
 * - Parallel execution with concurrency limit
 * - Stop on first failure option
 * - AbortSignal support for cancellation
 *
 * @example
 * ```typescript
 * const results = await runWithConcurrency(
 *   testCases,
 *   { agent: myAgent, judge: myJudge, agentDescription: 'Test agent' },
 *   { concurrency: 5, stopOnFirstFailure: false }
 * )
 *
 * console.log(`Passed: ${results.filter(r => r.passed).length}`)
 * console.log(`Failed: ${results.filter(r => !r.passed).length}`)
 * ```
 */
export async function runWithConcurrency<TInput, TOutput>(
    testCases: TestCase<TInput>[],
    context: ExecuteContext<TInput, TOutput>,
    options: RunOptions = {}
): Promise<EvalTestResult<TInput, TOutput>[]> {
    const { concurrency = 1, stopOnFirstFailure = false, signal } = options;

    if (concurrency < 1) {
        throw new EvalError('Concurrency must be at least 1', {
            code: EvalErrorCode.INVALID_CONFIG,
            context: { concurrency },
        });
    }

    if (testCases.length === 0) {
        return [];
    }

    const semaphore = createSemaphore(concurrency);
    const results: EvalTestResult<TInput, TOutput>[] = [];
    let shouldStop = false;
    let firstError: Error | undefined;
    const internalAbort = new AbortController();

    const propagateExternalAbort = () => {
        shouldStop = true;
        internalAbort.abort();
    };
    signal?.addEventListener('abort', propagateExternalAbort);

    if (signal?.aborted) {
        shouldStop = true;
    }

    try {
        const executeOne = async (testCase: TestCase<TInput>, index: number): Promise<void> => {
            if (shouldStop) return;

            await semaphore.acquire();

            try {
                if (shouldStop) return;

                const result = await executeTestCaseByType(testCase, context, internalAbort.signal);
                results[index] = result;

                if (stopOnFirstFailure && !result.passed) {
                    shouldStop = true;
                    internalAbort.abort();
                }
            } catch (e) {
                if (!firstError && !isAbortError(e)) {
                    firstError = e instanceof Error ? e : new Error(String(e));
                }
                shouldStop = true;
                internalAbort.abort();
            } finally {
                semaphore.release();
            }
        };

        const promises = testCases.map((tc, i) => executeOne(tc, i));
        await Promise.allSettled(promises);

        if (firstError) {
            throw firstError;
        }

        return results.filter((r): r is EvalTestResult<TInput, TOutput> => r !== undefined);
    } finally {
        signal?.removeEventListener('abort', propagateExternalAbort);
    }
}

function isAbortError(e: unknown): boolean {
    return (
        (e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof EvalError && e.context?.reason === 'aborted')
    );
}

async function executeTestCaseByType<TInput, TOutput>(
    testCase: TestCase<TInput>,
    context: ExecuteContext<TInput, TOutput>,
    signal: AbortSignal
): Promise<EvalTestResult<TInput, TOutput>> {
    if (isMultiTurnTestCase<TInput, TOutput>(testCase)) {
        const multiTurnResult = await executeMultiTurnTestCase(testCase, context, { signal });
        return toMultiTurnResult(multiTurnResult);
    }
    return executeTestCase(testCase, context, signal);
}
