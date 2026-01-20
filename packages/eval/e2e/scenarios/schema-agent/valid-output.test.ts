/**
 * Schema Validation: Valid Output E2E Tests
 *
 * Tests that ValidatorCriterion correctly passes when agent output matches the Zod schema.
 * These tests verify the happy path: complete, well-structured input → valid JSON → score 100.
 *
 * Run with: REAL_E2E=true GOOGLE_API_KEY=... pnpm test e2e/scenarios/schema-agent/valid-output
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createEvalSuite } from '@/core/suite'
import { createJudge } from '@/judge/llm-judge'
import { defaultJudgePrompt } from '@/judge/prompts/default'
import type { EvalAgent } from '@/core/types'

import {
  E2E_CONFIG,
  TEST_TIMEOUTS,
  createTestProvider,
  createProviderAgent,
  loadExtractorPrompt,
  runAndSave,
  createSchemaCriterion,
  VALID_PERSON_CASES,
  VALID_ORDER_CASES,
  VALID_EXTRACTION_MINIMAL,
  type ExtractorInput,
} from './setup'

describe.skipIf(!E2E_CONFIG.enabled)('Schema Validation: Valid Output', () => {
  let agent: EvalAgent<ExtractorInput, unknown>
  let provider: ReturnType<typeof createTestProvider>

  beforeAll(async () => {
    provider = createTestProvider()
    const prompt = await loadExtractorPrompt()

    agent = createProviderAgent(provider, prompt, {
      name: 'JSONExtractor',
      description: 'Extracts structured JSON data from natural language text',
      parseJson: true,
    })
  })

  it(
    'should score 100 when output matches PersonSchema',
    async () => {
      const judge = createJudge({
        provider,
        prompt: defaultJudgePrompt,
        criteria: [createSchemaCriterion('person')],
        passThreshold: 70,
      })

      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, VALID_EXTRACTION_MINIMAL, 'person-valid')

      const result = report.results[0]

      // Schema validation should pass
      expect(result.verdicts).toHaveLength(1)
      expect(result.verdicts[0].criterionId).toBe('person-schema')
      expect(result.verdicts[0].passed).toBe(true)
      expect(result.verdicts[0].score).toBe(100)

      // Overall score should be 100 (only criterion)
      expect(result.overallScore).toBe(100)
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should handle PersonSchema with optional email field',
    async () => {
      const judge = createJudge({
        provider,
        prompt: defaultJudgePrompt,
        criteria: [createSchemaCriterion('person')],
        passThreshold: 70,
      })

      const suite = createEvalSuite({ agent, judge })
      // Second case includes email in the text
      const report = await runAndSave(suite, [VALID_PERSON_CASES[1]], 'person-with-email')

      expect(report.results[0].overallScore).toBe(100)
      expect(report.results[0].verdicts[0].passed).toBe(true)
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should validate nested OrderSchema structure',
    async () => {
      const judge = createJudge({
        provider,
        prompt: defaultJudgePrompt,
        criteria: [createSchemaCriterion('order')],
        passThreshold: 70,
      })

      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, [VALID_ORDER_CASES[0]], 'order-valid')

      const result = report.results[0]

      // Schema validation should pass for nested structure
      expect(result.verdicts[0].criterionId).toBe('order-schema')
      expect(result.verdicts[0].passed).toBe(true)
      expect(result.verdicts[0].score).toBe(100)
      expect(result.overallScore).toBe(100)
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should validate OrderSchema with multiple items',
    async () => {
      const judge = createJudge({
        provider,
        prompt: defaultJudgePrompt,
        criteria: [createSchemaCriterion('order')],
        passThreshold: 70,
      })

      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, [VALID_ORDER_CASES[1]], 'order-multiple-items')

      expect(report.results[0].overallScore).toBe(100)
      expect(report.results[0].verdicts[0].passed).toBe(true)
    },
    TEST_TIMEOUTS.singleRound,
  )
})
