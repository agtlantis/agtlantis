import { EvalTestResult } from '@/core/types'
import { Suggestion, AggregatedMetrics } from '@/improver/types'
import type { CostSummary, EvalPricingConfig } from './cost-helpers'

/**
 * Reporter interface for saving/logging evaluation reports.
 *
 * @example
 * ```typescript
 * const reporter = createJsonReporter('./reports')
 * reporter.save(report, 'my-test')  // → ./reports/my-test-1736691234567.json
 * ```
 */
export interface Reporter<TInput = unknown, TOutput = unknown> {
  /** Save report to file, returns file path (optional - not all reporters save files) */
  save?(report: EvalReport<TInput, TOutput>, name: string): string

  /** Log report to console (optional) */
  log?(report: EvalReport<TInput, TOutput>): void
}

/**
 * Common options for file-based reporters.
 */
export interface FileReporterOptions {
  /** Output directory (created if missing) */
  outputDir: string
  /** Pricing config for cost calculation */
  pricing?: EvalPricingConfig
  /** Add timestamp to filename (default: true) */
  addTimestamp?: boolean
}

/**
 * Verbosity level for console output.
 */
export type LogVerbosity = 'summary' | 'detailed' | 'full'

/**
 * Options for ConsoleReporter.
 */
export interface ConsoleReporterOptions {
  /** Verbosity level (default: 'summary') */
  verbosity?: LogVerbosity
  /** Pricing config for cost display */
  pricing?: EvalPricingConfig
}

export interface ReportSummary {
  totalTests: number
  passed: number
  failed: number
  avgScore: number
  metrics: AggregatedMetrics

  /** Number of iterations run per test case (only present when iterations > 1) */
  iterations?: number
  /** Average standard deviation across all tests */
  avgStdDev?: number
  /** Average pass rate across all tests */
  avgPassRate?: number

  /** Cost summary (set by CLI or manually via calculateReportCosts) */
  costSummary?: CostSummary
}

/**
 * Evaluation report data.
 * Pure data interface - use utility functions for operations.
 *
 * @example
 * ```typescript
 * const report = await suite.run(testCases)
 *
 * // Convert to markdown
 * const markdown = reportToMarkdown(report)
 *
 * // Save to file
 * await saveReportMarkdown(report, './reports/eval-report.md')
 * ```
 */
export interface EvalReport<TInput, TOutput> {
  summary: ReportSummary
  /** Results - may include iteration stats when iterations > 1 */
  results: EvalTestResult<TInput, TOutput>[]
  suggestions: Suggestion[]
  generatedAt: Date
  promptVersion: string
}

/**
 * Options for markdown report generation.
 */
export interface ReportMarkdownOptions {
  /** Include passed test details (default: false, collapsed) */
  expandPassedTests?: boolean
  /** Include raw JSON output (default: false) */
  includeRawOutput?: boolean
  /** Max length for output preview (default: 200) */
  outputPreviewLength?: number
}

/**
 * Result of comparing two evaluation reports.
 * Useful for tracking improvements across prompt versions.
 *
 * @example
 * ```typescript
 * const beforeReport = await suite.run(testCases)
 * const afterReport = await suite.withAgent(improvedAgent).run(testCases)
 * const comparison = compareReports(beforeReport, afterReport)
 *
 * console.log(`Score delta: ${comparison.scoreDelta}`)
 * console.log(`Improved tests: ${comparison.improved.join(', ')}`)
 * ```
 */
export interface ReportComparison {
  /** Change in average score (positive = improvement) */
  scoreDelta: number
  /** Change in pass rate (positive = improvement) */
  passRateDelta: number
  /** Changes in performance metrics */
  metricsDelta: {
    /** Change in average latency (ms) */
    latencyMs: number
    /** Change in total token usage */
    tokenUsage: number
  }
  /** Test IDs that improved (score increased) */
  improved: string[]
  /** Test IDs that regressed (score decreased) */
  regressed: string[]
  /** Test IDs that were removed (in before but not in after) */
  removed: string[]
}
