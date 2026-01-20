import type {
  EvalAgent,
  EvalTestResult,
  TestCase,
  TestResultWithVerdict,
} from './types'
import type { Judge } from '@/judge/types'
import type { Improver, AggregatedMetrics, Suggestion } from '@/improver/types'
import type { EvalReport, ReportSummary } from '@/reporter/types'
import { runWithConcurrency, type RunOptions } from './runner'
import {
  aggregateIterationResults,
  calculateAvgPassRate,
  calculateAvgStdDev,
} from './iteration'
import { EvalError, EvalErrorCode } from './errors'

export type { RunOptions } from './runner'

/**
 * Configuration for creating an EvalSuite.
 *
 * @example
 * ```typescript
 * const suite = createEvalSuite({
 *   agent: myAgent,
 *   judge: myJudge,
 *   agentDescription: 'Recommends career paths based on student profiles',
 * })
 * ```
 */
export interface EvalSuiteConfig<TInput, TOutput> {
  /** The agent to evaluate */
  agent: EvalAgent<TInput, TOutput>

  /** Human-readable description of what the agent does (used by Judge) */
  agentDescription?: string

  /** Judge instance for evaluating agent outputs */
  judge: Judge

  /** Improver instance for generating prompt improvement suggestions (optional) */
  improver?: Improver
}

/**
 * Evaluation suite for running test cases against an agent.
 *
 * @example
 * ```typescript
 * const report = await suite.run(testCases, { concurrency: 3 })
 * console.log(reportToMarkdown(report))
 *
 * // Test with a different agent
 * const newReport = await suite.withAgent(improvedAgent).run(testCases)
 * ```
 */
export interface EvalSuite<TInput, TOutput> {
  /**
   * Run test cases and generate an evaluation report.
   *
   * @param testCases - Test cases to run
   * @param options - Run options (concurrency, stopOnFirstFailure, signal)
   * @returns Evaluation report with results, summary, and suggestions
   */
  run(
    testCases: TestCase<TInput>[],
    options?: RunOptions
  ): Promise<EvalReport<TInput, TOutput>>

  /**
   * Create a new suite with a different agent.
   * Useful for A/B testing or testing prompt improvements.
   *
   * @param agent - New agent to use
   * @returns New EvalSuite instance with the updated agent
   */
  withAgent(agent: EvalAgent<TInput, TOutput>): EvalSuite<TInput, TOutput>
}

/**
 * Calculate aggregated metrics from test results.
 * @internal
 *
 * Cost calculation is done via post-processing utilities (Phase 11).
 * Use calculateReportCosts() or addCostsToResults() from pricing module.
 */
function calculateAggregatedMetrics<TInput, TOutput>(
  results: TestResultWithVerdict<TInput, TOutput>[]
): AggregatedMetrics {
  if (results.length === 0) {
    return { avgLatencyMs: 0, totalTokens: 0 }
  }

  const totalLatencyMs = sumBy(results, (r) => r.metrics.latencyMs)
  const totalTokens = sumBy(results, (r) => r.metrics.tokenUsage.totalTokens)

  return {
    avgLatencyMs: totalLatencyMs / results.length,
    totalTokens,
  }
}

function sumBy<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((sum, item) => sum + selector(item), 0)
}

/** @internal */
function calculateSummary<TInput, TOutput>(
  results: EvalTestResult<TInput, TOutput>[],
  iterations?: number
): ReportSummary {
  const metrics = calculateAggregatedMetrics(results)
  const passedCount = results.filter((r) => r.passed).length
  const failedCount = results.length - passedCount
  const avgScore = results.length > 0
    ? sumBy(results, (r) => r.overallScore) / results.length
    : 0

  const summary: ReportSummary = {
    totalTests: results.length,
    passed: passedCount,
    failed: failedCount,
    avgScore,
    metrics,
  }

  const hasMultipleIterations = iterations && iterations > 1
  if (hasMultipleIterations) {
    summary.iterations = iterations
    summary.avgStdDev = calculateAvgStdDev(results)
    summary.avgPassRate = calculateAvgPassRate(results)
  }

  return summary
}

/**
 * Create an evaluation suite for testing an agent.
 *
 * The suite orchestrates test execution, evaluation, and optional
 * prompt improvement suggestions.
 *
 * @example
 * ```typescript
 * const suite = createEvalSuite({
 *   agent: scenarioGenerator,
 *   agentDescription: 'Recommends majors based on student profiles',
 *   judge: createJudge({
 *     llm: openaiClient,
 *     prompt: defaultJudgePrompt,
 *     criteria: [accuracy(), relevance()],
 *   }),
 * })
 *
 * const report = await suite.run(testCases, { concurrency: 3 })
 * ```
 */
export function createEvalSuite<TInput, TOutput>(
  config: EvalSuiteConfig<TInput, TOutput>
): EvalSuite<TInput, TOutput> {
  const { agent, agentDescription, judge, improver } = config
  const description = agentDescription ?? agent.config.description ?? agent.config.name

  const suite: EvalSuite<TInput, TOutput> = {
    async run(
      testCases: TestCase<TInput>[],
      options?: RunOptions
    ): Promise<EvalReport<TInput, TOutput>> {
      const iterations = options?.iterations ?? 1
      validateIterations(iterations)

      const executeContext = { agent, judge, agentDescription: description }
      const results = iterations <= 1
        ? await runWithConcurrency<TInput, TOutput>(testCases, executeContext, options)
        : await runMultipleIterations(testCases, executeContext, options, iterations)

      const summary = calculateSummary(results, iterations > 1 ? iterations : undefined)
      const suggestions = improver
        ? (await improver.improve(agent.prompt, results)).suggestions
        : []

      return {
        summary,
        results,
        suggestions,
        generatedAt: new Date(),
        promptVersion: agent.prompt.version,
      }
    },

    withAgent(newAgent: EvalAgent<TInput, TOutput>): EvalSuite<TInput, TOutput> {
      return createEvalSuite({
        ...config,
        agent: newAgent,
        agentDescription: undefined,
      })
    },
  }

  return suite
}

function validateIterations(iterations: number): void {
  if (iterations < 1 || !Number.isInteger(iterations)) {
    throw new EvalError(
      `Invalid iterations value: ${iterations}. Must be a positive integer.`,
      { code: EvalErrorCode.INVALID_CONFIG, context: { iterations } }
    )
  }
}

async function runMultipleIterations<TInput, TOutput>(
  testCases: TestCase<TInput>[],
  executeContext: { agent: EvalAgent<TInput, TOutput>; judge: Judge; agentDescription: string },
  options: RunOptions | undefined,
  iterations: number
): Promise<EvalTestResult<TInput, TOutput>[]> {
  const allIterationResults: EvalTestResult<TInput, TOutput>[][] = []

  for (let i = 0; i < iterations; i++) {
    const iterationResults = await runWithConcurrency<TInput, TOutput>(
      testCases,
      executeContext,
      { ...options, iterations: undefined }
    )
    allIterationResults.push(iterationResults)
  }

  return aggregateIterationResults(allIterationResults)
}
