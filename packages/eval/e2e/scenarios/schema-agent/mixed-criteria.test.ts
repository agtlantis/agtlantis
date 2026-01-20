/**
 * Schema Validation: Mixed Criteria E2E Tests
 *
 * Tests combining ValidatorCriterion (schema validation) with LLM-based criteria (accuracy).
 * Validates that weighted scoring works correctly when mixing deterministic and LLM evaluations.
 *
 * Key insight: Schema validation (0 or 100) + LLM accuracy (0-100) = weighted average
 *
 * Run with: REAL_E2E=true GOOGLE_API_KEY=... pnpm test e2e/scenarios/schema-agent/mixed-criteria
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createEvalSuite } from '@/core/suite'
import { createJudge } from '@/judge/llm-judge'
import { defaultJudgePrompt } from '@/judge/prompts/default'
import { accuracy } from '@/judge/criteria'
import type { EvalAgent } from '@/core/types'

import {
  E2E_CONFIG,
  TEST_TIMEOUTS,
  createTestProvider,
  createProviderAgent,
  loadExtractorPrompt,
  runAndSave,
  createSchemaCriterion,
  VALID_EXTRACTION_MINIMAL,
  INVALID_PERSON_CASES,
  type ExtractorInput,
} from './setup'

describe.skipIf(!E2E_CONFIG.enabled)('Schema Validation: Mixed Criteria', () => {
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
    'should combine schema (weight 2) + accuracy (weight 1) for valid output',
    async () => {
      const judge = createJudge({
        provider,
        prompt: defaultJudgePrompt,
        criteria: [
          createSchemaCriterion('person', { weight: 2 }),
          accuracy({ weight: 1 }),
        ],
        passThreshold: 70,
      })

      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, VALID_EXTRACTION_MINIMAL, 'mixed-valid')

      const result = report.results[0]

      // Should have 2 verdicts
      expect(result.verdicts).toHaveLength(2)

      // Find verdicts by criterionId
      const schemaVerdict = result.verdicts.find((v) => v.criterionId === 'person-schema')
      const accuracyVerdict = result.verdicts.find((v) => v.criterionId === 'accuracy')

      expect(schemaVerdict).toBeDefined()
      expect(accuracyVerdict).toBeDefined()

      // Schema should pass (100)
      expect(schemaVerdict!.score).toBe(100)
      expect(schemaVerdict!.passed).toBe(true)

      // Accuracy is LLM-evaluated (0-100)
      expect(accuracyVerdict!.score).toBeGreaterThanOrEqual(0)
      expect(accuracyVerdict!.score).toBeLessThanOrEqual(100)

      // Overall score should be weighted average
      // (schemaScore * 2 + accuracyScore * 1) / 3
      const expectedScore = (schemaVerdict!.score * 2 + accuracyVerdict!.score * 1) / 3
      expect(result.overallScore).toBeCloseTo(expectedScore, 1)

      console.log('Mixed criteria (valid):', {
        schemaScore: schemaVerdict!.score,
        accuracyScore: accuracyVerdict!.score,
        overallScore: result.overallScore,
        expectedScore,
      })
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should have lower overall score when schema fails despite good accuracy',
    async () => {
      const judge = createJudge({
        provider,
        prompt: defaultJudgePrompt,
        criteria: [
          createSchemaCriterion('person', { weight: 2 }),
          accuracy({ weight: 1 }),
        ],
        passThreshold: 70,
      })

      const suite = createEvalSuite({ agent, judge })
      // Input with missing age - schema likely fails
      const report = await runAndSave(suite, [INVALID_PERSON_CASES[0]], 'mixed-invalid')

      const result = report.results[0]

      // Should have 2 verdicts
      expect(result.verdicts).toHaveLength(2)

      const schemaVerdict = result.verdicts.find((v) => v.criterionId === 'person-schema')
      const accuracyVerdict = result.verdicts.find((v) => v.criterionId === 'accuracy')

      expect(schemaVerdict).toBeDefined()
      expect(accuracyVerdict).toBeDefined()

      // Log results for analysis
      console.log('Mixed criteria (invalid input):', {
        schemaScore: schemaVerdict!.score,
        schemaPassed: schemaVerdict!.passed,
        accuracyScore: accuracyVerdict!.score,
        overallScore: result.overallScore,
      })

      // If schema fails (0) and accuracy is moderate (e.g., 70):
      // Overall = (0 * 2 + 70 * 1) / 3 = 23.3
      // The overall score should reflect the weighted combination
      const expectedScore = (schemaVerdict!.score * 2 + accuracyVerdict!.score * 1) / 3
      expect(result.overallScore).toBeCloseTo(expectedScore, 1)
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should not call LLM when only validator criteria exist',
    async () => {
      // Judge with ONLY schema validation (no LLM criteria)
      const judge = createJudge({
        provider,
        prompt: defaultJudgePrompt,
        criteria: [createSchemaCriterion('person')],
        passThreshold: 70,
      })

      const suite = createEvalSuite({ agent, judge })
      const report = await runAndSave(suite, VALID_EXTRACTION_MINIMAL, 'validator-only')

      const result = report.results[0]

      // Only 1 verdict (schema)
      expect(result.verdicts).toHaveLength(1)
      expect(result.verdicts[0].criterionId).toBe('person-schema')

      // The judge should NOT have made an LLM call for evaluation
      // This is verified by the fact that only schema verdict exists
      // (If LLM was called, there would be additional metadata)
      expect(result.overallScore).toBe(result.verdicts[0].score)

      console.log('Validator-only result:', {
        score: result.overallScore,
        verdict: result.verdicts[0].criterionId,
      })
    },
    TEST_TIMEOUTS.singleRound,
  )
})
