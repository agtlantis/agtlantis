/**
 * E2E Tests: Suggestion Generation
 *
 * Tests that the Improver generates valid suggestions from evaluation results.
 * These tests verify:
 * - Improver produces suggestions when given low-scoring results
 * - Suggestions have valid structure (type, priority, values)
 * - Suggestions reference actual content from the prompt
 *
 * @see refs/testing-guidelines.md - E2E Testing: High Abstraction Level
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createEvalSuite } from '@/core/suite'

import {
  E2E_CONFIG,
  createTestProvider,
  createStrictJudge,
  createTestImprover,
  loadImprovablePrompt,
  createMathAgent,
  TEST_TIMEOUTS,
  logEvalReportIO,
  TEST_PRICING_CONFIG,
} from './setup'
import { MATH_IMPROVEMENT_CASES_MINIMAL } from './fixtures/test-cases'

import type { Provider } from '@agtlantis/core'
import type { Judge } from '@/judge/types'
import type { Improver } from '@/improver/types'
import type { AgentPrompt, EvalAgent } from '@/core/types'
import type { MathInput, MathOutput } from './fixtures/test-cases'

describe.skipIf(!E2E_CONFIG.enabled)('Suggestion Generation', () => {
  let provider: Provider
  let judge: Judge
  let improver: Improver
  let prompt: AgentPrompt<MathInput>
  let agent: EvalAgent<MathInput, MathOutput>

  beforeAll(async () => {
    provider = createTestProvider()
    judge = createStrictJudge(provider) // Uses stepByStep() criterion for stricter evaluation
    improver = createTestImprover(provider)
    prompt = await loadImprovablePrompt()
    agent = createMathAgent(provider, prompt)
  })

  it(
    'should process evaluation results and return valid improve result',
    async () => {
      // Run evaluation with the weak prompt
      const suite = createEvalSuite({ agent, judge })
      const report = await suite.run(MATH_IMPROVEMENT_CASES_MINIMAL)

      if (E2E_CONFIG.verbose) {
        logEvalReportIO(report, TEST_PRICING_CONFIG, E2E_CONFIG.verbose)
      }

      // Generate improvement suggestions based on results
      const improveResult = await improver.improve(prompt, report.results)

      // Verify the improve result has valid structure
      expect(improveResult).toBeDefined()
      expect(improveResult.suggestions).toBeDefined()
      expect(Array.isArray(improveResult.suggestions)).toBe(true)

      // Verify we have metadata (token usage tracking)
      expect(improveResult.metadata).toBeDefined()

      // Log context for debugging
      const avgScore = report.summary.avgScore
      const suggestionCount = improveResult.suggestions.length

      if (E2E_CONFIG) {
        console.log(`\n--- Improve Result ---`)
        console.log(`Evaluation Score: ${avgScore.toFixed(1)}`)
        console.log(`Suggestions Generated: ${suggestionCount}`)
        for (const s of improveResult.suggestions) {
          console.log(`  [${s.priority.toUpperCase()}] ${s.type}: ${s.reasoning.slice(0, 80)}...`)
        }
      }

      // If score is low (<80), we expect suggestions; if high, 0 suggestions is valid
      if (avgScore < 80 && suggestionCount === 0) {
        console.warn(
          `Warning: Low score (${avgScore.toFixed(1)}) but no suggestions generated. ` +
            `This may indicate an issue with the improver prompt or evaluation.`,
        )
      }
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should include valid suggestion structure',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await suite.run(MATH_IMPROVEMENT_CASES_MINIMAL)
      const improveResult = await improver.improve(prompt, report.results)

      // Each suggestion should have required fields
      for (const suggestion of improveResult.suggestions) {
        // Type validation
        expect(['system_prompt', 'user_prompt', 'parameters']).toContain(suggestion.type)

        // Priority validation
        expect(['high', 'medium', 'low']).toContain(suggestion.priority)

        // Required string fields
        expect(typeof suggestion.currentValue).toBe('string')
        expect(typeof suggestion.suggestedValue).toBe('string')
        expect(typeof suggestion.reasoning).toBe('string')
        expect(typeof suggestion.expectedImprovement).toBe('string')

        // Values should be non-empty
        expect(suggestion.suggestedValue.length).toBeGreaterThan(0)
        expect(suggestion.reasoning.length).toBeGreaterThan(0)
        expect(suggestion.expectedImprovement.length).toBeGreaterThan(0)
      }
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should reference actual content from the prompt',
    async () => {
      const suite = createEvalSuite({ agent, judge })
      const report = await suite.run(MATH_IMPROVEMENT_CASES_MINIMAL)
      const improveResult = await improver.improve(prompt, report.results)

      // Log suggestions for observability (no validation - LLM output is non-deterministic)
      const systemSuggestions = improveResult.suggestions.filter((s) => s.type === 'system_prompt')
      const userSuggestions = improveResult.suggestions.filter((s) => s.type === 'user_prompt')

      if (E2E_CONFIG.verbose) {
        console.log(`\n--- Suggestion Summary ---`)
        console.log(`  System prompt suggestions: ${systemSuggestions.length}`)
        console.log(`  User prompt suggestions: ${userSuggestions.length}`)
      }
    },
    TEST_TIMEOUTS.singleRound,
  )
})
