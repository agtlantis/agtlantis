/**
 * Tests for Cycle Termination Conditions
 *
 * Following testing guidelines:
 * - Blackbox testing (verify behavior, not implementation)
 * - AAA structure with meaningful test data
 * - Factory functions for test fixtures
 */

import { describe, it, expect } from 'vitest'
import {
  targetScore,
  maxRounds,
  noImprovement,
  maxCost,
  customCondition,
  checkCycleCondition,
  checkCycleTermination,
  and,
  or,
  not,
} from './conditions'
import type {
  CycleContext,
  RoundResult,
  RoundCost,
  SerializedPrompt,
} from './types'
import type { EvalReport } from '@/reporter/types'
import { EvalError } from '@/core/errors'

// =============================================================================
// Test Fixtures
// =============================================================================

function createCycleContext(overrides?: Partial<CycleContext>): CycleContext {
  return {
    currentRound: 1,
    latestScore: 50,
    previousScores: [],
    totalCost: 0,
    history: [],
    ...overrides,
  }
}

function createRoundResult(overrides?: Partial<RoundResult>): RoundResult {
  const defaultCost: RoundCost = { agent: 0, judge: 0, improver: 0, total: 0 }
  const defaultSnapshot: SerializedPrompt = {
    id: 'test-prompt',
    version: '1.0.0',
    system: 'Test system prompt',
    userTemplate: 'Test user template',
  }

  return {
    round: 1,
    completedAt: new Date(),
    report: {} as EvalReport<unknown, unknown>,
    suggestionsGenerated: [],
    suggestionsApproved: [],
    promptSnapshot: defaultSnapshot,
    promptVersionAfter: '1.0.0',
    cost: defaultCost,
    scoreDelta: null,
    ...overrides,
  }
}

// =============================================================================
// targetScore Tests
// =============================================================================

