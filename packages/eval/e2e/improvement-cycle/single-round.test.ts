/**
 * Single Round E2E Tests - Tests a single evaluation round with real LLM calls.
 */

import { describe, it, expect } from 'vitest'
import { E2E_CONFIG, TEST_TIMEOUTS } from './setup'
import type { RoundAssertions } from '@e2e/shared'
import { e2e, MATH_TEST_CASES_MINIMAL, QA_TEST_CASES_MINIMAL } from './test-helper'

interface AgentTestConfig {
  name: string
  run: () => Promise<RoundAssertions>
}

const AGENT_CONFIGS: AgentTestConfig[] = [
  {
    name: 'MathSolver',
    run: () => e2e.mathSolver().withTestCases(MATH_TEST_CASES_MINIMAL).runSingleRound(),
  },
  {
    name: 'QAAgent',
    run: () => e2e.qaAgent().withTestCases(QA_TEST_CASES_MINIMAL).runSingleRound(),
  },
]

describe.skipIf(!E2E_CONFIG.enabled)('Real E2E: Single Round', () => {
  it.each(AGENT_CONFIGS)(
    '$name: should complete single evaluation round',
    async ({ run }) => {
      const round = await run()

      round.expectScore().toBeValid()
      round.expectCost().toBeLessThan(0.05)
      round.expectSuggestions().toExist()
    },
    TEST_TIMEOUTS.singleRound,
  )

  describe('MathSolver detailed tests', () => {
    it(
      'should include prompt snapshot for rollback',
      async () => {
        const round = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .runSingleRound()

        round.expectPromptSnapshot().toExist()
        round.expectPromptSnapshot().toHaveUserTemplate()
      },
      TEST_TIMEOUTS.singleRound,
    )

    it(
      'should track cost accurately with all components',
      async () => {
        const round = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .runSingleRound()

        // Cost breakdown (agent + judge + improver) should equal total
        round.expectCost().toMatchBreakdown()

        // All components should have been called
        const { roundResult } = round.raw
        expect(roundResult.cost.agent).toBeGreaterThanOrEqual(0)
        expect(roundResult.cost.judge).toBeGreaterThanOrEqual(0)
        expect(roundResult.cost.improver).toBeGreaterThanOrEqual(0)
        expect(roundResult.cost.total).toBeGreaterThan(0)
      },
      TEST_TIMEOUTS.singleRound,
    )

    it(
      'should generate valid suggestions when score is not perfect',
      async () => {
        const round = await e2e
          .mathSolver()
          .withTestCases(MATH_TEST_CASES_MINIMAL)
          .runSingleRound()

        const { pendingSuggestions } = round.raw

        // If suggestions exist, they should have valid structure
        if (pendingSuggestions.length > 0) {
          round.expectSuggestions().toHaveValidStructure()

          // Verify specific fields on first suggestion
          const suggestion = pendingSuggestions[0]
          expect(suggestion.type).toMatch(/^(system_prompt|user_prompt|parameters)$/)
          expect(suggestion.priority).toMatch(/^(high|medium|low)$/)
          expect(suggestion.currentValue).toBeDefined()
          expect(suggestion.suggestedValue).toBeDefined()
          expect(suggestion.reasoning).toBeDefined()
        }
      },
      TEST_TIMEOUTS.singleRound,
    )
  })
})
