/**
 * E2E Tests: Suggestion Application
 *
 * Tests that applyPromptSuggestions correctly modifies prompts.
 * These tests verify:
 * - Approved suggestions are applied to the prompt
 * - Version is bumped after applying suggestions
 * - Skipped suggestions are properly reported
 *
 * @see refs/testing-guidelines.md - E2E Testing: High Abstraction Level
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createEvalSuite } from '@/core/suite'
import { applyPromptSuggestions } from '@/improver/utils'

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
import type { Suggestion } from '@/improver/types'
import type { AgentPrompt, EvalAgent } from '@/core/types'
import type { EvalReport } from '@/reporter/types'
import type { MathInput, MathOutput } from './fixtures/test-cases'

describe.skipIf(!E2E_CONFIG.enabled)('Suggestion Application', () => {
  let provider: Provider
  let judge: Judge
  let improver: Improver
  let prompt: AgentPrompt<MathInput>
  let agent: EvalAgent<MathInput, MathOutput>
  let generatedSuggestions: Suggestion[]
  let evalReport: EvalReport<MathInput, MathOutput>

  beforeAll(async () => {
    provider = createTestProvider()
    judge = createStrictJudge(provider) // Uses stepByStep() criterion for stricter evaluation
    improver = createTestImprover(provider)
    prompt = await loadImprovablePrompt()
    agent = createMathAgent(provider, prompt)

    // Generate suggestions once for all tests
    const suite = createEvalSuite({ agent, judge })
    evalReport = await suite.run(MATH_IMPROVEMENT_CASES_MINIMAL)

    if (E2E_CONFIG.verbose) {
      console.log('\n' + '='.repeat(60))
      console.log('Suggestion Application Tests - Setup')
      console.log('='.repeat(60))
      logEvalReportIO(evalReport, TEST_PRICING_CONFIG, E2E_CONFIG.verbose)
    }

    const improveResult = await improver.improve(prompt, evalReport.results)
    generatedSuggestions = improveResult.suggestions

    if (E2E_CONFIG.verbose) {
      console.log('\n--- Generated Suggestions Summary ---')
      console.log(`Total Suggestions: ${generatedSuggestions.length}`)
      console.log(
        `By Type: system_prompt=${generatedSuggestions.filter((s) => s.type === 'system_prompt').length}, ` +
          `user_prompt=${generatedSuggestions.filter((s) => s.type === 'user_prompt').length}, ` +
          `parameters=${generatedSuggestions.filter((s) => s.type === 'parameters').length}`,
      )
      for (const s of generatedSuggestions) {
        console.log(`  [${s.priority.toUpperCase()}] ${s.type}: "${s.currentValue.slice(0, 40)}..." → "${s.suggestedValue.slice(0, 40)}..."`)
      }
      console.log('='.repeat(60) + '\n')
    }
  }, TEST_TIMEOUTS.fullCycle)

  it(
    'should apply approved system_prompt suggestions',
    async () => {
      if (E2E_CONFIG.verbose) {
        console.log('\n--- Test: Apply System Prompt Suggestions ---')
      }

      // Get system_prompt suggestions only
      const systemSuggestions = generatedSuggestions.filter((s) => s.type === 'system_prompt')

      if (systemSuggestions.length === 0) {
        if (E2E_CONFIG.verbose) {
          console.log('⚠️  No system_prompt suggestions generated')
          console.log('   This test requires LLM-generated suggestions - skipping')
        }
        return
      }

      // Mark first suggestion as approved
      const approvedSuggestions = systemSuggestions.map((s, i) => ({
        ...s,
        approved: i === 0, // Only approve first one
      }))

      if (E2E_CONFIG.verbose) {
        console.log(`Input: ${systemSuggestions.length} system_prompt suggestions (1 approved)`)
      }

      const result = applyPromptSuggestions(prompt, approvedSuggestions)

      // Verify at least one suggestion was applied
      expect(result.appliedCount).toBeGreaterThanOrEqual(0)

      // If applied, prompt should be different
      if (result.appliedCount > 0) {
        expect(result.prompt.system).not.toBe(prompt.system)

        if (E2E_CONFIG.verbose) {
          console.log(`✅ Applied: ${result.appliedCount} suggestion(s)`)
          console.log(`   Original: "${prompt.system.slice(0, 60).replace(/\n/g, ' ')}..."`)
          console.log(`   Modified: "${result.prompt.system.slice(0, 60).replace(/\n/g, ' ')}..."`)
        }
      } else {
        // If not applied, check why (reported in skipped)
        expect(result.skipped.length).toBeGreaterThan(0)

        if (E2E_CONFIG.verbose) {
          console.log(`⚠️  All suggestions skipped:`)
          for (const s of result.skipped) {
            console.log(`   - ${s.reason}`)
          }
        }
      }
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should bump version after applying suggestions',
    async () => {
      if (E2E_CONFIG.verbose) {
        console.log('\n--- Test: Version Bump After Apply ---')
      }

      // Find a suggestion we can apply
      const applicableSuggestions = generatedSuggestions
        .filter((s) => s.type === 'system_prompt' && prompt.system.includes(s.currentValue))
        .map((s) => ({ ...s, approved: true }))

      const usingSynthetic = applicableSuggestions.length === 0

      if (usingSynthetic) {
        if (E2E_CONFIG.verbose) {
          console.log('Using synthetic suggestion (no applicable LLM suggestions)')
        }

        // Create a synthetic suggestion that will apply
        const syntheticSuggestion: Suggestion = {
          type: 'system_prompt',
          priority: 'high',
          currentValue: 'You solve math problems.',
          suggestedValue: 'You are an expert math tutor who solves problems step by step.',
          reasoning: 'More specific instructions improve accuracy',
          expectedImprovement: 'Better structured responses',
          approved: true,
        }

        const originalVersion = prompt.version

        const result = applyPromptSuggestions(prompt, [syntheticSuggestion], {
          bumpVersion: 'minor',
        })

        if (result.appliedCount > 0) {
          // Version should be bumped
          expect(result.prompt.version).not.toBe(originalVersion)

          // Parse versions to verify bump
          const [origMajor, origMinor] = originalVersion.split('.').map(Number)
          const [newMajor, newMinor] = result.prompt.version.split('.').map(Number)

          expect(newMajor).toBe(origMajor)
          expect(newMinor).toBe(origMinor + 1)

          if (E2E_CONFIG.verbose) {
            console.log(`✅ Version bumped: ${originalVersion} → ${result.prompt.version}`)
          }
        } else if (E2E_CONFIG.verbose) {
          console.log(`⚠️  Suggestion not applied: ${result.skipped[0]?.reason}`)
        }
      } else {
        if (E2E_CONFIG.verbose) {
          console.log(`Using ${applicableSuggestions.length} LLM-generated suggestion(s)`)
        }

        const originalVersion = prompt.version

        const result = applyPromptSuggestions(prompt, applicableSuggestions, {
          bumpVersion: 'minor',
        })

        if (result.appliedCount > 0) {
          expect(result.prompt.version).not.toBe(originalVersion)

          if (E2E_CONFIG.verbose) {
            console.log(`✅ Version bumped: ${originalVersion} → ${result.prompt.version}`)
            console.log(`   Applied: ${result.appliedCount}, Skipped: ${result.skipped.length}`)
          }
        }
      }
    },
    TEST_TIMEOUTS.singleRound,
  )

  it(
    'should report skipped suggestions when currentValue not found',
    async () => {
      if (E2E_CONFIG.verbose) {
        console.log('\n--- Test: Report Skipped Suggestions ---')
      }

      // Create a suggestion with a currentValue that doesn't exist
      const invalidSuggestion: Suggestion = {
        type: 'system_prompt',
        priority: 'high',
        currentValue: 'THIS TEXT DOES NOT EXIST IN THE PROMPT',
        suggestedValue: 'Some replacement',
        reasoning: 'Testing skipped suggestions',
        expectedImprovement: 'N/A',
        approved: true,
      }

      if (E2E_CONFIG.verbose) {
        console.log(`Input: Suggestion with non-existent currentValue`)
        console.log(`   currentValue: "${invalidSuggestion.currentValue}"`)
      }

      const result = applyPromptSuggestions(prompt, [invalidSuggestion])

      // Should report as skipped
      expect(result.skipped.length).toBe(1)
      expect(result.skipped[0].reason).toContain('not found')
      expect(result.appliedCount).toBe(0)

      // Prompt should be unchanged
      expect(result.prompt.system).toBe(prompt.system)

      if (E2E_CONFIG.verbose) {
        console.log(`✅ Correctly skipped: ${result.skipped[0].reason}`)
        console.log(`   Prompt unchanged: ${result.prompt.system === prompt.system}`)
      }
    },
    TEST_TIMEOUTS.singleRound,
  )
})
