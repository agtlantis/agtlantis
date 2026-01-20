import type { Reporter, ConsoleReporterOptions, EvalReport, LogVerbosity } from './types'
import { calculateReportCosts, type EvalPricingConfig } from './cost-helpers'
import { truncate } from '@/utils/json'

/**
 * Reporter that logs EvalReport to console.
 *
 * @example
 * ```typescript
 * const reporter = new ConsoleReporter({ verbosity: 'detailed' })
 * reporter.log(report)  // Logs to console
 *
 * // With cost display
 * const costReporter = new ConsoleReporter({
 *   verbosity: 'summary',
 *   pricing: GOOGLE_PRICING,
 * })
 * ```
 */
export class ConsoleReporter<TInput = unknown, TOutput = unknown>
  implements Reporter<TInput, TOutput>
{
  private readonly verbosity: LogVerbosity
  private readonly pricing?: EvalPricingConfig

  constructor(options: ConsoleReporterOptions = {}) {
    this.verbosity = options.verbosity ?? 'summary'
    this.pricing = options.pricing
  }

  log(report: EvalReport<TInput, TOutput>): void {
    const { summary } = report
    const passRate = summary.totalTests > 0 ? summary.passed / summary.totalTests : 0

    console.log(`\n📊 Eval Report: ${summary.totalTests} tests`)
    console.log(`   Score: ${summary.avgScore.toFixed(1)} | Pass Rate: ${(passRate * 100).toFixed(0)}%`)

    if (this.verbosity === 'summary') {
      this.logCostIfAvailable(report)
      return
    }

    console.log('')
    for (const result of report.results) {
      const testId = result.testCase.id || 'unknown'
      const status = result.passed ? '✓' : '✗'
      console.log(`   ${status} [${testId}] Score: ${result.overallScore.toFixed(1)}`)

      if (this.verbosity === 'full') {
        console.log(`      Input: ${truncate(JSON.stringify(result.testCase.input), 80)}`)
        console.log(`      Output: ${truncate(String(result.output), 80)}`)
      }
    }

    this.logCostIfAvailable(report)
  }

  private logCostIfAvailable(report: EvalReport<TInput, TOutput>): void {
    if (this.pricing) {
      const costs = calculateReportCosts(report, this.pricing)
      console.log(`\n   💰 Cost: $${costs.total.toFixed(4)}`)
    }
  }
}
