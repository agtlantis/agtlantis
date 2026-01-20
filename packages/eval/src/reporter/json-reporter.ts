import { writeFileSync } from 'node:fs'
import type { Reporter, FileReporterOptions, EvalReport } from './types'
import { calculateReportCosts, type CostSummary, type EvalPricingConfig } from './cost-helpers'
import { buildOutputPath } from './format-utils'

interface SerializedReport<TInput, TOutput> {
  summary: EvalReport<TInput, TOutput>['summary']
  results: EvalReport<TInput, TOutput>['results']
  suggestions: EvalReport<TInput, TOutput>['suggestions']
  generatedAt: string
  promptVersion: string
  costs?: CostSummary
}

/**
 * Reporter that saves EvalReport as JSON.
 *
 * @example
 * ```typescript
 * const reporter = new JsonReporter({ outputDir: './reports' })
 * reporter.save(report, 'my-test')  // -> ./reports/my-test-1736691234567.json
 *
 * // Without timestamp
 * const fixedReporter = new JsonReporter({
 *   outputDir: './reports',
 *   addTimestamp: false,
 * })
 * fixedReporter.save(report, 'round-1')  // -> ./reports/round-1.json
 * ```
 */
export class JsonReporter<TInput = unknown, TOutput = unknown>
  implements Reporter<TInput, TOutput>
{
  private readonly outputDir: string
  private readonly pricing?: EvalPricingConfig
  private readonly addTimestamp: boolean

  constructor(options: FileReporterOptions) {
    this.outputDir = options.outputDir
    this.pricing = options.pricing
    this.addTimestamp = options.addTimestamp ?? true
  }

  save(report: EvalReport<TInput, TOutput>, name: string): string {
    const filepath = buildOutputPath(this.outputDir, name, 'json', this.addTimestamp)

    const costs = this.pricing
      ? calculateReportCosts(report, this.pricing)
      : undefined

    const output: SerializedReport<TInput, TOutput> = {
      summary: report.summary,
      results: report.results,
      suggestions: report.suggestions,
      generatedAt: report.generatedAt.toISOString(),
      promptVersion: report.promptVersion,
      ...(costs && { costs }),
    }

    writeFileSync(filepath, JSON.stringify(output, null, 2))
    return filepath
  }
}
