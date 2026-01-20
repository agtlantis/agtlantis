/**
 * E2E Tests: Full Improvement Cycle
 *
 * Tests the complete Test → Improve → Apply → Re-test cycle.
 * These tests verify:
 * - Cycle completes at least one round
 * - Score progression is tracked across rounds
 * - Termination conditions work correctly
 * - Costs accumulate properly
 *
 * @see refs/testing-guidelines.md - E2E Testing: High Abstraction Level
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { runImprovementCycleAuto } from '@/improvement-cycle/runner'
import { targetScore, maxRounds, maxCost } from '@/improvement-cycle/conditions'

import {
  E2E_CONFIG,
  createTestProvider,
  createStrictJudge,
  createTestImprover,
  loadImprovablePrompt,
  createMathAgent,
  buildCycleConfig,
  runCycleWithLogging,
  TEST_TIMEOUTS,
  TEST_PRICING_CONFIG,
  E2E_IMPROVEMENT_TERMINATION,
} from './setup'
import { MATH_IMPROVEMENT_CASES_MINIMAL } from './fixtures/test-cases'

import type { Provider } from '@agtlantis/core'
import type { Judge } from '@/judge/types'
import type { Improver } from '@/improver/types'
import type { AgentPrompt } from '@/core/types'
import type { MathInput, MathOutput } from './fixtures/test-cases'

describe.skipIf(!E2E_CONFIG.enabled)('Full Improvement Cycle', () => {
  let provider: Provider
  let judge: Judge
  let improver: Improver
  let prompt: AgentPrompt<MathInput>

  beforeAll(async () => {
    provider = createTestProvider()
    judge = createStrictJudge(provider) // Uses stepByStep() criterion for stricter evaluation
    improver = createTestImprover(provider)
    prompt = await loadImprovablePrompt()
  })

  it(
    'should complete at least one round',
    async () => {
      const config = buildCycleConfig({
        provider,
        initialPrompt: prompt,
        testCases: MATH_IMPROVEMENT_CASES_MINIMAL,
        judge,
        improver,
        // Use single round termination for this test
        terminateWhen: [maxRounds(1), maxCost(0.05)],
      })

      const result = await runCycleWithLogging(config)

      // Verify at least one round completed
      expect(result.rounds.length).toBeGreaterThanOrEqual(1)

      // Verify first round has required data
      const firstRound = result.rounds[0]
      expect(firstRound.round).toBe(1)
      expect(firstRound.report).toBeDefined()
      expect(firstRound.report.summary).toBeDefined()
      expect(firstRound.report.summary.avgScore).toBeGreaterThanOrEqual(0)
      expect(firstRound.report.summary.avgScore).toBeLessThanOrEqual(100)

      // Verify cost tracking
      expect(firstRound.cost).toBeDefined()
      expect(firstRound.cost.agent).toBeGreaterThanOrEqual(0)
      expect(firstRound.cost.judge).toBeGreaterThanOrEqual(0)
      expect(firstRound.cost.total).toBeGreaterThan(0)

      // Verify prompt snapshot exists (for rollback)
      expect(firstRound.promptSnapshot).toBeDefined()
      expect(firstRound.promptSnapshot.id).toBe(prompt.id)

      if (E2E_CONFIG.verbose) {
        console.log(`\n=== Round 1 Summary ===`)
        console.log(`Score: ${firstRound.report.summary.avgScore.toFixed(1)}`)
        console.log(`Cost: $${firstRound.cost.total.toFixed(4)}`)
        console.log(`Suggestions: ${firstRound.suggestionsGenerated.length}`)
      }
    },
    TEST_TIMEOUTS.fullCycle,
  )

  it(
    'should track score progression across rounds',
    async () => {
      const config = buildCycleConfig({
        provider,
        initialPrompt: prompt,
        testCases: MATH_IMPROVEMENT_CASES_MINIMAL,
        judge,
        improver,
        // Allow multiple rounds to observe progression
        terminateWhen: [maxRounds(2), maxCost(0.1)],
      })

      const result = await runCycleWithLogging(config)

      // If we have multiple rounds, verify scoreDelta is tracked
      if (result.rounds.length >= 2) {
        const secondRound = result.rounds[1]

        // scoreDelta should be calculated for round 2+
        expect(secondRound.scoreDelta).not.toBeNull()

        // Verify it's the actual difference
        const firstScore = result.rounds[0].report.summary.avgScore
        const secondScore = secondRound.report.summary.avgScore
        const expectedDelta = secondScore - firstScore

        expect(secondRound.scoreDelta).toBeCloseTo(expectedDelta, 1)

        if (E2E_CONFIG.verbose) {
          console.log(`\n=== Score Progression ===`)
          for (const round of result.rounds) {
            const delta =
              round.scoreDelta !== null
                ? ` (${round.scoreDelta > 0 ? '+' : ''}${round.scoreDelta.toFixed(1)})`
                : ''
            console.log(`Round ${round.round}: ${round.report.summary.avgScore.toFixed(1)}${delta}`)
          }
        }
      } else {
        // Only one round completed, scoreDelta should be null
        expect(result.rounds[0].scoreDelta).toBeNull()
      }
    },
    TEST_TIMEOUTS.fullCycle,
  )

  it(
    'should terminate on maxRounds condition',
    async () => {
      const MAX_ROUNDS = 2

      const config = buildCycleConfig({
        provider,
        initialPrompt: prompt,
        testCases: MATH_IMPROVEMENT_CASES_MINIMAL,
        judge,
        improver,
        // Set a low maxRounds with high target score (won't be reached)
        terminateWhen: [targetScore(99), maxRounds(MAX_ROUNDS), maxCost(0.15)],
      })

      const result = await runCycleWithLogging(config)

      // Should have exactly MAX_ROUNDS rounds (unless terminated earlier by other condition)
      expect(result.rounds.length).toBeLessThanOrEqual(MAX_ROUNDS)

      // Termination reason should mention the condition
      expect(result.terminationReason).toBeDefined()
      expect(result.terminationReason.length).toBeGreaterThan(0)

      if (E2E_CONFIG.verbose) {
        console.log(`\n=== Termination ===`)
        console.log(`Rounds: ${result.rounds.length}`)
        console.log(`Reason: ${result.terminationReason}`)
      }
    },
    TEST_TIMEOUTS.fullCycle,
  )

  it(
    'should accumulate costs correctly',
    async () => {
      const config = buildCycleConfig({
        provider,
        initialPrompt: prompt,
        testCases: MATH_IMPROVEMENT_CASES_MINIMAL,
        judge,
        improver,
        terminateWhen: [maxRounds(2), maxCost(0.1)],
      })

      const result = await runCycleWithLogging(config)

      // Total cost should be sum of all round costs
      const sumOfRoundCosts = result.rounds.reduce((sum, r) => sum + r.cost.total, 0)
      expect(result.totalCost).toBeCloseTo(sumOfRoundCosts, 4)

      // Each round should have component costs
      for (const round of result.rounds) {
        // Agent cost (running test cases)
        expect(round.cost.agent).toBeGreaterThanOrEqual(0)

        // Judge cost (evaluating results)
        expect(round.cost.judge).toBeGreaterThanOrEqual(0)

        // Improver cost (generating suggestions)
        expect(round.cost.improver).toBeGreaterThanOrEqual(0)

        // Total should be sum of components
        const expectedTotal = round.cost.agent + round.cost.judge + round.cost.improver
        expect(round.cost.total).toBeCloseTo(expectedTotal, 4)
      }

      // Should stay within budget
      expect(result.totalCost).toBeLessThanOrEqual(0.15)

      if (E2E_CONFIG.verbose) {
        console.log(`\n=== Cost Breakdown ===`)
        for (const round of result.rounds) {
          console.log(`Round ${round.round}:`)
          console.log(`  Agent:    $${round.cost.agent.toFixed(4)}`)
          console.log(`  Judge:    $${round.cost.judge.toFixed(4)}`)
          console.log(`  Improver: $${round.cost.improver.toFixed(4)}`)
          console.log(`  Total:    $${round.cost.total.toFixed(4)}`)
        }
        console.log(`\nCycle Total: $${result.totalCost.toFixed(4)}`)
      }
    },
    TEST_TIMEOUTS.fullCycle,
  )
})
