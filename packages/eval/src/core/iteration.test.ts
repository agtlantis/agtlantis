import { describe, expect, it } from 'vitest'
import {
  aggregateIterationResults,
  calculateAvgPassRate,
  calculateAvgStdDev,
  calculateIterationStats,
  calculateMultiTurnIterationStats,
  selectRepresentativeResult,
} from './iteration.js'
import type {
  EvalTestResult,
  SingleTurnResult,
  SingleTurnIteratedResult,
  MultiTurnResult,
  MultiTurnIteratedResult,
  TestResultWithVerdict,
} from './types.js'
import { isSingleTurnResult, isMultiTurnResult, isIteratedResult } from './types.js'

// Helper to create base test result (without kind)
function createBaseResult<TInput, TOutput>(
  overrides: Partial<TestResultWithVerdict<TInput, TOutput>> & {
    overallScore: number
    passed: boolean
  }
): Omit<SingleTurnResult<TInput, TOutput>, 'kind'> {
  return {
    testCase: { input: 'test' as TInput },
    output: 'output' as TOutput,
    metrics: {
      latencyMs: 100,
      tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    },
    verdicts: [],
    ...overrides,
  }
}

// Helper to create single-turn test results
function createTestResult<TInput, TOutput>(
  overrides: Partial<TestResultWithVerdict<TInput, TOutput>> & {
    overallScore: number
    passed: boolean
  }
): SingleTurnResult<TInput, TOutput> {
  return {
    kind: 'single-turn',
    ...createBaseResult(overrides),
  }
}

// Helper to create base multi-turn result (without kind)
function createBaseMultiTurnResult<TInput, TOutput>(
  overrides: {
    overallScore: number
    passed: boolean
    totalTurns?: number
    terminationType?: string
  }
): Omit<MultiTurnResult<TInput, TOutput>, 'kind'> {
  return {
    testCase: { input: 'test' as TInput },
    output: 'output' as TOutput,
    metrics: {
      latencyMs: 100,
      tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    },
    verdicts: [],
    overallScore: overrides.overallScore,
    passed: overrides.passed,
    conversationHistory: [
      { turn: 1, input: 'hi' as TInput, output: 'hello' as TOutput },
    ],
    totalTurns: overrides.totalTurns ?? 1,
    terminationReason: overrides.terminationType
      ? `Terminated by ${overrides.terminationType}`
      : 'test',
    termination: {
      terminated: true,
      reason: overrides.terminationType
        ? `Terminated by ${overrides.terminationType}`
        : 'test',
      terminationType: overrides.terminationType,
    },
  }
}

// Helper to create multi-turn test results
function createMultiTurnResult<TInput, TOutput>(
  overrides: {
    overallScore: number
    passed: boolean
    totalTurns?: number
    terminationType?: string
  }
): MultiTurnResult<TInput, TOutput> {
  return {
    kind: 'multi-turn',
    ...createBaseMultiTurnResult(overrides),
  }
}

