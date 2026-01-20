/**
 * Improvement Cycle E2E Test Setup - Domain-specific setup for improvement-cycle E2E tests.
 * Re-exports shared infrastructure and adds local prompt loading.
 */

import path from 'node:path'
import { execa, type ExecaError } from 'execa'
import type { AgentPrompt } from '@/core/types'
import { PACKAGE_ROOT, E2E_PATHS, createPromptLoader } from '@e2e/shared'

// Re-export everything from shared for backward compatibility
export {
  // Environment
  E2E_CONFIG,
  skipIfNoRealE2E,
  validateEnvironment,
  // LLM & Factories
  createTestLLMClient,
  DEFAULT_CRITERIA,
  createTestJudge,
  createTestImprover,
  createLLMAgent,
  // Termination
  DEFAULT_TERMINATION,
  SINGLE_ROUND_TERMINATION,
  TARGET_SCORE_TERMINATION,
  // Pricing
  TEST_PRICING_CONFIG,
  TEST_TIMEOUTS,
  // Cost Tracking
  createCostTracker,
  createTempHistoryPath,
  logCostIfVerbose,
  // Paths
  E2E_PATHS,
  PACKAGE_ROOT,
  // Test Lifecycle
  createTestDirectory,
  withTestFixture,
  createTestPath,
} from '@e2e/shared'

export type {
  VerbosityLevel,
  RoundCostEntry,
  CostTracker,
} from '@e2e/shared'

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'prompts')

export const loadPromptFixture = createPromptLoader(FIXTURES_DIR)

const CLI_PATH = path.join(PACKAGE_ROOT, 'src/cli/index.ts')
export const CLI_FIXTURES_DIR = path.join(__dirname, 'fixtures', 'configs')

export interface CLIResult {
  exitCode: number
  stdout: string
  stderr: string
  all: string
}

export async function runCLI(
  args: string[],
  options: {
    cwd?: string
    reject?: boolean
    timeout?: number
    env?: Record<string, string>
  } = {},
): Promise<CLIResult> {
  const {
    cwd = CLI_FIXTURES_DIR,
    reject = true,
    timeout = 60_000,
    env = {},
  } = options

  try {
    const result = await execa('npx', ['tsx', CLI_PATH, ...args], {
      cwd,
      reject,
      all: true,
      timeout,
      env: { ...process.env, ...env },
    })
    return {
      exitCode: result.exitCode ?? 0,
      stdout: result.stdout,
      stderr: result.stderr,
      all: result.all ?? '',
    }
  } catch (error) {
    const execaError = error as ExecaError
    if ('exitCode' in execaError) {
      return {
        exitCode: execaError.exitCode ?? 1,
        stdout: String(execaError.stdout ?? ''),
        stderr: String(execaError.stderr ?? ''),
        all: String((execaError as { all?: unknown }).all ?? ''),
      }
    }
    throw error
  }
}

export function createCLIHistoryPath(testName: string): string {
  return path.join(E2E_PATHS.cli, `${testName}-${Date.now()}.json`)
}
