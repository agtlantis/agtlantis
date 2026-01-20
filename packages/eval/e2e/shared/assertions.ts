/**
 * E2E Test Assertions
 *
 * Fluent assertion builders for E2E test validation.
 * These provide a readable, chainable API for verifying test results.
 */

import type { Suggestion } from '@/improver/types'
import type { RoundYield, ImprovementCycleResult } from '@/improvement-cycle/types'
import type {
  ScoreAssertions,
  CostAssertions,
  SuggestionAssertions,
  PromptAssertions,
  RoundAssertions,
  ResultAssertions,
} from './types'

export function createScoreAssertions(score: number): ScoreAssertions {
  return {
    toBeValid() {
      if (score < 0 || score > 100) {
        throw new Error(`Score ${score} is not in valid range [0, 100]`)
      }
    },
    toBeGreaterThan(value: number) {
      if (score <= value) {
        throw new Error(`Expected score ${score} to be greater than ${value}`)
      }
    },
    toBeLessThan(value: number) {
      if (score >= value) {
        throw new Error(`Expected score ${score} to be less than ${value}`)
      }
    },
    toBe(value: number) {
      if (score !== value) {
        throw new Error(`Expected score ${score} to be ${value}`)
      }
    },
  }
}

interface CostBreakdown {
  total: number
  agent: number
  judge: number
  improver: number
}

export function createCostAssertions(cost: CostBreakdown): CostAssertions {
  return {
    toBeLessThan(value: number) {
      if (cost.total >= value) {
        throw new Error(`Expected cost $${cost.total.toFixed(4)} to be less than $${value}`)
      }
    },
    toBeGreaterThan(value: number) {
      if (cost.total <= value) {
        throw new Error(`Expected cost $${cost.total.toFixed(4)} to be greater than $${value}`)
      }
    },
    toMatchBreakdown() {
      const sum = cost.agent + cost.judge + cost.improver
      if (Math.abs(cost.total - sum) > 0.0001) {
        throw new Error(`Cost breakdown mismatch: total=$${cost.total}, sum=$${sum}`)
      }
    },
  }
}

export function createSuggestionAssertions(suggestions: Suggestion[]): SuggestionAssertions {
  return {
    toExist() {
      if (!Array.isArray(suggestions)) {
        throw new Error('Suggestions should be an array')
      }
    },
    toHaveValidStructure() {
      for (const s of suggestions) {
        if (!s.type || !s.priority || !s.reasoning) {
          throw new Error(`Invalid suggestion structure: ${JSON.stringify(s)}`)
        }
      }
    },
    toHaveCount(count: number) {
      if (suggestions.length !== count) {
        throw new Error(`Expected ${count} suggestions, got ${suggestions.length}`)
      }
    },
    toHaveCountGreaterThan(count: number) {
      if (suggestions.length <= count) {
        throw new Error(`Expected more than ${count} suggestions, got ${suggestions.length}`)
      }
    },
  }
}

export function createPromptAssertions(snapshot: { userTemplate?: string }): PromptAssertions {
  return {
    toExist() {
      if (!snapshot) {
        throw new Error('Prompt snapshot should exist')
      }
    },
    toHaveUserTemplate() {
      if (!snapshot.userTemplate) {
        throw new Error('Prompt snapshot should have userTemplate')
      }
    },
  }
}

export function createRoundAssertions(roundYield: RoundYield): RoundAssertions {
  const { roundResult, pendingSuggestions } = roundYield
  return {
    expectScore: () => createScoreAssertions(roundResult.report.summary.avgScore),
    expectCost: () => createCostAssertions(roundResult.cost),
    expectSuggestions: () => createSuggestionAssertions(pendingSuggestions),
    expectPromptSnapshot: () => createPromptAssertions(roundResult.promptSnapshot),
    raw: roundYield,
  }
}

export function createResultAssertions<TInput>(
  result: ImprovementCycleResult<TInput, unknown>,
): ResultAssertions<TInput> {
  return {
    expectTermination(reason: string) {
      const regex = new RegExp(reason, 'i')
      if (!regex.test(result.terminationReason)) {
        throw new Error(
          `Expected termination reason to match "${reason}", got "${result.terminationReason}"`,
        )
      }
    },
    expectRoundCount(count: number) {
      if (result.rounds.length !== count) {
        throw new Error(`Expected ${count} rounds, got ${result.rounds.length}`)
      }
    },
    expectRoundCountAtLeast(count: number) {
      if (result.rounds.length < count) {
        throw new Error(`Expected at least ${count} rounds, got ${result.rounds.length}`)
      }
    },
    expectRoundCountAtMost(count: number) {
      if (result.rounds.length > count) {
        throw new Error(`Expected at most ${count} rounds, got ${result.rounds.length}`)
      }
    },
    expectCost: () =>
      createCostAssertions({
        total: result.totalCost,
        agent: result.rounds.reduce((s, r) => s + r.cost.agent, 0),
        judge: result.rounds.reduce((s, r) => s + r.cost.judge, 0),
        improver: result.rounds.reduce((s, r) => s + r.cost.improver, 0),
      }),
    expectScoreProgression() {
      if (result.rounds.length > 0 && result.rounds[0].scoreDelta !== null) {
        throw new Error('First round should have null scoreDelta')
      }
      for (let i = 1; i < result.rounds.length; i++) {
        if (result.rounds[i].scoreDelta === null) {
          throw new Error(`Round ${i + 1} should have scoreDelta`)
        }
      }
    },
    raw: result,
  }
}
