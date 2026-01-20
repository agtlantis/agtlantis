/**
 * Iteration statistics utilities for repeated test execution.
 *
 * These functions aggregate results from running the same test multiple times,
 * providing statistical metrics like mean, standard deviation, and pass rate.
 */

import type {
  EvalTestResult,
  IterationStats,
  MultiTurnIteratedResult,
  MultiTurnResult,
  MultiTurnIterationStats,
  SingleTurnIteratedResult,
  SingleTurnResult,
  TestResultWithVerdict,
} from './types.js'
import { isMultiTurnResult } from './types.js'
import { EvalError, EvalErrorCode } from './errors'
import { SCORE } from './constants'

/**
 * Calculate iteration statistics from multiple test results.
 *
 * @param results - Results from running the same test multiple times
 * @returns Aggregated statistics including mean, stdDev, and passRate
 *
 * @example
 * ```typescript
 * const stats = calculateIterationStats([
 *   { overallScore: 85, passed: true, ... },
 *   { overallScore: 90, passed: true, ... },
 *   { overallScore: 80, passed: true, ... },
 * ])
 * // stats.mean = 85
 * // stats.stdDev ≈ 4.08
 * // stats.passRate = 1.0
 * ```
 */
export function calculateIterationStats(
  results: TestResultWithVerdict<unknown, unknown>[]
): IterationStats {
  if (results.length === 0) {
    return {
      iterations: 0,
      scores: [],
      mean: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      passRate: 0,
      passCount: 0,
    }
  }

  const scores = results.map((r) => r.overallScore)
  const passCount = results.filter((r) => r.passed).length

  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length

  // Population standard deviation (not sample)
  const variance =
    scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length
  const stdDev = Math.sqrt(variance)

  return {
    iterations: results.length,
    scores,
    mean,
    stdDev,
    min: Math.min(...scores),
    max: Math.max(...scores),
    passRate: passCount / results.length,
    passCount,
  }
}

/**
 * Calculate multi-turn specific iteration statistics.
 *
 * Extends base iteration stats with turn counts and termination type distribution.
 * Used when aggregating multiple iterations of multi-turn tests.
 *
 * @param results - Results from running the same multi-turn test multiple times
 * @returns Extended statistics including avgTurns, min/max turns, and terminationCounts
 *
 * @example
 * ```typescript
 * const stats = calculateMultiTurnIterationStats(results)
 * // stats.avgTurns = 4.2
 * // stats.minTurns = 3
 * // stats.maxTurns = 6
 * // stats.terminationCounts = { condition: 2, maxTurns: 1 }
 * ```
 */
export function calculateMultiTurnIterationStats<TInput, TOutput>(
  results: (MultiTurnResult<TInput, TOutput> | MultiTurnIteratedResult<TInput, TOutput>)[]
): MultiTurnIterationStats {
  const baseStats = calculateIterationStats(results)

  // Extract turns from results (all multi-turn results have totalTurns)
  const turns = results.map((r) => r.totalTurns)

  // Count termination types from termination.terminationType
  const terminationCounts: Record<string, number> = {}
  for (const r of results) {
    const type = r.termination.terminationType
    if (type) {
      terminationCounts[type] = (terminationCounts[type] || 0) + 1
    }
  }

  return {
    ...baseStats,
    avgTurns: turns.length > 0 ? turns.reduce((a, b) => a + b, 0) / turns.length : 0,
    minTurns: turns.length > 0 ? Math.min(...turns) : 0,
    maxTurns: turns.length > 0 ? Math.max(...turns) : 0,
    terminationCounts,
  }
}

/**
 * Select the result closest to the mean score.
 * Used to pick a "representative" result for displaying verdicts/reasoning.
 *
 * The function preserves the full type of the input array, so if you pass
 * `TestResultWithIteration[]`, you get back `TestResultWithIteration`.
 *
 * @param results - Array of results to choose from (must not be empty)
 * @param mean - The mean score to compare against
 * @returns The result with overallScore closest to mean
 * @throws Error if results array is empty
 */
export function selectRepresentativeResult<
  TInput,
  TOutput,
  T extends TestResultWithVerdict<TInput, TOutput> = TestResultWithVerdict<TInput, TOutput>,
>(results: T[], mean: number): T {
  if (results.length === 0) {
    throw new EvalError('Cannot select representative result from empty array', {
      code: EvalErrorCode.UNKNOWN_ERROR,
    })
  }

  return results.reduce((closest, current) => {
    const closestDiff = Math.abs(closest.overallScore - mean)
    const currentDiff = Math.abs(current.overallScore - mean)
    return currentDiff < closestDiff ? current : closest
  })
}

