/**
 * Prompt Improvement E2E Test Setup
 *
 * Re-exports shared infrastructure and adds utilities for testing
 * the improvement cycle: suggestion generation, application, and
 * score progression across rounds.
 *
 * @example
 * import {
 *   REAL_E2E_ENABLED,
 *   createTestLLMClient,
 *   createTestJudge,
 *   createTestImprover,
 *   loadImprovablePrompt,
 *   createMathAgent,
 *   E2E_IMPROVEMENT_TERMINATION,
 * } from './setup'
 */

import path from 'node:path'
import { createFilePromptRepository } from '@agtlantis/core'
import type { AgentPrompt } from '@/core/types'
import { createEvalSuite } from '@/core/suite'
import { runImprovementCycleAuto } from '@/improvement-cycle/runner'
import { maxRounds, maxCost, targetScore } from '@/improvement-cycle/conditions'

import type { EvalAgent } from '@/core/types'
import type { Judge } from '@/judge/types'
import type { Improver } from '@/improver/types'
import type { CycleTerminationCondition, ImprovementCycleConfig } from '@/improvement-cycle/types'
import type { MathInput, MathOutput } from './fixtures/test-cases'
import type { Provider } from '@agtlantis/core'

// ============================================================================
// Shared Infrastructure Re-exports
// ============================================================================

export {
  E2E_CONFIG,
  skipIfNoRealE2E,
  validateEnvironment,
  createTestProvider,
  DEFAULT_CRITERIA,
  createTestJudge,
  createTestImprover,
  createProviderAgent,
  DEFAULT_TERMINATION,
  SINGLE_ROUND_TERMINATION,
  TARGET_SCORE_TERMINATION,
  TEST_PRICING_CONFIG,
  TEST_TIMEOUTS,
  logTestResultIO,
  logEvalReportIO,
  saveEvalReport,
  E2E_PATHS,
  createSubdir,
} from '@e2e/shared'

// Local imports for use within this module
import {
  E2E_CONFIG,
  E2E_PATHS,
  TEST_PRICING_CONFIG,
  createTestJudge,
  createTestImprover,
  createProviderAgent,
  logEvalReportIO,
} from '@e2e/shared'

import { accuracy, stepByStep } from '@/judge/criteria'
import { createJudge } from '@/judge/llm-judge'
import { defaultJudgePrompt } from '@/judge/prompts/default'

export type { VerbosityLevel } from '@e2e/shared'

// ============================================================================
// Local Constants
// ============================================================================

const PROMPTS_DIR = path.join(__dirname, 'fixtures', 'prompts')

/**
 * Output directory for prompt improvement tests.
 */
export const PROMPT_IMPROVEMENT_PATH = path.join(E2E_PATHS.improvementCycle, 'prompt-improvement')

// ============================================================================
// Termination Conditions for This Scenario
// ============================================================================

/**
 * Termination conditions optimized for improvement testing.
 * - Target 75% score (achievable with improvement)
 * - Max 3 rounds (enough to show progression)
 * - Max $0.10 cost (budget safety)
 */
export const E2E_IMPROVEMENT_TERMINATION: CycleTerminationCondition[] = [
  targetScore(75),
  maxRounds(3),
  maxCost(0.1),
]

// ============================================================================
// Strict Judge for Improvement Testing
// ============================================================================

/**
 * Criteria that require structured reasoning.
 * The weak prompt doesn't instruct step-by-step, so it will score lower.
 * After improvement (adding step-by-step instruction), scores should increase.
 */
export const STRICT_CRITERIA = [accuracy(), stepByStep()]

/**
 * Creates a strict judge that requires step-by-step reasoning.
 * This judge will give lower scores to the weak prompt, enabling improvement.
 *
 * @example
 * const judge = createStrictJudge(provider)
 * // Uses accuracy() + stepByStep() criteria
 */
export function createStrictJudge(provider: Provider): Judge {
  return createJudge({
    provider,
    prompt: defaultJudgePrompt,
    criteria: STRICT_CRITERIA,
    passThreshold: 70,
  })
}

// ============================================================================
// Prompt Loading
// ============================================================================

