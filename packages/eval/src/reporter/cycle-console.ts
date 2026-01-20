import type { ImprovementCycleResult } from '@/improvement-cycle/types'
import type { LogVerbosity } from './types'
import { ConsoleReporter } from './console-reporter'
import { formatScoreDelta } from './format-utils'

/**
 * Options for logging an ImprovementCycleResult to console.
 */
export interface LogCycleOptions {
  /** Verbosity level for per-round details */
  verbosity?: LogVerbosity
  /** Show per-round details (default: false, summary only) */
  showRounds?: boolean
}

/**
 * Logs an ImprovementCycleResult to the console.
 *
 * Shows cycle summary including round count, termination reason, total cost,
 * and score progression. Optionally shows per-round details.
 *
 * @param result - The improvement cycle result to log
 * @param options - Logging options
 *
 * @example
 * ```typescript
 * import { logCycle } from '@agtlantis/eval'
 *
 * const result = await runImprovementCycleAuto(config)
 * logCycle(result, { verbosity: 'detailed', showRounds: true })
 * ```
 */
export function logCycle<TInput, TOutput>(
  result: ImprovementCycleResult<TInput, TOutput>,
  options: LogCycleOptions = {},
): void {
  const { verbosity = 'summary', showRounds = false } = options

  console.log('\n🔄 Improvement Cycle Complete')
  console.log(`   Rounds: ${result.rounds.length}`)
  console.log(`   Termination: ${result.terminationReason}`)
  console.log(`   Total Cost: $${result.totalCost.toFixed(4)}`)

  if (result.rounds.length > 0) {
    const firstScore = result.rounds[0].report.summary.avgScore
    const lastScore = result.rounds[result.rounds.length - 1].report.summary.avgScore
    const delta = lastScore - firstScore
    console.log(`   Score: ${firstScore.toFixed(1)} -> ${lastScore.toFixed(1)} (${formatScoreDelta(delta)})`)
  }

  if (showRounds) {
    const consoleReporter = new ConsoleReporter({ verbosity })
    for (const round of result.rounds) {
      console.log(`\n   -- Round ${round.round} --`)
      consoleReporter.log(round.report)
    }
  }
}
