// Types
export type {
  Reporter,
  FileReporterOptions,
  ConsoleReporterOptions,
  LogVerbosity,
} from './types.js'
export * from './types.js'

// Reporter Classes
export { JsonReporter } from './json-reporter.js'
export { MarkdownReporter, type MarkdownReporterOptions } from './markdown-reporter.js'
export { ConsoleReporter } from './console-reporter.js'
export { CompositeReporter } from './composite-reporter.js'

// Factory Functions
export {
  createJsonReporter,
  createMarkdownReporter,
  createConsoleReporter,
  createCompositeReporter,
  createDefaultReporter,
} from './factory.js'

// Markdown Utilities
export { reportToMarkdown, compareReports, saveReportMarkdown } from './markdown.js'

// Report Runner
export { createReportRunner, type ReportRunnerOptions, type ReportRunnerResult } from './runner.js'

// Cost Calculation
export {
  calculateResultCost,
  calculateReportCosts,
  addCostsToResults,
  type CostBreakdown,
  type CostSummary,
  type MetricsWithCost,
  type TestResultWithCost,
  type EvalPricingConfig,
} from './cost-helpers.js'

// Improvement Cycle Helpers
export { saveCycleJson, type SaveCycleJsonOptions } from './cycle-json.js'
export { logCycle, type LogCycleOptions } from './cycle-console.js'
export { cycleToMarkdown, saveCycleMarkdown, type CycleMarkdownOptions } from './cycle-markdown.js'
