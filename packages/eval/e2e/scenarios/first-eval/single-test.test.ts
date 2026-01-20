/**
 * First Evaluation: Single Test E2E
 *
 * Tests basic Agent → Judge → Report flow with a single test case.
 * Run with: REAL_E2E=true GOOGLE_API_KEY=... pnpm test e2e/scenarios/first-eval/single-test
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createEvalSuite } from '@/core/suite'
import type { EvalAgent } from '@/core/types'
import {
  E2E_CONFIG,
  TEST_TIMEOUTS,
  createTestLLMClient,
  createTestJudge,
  createLLMAgent,
  loadPromptFixture,
  createTestRunner,
} from './setup'
import { GREETING_TEST_CASES_MINIMAL, type GreetingInput } from './fixtures/test-cases'

describe.skipIf(!E2E_CONFIG.enabled)('First Evaluation: Single Test', () => {
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
    'should evaluate agent with one test case',
    async (ctx) => {
      const run = createTestRunner(ctx)
      const suite = createEvalSuite({ agent, judge })
      const report = await run(suite, GREETING_TEST_CASES_MINIMAL)

      // Report should have exactly 1 result
      expect(report.results).toHaveLength(1)
      expect(report.summary.totalTests).toBe(1)

      // Score should be valid (0-100)
      expect(report.summary.avgScore).toBeGreaterThanOrEqual(0)
      expect(report.summary.avgScore).toBeLessThanOrEqual(100)
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should return valid output from agent',
    async (ctx) => {
      const run = createTestRunner(ctx)
      const suite = createEvalSuite({ agent, judge })
      const report = await run(suite, GREETING_TEST_CASES_MINIMAL)

      const result = report.results[0]

      // Agent should have produced output
      expect(result.output).toBeDefined()
      expect(typeof result.output).toBe('string')
      expect(result.output.length).toBeGreaterThan(0)

      // Output should mention the name from input
      const inputName = GREETING_TEST_CASES_MINIMAL[0].input.name
      expect(result.output.toLowerCase()).toContain(inputName.toLowerCase())
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should have valid execution metrics',
    async (ctx) => {
      const run = createTestRunner(ctx)
      const suite = createEvalSuite({ agent, judge })
      const report = await run(suite, GREETING_TEST_CASES_MINIMAL)

      // Summary metrics
      expect(report.summary.metrics.avgLatencyMs).toBeGreaterThan(0)
      expect(report.summary.metrics.totalTokens).toBeGreaterThan(0)

      // Per-result metrics
      const result = report.results[0]
      expect(result.metrics.latencyMs).toBeGreaterThan(0)
      expect(result.metrics.tokenUsage).toBeDefined()
      expect(result.metrics.tokenUsage.totalTokens).toBeGreaterThan(0)
    },
    TEST_TIMEOUTS.singleRound,
  )
})
