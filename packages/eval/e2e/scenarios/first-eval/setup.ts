/**
 * First Evaluation E2E Test Setup
 *
 * Re-exports shared infrastructure and adds local prompt loading.
 * This scenario tests the basic Agent → Judge → Report flow without
 * the improvement cycle.
 *
 * @example
 * import {
 *   REAL_E2E_ENABLED,
 *   createTestLLMClient,
 *   createTestJudge,
 *   loadPromptFixture,
 *   runAndSave,
 * } from './setup'
 */

import path from 'node:path'
import type { AgentPrompt } from '@/core/types'
import type { EvalReport } from '@/reporter/types'
import type { EvalSuite } from '@/core/suite'
import type { TestCase } from '@/core/types'

// ============================================================================
// Shared Infrastructure Re-exports
// ============================================================================

export {
  E2E_CONFIG,
  skipIfNoRealE2E,
  validateEnvironment,
  createTestLLMClient,
  DEFAULT_CRITERIA,
  createTestJudge,
  createLLMAgent,
  TEST_PRICING_CONFIG,
  TEST_TIMEOUTS,
  logTestResultIO,
  logEvalReportIO,
  saveEvalReport,
  E2E_PATHS,
} from '@e2e/shared'

// Local imports for use within this module
import {
  E2E_CONFIG,
  E2E_PATHS,
  TEST_PRICING_CONFIG,
  logEvalReportIO,
  saveEvalReport,
  getTestSlug,
  createPromptLoader,
} from '@e2e/shared'
import type { VitestTaskContext } from '@e2e/shared'

export type { VerbosityLevel } from '@e2e/shared'

// ============================================================================
// Local Prompt Loading
// ============================================================================

const FIXTURES_DIR = path.join(__dirname, 'fixtures')

/**
 * Loads a prompt from a YAML fixture file.
 * Uses shared createPromptLoader factory.
 *
 * @example
 * const prompt = await loadPromptFixture<GreetingInput>('greeting-agent')
 */
export const loadPromptFixture = createPromptLoader(FIXTURES_DIR)

// ============================================================================
// Convenience Wrapper
// ============================================================================

/**
 * Runs the suite, logs I/O, and saves the report automatically.
 *
 * @example
 * const report = await runAndSave(suite, testCases, 'my-test')
 */
export async function runAndSave<TInput, TOutput>(
  suite: EvalSuite<TInput, TOutput>,
  testCases: TestCase<TInput>[],
  testName: string,
): Promise<EvalReport<TInput, TOutput>> {
  const report = await suite.run(testCases)
  logEvalReportIO(report, TEST_PRICING_CONFIG, E2E_CONFIG.verbose)
  saveEvalReport(report, testName, E2E_PATHS.firstEval, TEST_PRICING_CONFIG)
  return report
}

/**
 * Creates a test runner that auto-names reports from Vitest test context.
 * Uses the test name as the report filename (slugified).
 *
 * @example
 * it('should evaluate agent with one test case', async (ctx) => {
 *   const run = createTestRunner(ctx)
 *   const report = await run(suite, testCases)
 *   // Report saved as: should-evaluate-agent-with-one-test-case-{timestamp}.json
 * })
 */
export function createTestRunner(ctx: VitestTaskContext) {
  return async <TInput, TOutput>(
    suite: EvalSuite<TInput, TOutput>,
    testCases: TestCase<TInput>[],
  ): Promise<EvalReport<TInput, TOutput>> => {
    const testName = getTestSlug(ctx)
    return runAndSave(suite, testCases, testName)
  }
}