describe('targetScore', () => {
  it('should terminate when score reaches threshold', async () => {
    const condition = targetScore(85)
    const ctx = createCycleContext({ latestScore: 90 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
    expect(result.matchedCondition?.type).toBe('targetScore')
  })

  it('should continue when score is below threshold', async () => {
    const condition = targetScore(85)
    const ctx = createCycleContext({ latestScore: 80 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
  })

  it('should terminate at exact threshold (>=)', async () => {
    const condition = targetScore(85)
    const ctx = createCycleContext({ latestScore: 85 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })
})

// =============================================================================
// maxRounds Tests
// =============================================================================

describe('maxRounds', () => {
  it('should terminate when round count reached', async () => {
    const condition = maxRounds(5)
    const ctx = createCycleContext({ currentRound: 5 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })

  it('should continue before reaching max rounds', async () => {
    const condition = maxRounds(5)
    const ctx = createCycleContext({ currentRound: 3 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
  })

  it('should terminate when exceeding max rounds', async () => {
    const condition = maxRounds(5)
    const ctx = createCycleContext({ currentRound: 7 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })
})

// =============================================================================
// noImprovement Tests
// =============================================================================

describe('noImprovement', () => {
  it('should terminate after N consecutive rounds without improvement', async () => {
    const condition = noImprovement(3)
    const ctx = createCycleContext({
      currentRound: 5,
      history: [
        createRoundResult({ round: 1, scoreDelta: null }),
        createRoundResult({ round: 2, scoreDelta: 5 }), // improvement
        createRoundResult({ round: 3, scoreDelta: 0 }), // no improvement
        createRoundResult({ round: 4, scoreDelta: -1 }), // no improvement
        createRoundResult({ round: 5, scoreDelta: 0 }), // no improvement (3rd)
      ],
    })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
    expect(result.matchedCondition?.type).toBe('noImprovement')
  })

  it('should reset count when improvement occurs', async () => {
    const condition = noImprovement(3)
    const ctx = createCycleContext({
      currentRound: 4,
      history: [
        createRoundResult({ round: 1, scoreDelta: null }),
        createRoundResult({ round: 2, scoreDelta: 0 }), // no improvement
        createRoundResult({ round: 3, scoreDelta: 0 }), // no improvement
        createRoundResult({ round: 4, scoreDelta: 2 }), // improvement! resets count
      ],
    })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
  })

  it('should respect minDelta parameter', async () => {
    const condition = noImprovement(2, 1) // need > 1 to count as improvement
    const ctx = createCycleContext({
      currentRound: 3,
      history: [
        createRoundResult({ round: 1, scoreDelta: null }),
        createRoundResult({ round: 2, scoreDelta: 0.5 }), // <= 1, no improvement
        createRoundResult({ round: 3, scoreDelta: 1 }), // <= 1, no improvement (2nd)
      ],
    })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })

  it('should not terminate with empty history', async () => {
    const condition = noImprovement(3)
    const ctx = createCycleContext({ history: [] })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
  })

  it('should not terminate with only first round (null delta)', async () => {
    const condition = noImprovement(1)
    const ctx = createCycleContext({
      currentRound: 1,
      history: [createRoundResult({ round: 1, scoreDelta: null })],
    })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
  })

  it('should count from most recent rounds', async () => {
    const condition = noImprovement(2)
    const ctx = createCycleContext({
      currentRound: 4,
      history: [
        createRoundResult({ round: 1, scoreDelta: null }),
        createRoundResult({ round: 2, scoreDelta: 0 }), // no improvement
        createRoundResult({ round: 3, scoreDelta: 5 }), // improvement - breaks streak
        createRoundResult({ round: 4, scoreDelta: 0 }), // no improvement (only 1 so far)
      ],
    })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
    expect(result.reason).toContain('1 round without improvement')
  })
})

// =============================================================================
// maxCost Tests
// =============================================================================

describe('maxCost', () => {
  it('should terminate when cost exceeds budget', async () => {
    const condition = maxCost(10.0)
    const ctx = createCycleContext({ totalCost: 12.5 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
    expect(result.matchedCondition?.type).toBe('maxCost')
  })

  it('should continue when under budget', async () => {
    const condition = maxCost(10.0)
    const ctx = createCycleContext({ totalCost: 5.0 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
  })

  it('should terminate at exact budget (>=)', async () => {
    const condition = maxCost(10.0)
    const ctx = createCycleContext({ totalCost: 10.0 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })
})

// =============================================================================
// customCondition Tests
// =============================================================================

describe('customCondition', () => {
  it('should support sync check functions', async () => {
    const condition = customCondition((ctx) => ctx.latestScore > 90, 'Score above 90')
    const ctx = createCycleContext({ latestScore: 95 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
    expect(result.matchedCondition?.type).toBe('custom')
  })

  it('should support async check functions', async () => {
    const condition = customCondition(
      async (ctx) => {
        await Promise.resolve() // simulate async operation
        return ctx.latestScore > 90
      },
      'Async score check'
    )
    const ctx = createCycleContext({ latestScore: 95 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })

  it('should not terminate on check error', async () => {
    const condition = customCondition(
      async () => {
        throw new Error('Check failed')
      },
      'Failing check'
    )
    const ctx = createCycleContext()

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
    expect(result.reason).toContain('failed')
    expect(result.reason).toContain('Check failed')
  })

  it('should use default description when not provided', async () => {
    const condition = customCondition((ctx) => ctx.currentRound > 10)
    const ctx = createCycleContext({ currentRound: 5 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
    expect(result.reason).toContain('Custom condition')
  })
})

// =============================================================================
// checkCycleTermination Tests (OR semantics)
// =============================================================================

describe('checkCycleTermination', () => {
  it('should use OR semantics - first match wins', async () => {
    const ctx = createCycleContext({ currentRound: 5, latestScore: 60 })
    const conditions = [targetScore(90), maxRounds(5)]

    const result = await checkCycleTermination(conditions, ctx)

    expect(result.terminated).toBe(true)
    expect(result.matchedCondition?.type).toBe('maxRounds') // first to match
  })

  it('should return first matching condition in order', async () => {
    const ctx = createCycleContext({ currentRound: 5, latestScore: 95 })
    const conditions = [targetScore(90), maxRounds(5)]

    const result = await checkCycleTermination(conditions, ctx)

    expect(result.terminated).toBe(true)
    expect(result.matchedCondition?.type).toBe('targetScore') // checked first
  })

  it('should return continue when no conditions met', async () => {
    const ctx = createCycleContext({ currentRound: 2, latestScore: 50 })
    const conditions = [targetScore(90), maxRounds(5)]

    const result = await checkCycleTermination(conditions, ctx)

    expect(result.terminated).toBe(false)
    expect(result.reason).toBe('No termination conditions met')
  })

  it('should handle empty conditions array', async () => {
    const ctx = createCycleContext()

    const result = await checkCycleTermination([], ctx)

    expect(result.terminated).toBe(false)
    expect(result.reason).toBe('No termination conditions specified')
  })

  it('should check all condition types', async () => {
    const ctx = createCycleContext({
      currentRound: 3,
      latestScore: 80,
      totalCost: 5.0,
      history: [
        createRoundResult({ round: 1, scoreDelta: null }),
        createRoundResult({ round: 2, scoreDelta: 5 }),
        createRoundResult({ round: 3, scoreDelta: 3 }),
      ],
    })

    const conditions = [
      targetScore(90),
      maxRounds(5),
      noImprovement(3),
      maxCost(10.0),
      customCondition((c) => c.latestScore < 50, 'Score too low'),
    ]

    const result = await checkCycleTermination(conditions, ctx)

    expect(result.terminated).toBe(false)
  })
})

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('factory functions', () => {
  it('targetScore should create correct condition type', () => {
    const condition = targetScore(85)

    expect(condition.type).toBe('targetScore')
    expect(condition.threshold).toBe(85)
  })

  it('maxRounds should create correct condition type', () => {
    const condition = maxRounds(10)

    expect(condition.type).toBe('maxRounds')
    expect(condition.count).toBe(10)
  })

  it('noImprovement should create correct condition type', () => {
    const condition = noImprovement(3, 0.5)

    expect(condition.type).toBe('noImprovement')
    expect(condition.consecutiveRounds).toBe(3)
    expect(condition.minDelta).toBe(0.5)
  })

  it('noImprovement should omit minDelta when undefined', () => {
    const condition = noImprovement(3)

    expect(condition.type).toBe('noImprovement')
    expect(condition.consecutiveRounds).toBe(3)
    expect('minDelta' in condition).toBe(false)
  })

  it('maxCost should create correct condition type', () => {
    const condition = maxCost(25.5)

    expect(condition.type).toBe('maxCost')
    expect(condition.maxUSD).toBe(25.5)
  })

  it('customCondition should create correct condition type', () => {
    const checkFn = (ctx: CycleContext) => ctx.latestScore > 90
    const condition = customCondition(checkFn, 'High score')

    expect(condition.type).toBe('custom')
    expect(condition.check).toBe(checkFn)
    expect(condition.description).toBe('High score')
  })

  it('customCondition should omit description when undefined', () => {
    const checkFn = (ctx: CycleContext) => ctx.latestScore > 90
    const condition = customCondition(checkFn)

    expect(condition.type).toBe('custom')
    expect('description' in condition).toBe(false)
  })
})

// =============================================================================
// Factory Input Validation Tests
// =============================================================================

describe('Factory Input Validation', () => {
  describe('targetScore validation', () => {
    it('should throw for NaN', () => {
      expect(() => targetScore(NaN)).toThrow(EvalError)
    })

    it('should throw for Infinity', () => {
      expect(() => targetScore(Infinity)).toThrow(EvalError)
    })

    it('should throw for -Infinity', () => {
      expect(() => targetScore(-Infinity)).toThrow(EvalError)
    })

    it('should throw for negative threshold', () => {
      expect(() => targetScore(-1)).toThrow(EvalError)
    })

    it('should throw for threshold > 100', () => {
      expect(() => targetScore(101)).toThrow(EvalError)
    })

    it('should accept boundary value 0', () => {
      expect(() => targetScore(0)).not.toThrow()
    })

    it('should accept boundary value 100', () => {
      expect(() => targetScore(100)).not.toThrow()
    })
  })

  describe('maxRounds validation', () => {
    it('should throw for zero', () => {
      expect(() => maxRounds(0)).toThrow(EvalError)
    })

    it('should throw for negative count', () => {
      expect(() => maxRounds(-1)).toThrow(EvalError)
    })

    it('should throw for non-integer', () => {
      expect(() => maxRounds(1.5)).toThrow(EvalError)
    })

    it('should throw for NaN', () => {
      expect(() => maxRounds(NaN)).toThrow(EvalError)
    })

    it('should throw for Infinity', () => {
      expect(() => maxRounds(Infinity)).toThrow(EvalError)
    })

    it('should accept positive integers', () => {
      expect(() => maxRounds(1)).not.toThrow()
      expect(() => maxRounds(100)).not.toThrow()
    })
  })

  describe('maxCost validation', () => {
    it('should throw for zero', () => {
      expect(() => maxCost(0)).toThrow(EvalError)
    })

    it('should throw for negative cost', () => {
      expect(() => maxCost(-1)).toThrow(EvalError)
    })

    it('should throw for NaN', () => {
      expect(() => maxCost(NaN)).toThrow(EvalError)
    })

    it('should throw for Infinity', () => {
      expect(() => maxCost(Infinity)).toThrow(EvalError)
    })

    it('should accept positive numbers', () => {
      expect(() => maxCost(0.01)).not.toThrow()
      expect(() => maxCost(100)).not.toThrow()
    })
  })

  describe('noImprovement validation', () => {
    it('should throw for zero consecutiveRounds', () => {
      expect(() => noImprovement(0)).toThrow(EvalError)
    })

    it('should throw for negative consecutiveRounds', () => {
      expect(() => noImprovement(-1)).toThrow(EvalError)
    })

    it('should throw for non-integer consecutiveRounds', () => {
      expect(() => noImprovement(1.5)).toThrow(EvalError)
    })

    it('should throw for NaN consecutiveRounds', () => {
      expect(() => noImprovement(NaN)).toThrow(EvalError)
    })

    it('should throw for negative minDelta', () => {
      expect(() => noImprovement(2, -1)).toThrow(EvalError)
    })

    it('should throw for NaN minDelta', () => {
      expect(() => noImprovement(2, NaN)).toThrow(EvalError)
    })

    it('should throw for Infinity minDelta', () => {
      expect(() => noImprovement(2, Infinity)).toThrow(EvalError)
    })

    it('should accept valid consecutiveRounds', () => {
      expect(() => noImprovement(1)).not.toThrow()
      expect(() => noImprovement(10)).not.toThrow()
    })

    it('should accept zero minDelta', () => {
      expect(() => noImprovement(2, 0)).not.toThrow()
    })

    it('should accept positive minDelta', () => {
      expect(() => noImprovement(2, 5)).not.toThrow()
    })
  })
})

// =============================================================================
// Composite Condition Tests (and, or, not)
// =============================================================================

describe('and', () => {
  it('should return true when all conditions are met', async () => {
    const condition = and(targetScore(80), maxRounds(5))
    const ctx = createCycleContext({
      latestScore: 85,
      currentRound: 5,
    })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })

  it('should return false when any condition is not met', async () => {
    const condition = and(targetScore(90), maxRounds(5))
    const ctx = createCycleContext({
      latestScore: 85, // Below 90
      currentRound: 5,
    })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
  })

  it('should short-circuit on first false condition', async () => {
    let secondChecked = false

    const condition = and(
      targetScore(90), // Will fail first
      customCondition(() => {
        secondChecked = true
        return true
      })
    )
    const ctx = createCycleContext({ latestScore: 80 })

    await checkCycleCondition(condition, ctx)

    expect(secondChecked).toBe(false)
  })

  it('should return false for empty conditions', async () => {
    const condition = and()
    const ctx = createCycleContext()

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
    expect(condition.description).toContain('empty')
  })

  it('should work with single condition', async () => {
    const condition = and(targetScore(80))
    const ctx = createCycleContext({ latestScore: 85 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })

  it('should have descriptive description', () => {
    const condition = and(targetScore(90), maxRounds(5))

    expect(condition.description).toBe('and(targetScore, maxRounds)')
  })
})

describe('or', () => {
  it('should return true when any condition is met', async () => {
    const condition = or(targetScore(90), maxRounds(5))
    const ctx = createCycleContext({
      latestScore: 80, // Below 90
      currentRound: 5, // At max
    })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })

  it('should return false when no conditions are met', async () => {
    const condition = or(targetScore(90), maxRounds(10))
    const ctx = createCycleContext({
      latestScore: 80,
      currentRound: 5,
    })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
  })

  it('should short-circuit on first true condition', async () => {
    let secondChecked = false

    const condition = or(
      maxRounds(5), // Will pass first
      customCondition(() => {
        secondChecked = true
        return true
      })
    )
    const ctx = createCycleContext({ currentRound: 5 })

    await checkCycleCondition(condition, ctx)

    expect(secondChecked).toBe(false)
  })

  it('should return false for empty conditions', async () => {
    const condition = or()
    const ctx = createCycleContext()

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false)
    expect(condition.description).toContain('empty')
  })

  it('should work with single condition', async () => {
    const condition = or(targetScore(80))
    const ctx = createCycleContext({ latestScore: 85 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })

  it('should have descriptive description', () => {
    const condition = or(targetScore(90), maxCost(10))

    expect(condition.description).toBe('or(targetScore, maxCost)')
  })
})

describe('not', () => {
  it('should invert true to false', async () => {
    const condition = not(targetScore(80))
    const ctx = createCycleContext({ latestScore: 90 }) // Would terminate

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(false) // Inverted
  })

  it('should invert false to true', async () => {
    const condition = not(targetScore(90))
    const ctx = createCycleContext({ latestScore: 80 }) // Would not terminate

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true) // Inverted
  })

  it('should have descriptive description', () => {
    const condition = not(targetScore(90))

    expect(condition.description).toBe('not(targetScore)')
  })
})

describe('composite conditions (nested)', () => {
  it('should support nested and/or', async () => {
    // (targetScore >= 85 AND cost >= 5) OR maxRounds >= 10
    const condition = or(and(targetScore(85), maxCost(5)), maxRounds(10))

    // Neither inner and() nor maxRounds met
    const ctx1 = createCycleContext({
      latestScore: 80,
      totalCost: 3,
      currentRound: 5,
    })
    expect((await checkCycleCondition(condition, ctx1)).terminated).toBe(false)

    // Inner and() met (score >= 85 AND cost >= 5)
    const ctx2 = createCycleContext({
      latestScore: 90,
      totalCost: 6, // >= 5, so maxCost(5) passes
      currentRound: 5,
    })
    expect((await checkCycleCondition(condition, ctx2)).terminated).toBe(true)

    // maxRounds met
    const ctx3 = createCycleContext({
      latestScore: 70,
      totalCost: 10,
      currentRound: 10,
    })
    expect((await checkCycleCondition(condition, ctx3)).terminated).toBe(true)
  })

  it('should support deeply nested conditions', async () => {
    // not(and(A, B)) = not(A) OR not(B) by De Morgan's law
    const condition = not(and(targetScore(90), maxRounds(5)))

    // Both met -> and=true -> not=false
    const ctx1 = createCycleContext({
      latestScore: 95,
      currentRound: 5,
    })
    expect((await checkCycleCondition(condition, ctx1)).terminated).toBe(false)

    // One not met -> and=false -> not=true
    const ctx2 = createCycleContext({
      latestScore: 80, // Below target
      currentRound: 5,
    })
    expect((await checkCycleCondition(condition, ctx2)).terminated).toBe(true)
  })

  it('should generate nested description', () => {
    const condition = or(and(targetScore(90), maxRounds(5)), maxCost(10))

    // The and() becomes type 'custom'
    expect(condition.description).toBe('or(custom, maxCost)')
  })

  it('should work with async custom conditions in and()', async () => {
    const asyncCondition = customCondition(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return true
    })
    const condition = and(targetScore(80), asyncCondition)
    const ctx = createCycleContext({ latestScore: 85 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })

  it('should work with async custom conditions in or()', async () => {
    const asyncCondition = customCondition(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return true
    })
    const condition = or(targetScore(90), asyncCondition)
    const ctx = createCycleContext({ latestScore: 80 })

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })

  it('should work with async custom conditions in not()', async () => {
    const asyncCondition = customCondition(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return false
    })
    const condition = not(asyncCondition)
    const ctx = createCycleContext()

    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true) // not(false) = true
  })
})

// =============================================================================
// Error Propagation in Composite Conditions
// =============================================================================

describe('composite conditions error handling', () => {
  it('should propagate errors from inner conditions in and()', async () => {
    const errorCondition = customCondition(() => {
      throw new Error('Inner condition error')
    })
    const condition = and(targetScore(80), errorCondition)
    const ctx = createCycleContext({ latestScore: 85 })

    // Note: customCondition errors are caught and treated as non-terminating
    // This is consistent with checkCustomCondition behavior
    const result = await checkCycleCondition(condition, ctx)

    // Since targetScore passes but errorCondition is caught and returns false
    expect(result.terminated).toBe(false)
  })

  it('should propagate errors from inner conditions in or()', async () => {
    const errorCondition = customCondition(() => {
      throw new Error('Inner condition error')
    })
    const condition = or(errorCondition, targetScore(80))
    const ctx = createCycleContext({ latestScore: 85 })

    // Error condition doesn't terminate (caught), then targetScore succeeds
    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })

  it('should propagate errors from inner conditions in not()', async () => {
    const errorCondition = customCondition(() => {
      throw new Error('Inner condition error')
    })
    const condition = not(errorCondition)
    const ctx = createCycleContext()

    // Error is caught, returns false, not(false) = true
    const result = await checkCycleCondition(condition, ctx)

    expect(result.terminated).toBe(true)
  })
})
