import type { EvalSuite } from '@/core/suite'
import type { TestCase } from '@/core/types'
import type { EvalReport, LogVerbosity } from './types'
import type { EvalPricingConfig } from './cost-helpers'
import { JsonReporter } from './json-reporter'
import { ConsoleReporter } from './console-reporter'

/**
 * Options for creating a report runner.
 */
export interface ReportRunnerOptions {
  /** Directory where reports will be saved */
  outputDir: string
  /** Pricing config for cost calculation */
  pricing?: EvalPricingConfig
  /** Verbosity level for console output (false to disable logging) */
  verbosity?: LogVerbosity | false
}


/**
 * Result returned by the report runner.
 */
export interface ReportRunnerResult<TInput, TOutput> {
  /** The generated evaluation report */
  report: EvalReport<TInput, TOutput>
  /** Path where the report was saved */
  savedPath: string
}

/**
 * Creates a runner that automatically logs and saves reports.
 *
 * @param options - Runner configuration
 * @returns A function that runs the suite and handles reporting
 *
 * @example
 * ```typescript
 * import { createReportRunner, GOOGLE_PRICING } from '@agtlantis/eval'
 *
 * const run = createReportRunner({
 *   outputDir: './reports',
 *   pricing: GOOGLE_PRICING,
 *   verbosity: 'detailed',
 * })
 *
 * const { report, savedPath } = await run(suite, testCases, 'my-evaluation')
 * // Logs to console and saves to ./reports/my-evaluation-{timestamp}.json
 * console.log(`Saved to: ${savedPath}`)
 * ```
 */
export function createReportRunner(options: ReportRunnerOptions) {
  const { outputDir, pricing, verbosity } = options

  const jsonReporter = new JsonReporter({ outputDir, pricing })
  const consoleReporter = verbosity !== false
    ? new ConsoleReporter({ verbosity: verbosity || 'summary', pricing })
    : null

  return async <TInput, TOutput>(
    suite: EvalSuite<TInput, TOutput>,
    testCases: TestCase<TInput>[],
    name: string,
  ): Promise<ReportRunnerResult<TInput, TOutput>> => {
    const report = await suite.run(testCases)

    consoleReporter?.log(report)
    const savedPath = jsonReporter.save(report, name)

    return { report, savedPath }
  }
}
