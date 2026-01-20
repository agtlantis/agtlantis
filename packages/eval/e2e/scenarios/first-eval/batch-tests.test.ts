/**
 * First Evaluation: Batch Tests E2E
 *
 * Tests concurrent execution of multiple test cases.
 * Run with: REAL_E2E=true GOOGLE_API_KEY=... pnpm test e2e/scenarios/first-eval/batch-tests
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
  runAndSave,
} from './setup'
import { GREETING_TEST_CASES, type GreetingInput } from './fixtures/test-cases'

describe.skipIf(!E2E_CONFIG.enabled)('First Evaluation: Batch Tests', () => {
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
    'should evaluate 5 test cases concurrently',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES, 'batch-concurrent')

      // All 5 test cases should be executed
      expect(report.results).toHaveLength(5)
      expect(report.summary.totalTests).toBe(5)

      // Passed + failed should equal total
      expect(report.summary.passed + report.summary.failed).toBe(5)
    },
    TEST_TIMEOUTS.fullCycle,
  )

  it(
    'should have unique test case IDs in results',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES, 'batch-unique-ids')

      const resultIds = report.results.map((r) => r.testCase.id)
      const inputIds = GREETING_TEST_CASES.map((tc) => tc.id)

      // All input IDs should be present in results
      expect(resultIds.sort()).toEqual(inputIds.sort())
    },
    TEST_TIMEOUTS.fullCycle,
  )

  it(
    'should aggregate metrics correctly across all tests',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES, 'batch-metrics')

      // Average score should be between 0 and 100
      expect(report.summary.avgScore).toBeGreaterThanOrEqual(0)
      expect(report.summary.avgScore).toBeLessThanOrEqual(100)

      // Average latency should be positive
      expect(report.summary.metrics.avgLatencyMs).toBeGreaterThan(0)

      // Total tokens should be sum of all individual tokens
      const sumTokens = report.results.reduce((sum, r) => sum + r.metrics.tokenUsage.totalTokens, 0)
      expect(report.summary.metrics.totalTokens).toBe(sumTokens)
    },
    TEST_TIMEOUTS.fullCycle,
  )

  it(
    'should produce output for each test case',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES, 'batch-outputs')

      for (let i = 0; i < report.results.length; i++) {
        const result = report.results[i]
        const expectedName = GREETING_TEST_CASES.find((tc) => tc.id === result.testCase.id)?.input
          .name

        // Each result should have output
        expect(result.output).toBeDefined()
        expect(typeof result.output).toBe('string')
        expect(result.output.length).toBeGreaterThan(0)

        // Output should mention the person's name
        if (expectedName) {
          expect(result.output.toLowerCase()).toContain(expectedName.toLowerCase())
        }
      }
    },
    TEST_TIMEOUTS.fullCycle,
  )
})