describe('calculateIterationStats', () => {
  it('should calculate stats for multiple results', () => {
    const results = [
      createTestResult({ overallScore: 80, passed: true }),
      createTestResult({ overallScore: 90, passed: true }),
      createTestResult({ overallScore: 85, passed: true }),
    ]

    const stats = calculateIterationStats(results)

    expect(stats.iterations).toBe(3)
    expect(stats.scores).toEqual([80, 90, 85])
    expect(stats.mean).toBe(85)
    expect(stats.min).toBe(80)
    expect(stats.max).toBe(90)
    expect(stats.passRate).toBe(1)
    expect(stats.passCount).toBe(3)

    // stdDev = sqrt(((80-85)^2 + (90-85)^2 + (85-85)^2) / 3)
    // = sqrt((25 + 25 + 0) / 3) = sqrt(50/3) ≈ 4.08
    expect(stats.stdDev).toBeCloseTo(4.08, 2)
  })

  it('should handle single result', () => {
    const results = [createTestResult({ overallScore: 75, passed: true })]

    const stats = calculateIterationStats(results)

    expect(stats.iterations).toBe(1)
    expect(stats.scores).toEqual([75])
    expect(stats.mean).toBe(75)
    expect(stats.stdDev).toBe(0) // No variance with single result
    expect(stats.min).toBe(75)
    expect(stats.max).toBe(75)
    expect(stats.passRate).toBe(1)
    expect(stats.passCount).toBe(1)
  })

  it('should handle empty results', () => {
    const stats = calculateIterationStats([])

    expect(stats.iterations).toBe(0)
    expect(stats.scores).toEqual([])
    expect(stats.mean).toBe(0)
    expect(stats.stdDev).toBe(0)
    expect(stats.min).toBe(0)
    expect(stats.max).toBe(0)
    expect(stats.passRate).toBe(0)
    expect(stats.passCount).toBe(0)
  })

  it('should calculate correct pass rate with mixed results', () => {
    const results = [
      createTestResult({ overallScore: 80, passed: true }),
      createTestResult({ overallScore: 60, passed: false }),
      createTestResult({ overallScore: 75, passed: true }),
    ]

    const stats = calculateIterationStats(results)

    expect(stats.passRate).toBeCloseTo(0.667, 2) // 2 of 3 passed
    expect(stats.passCount).toBe(2)
  })

  it('should handle all failed results', () => {
    const results = [
      createTestResult({ overallScore: 40, passed: false }),
      createTestResult({ overallScore: 50, passed: false }),
    ]

    const stats = calculateIterationStats(results)

    expect(stats.passRate).toBe(0)
    expect(stats.passCount).toBe(0)
    expect(stats.mean).toBe(45)
  })
})

describe('selectRepresentativeResult', () => {
  it('should select result closest to mean', () => {
    const results = [
      createTestResult({ overallScore: 80, passed: true }),
      createTestResult({ overallScore: 90, passed: true }),
      createTestResult({ overallScore: 85, passed: true }),
    ]

    // Mean is 85
    const representative = selectRepresentativeResult(results, 85)

    expect(representative.overallScore).toBe(85)
  })

  it('should handle tie by selecting first match', () => {
    const results = [
      createTestResult({ overallScore: 80, passed: true }),
      createTestResult({ overallScore: 90, passed: true }),
    ]

    // Mean is 85, both are equidistant (5 away)
    const representative = selectRepresentativeResult(results, 85)

    // reduce keeps first one when equal
    expect(representative.overallScore).toBe(80)
  })

  it('should work with single result', () => {
    const results = [createTestResult({ overallScore: 75, passed: true })]

    const representative = selectRepresentativeResult(results, 75)

    expect(representative.overallScore).toBe(75)
  })

  it('should throw error for empty results', () => {
    expect(() => selectRepresentativeResult([], 85)).toThrow(
      'Cannot select representative result from empty array'
    )
  })
})

