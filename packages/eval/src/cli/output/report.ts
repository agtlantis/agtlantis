import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { reportToMarkdown } from '@/reporter/markdown'
import type { EvalReport, ReportMarkdownOptions } from '@/reporter/types'

export interface GenerateReportOptions {
  /** Output directory (default: './reports') */
  dir?: string
  /** Filename (default: 'eval-{timestamp}.md') */
  filename?: string
  /** Markdown options */
  markdown?: ReportMarkdownOptions
}

export async function generateReport<TInput, TOutput>(
  report: EvalReport<TInput, TOutput>,
  options: GenerateReportOptions = {}
): Promise<string> {
  const {
    dir = './reports',
    filename = generateFilename(),
    markdown,
  } = options

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }

  const content = reportToMarkdown(report, markdown)
  const outputPath = join(dir, filename)
  await writeFile(outputPath, content, 'utf-8')

  return outputPath
}

function generateFilename(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, '')

  return `eval-${timestamp}.md`
}