/**
 * Aggregate results from multiple iteration runs into iterated result types.
 *
 * Takes N arrays of results (one per iteration) and groups them by test case,
 * calculating iteration statistics for each test case.
 *
 * For multi-turn tests, returns MultiTurnIteratedResult with multi-turn specific
 * statistics like average turns, min/max turns, and termination type distribution.
 *
 * For single-turn tests, returns SingleTurnIteratedResult with base iteration stats.
 *
 * @param allIterationResults - Array of arrays: outer = iterations, inner = test cases
 * @returns Aggregated results with iteration statistics
 *
 * @example
 * ```typescript
 * // 3 iterations, 2 test cases each
 * const allResults = [
 *   [testCase1_iter1, testCase2_iter1],  // iteration 1
 *   [testCase1_iter2, testCase2_iter2],  // iteration 2
 *   [testCase1_iter3, testCase2_iter3],  // iteration 3
 * ]
 *
 * const aggregated = aggregateIterationResults(allResults)
 * // aggregated[0] = testCase1 with stats from iter1, iter2, iter3
 * // aggregated[1] = testCase2 with stats from iter1, iter2, iter3
 *
 * // For multi-turn tests:
 * // aggregated[0].kind === 'multi-turn-iterated'
 * // aggregated[0].multiTurnIterationStats = { avgTurns, minTurns, maxTurns, terminationCounts }
 * ```
 */
export function aggregateIterationResults<TInput, TOutput>(
  allIterationResults: EvalTestResult<TInput, TOutput>[][]
): (SingleTurnIteratedResult<TInput, TOutput> | MultiTurnIteratedResult<TInput, TOutput>)[] {
  if (allIterationResults.length === 0) {
    return []
  }

  const testCount = allIterationResults[0].length
  const aggregated: (SingleTurnIteratedResult<TInput, TOutput> | MultiTurnIteratedResult<TInput, TOutput>)[] = []

  for (let i = 0; i < testCount; i++) {
    const resultsForTestCase = allIterationResults.map((iteration) => iteration[i])
    const stats = calculateIterationStats(resultsForTestCase)
    const representative = selectRepresentativeResult(resultsForTestCase, stats.mean)
    const isMultiTurn = resultsForTestCase.some((r) => isMultiTurnResult(r))
    const passedByMajority = stats.passRate >= SCORE.MAJORITY_PASS_THRESHOLD

    if (isMultiTurn) {
      const multiTurnResults = resultsForTestCase.filter(
        (r): r is MultiTurnResult<TInput, TOutput> | MultiTurnIteratedResult<TInput, TOutput> =>
          isMultiTurnResult(r)
      )
      const multiTurnRep = representative as MultiTurnResult<TInput, TOutput> | MultiTurnIteratedResult<TInput, TOutput>

      const aggregatedResult: MultiTurnIteratedResult<TInput, TOutput> = {
        kind: 'multi-turn-iterated',
        testCase: multiTurnRep.testCase,
        output: multiTurnRep.output,
        metrics: multiTurnRep.metrics,
        verdicts: multiTurnRep.verdicts,
        error: multiTurnRep.error,
        overallScore: stats.mean,
        passed: passedByMajority,
        iterationStats: stats,
        iterationResults: resultsForTestCase,
        conversationHistory: multiTurnRep.conversationHistory,
        totalTurns: multiTurnRep.totalTurns,
        terminationReason: multiTurnRep.terminationReason,
        termination: multiTurnRep.termination,
        multiTurnIterationStats: calculateMultiTurnIterationStats(multiTurnResults),
      }
      aggregated.push(aggregatedResult)
    } else {
      const aggregatedResult: SingleTurnIteratedResult<TInput, TOutput> = {
        kind: 'single-turn-iterated',
        testCase: representative.testCase,
        output: representative.output,
        metrics: representative.metrics,
        verdicts: representative.verdicts,
        error: representative.error,
        overallScore: stats.mean,
        passed: passedByMajority,
        iterationStats: stats,
        iterationResults: resultsForTestCase,
      }
      aggregated.push(aggregatedResult)
    }
  }

  return aggregated
}

type IteratedResult<TInput, TOutput> = SingleTurnIteratedResult<TInput, TOutput> | MultiTurnIteratedResult<TInput, TOutput>

function filterIteratedResults<TInput, TOutput>(
  results: EvalTestResult<TInput, TOutput>[]
): IteratedResult<TInput, TOutput>[] {
  return results.filter(
    (r): r is IteratedResult<TInput, TOutput> =>
      r.kind === 'single-turn-iterated' || r.kind === 'multi-turn-iterated'
  )
}

function averageIterationStat<TInput, TOutput>(
  results: EvalTestResult<TInput, TOutput>[],
  selector: (stats: IterationStats) => number
): number | undefined {
  const iteratedResults = filterIteratedResults(results)
  if (iteratedResults.length === 0) {
    return undefined
  }
  const total = iteratedResults.reduce((sum, r) => sum + selector(r.iterationStats), 0)
  return total / iteratedResults.length
}

/**
 * Calculate average standard deviation across multiple test results.
 * Used for report summary.
 *
 * @param results - Eval results (only iterated results have stats)
 * @returns Average stdDev across all iterated tests, or undefined if no iteration data
 */
export function calculateAvgStdDev<TInput, TOutput>(
  results: EvalTestResult<TInput, TOutput>[]
): number | undefined {
  return averageIterationStat(results, (stats) => stats.stdDev)
}

/**
 * Calculate average pass rate across multiple test results.
 * Used for report summary.
 *
 * @param results - Eval results (only iterated results have stats)
 * @returns Average passRate across all iterated tests, or undefined if no iteration data
 */
export function calculateAvgPassRate<TInput, TOutput>(
  results: EvalTestResult<TInput, TOutput>[]
): number | undefined {
  return averageIterationStat(results, (stats) => stats.passRate)
}