describe('aggregateIterationResults', () => {
  it('should aggregate results by test case', () => {
    // 2 iterations, 2 test cases each
    const allResults = [
      // Iteration 1
      [
        createTestResult({ overallScore: 80, passed: true }),
        createTestResult({ overallScore: 70, passed: true }),
      ],
      // Iteration 2
      [
        createTestResult({ overallScore: 90, passed: true }),
        createTestResult({ overallScore: 60, passed: false }),
      ],
    ]

    const aggregated = aggregateIterationResults(allResults)

    expect(aggregated).toHaveLength(2)

    // Test case 1: scores 80, 90 → mean 85
    expect(aggregated[0].overallScore).toBe(85)
    expect(aggregated[0].passed).toBe(true) // 100% pass rate
    expect(aggregated[0].iterationStats).toBeDefined()
    expect(aggregated[0].iterationStats.mean).toBe(85)
    expect(aggregated[0].iterationStats.passRate).toBe(1)
    expect(aggregated[0].iterationResults).toHaveLength(2)

    // Test case 2: scores 70, 60 → mean 65
    expect(aggregated[1].overallScore).toBe(65)
    expect(aggregated[1].passed).toBe(true) // 50% pass rate (>= 0.5 passes)
    expect(aggregated[1].iterationStats.passRate).toBe(0.5)
  })

  it('should handle empty input', () => {
    const aggregated = aggregateIterationResults([])

    expect(aggregated).toEqual([])
  })

  it('should handle single iteration (edge case)', () => {
    const allResults = [
      [
        createTestResult({ overallScore: 85, passed: true }),
      ],
    ]

    const aggregated = aggregateIterationResults(allResults)

    expect(aggregated).toHaveLength(1)
    expect(aggregated[0].overallScore).toBe(85)
    expect(aggregated[0].iterationStats.iterations).toBe(1)
    expect(aggregated[0].iterationStats.stdDev).toBe(0)
  })

  it('should determine passed based on majority (>= 0.5)', () => {
    // 3 iterations
    const allResults = [
      [createTestResult({ overallScore: 80, passed: true })],
      [createTestResult({ overallScore: 60, passed: false })],
      [createTestResult({ overallScore: 70, passed: true })],
    ]

    const aggregated = aggregateIterationResults(allResults)

    // 2 of 3 passed (66.7%) → passed
    expect(aggregated[0].passed).toBe(true)
    expect(aggregated[0].iterationStats.passRate).toBeCloseTo(0.667, 2)
  })

  it('should fail when exactly half pass', () => {
    // 2 iterations, one pass one fail
    const allResults = [
      [createTestResult({ overallScore: 80, passed: true })],
      [createTestResult({ overallScore: 60, passed: false })],
    ]

    const aggregated = aggregateIterationResults(allResults)

    // 1 of 2 passed (50%) → passed (>= 0.5)
    expect(aggregated[0].passed).toBe(true)
    expect(aggregated[0].iterationStats.passRate).toBe(0.5)
  })

  it('should fail when minority passes', () => {
    // 3 iterations, 1 pass 2 fail
    const allResults = [
      [createTestResult({ overallScore: 80, passed: true })],
      [createTestResult({ overallScore: 60, passed: false })],
      [createTestResult({ overallScore: 50, passed: false })],
    ]

    const aggregated = aggregateIterationResults(allResults)

    // 1 of 3 passed (33.3%) → failed
    expect(aggregated[0].passed).toBe(false)
    expect(aggregated[0].iterationStats.passRate).toBeCloseTo(0.333, 2)
  })

  it('should select representative result closest to mean', () => {
    // 3 iterations with varying verdicts
    const allResults = [
      [
        createTestResult({
          overallScore: 80,
          passed: true,
          verdicts: [{ criterionId: 'a', score: 80, reasoning: 'iter1', passed: true }],
        }),
      ],
      [
        createTestResult({
          overallScore: 85,
          passed: true,
          verdicts: [{ criterionId: 'a', score: 85, reasoning: 'iter2', passed: true }],
        }),
      ],
      [
        createTestResult({
          overallScore: 90,
          passed: true,
          verdicts: [{ criterionId: 'a', score: 90, reasoning: 'iter3', passed: true }],
        }),
      ],
    ]

    const aggregated = aggregateIterationResults(allResults)

    // Mean is 85, so representative should have score 85
    expect(aggregated[0].verdicts[0].reasoning).toBe('iter2')
  })
})

describe('calculateAvgStdDev', () => {
  it('should calculate average stdDev across results', () => {
    const results: SingleTurnIteratedResult<unknown, unknown>[] = [
      {
        kind: 'single-turn-iterated',
        ...createBaseResult({ overallScore: 85, passed: true }),
        iterationStats: {
          iterations: 3,
          scores: [80, 85, 90],
          mean: 85,
          stdDev: 4.08,
          min: 80,
          max: 90,
          passRate: 1,
          passCount: 3,
        },
        iterationResults: [],
      },
      {
        kind: 'single-turn-iterated',
        ...createBaseResult({ overallScore: 75, passed: true }),
        iterationStats: {
          iterations: 3,
          scores: [70, 75, 80],
          mean: 75,
          stdDev: 4.08,
          min: 70,
          max: 80,
          passRate: 1,
          passCount: 3,
        },
        iterationResults: [],
      },
    ]

    const avgStdDev = calculateAvgStdDev(results)

    expect(avgStdDev).toBeCloseTo(4.08, 2)
  })

  it('should return undefined for results without iteration stats', () => {
    const results: EvalTestResult<unknown, unknown>[] = [
      createTestResult({ overallScore: 85, passed: true }),
    ]

    const avgStdDev = calculateAvgStdDev(results)

    expect(avgStdDev).toBeUndefined()
  })
})

