/**
 * First Evaluation: Report Structure E2E
 *
 * Tests EvalReport structure and score calculation accuracy.
 * Run with: REAL_E2E=true GOOGLE_API_KEY=... pnpm test e2e/scenarios/first-eval/report
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
import { GREETING_TEST_CASES, GREETING_TEST_CASES_MINIMAL, type GreetingInput } from './fixtures/test-cases'

describe.skipIf(!E2E_CONFIG.enabled)('First Evaluation: Report Structure', () => {
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
    'should generate valid EvalReport structure',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES_MINIMAL, 'report-structure')

      // Required top-level fields
      expect(report.summary).toBeDefined()
      expect(report.results).toBeDefined()
      expect(report.generatedAt).toBeInstanceOf(Date)
      expect(report.promptVersion).toBeDefined()
      expect(typeof report.promptVersion).toBe('string')
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should have complete summary fields',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES_MINIMAL, 'report-summary')

      // Summary required fields
      expect(typeof report.summary.totalTests).toBe('number')
      expect(typeof report.summary.passed).toBe('number')
      expect(typeof report.summary.failed).toBe('number')
      expect(typeof report.summary.avgScore).toBe('number')

      // Metrics sub-object
      expect(report.summary.metrics).toBeDefined()
      expect(typeof report.summary.metrics.avgLatencyMs).toBe('number')
      expect(typeof report.summary.metrics.totalTokens).toBe('number')
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should have valid result structure for each test case',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES, 'report-results')

      for (const result of report.results) {
        // Test case reference
        expect(result.testCase).toBeDefined()
        expect(result.testCase.id).toBeDefined()
        expect(result.testCase.input).toBeDefined()

        // Output
        expect(result.output).toBeDefined()

        // Metrics
        expect(result.metrics).toBeDefined()
        expect(result.metrics.latencyMs).toBeGreaterThan(0)
        expect(result.metrics.tokenUsage).toBeDefined()

        // Verdicts
        expect(Array.isArray(result.verdicts)).toBe(true)
        expect(result.verdicts.length).toBeGreaterThan(0)

        // Score and pass status
        expect(result.overallScore).toBeGreaterThanOrEqual(0)
        expect(result.overallScore).toBeLessThanOrEqual(100)
        expect(typeof result.passed).toBe('boolean')
      }
    },
    TEST_TIMEOUTS.fullCycle,
  )

  it(
    'should have valid verdict structure',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES_MINIMAL, 'report-verdicts')

      const result = report.results[0]

      for (const verdict of result.verdicts) {
        expect(verdict.criterionId).toBeDefined()
        expect(typeof verdict.criterionId).toBe('string')

        expect(verdict.score).toBeGreaterThanOrEqual(0)
        expect(verdict.score).toBeLessThanOrEqual(100)

        expect(verdict.reasoning).toBeDefined()
        expect(typeof verdict.reasoning).toBe('string')

        expect(typeof verdict.passed).toBe('boolean')
      }
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should calculate pass rate correctly',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES, 'report-pass-rate')

      // Count passed results manually
      const passedCount = report.results.filter((r) => r.passed).length
      const failedCount = report.results.filter((r) => !r.passed).length

      // Summary should match
      expect(report.summary.passed).toBe(passedCount)
      expect(report.summary.failed).toBe(failedCount)
      expect(report.summary.totalTests).toBe(passedCount + failedCount)
    },
    TEST_TIMEOUTS.fullCycle,
  )

  it(
    'should calculate average score correctly',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, GREETING_TEST_CASES, 'report-avg-score')

      // Calculate expected average
      const totalScore = report.results.reduce((sum, r) => sum + r.overallScore, 0)
      const expectedAvg = totalScore / report.results.length

      // Summary avgScore should match (allow for floating point precision)
      expect(report.summary.avgScore).toBeCloseTo(expectedAvg, 2)
    },
    TEST_TIMEOUTS.fullCycle,
  )
})
