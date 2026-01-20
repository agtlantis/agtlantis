import { writeFileSync } from 'node:fs'
import type { Reporter, FileReporterOptions, EvalReport, ReportMarkdownOptions } from './types'
import { reportToMarkdown } from './markdown'
import { buildOutputPath } from './format-utils'

export interface MarkdownReporterOptions extends FileReporterOptions {
  /** Markdown generation options */
  markdown?: ReportMarkdownOptions
}

/**
 * Reporter that saves EvalReport as Markdown.
 *
 * @example
 * ```typescript
 * const reporter = new MarkdownReporter({ outputDir: './reports' })
 * reporter.save(report, 'my-test')  // -> ./reports/my-test-1736691234567.md
 *
 * // With expanded passed tests
 * const detailedReporter = new MarkdownReporter({
 *   outputDir: './reports',
 *   markdown: { expandPassedTests: true },
 * })
 * ```
 */
export class MarkdownReporter<TInput = unknown, TOutput = unknown>
  implements Reporter<TInput, TOutput>
{
  private readonly outputDir: string
  private readonly addTimestamp: boolean
  private readonly markdownOptions: ReportMarkdownOptions

  constructor(options: MarkdownReporterOptions) {
    this.outputDir = options.outputDir
    this.addTimestamp = options.addTimestamp ?? true
    this.markdownOptions = options.markdown ?? {}
  }

  save(report: EvalReport<TInput, TOutput>, name: string): string {
    const filepath = buildOutputPath(this.outputDir, name, 'md', this.addTimestamp)
    const markdown = reportToMarkdown(report, this.markdownOptions)
    writeFileSync(filepath, markdown)
    return filepath
  }
}
