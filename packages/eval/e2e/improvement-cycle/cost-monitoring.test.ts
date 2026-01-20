/**
 * Cost Monitoring E2E Tests - Tests comprehensive cost tracking across the improvement cycle.
 * Covers component-level cost tracking, cost limit termination, and cost accumulation across rounds.
 */

import { describe, it, expect } from 'vitest'
import {
  E2E_CONFIG,
  TEST_TIMEOUTS,
  createTempHistoryPath,
} from './setup'
import {
  e2e,
  MATH_TEST_CASES_MINIMAL,
  loadHistory,
} from './test-helper'

describe.skipIf(!E2E_CONFIG.enabled)('Real E2E: Cost Monitoring', () => {
  describe('Component-level cost tracking', () => {
    it(
      'should track agent, judge, improver costs separately',
      async () => {
        const round = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .runSingleRound()

        const { cost } = round.raw.roundResult

        // Each component should have tracked cost
        expect(cost.agent).toBeGreaterThan(0)
        expect(cost.judge).toBeGreaterThan(0)
        expect(cost.improver).toBeGreaterThan(0)
      },
      TEST_TIMEOUTS.singleRound,
    )

    it(
      'should calculate total as sum of components',
      async () => {
        const round = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .runSingleRound()

        const { cost } = round.raw.roundResult

        // Total should be exactly the sum of components
        const expectedTotal = cost.agent + cost.judge + cost.improver
        expect(cost.total).toBeCloseTo(expectedTotal, 6)

        // Use fluent assertion as well
        round.expectCost().toMatchBreakdown()
      },
      TEST_TIMEOUTS.singleRound,
    )

    it(
      'should have reasonable cost magnitudes for minimal test cases',
      async () => {
        const round = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .runSingleRound()

        const { cost } = round.raw.roundResult

        // With 1 test case, costs should be small but non-trivial
        // Agent + Judge + Improver for 1 test case typically < $0.05
        expect(cost.total).toBeGreaterThan(0.0001)
        expect(cost.total).toBeLessThan(0.05)

        // Each component should be a reasonable fraction of total
        expect(cost.agent).toBeLessThan(cost.total)
        expect(cost.judge).toBeLessThan(cost.total)
        expect(cost.improver).toBeLessThan(cost.total)
      },
      TEST_TIMEOUTS.singleRound,
    )
  })

  describe('Cost limit termination', () => {
    it(
      'should terminate when totalCost >= maxCost',
      async () => {
        // Set a very low cost limit to trigger termination after 1 round
        const result = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ cost: 0.001, rounds: 10 })
          .runAuto()

        // Should terminate due to cost (not rounds)
        // Note: First round completes before cost is checked
        result.expectRoundCountAtLeast(1)
        expect(result.raw.totalCost).toBeGreaterThanOrEqual(0.001)
      },
      TEST_TIMEOUTS.fullCycle,
    )

    it(
      'should report correct termination reason for cost limit',
      async () => {
        const result = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ cost: 0.001, rounds: 10 })
          .runAuto()

        // Termination reason should indicate cost limit exceeded
        result.expectTermination('cost.*limit|Cost.*exceeded')
      },
      TEST_TIMEOUTS.fullCycle,
    )

    it(
      'should continue cycle when cost is under limit',
      async () => {
        // High cost limit should not trigger termination
        const result = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ cost: 1.00, rounds: 2 })
          .runAuto()

        // Should terminate due to maxRounds (2), not cost
        result.expectRoundCountAtLeast(1)
        result.expectRoundCountAtMost(2)
        expect(result.raw.totalCost).toBeLessThan(1.00)

        // If 2 rounds completed, termination should be due to rounds, not cost
        if (result.raw.rounds.length === 2) {
          result.expectTermination('max.*round|round.*limit')
        }
      },
      TEST_TIMEOUTS.fullCycle,
    )
  })

  describe('Cost accumulation across rounds', () => {
    it(
      'should accumulate costs across multiple rounds',
      async () => {
        const result = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 2, cost: 0.50 })
          .runAuto()

        // Calculate expected total from individual rounds
        const calculatedTotal = result.raw.rounds.reduce(
          (sum, r) => sum + r.cost.total,
          0,
        )

        // Total cost should match sum of round costs
        expect(result.raw.totalCost).toBeCloseTo(calculatedTotal, 6)
      },
      TEST_TIMEOUTS.fullCycle,
    )

    it(
      'should track component costs across rounds',
      async () => {
        const result = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 2, cost: 0.50 })
          .runAuto()

        // Calculate component totals
        const totalAgent = result.raw.rounds.reduce((s, r) => s + r.cost.agent, 0)
        const totalJudge = result.raw.rounds.reduce((s, r) => s + r.cost.judge, 0)
        const totalImprover = result.raw.rounds.reduce((s, r) => s + r.cost.improver, 0)

        // Sum of component totals should equal total cost
        const componentSum = totalAgent + totalJudge + totalImprover
        expect(result.raw.totalCost).toBeCloseTo(componentSum, 6)

        // Each component should have contributed across rounds
        if (result.raw.rounds.length >= 2) {
          expect(totalAgent).toBeGreaterThan(0)
          expect(totalJudge).toBeGreaterThan(0)
          expect(totalImprover).toBeGreaterThan(0)
        }
      },
      TEST_TIMEOUTS.fullCycle,
    )

    it(
      'should preserve cost breakdown in history file',
      async () => {
        const historyPath = createTempHistoryPath('cost-monitoring')

        const result = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 2, cost: 0.50 })
          .withHistoryPath(historyPath)
          .runAuto()

        // Load saved history
        const history = await loadHistory(historyPath)

        // History should have correct total cost
        expect(history.totalCost).toBeCloseTo(result.raw.totalCost, 6)

        // Each round in history should have cost breakdown
        for (let i = 0; i < history.rounds.length; i++) {
          const historyRound = history.rounds[i]
          const resultRound = result.raw.rounds[i]

          expect(historyRound.cost.agent).toBeCloseTo(resultRound.cost.agent, 6)
          expect(historyRound.cost.judge).toBeCloseTo(resultRound.cost.judge, 6)
          expect(historyRound.cost.improver).toBeCloseTo(resultRound.cost.improver, 6)
          expect(historyRound.cost.total).toBeCloseTo(resultRound.cost.total, 6)
        }
      },
      TEST_TIMEOUTS.fullCycle,
    )

    it(
      'should show increasing cumulative cost after each round',
      async () => {
        const result = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .terminateAfter({ rounds: 2, cost: 0.50 })
          .runAuto()

        // Track cumulative cost
        let cumulativeCost = 0
        for (const round of result.raw.rounds) {
          const previousCumulative = cumulativeCost
          cumulativeCost += round.cost.total

          // Each round should add positive cost
          expect(cumulativeCost).toBeGreaterThan(previousCumulative)
        }

        // Final cumulative should match total
        expect(cumulativeCost).toBeCloseTo(result.raw.totalCost, 6)
      },
      TEST_TIMEOUTS.fullCycle,
    )
  })
})
