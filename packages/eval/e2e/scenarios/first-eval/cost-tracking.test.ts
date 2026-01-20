/**
 * First Evaluation: Cost Tracking E2E
 *
 * Tests Agent + Judge cost calculation accuracy.
 * Run with: REAL_E2E=true GOOGLE_API_KEY=... pnpm test e2e/scenarios/first-eval/cost-tracking
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createEvalSuite } from '@/core/suite'
import { calculateReportCosts } from '@/reporter/cost-helpers'
import type { EvalAgent } from '@/core/types'
import {
  E2E_CONFIG,
  TEST_TIMEOUTS,
  TEST_PRICING_CONFIG,
  createTestLLMClient,
  createTestJudge,
  createLLMAgent,
  loadPromptFixture,
  runAndSave,
} from './setup'
import { GREETING_TEST_CASES, GREETING_TEST_CASES_MINIMAL, type GreetingInput } from './fixtures/test-cases'

describe.skipIf(!E2E_CONFIG.enabled)('First Evaluation: Cost Tracking', () => {
  let agent: EvalAgent<GreetingInput, string>
  let judge: ReturnType<typeof createTestJudge>

  beforeAll(async () => {
    const llm = createTestLLMClient()
    const prompt = await loadPromptFixture<GreetingInput>('greeting-agent')

    agent = createLLMAgent(llm, prompt, {
      name: 'GreetingAgent',
      description: 'A friendly agent that greets people by name',
    })
    judge = createTestJudge(llm)
  })

  it(
    'should calculate agent and judge costs',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES_MINIMAL, 'cost-agent-judge')
      const costs = calculateReportCosts(report, TEST_PRICING_CONFIG)

      // Total cost should be positive
      expect(costs.total).toBeGreaterThan(0)

      // Both components should have costs
      expect(costs.byComponent.agent).toBeGreaterThan(0)
      expect(costs.byComponent.judge).toBeGreaterThan(0)
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should have cost breakdown that sums to total',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES_MINIMAL, 'cost-breakdown')
      const costs = calculateReportCosts(report, TEST_PRICING_CONFIG)

      // Agent + Judge should equal total (no improver in this scenario)
      const componentSum = costs.byComponent.agent + costs.byComponent.judge
      expect(componentSum).toBeCloseTo(costs.total, 6)
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should track token usage in each result',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES_MINIMAL, 'cost-tokens')

      for (const result of report.results) {
        // Token usage should be present
        expect(result.metrics.tokenUsage).toBeDefined()
        expect(result.metrics.tokenUsage.inputTokens).toBeGreaterThan(0)
        expect(result.metrics.tokenUsage.outputTokens).toBeGreaterThan(0)
        expect(result.metrics.tokenUsage.totalTokens).toBeGreaterThan(0)

        // Total should equal input + output
        expect(result.metrics.tokenUsage.totalTokens).toBe(
          result.metrics.tokenUsage.inputTokens + result.metrics.tokenUsage.outputTokens,
        )
      }
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should track judge metadata for cost calculation',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES_MINIMAL, 'cost-judge-meta')

      for (const result of report.results) {
        // Judge metadata should be present for cost calculation
        expect(result.judgeMetadata).toBeDefined()
        expect(result.judgeMetadata?.tokenUsage).toBeDefined()
        expect(result.judgeMetadata?.tokenUsage?.totalTokens).toBeGreaterThan(0)
      }
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should scale costs with number of test cases',
    async () => {
      const suite = createEvalSuite({ agent, judge })

      // Run with 1 test case
      const report1 = await runAndSave(suite, GREETING_TEST_CASES_MINIMAL, 'cost-scale-1')
      const costs1 = calculateReportCosts(report1, TEST_PRICING_CONFIG)

      // Run with 5 test cases
      const report5 = await runAndSave(suite, GREETING_TEST_CASES, 'cost-scale-5')
      const costs5 = calculateReportCosts(report5, TEST_PRICING_CONFIG)

      // Cost for 5 tests should be significantly higher than 1 test
      // (not exactly 5x due to variance, but should be at least 2x)
      expect(costs5.total).toBeGreaterThan(costs1.total * 2)
    },
    TEST_TIMEOUTS.fullCycle,
  )

  it(
    'should have reasonable cost for greeting scenario',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES, 'cost-reasonable')
      const costs = calculateReportCosts(report, TEST_PRICING_CONFIG)

      // Based on gemini-2.5-flash-lite pricing, 5 test cases should cost < $0.05
      expect(costs.total).toBeLessThan(0.05)

      // But should be non-trivial (at least $0.001)
      expect(costs.total).toBeGreaterThan(0.001)
    },
    TEST_TIMEOUTS.fullCycle,
  )
})