describe('calculateAvgPassRate', () => {
  it('should calculate average pass rate across results', () => {
    const results: SingleTurnIteratedResult<unknown, unknown>[] = [
      {
        kind: 'single-turn-iterated',
        ...createBaseResult({ overallScore: 85, passed: true }),
        iterationStats: {
          iterations: 3,
          scores: [80, 85, 90],
          mean: 85,
          stdDev: 4.08,
          min: 80,
          max: 90,
          passRate: 1,
          passCount: 3,
        },
        iterationResults: [],
      },
      {
        kind: 'single-turn-iterated',
        ...createBaseResult({ overallScore: 65, passed: false }),
        iterationStats: {
          iterations: 3,
          scores: [60, 65, 70],
          mean: 65,
          stdDev: 4.08,
          min: 60,
          max: 70,
          passRate: 0.333,
          passCount: 1,
        },
        iterationResults: [],
      },
    ]

    const avgPassRate = calculateAvgPassRate(results)

    // (1 + 0.333) / 2 = 0.6665
    expect(avgPassRate).toBeCloseTo(0.6665, 2)
  })

  it('should return undefined for results without iteration stats', () => {
    const results: EvalTestResult<unknown, unknown>[] = [
      createTestResult({ overallScore: 85, passed: true }),
    ]

    const avgPassRate = calculateAvgPassRate(results)

    expect(avgPassRate).toBeUndefined()
  })
})

// ============================================================================
// Multi-turn Iteration Tests (Phase 7.2)
// ============================================================================

describe('calculateMultiTurnIterationStats', () => {
  it('should calculate avgTurns across iterations', () => {
    const results = [
      createMultiTurnResult({ overallScore: 80, passed: true, totalTurns: 3, terminationType: 'condition' }),
      createMultiTurnResult({ overallScore: 90, passed: true, totalTurns: 5, terminationType: 'condition' }),
      createMultiTurnResult({ overallScore: 85, passed: true, totalTurns: 4, terminationType: 'maxTurns' }),
    ]

    const stats = calculateMultiTurnIterationStats(results)

    expect(stats.avgTurns).toBe(4) // (3 + 5 + 4) / 3
    expect(stats.minTurns).toBe(3)
    expect(stats.maxTurns).toBe(5)
  })

  it('should count termination types correctly', () => {
    const results = [
      createMultiTurnResult({ overallScore: 80, passed: true, totalTurns: 3, terminationType: 'condition' }),
      createMultiTurnResult({ overallScore: 90, passed: true, totalTurns: 5, terminationType: 'condition' }),
      createMultiTurnResult({ overallScore: 85, passed: true, totalTurns: 4, terminationType: 'maxTurns' }),
    ]

    const stats = calculateMultiTurnIterationStats(results)

    expect(stats.terminationCounts).toEqual({
      condition: 2,
      maxTurns: 1,
    })
  })

  it('should include base iteration stats', () => {
    const results = [
      createMultiTurnResult({ overallScore: 80, passed: true, totalTurns: 3, terminationType: 'condition' }),
      createMultiTurnResult({ overallScore: 90, passed: true, totalTurns: 5, terminationType: 'condition' }),
    ]

    const stats = calculateMultiTurnIterationStats(results)

    // Base stats should be present
    expect(stats.iterations).toBe(2)
    expect(stats.mean).toBe(85)
    expect(stats.passRate).toBe(1)
    expect(stats.scores).toEqual([80, 90])
  })

  it('should handle empty results', () => {
    const stats = calculateMultiTurnIterationStats([])

    expect(stats.avgTurns).toBe(0)
    expect(stats.minTurns).toBe(0)
    expect(stats.maxTurns).toBe(0)
    expect(stats.terminationCounts).toEqual({})
    expect(stats.iterations).toBe(0)
  })

  it('should handle results without termination type', () => {
    // Create a result without terminationType
    const result: MultiTurnResult<unknown, unknown> = {
      ...createMultiTurnResult({ overallScore: 80, passed: true, totalTurns: 3, terminationType: 'condition' }),
      termination: {
        terminated: true,
        reason: 'Some reason',
        // No terminationType
      },
    }

    const stats = calculateMultiTurnIterationStats([result])

    expect(stats.terminationCounts).toEqual({}) // No counts when no terminationType
  })
})

