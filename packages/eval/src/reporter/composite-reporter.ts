import type { Reporter, EvalReport } from './types'

/**
 * Combines multiple reporters to save/log to multiple outputs.
 *
 * @example
 * ```typescript
 * const reporter = new CompositeReporter([
 *   new JsonReporter({ outputDir: './reports' }),
 *   new ConsoleReporter({ verbosity: 'detailed' }),
 * ])
 * reporter.save(report, 'my-test')  // JSON 저장 + 콘솔 출력
 * ```
 */
export class CompositeReporter<TInput = unknown, TOutput = unknown>
  implements Reporter<TInput, TOutput>
{
  constructor(private readonly reporters: Reporter<TInput, TOutput>[]) {}

  /**
   * Saves to all reporters that support saving.
   * Returns the first successful file path (usually JsonReporter).
   */
  save(report: EvalReport<TInput, TOutput>, name: string): string {
    const errors: Array<{ reporter: string; error: Error }> = []
    let firstPath: string | undefined

    for (const reporter of this.reporters) {
      // Skip reporters that don't support save
      if (!reporter.save) {
        reporter.log?.(report)
        continue
      }

      try {
        const savedPath = reporter.save(report, name)
        if (!firstPath) firstPath = savedPath
      } catch (error) {
        errors.push({
          reporter: reporter.constructor.name,
          error: error as Error,
        })
      }

      // Log regardless of save success/failure - user should see output even if save fails
      reporter.log?.(report)
    }

    if (!firstPath) {
      const details = errors.length > 0
        ? errors.map(e => `${e.reporter}: ${e.error.message}`).join(', ')
        : 'No reporters support save()'
      throw new Error(`No reporter saved successfully. ${details}`)
    }

    return firstPath
  }

  log(report: EvalReport<TInput, TOutput>): void {
    for (const reporter of this.reporters) {
      reporter.log?.(report)
    }
  }
}
