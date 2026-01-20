/**
 * Multi-turn E2E Tests - Tests the improvement cycle with multi-turn conversation test cases.
 */

import { describe, it, expect } from 'vitest'
import { E2E_CONFIG, TEST_TIMEOUTS } from './setup'
import {
  e2e,
  RECOMMENDER_MULTI_TURN_CASES_MINIMAL,
  isMultiTurnResult,
} from './test-helper'

describe.skipIf(!E2E_CONFIG.enabled)('Real E2E: Multi-turn', () => {
  it(
    'should run improvement cycle with multi-turn test cases',
    async () => {
      const result = await e2e
        .recommender()
        .withTestCases(RECOMMENDER_MULTI_TURN_CASES_MINIMAL)
        .terminateAfter({ rounds: 1, cost: 0.10 })
        .runAuto()

      // Verify completion
      result.expectRoundCountAtLeast(1)
      result.expectCost().toBeLessThan(0.10)

      // Verify test results count matches test cases
      const firstRound = result.raw.rounds[0]
      expect(firstRound.report.results.length).toBe(RECOMMENDER_MULTI_TURN_CASES_MINIMAL.length)

      // Check if results are multi-turn type
      const firstResult = firstRound.report.results[0]
      if (isMultiTurnResult(firstResult)) {
        expect(firstResult.kind).toBe('multi-turn')
        expect(firstResult.conversationHistory).toBeDefined()
        expect(firstResult.totalTurns).toBeGreaterThanOrEqual(1)
      }
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should track conversation history in multi-turn results',
    async () => {
      const result = await e2e
        .recommender()
        .withTestCases(RECOMMENDER_MULTI_TURN_CASES_MINIMAL)
        .terminateAfter({ rounds: 1, cost: 0.10 })
        .runAuto()

      const evalResult = result.raw.rounds[0].report.results[0]

      // Verify multi-turn specific data
      if (isMultiTurnResult(evalResult)) {
        const { conversationHistory, totalTurns, termination } = evalResult

        // Should have at least one turn
        expect(conversationHistory.length).toBeGreaterThanOrEqual(1)
        expect(totalTurns).toBeGreaterThanOrEqual(1)

        // Each turn should have input and output
        for (const turn of conversationHistory) {
          expect(turn.turn).toBeGreaterThanOrEqual(1)
          expect(turn.input).toBeDefined()
          expect(turn.output).toBeDefined()
        }

        // Termination info should be present
        expect(termination.terminated).toBe(true)
        expect(termination.reason).toBeDefined()
      }
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should generate suggestions for multi-turn conversations',
    async () => {
      const result = await e2e
        .recommender()
        .withTestCases(RECOMMENDER_MULTI_TURN_CASES_MINIMAL)
        .terminateAfter({ rounds: 1, cost: 0.10 })
        .runAuto()

      const firstRound = result.raw.rounds[0]

      // Suggestions should be generated
      expect(firstRound.suggestionsGenerated).toBeDefined()
      expect(Array.isArray(firstRound.suggestionsGenerated)).toBe(true)

      // If there are suggestions, verify structure
      if (firstRound.suggestionsGenerated.length > 0) {
        const suggestion = firstRound.suggestionsGenerated[0]
        expect(suggestion.type).toMatch(/^(system_prompt|user_prompt|parameters)$/)
        expect(suggestion.suggestedValue).toBeDefined()
        expect(suggestion.reasoning).toBeDefined()
      }
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should handle multi-turn with multiple rounds of improvement',
    async () => {
      const result = await e2e
        .recommender()
        .withTestCases(RECOMMENDER_MULTI_TURN_CASES_MINIMAL)
        .terminateAfter({ rounds: 2, cost: 0.20 })
        .withVersionBump('minor')
        .runAuto()

      // May have 1 or 2 rounds depending on cost
      result.expectRoundCountAtLeast(1)
      result.expectRoundCountAtMost(2)
      result.expectCost().toBeLessThan(0.20)

      // If 2 rounds completed, verify score delta
      if (result.raw.rounds.length === 2) {
        expect(result.raw.rounds[1].scoreDelta).not.toBeNull()
      }
    },
    TEST_TIMEOUTS.multiTurn,
  )
})