describe('aggregateIterationResults with multi-turn', () => {
  it('should detect multi-turn results and add multiTurnIterationStats', () => {
    // 3 iterations of a multi-turn test
    const allResults = [
      [createMultiTurnResult({ overallScore: 80, passed: true, totalTurns: 3, terminationType: 'condition' })],
      [createMultiTurnResult({ overallScore: 90, passed: true, totalTurns: 5, terminationType: 'condition' })],
      [createMultiTurnResult({ overallScore: 85, passed: true, totalTurns: 4, terminationType: 'maxTurns' })],
    ]

    const aggregated = aggregateIterationResults(allResults)

    expect(aggregated).toHaveLength(1)

    // Type guard to access multi-turn properties
    const result = aggregated[0]
    expect(result.kind).toBe('multi-turn-iterated')
    if (result.kind === 'multi-turn-iterated') {
      expect(result.multiTurnIterationStats).toBeDefined()
      expect(result.multiTurnIterationStats.avgTurns).toBe(4)
      expect(result.multiTurnIterationStats.minTurns).toBe(3)
      expect(result.multiTurnIterationStats.maxTurns).toBe(5)
      expect(result.multiTurnIterationStats.terminationCounts).toEqual({
        condition: 2,
        maxTurns: 1,
      })
    }
  })

  it('should preserve conversationHistory from representative result', () => {
    const allResults = [
      [createMultiTurnResult({ overallScore: 80, passed: true, totalTurns: 3, terminationType: 'condition' })],
      [createMultiTurnResult({ overallScore: 85, passed: true, totalTurns: 4, terminationType: 'condition' })],
      [createMultiTurnResult({ overallScore: 90, passed: true, totalTurns: 5, terminationType: 'maxTurns' })],
    ]

    const aggregated = aggregateIterationResults(allResults)
    const result = aggregated[0]

    // Mean is 85, so representative should be the result with score 85
    expect(result.kind).toBe('multi-turn-iterated')
    if (result.kind === 'multi-turn-iterated') {
      expect(result.conversationHistory).toBeDefined()
      expect(result.totalTurns).toBe(4) // From representative (score 85)
    }
  })

  it('should NOT add multiTurnIterationStats for single-turn tests', () => {
    const allResults = [
      [createTestResult({ overallScore: 80, passed: true })],
      [createTestResult({ overallScore: 90, passed: true })],
    ]

    const aggregated = aggregateIterationResults(allResults)
    const result = aggregated[0]

    expect(result.kind).toBe('single-turn-iterated')
    if (result.kind === 'single-turn-iterated') {
      // Single-turn iterated result doesn't have multiTurnIterationStats
      expect('multiTurnIterationStats' in result).toBe(false)
      expect('conversationHistory' in result).toBe(false)
    }
  })

  it('should handle mixed single-turn and multi-turn in same suite', () => {
    // 2 iterations, 2 test cases (one single-turn, one multi-turn)
    const allResults = [
      [
        createTestResult({ overallScore: 80, passed: true }), // Single-turn
        createMultiTurnResult({ overallScore: 70, passed: true, totalTurns: 3, terminationType: 'condition' }), // Multi-turn
      ],
      [
        createTestResult({ overallScore: 90, passed: true }), // Single-turn
        createMultiTurnResult({ overallScore: 80, passed: true, totalTurns: 4, terminationType: 'maxTurns' }), // Multi-turn
      ],
    ]

    const aggregated = aggregateIterationResults(allResults)

    expect(aggregated).toHaveLength(2)

    // First test case: single-turn, no multi-turn stats
    const firstResult = aggregated[0]
    expect(firstResult.kind).toBe('single-turn-iterated')
    expect(firstResult.overallScore).toBe(85) // (80 + 90) / 2

    // Second test case: multi-turn, has multi-turn stats
    const secondResult = aggregated[1]
    expect(secondResult.kind).toBe('multi-turn-iterated')
    if (secondResult.kind === 'multi-turn-iterated') {
      expect(secondResult.multiTurnIterationStats).toBeDefined()
      expect(secondResult.multiTurnIterationStats.avgTurns).toBe(3.5) // (3 + 4) / 2
    }
    expect(secondResult.overallScore).toBe(75) // (70 + 80) / 2
  })
})

// ============================================================================
// Type Guard Tests (Discriminated Union)
// ============================================================================