/**
 * Loads the "improvable" math agent prompt.
 * Uses Core's createFilePromptRepository with directory + ID pattern.
 * This prompt is deliberately weak to allow for measurable improvement.
 *
 * @example
 * const prompt = await loadImprovablePrompt()
 * // prompt.system is minimal: "You solve math problems."
 */
export async function loadImprovablePrompt(): Promise<AgentPrompt<MathInput>> {
  const repo = createFilePromptRepository({
    directory: PROMPTS_DIR,
  })
  const prompt = await repo.read<MathInput>('improvable-agent')
  return prompt as AgentPrompt<MathInput>
}

// ============================================================================
// Agent Factory
// ============================================================================

/**
 * Creates a math solver agent from a prompt.
 * Used to create agents during the improvement cycle.
 *
 * @example
 * const agent = createMathAgent(provider, prompt)
 * const result = await agent.execute({ problem: 'What is 2 + 2?' })
 */
export function createMathAgent(
  provider: Provider,
  prompt: AgentPrompt<MathInput>,
): EvalAgent<MathInput, MathOutput> {
  return createProviderAgent(provider, prompt, {
    name: prompt.id,
    description: 'Math solver agent for improvement testing',
  })
}

// ============================================================================
// Improvement Cycle Helpers
// ============================================================================

/**
 * Configuration builder for improvement cycle tests.
 *
 * @example
 * const config = buildCycleConfig({
 *   provider,
 *   initialPrompt,
 *   testCases,
 *   terminateWhen: E2E_IMPROVEMENT_TERMINATION,
 * })
 * const result = await runImprovementCycleAuto(config)
 */
export interface CycleConfigOptions {
  provider: Provider
  initialPrompt: AgentPrompt<MathInput>
  testCases: import('@/core/types').TestCase<MathInput>[]
  judge?: Judge
  improver?: Improver
  terminateWhen?: CycleTerminationCondition[]
}

export function buildCycleConfig(
  options: CycleConfigOptions,
): ImprovementCycleConfig<MathInput, MathOutput> {
  const { provider, initialPrompt, testCases, terminateWhen = E2E_IMPROVEMENT_TERMINATION } = options

  const judge = options.judge ?? createTestJudge(provider)
  const improver = options.improver ?? createTestImprover(provider)

  return {
    createAgent: (prompt) => createMathAgent(provider, prompt),
    initialPrompt,
    testCases,
    judge,
    improver,
    terminateWhen,
    options: {
      pricingConfig: TEST_PRICING_CONFIG,
      versionBump: 'minor',
      agentDescription: 'Math solver for improvement testing',
    },
  }
}

/**
 * Runs an improvement cycle and logs results.
 * Convenience wrapper that adds observability.
 *
 * @example
 * const result = await runCycleWithLogging(config)
 * console.log(`Final score: ${result.rounds.at(-1)?.report.summary.avgScore}`)
 */
export async function runCycleWithLogging(
  config: ImprovementCycleConfig<MathInput, MathOutput>,
): Promise<Awaited<ReturnType<typeof runImprovementCycleAuto<MathInput, MathOutput>>>> {
  const result = await runImprovementCycleAuto(config)

  // Log each round's report if verbose
  if (E2E_CONFIG.verbose) {
    for (const round of result.rounds) {
      console.log(`\n--- Round ${round.round} ---`)
      logEvalReportIO(round.report, TEST_PRICING_CONFIG, E2E_CONFIG.verbose)

      if (round.scoreDelta !== null) {
        const direction = round.scoreDelta > 0 ? '↑' : round.scoreDelta < 0 ? '↓' : '→'
        console.log(`Score Delta: ${direction} ${round.scoreDelta.toFixed(1)}`)
      }

      console.log(`Suggestions Generated: ${round.suggestionsGenerated.length}`)
      console.log(`Suggestions Approved: ${round.suggestionsApproved.length}`)
    }

    console.log(`\n=== Cycle Complete ===`)
    console.log(`Total Rounds: ${result.rounds.length}`)
    console.log(`Total Cost: $${result.totalCost.toFixed(4)}`)
    console.log(`Termination: ${result.terminationReason}`)
  }

  return result
}
