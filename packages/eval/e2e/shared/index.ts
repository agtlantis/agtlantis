/**
 * Shared E2E Infrastructure
 *
 * Re-exports all shared E2E testing utilities.
 */

export type {
  VerbosityLevel,
  RoundCostEntry,
  CostTracker,
  E2ELogger,
  TestCaseIO,
  RoundSummary,
  CycleSummary,
  TerminationOptions,
  ScoreAssertions,
  CostAssertions,
  SuggestionAssertions,
  PromptAssertions,
  RoundAssertions,
  ResultAssertions,
  HITLCycle,
  VitestTaskContext,
} from './types'

export { E2E_CONFIG } from './config'
export type { E2EConfig } from './config'

export {
  skipIfNoRealE2E,
  validateEnvironment,
  createTestProvider,
  createTestLLMClient,
  DEFAULT_CRITERIA,
  createTestJudge,
  createTestImprover,
  createProviderAgent,
  createLLMAgent,
  DEFAULT_TERMINATION,
  SINGLE_ROUND_TERMINATION,
  TARGET_SCORE_TERMINATION,
  TEST_PRICING_CONFIG,
  TEST_TIMEOUTS,
  toEvalTokenUsage,
  createPromptLoader,
} from './setup'

export { createCostTracker, createTempHistoryPath, logCostIfVerbose } from './cost-tracker'

export {
  formatCost,
  formatDuration,
  formatScoreDelta,
  truncate,
  indent,
  nullLogger,
  createConsoleLogger,
  ensureDir,
  saveRoundReport,
  createReportDir,
  logTestResultIO,
  logEvalReportIO,
  saveEvalReport,
  slugify,
  getTestSlug,
} from './observability'

export { saveCycleJson, logCycle, cycleToMarkdown } from '@/reporter'

export {
  createScoreAssertions,
  createCostAssertions,
  createSuggestionAssertions,
  createPromptAssertions,
  createRoundAssertions,
  createResultAssertions,
} from './assertions'

export {
  E2E_ROOT,
  PACKAGE_ROOT,
  TEST_OUTPUT_BASE,
  E2E_PATHS,
  createTimestampedPath,
  createSubdir,
} from './paths'
export type { E2EPathKey } from './paths'

export {
  createTestDirectory,
  withTestFixture,
  createTestPath,
} from './test-lifecycle'