describe('isSingleTurnResult', () => {
  it('should return true for single-turn result', () => {
    const result = createTestResult({ overallScore: 85, passed: true })
    expect(isSingleTurnResult(result)).toBe(true)
  })

  it('should return true for single-turn-iterated result', () => {
    const result: SingleTurnIteratedResult<unknown, unknown> = {
      kind: 'single-turn-iterated',
      ...createBaseResult({ overallScore: 85, passed: true }),
      iterationStats: {
        iterations: 3,
        scores: [80, 85, 90],
        mean: 85,
        stdDev: 4.08,
        min: 80,
        max: 90,
        passRate: 1,
        passCount: 3,
      },
      iterationResults: [],
    }
    expect(isSingleTurnResult(result)).toBe(true)
  })

  it('should return false for multi-turn result', () => {
    const result = createMultiTurnResult({ overallScore: 85, passed: true, totalTurns: 3 })
    expect(isSingleTurnResult(result)).toBe(false)
  })
})

describe('isMultiTurnResult', () => {
  it('should return true for multi-turn result', () => {
    const result = createMultiTurnResult({ overallScore: 85, passed: true, totalTurns: 3 })
    expect(isMultiTurnResult(result)).toBe(true)
  })

  it('should return true for multi-turn-iterated result', () => {
    const result: MultiTurnIteratedResult<unknown, unknown> = {
      kind: 'multi-turn-iterated',
      ...createBaseMultiTurnResult({ overallScore: 85, passed: true, totalTurns: 4 }),
      iterationStats: {
        iterations: 3,
        scores: [80, 85, 90],
        mean: 85,
        stdDev: 4.08,
        min: 80,
        max: 90,
        passRate: 1,
        passCount: 3,
      },
      iterationResults: [],
      multiTurnIterationStats: {
        iterations: 3,
        scores: [80, 85, 90],
        mean: 85,
        stdDev: 4.08,
        min: 80,
        max: 90,
        passRate: 1,
        passCount: 3,
        avgTurns: 4,
        minTurns: 3,
        maxTurns: 5,
        terminationCounts: { condition: 2, maxTurns: 1 },
      },
    }
    expect(isMultiTurnResult(result)).toBe(true)
  })

  it('should return false for single-turn result', () => {
    const result = createTestResult({ overallScore: 85, passed: true })
    expect(isMultiTurnResult(result)).toBe(false)
  })
})

describe('isIteratedResult', () => {
  it('should return true for single-turn-iterated result', () => {
    const result: SingleTurnIteratedResult<unknown, unknown> = {
      kind: 'single-turn-iterated',
      ...createBaseResult({ overallScore: 85, passed: true }),
      iterationStats: {
        iterations: 3,
        scores: [80, 85, 90],
        mean: 85,
        stdDev: 4.08,
        min: 80,
        max: 90,
        passRate: 1,
        passCount: 3,
      },
      iterationResults: [],
    }
    expect(isIteratedResult(result)).toBe(true)
  })

  it('should return true for multi-turn-iterated result', () => {
    const result: MultiTurnIteratedResult<unknown, unknown> = {
      kind: 'multi-turn-iterated',
      ...createBaseMultiTurnResult({ overallScore: 85, passed: true, totalTurns: 4 }),
      iterationStats: {
        iterations: 3,
        scores: [80, 85, 90],
        mean: 85,
        stdDev: 4.08,
        min: 80,
        max: 90,
        passRate: 1,
        passCount: 3,
      },
      iterationResults: [],
      multiTurnIterationStats: {
        iterations: 3,
        scores: [80, 85, 90],
        mean: 85,
        stdDev: 4.08,
        min: 80,
        max: 90,
        passRate: 1,
        passCount: 3,
        avgTurns: 4,
        minTurns: 3,
        maxTurns: 5,
        terminationCounts: { condition: 2, maxTurns: 1 },
      },
    }
    expect(isIteratedResult(result)).toBe(true)
  })

  it('should return false for non-iterated single-turn result', () => {
    const result = createTestResult({ overallScore: 85, passed: true })
    expect(isIteratedResult(result)).toBe(false)
  })

  it('should return false for non-iterated multi-turn result', () => {
    const result = createMultiTurnResult({ overallScore: 85, passed: true, totalTurns: 3 })
    expect(isIteratedResult(result)).toBe(false)
  })
})
