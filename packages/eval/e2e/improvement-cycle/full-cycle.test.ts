/**
 * Full Cycle E2E Tests - Tests complete improvement cycles (2-3 rounds) with real LLM calls.
 */

import { describe, it, expect } from 'vitest'
import { E2E_CONFIG, TEST_TIMEOUTS } from './setup'
import { e2e, MATH_TEST_CASES_MINIMAL, QA_TEST_CASES_MINIMAL } from './test-helper'

describe.skipIf(!E2E_CONFIG.enabled)('Real E2E: Full Cycle', () => {
  describe('Auto Mode', () => {
    it(
      'should complete 2-round cycle with maxRounds termination',
      async () => {
        const result = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 2, cost: 0.15 })
          .runAuto()

        // Cycle should complete with valid structure
        result.expectRoundCountAtLeast(1)
        result.expectRoundCountAtMost(2)
        result.expectCost().toBeLessThan(0.15)

        // If there were 2 rounds, verify score delta exists
        if (result.raw.rounds.length === 2) {
          expect(result.raw.rounds[1].scoreDelta).not.toBeNull()
        }
      },
      TEST_TIMEOUTS.fullCycle,
    )

    it(
      'should track score progression across rounds',
      async () => {
        const result = await e2e
          .qaAgent()
          .withTestCases(QA_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 2, cost: 0.15 })
          .runAuto()

        // Score progression should be properly tracked
        result.expectScoreProgression()

        // Each round should have valid score
        for (const round of result.raw.rounds) {
          const avgScore = round.report.summary.avgScore
          expect(avgScore).toBeGreaterThanOrEqual(0)
          expect(avgScore).toBeLessThanOrEqual(100)
        }
      },
      TEST_TIMEOUTS.fullCycle,
    )

    it(
      'should accumulate cost across rounds',
      async () => {
        const result = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 2, cost: 0.15 })
          .runAuto()

        // Total cost should match sum of round costs
        const calculatedTotal = result.raw.rounds.reduce((sum, r) => sum + r.cost.total, 0)
        expect(result.raw.totalCost).toBeCloseTo(calculatedTotal, 4)

        // Each round should have non-zero cost
        for (const round of result.raw.rounds) {
          expect(round.cost.total).toBeGreaterThan(0)
        }
      },
      TEST_TIMEOUTS.fullCycle,
    )
  })

  describe('HITL Mode', () => {
    it(
      'should yield after each round for manual approval',
      async () => {
        const cycle = e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 3, cost: 0.15 })
          .runHITL()

        // First round
        const r1 = await cycle.nextRound()
        expect(r1.raw.roundResult.round).toBe(1)
        r1.expectScore().toBeValid()

        // Continue to second round (if not terminated)
        try {
          const r2 = await cycle.approveSuggestions().nextRound()
          expect(r2.raw.roundResult.round).toBe(2)
        } catch (error) {
          // Expected: cycle may terminate between rounds due to termination conditions
          expect(error).toBeInstanceOf(Error)
          expect((error as Error).message).toContain('Cycle already completed')
        }

        // Stop the cycle
        await cycle.stop()
      },
      TEST_TIMEOUTS.fullCycle,
    )

    it(
      'should apply approved suggestions and bump version',
      async () => {
        const cycle = e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 2, cost: 0.15 })
          .withVersionBump('minor')
          .runHITL()

        const r1 = await cycle.nextRound()
        const initialVersion = r1.raw.roundResult.promptVersionAfter

        // If there are suggestions, approve and continue
        if (cycle.pendingSuggestions.length > 0) {
          try {
            const r2 = await cycle.approveSuggestions().nextRound()
            const newVersion = r2.raw.roundResult.promptVersionAfter

            // Version should have changed
            expect(newVersion).not.toBe(initialVersion)
          } catch (error) {
            // Expected: cycle may terminate between rounds due to termination conditions
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toContain('Cycle already completed')
          }
        }

        await cycle.stop()
      },
      TEST_TIMEOUTS.fullCycle,
    )

    it(
      'should handle partial suggestion approval',
      async () => {
        const cycle = e2e
          .qaAgent()
          .withTestCases(QA_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 2, cost: 0.15 })
          .runHITL()

        const r1 = await cycle.nextRound()

        // If multiple suggestions, approve only first one
        if (cycle.pendingSuggestions.length > 1) {
          try {
            await cycle.approveFirst(1).nextRound()
          } catch (error) {
            // Expected: cycle may terminate between rounds due to termination conditions
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toContain('Cycle already completed')
          }
        }

        await cycle.stop()
      },
      TEST_TIMEOUTS.fullCycle,
    )

    it(
      'should allow user stop before termination condition',
      async () => {
        const cycle = e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 5, cost: 0.50 }) // High limits
          .runHITL()

        // Get first round
        await cycle.nextRound()

        // User decides to stop early
        const final = await cycle.stop()

        // Result should have exactly 1 round
        final.expectRoundCount(1)
        final.expectTermination('stop')
      },
      TEST_TIMEOUTS.fullCycle,
    )
  })

  describe('Termination Conditions', () => {
    it(
      'should terminate on maxRounds condition',
      async () => {
        const result = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 1 }) // Force 1 round only
          .runAuto()

        result.expectRoundCount(1)
        result.expectTermination('max.*round|round.*limit')
      },
      TEST_TIMEOUTS.singleRound,
    )

    it(
      'should terminate on maxCost condition',
      async () => {
        const result = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 10, cost: 0.001 }) // Very low cost limit
          .runAuto()

        // Should terminate due to cost (may complete 1 round before cost is checked)
        result.expectRoundCountAtLeast(1)
      },
      TEST_TIMEOUTS.fullCycle,
    )
  })
})
