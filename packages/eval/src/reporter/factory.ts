import { JsonReporter } from './json-reporter.js'
import { MarkdownReporter, type MarkdownReporterOptions } from './markdown-reporter.js'
import { ConsoleReporter } from './console-reporter.js'
import { CompositeReporter } from './composite-reporter.js'
import type { FileReporterOptions, ConsoleReporterOptions, Reporter, LogVerbosity } from './types.js'
import type { EvalPricingConfig } from './cost-helpers.js'

/**
 * Create a JSON reporter.
 *
 * @example
 * ```typescript
 * const reporter = createJsonReporter('./reports')
 * reporter.save(report, 'my-test')  // → ./reports/my-test-1736691234567.json
 * ```
 */
export function createJsonReporter<TInput = unknown, TOutput = unknown>(
  outputDir: string,
  options?: Omit<FileReporterOptions, 'outputDir'>,
): JsonReporter<TInput, TOutput> {
  return new JsonReporter({ outputDir, ...options })
}

/**
 * Create a Markdown reporter.
 *
 * @example
 * ```typescript
 * const reporter = createMarkdownReporter('./reports')
 * reporter.save(report, 'my-test')  // → ./reports/my-test-1736691234567.md
 * ```
 */
export function createMarkdownReporter<TInput = unknown, TOutput = unknown>(
  outputDir: string,
  options?: Omit<MarkdownReporterOptions, 'outputDir'>,
): MarkdownReporter<TInput, TOutput> {
  return new MarkdownReporter({ outputDir, ...options })
}

/**
 * Create a console reporter.
 *
 * @example
 * ```typescript
 * const reporter = createConsoleReporter({ verbosity: 'detailed' })
 * reporter.log(report)  // Logs to console
 * ```
 */
export function createConsoleReporter<TInput = unknown, TOutput = unknown>(
  options?: ConsoleReporterOptions,
): ConsoleReporter<TInput, TOutput> {
  return new ConsoleReporter(options)
}

/**
 * Create a composite reporter from multiple reporters.
 *
 * @example
 * ```typescript
 * const reporter = createCompositeReporter([
 *   createJsonReporter('./reports'),
 *   createConsoleReporter({ verbosity: 'summary' }),
 * ])
 * ```
 */
export function createCompositeReporter<TInput = unknown, TOutput = unknown>(
  reporters: Reporter<TInput, TOutput>[],
): CompositeReporter<TInput, TOutput> {
  return new CompositeReporter(reporters)
}

/**
 * Convenience: Create JSON + Console reporter combo.
 *
 * @example
 * ```typescript
 * const reporter = createDefaultReporter('./reports', {
 *   pricing: GOOGLE_PRICING,
 *   verbosity: 'summary',
 * })
 * reporter.save(report, 'my-test')  // JSON 저장 + 콘솔 출력
 * ```
 */
export function createDefaultReporter<TInput = unknown, TOutput = unknown>(
  outputDir: string,
  options?: {
    pricing?: EvalPricingConfig
    verbosity?: LogVerbosity
    addTimestamp?: boolean
  },
): CompositeReporter<TInput, TOutput> {
  return new CompositeReporter([
    new JsonReporter({
      outputDir,
      pricing: options?.pricing,
      addTimestamp: options?.addTimestamp,
    }),
    new ConsoleReporter({
      verbosity: options?.verbosity,
      pricing: options?.pricing,
    }),
  ])
}
