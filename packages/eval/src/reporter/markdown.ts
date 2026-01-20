import { writeFile } from 'node:fs/promises'
import { truncate } from '@/utils/json'
import { getFilePartsDisplayInfo } from '@agtlantis/core'
import type { EvalReport, ReportComparison, ReportMarkdownOptions } from './types'

const PASS_ICON = '✅'
const FAIL_ICON = '❌'

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

/**
 * Converts an evaluation report to Markdown format.
 *
 * @example
 * ```typescript
 * const report = await suite.run(testCases)
 * const markdown = reportToMarkdown(report)
 * console.log(markdown)
 * ```
 */
export function reportToMarkdown<TInput, TOutput>(
  report: EvalReport<TInput, TOutput>,
  options: ReportMarkdownOptions = {}
): string {
  const {
    expandPassedTests = false,
    includeRawOutput = false,
    outputPreviewLength = 200,
  } = options

  const { summary, results, suggestions, generatedAt, promptVersion } = report
  const passRate =
    summary.totalTests > 0
      ? ((summary.passed / summary.totalTests) * 100).toFixed(1)
      : '0.0'

  const lines: string[] = []

  lines.push('# Evaluation Report')
  lines.push('')
  lines.push(`> Generated: ${generatedAt.toISOString()}`)
  lines.push(`> Prompt Version: ${promptVersion}`)
  lines.push('')

  lines.push('## Summary')
  lines.push('')
  lines.push(`| Metric | Value |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Total Tests | ${summary.totalTests} |`)
  if (summary.iterations && summary.iterations > 1) {
    lines.push(`| **Iterations** | **${summary.iterations}** |`)
  }
  lines.push(`| Passed | ${summary.passed} (${passRate}%) |`)
  lines.push(`| Failed | ${summary.failed} |`)
  if (summary.avgStdDev !== undefined) {
    lines.push(`| Average Score | ${summary.avgScore.toFixed(1)} ± ${summary.avgStdDev.toFixed(1)} |`)
  } else {
    lines.push(`| Average Score | ${summary.avgScore.toFixed(1)} |`)
  }
  if (summary.avgPassRate !== undefined) {
    lines.push(`| Avg Pass Rate | ${(summary.avgPassRate * 100).toFixed(1)}% |`)
  }
  lines.push(`| Avg Latency | ${summary.metrics.avgLatencyMs.toFixed(0)}ms |`)
  lines.push(`| Total Tokens | ${summary.metrics.totalTokens} |`)
  if (summary.costSummary?.total !== undefined) {
    lines.push(`| Est. Cost | $${summary.costSummary.total.toFixed(4)} |`)
  }
  lines.push('')

  const failedResults = results.filter((r) => !r.passed)
  if (failedResults.length > 0) {
    lines.push(`## ${FAIL_ICON} Failed Tests`)
    lines.push('')
    for (const result of failedResults) {
      lines.push(formatTestResult(result, outputPreviewLength, includeRawOutput))
    }
  }

  const passedResults = results.filter((r) => r.passed)
  if (passedResults.length > 0) {
    lines.push(`## ${PASS_ICON} Passed Tests`)
    lines.push('')
    if (expandPassedTests) {
      for (const result of passedResults) {
        lines.push(formatTestResult(result, outputPreviewLength, includeRawOutput))
      }
    } else {
      lines.push('<details>')
      lines.push('<summary>Click to expand passed tests</summary>')
      lines.push('')
      for (const result of passedResults) {
        lines.push(formatTestResult(result, outputPreviewLength, includeRawOutput))
      }
      lines.push('</details>')
      lines.push('')
    }
  }

  if (suggestions.length > 0) {
    lines.push('## 💡 Improvement Suggestions')
    lines.push('')
    const sortedSuggestions = [...suggestions].sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    )

    for (const suggestion of sortedSuggestions) {
      lines.push(formatSuggestion(suggestion))
    }
  }

  return lines.join('\n')
}

/**
 * Saves an evaluation report as a Markdown file.
 *
 * @example
 * ```typescript
 * const report = await suite.run(testCases)
 * await saveReportMarkdown(report, './reports/eval-2024-01.md')
 * ```
 */
export async function saveReportMarkdown<TInput, TOutput>(
  report: EvalReport<TInput, TOutput>,
  path: string,
  options?: ReportMarkdownOptions
): Promise<void> {
  const markdown = reportToMarkdown(report, options)
  await writeFile(path, markdown, 'utf-8')
}

function jsonCodeBlock(value: unknown, maxLength?: number): string[] {
  const json = JSON.stringify(value, null, 2)
  const content = maxLength !== undefined ? truncate(json, maxLength) : json
  return ['```json', content, '```']
}

function passFailIcon(passed: boolean): string {
  return passed ? PASS_ICON : FAIL_ICON
}

interface TestResultForFormat<TInput, TOutput> {
  testCase: { id?: string; input: TInput; description?: string }
  output: TOutput
  overallScore: number
  passed: boolean
  verdicts: Array<{ criterionId: string; score: number; reasoning: string; passed: boolean }>
  iterationStats?: {
    iterations: number
    scores: number[]
    mean: number
    stdDev: number
    min: number
    max: number
    passRate: number
    passCount: number
  }
  iterationResults?: Array<{ overallScore: number; passed: boolean; metrics: { latencyMs: number } }>
  conversationHistory?: Array<{ turn: number; input: TInput; output: TOutput | undefined }>
  totalTurns?: number
  terminationReason?: string
  multiTurnIterationStats?: {
    avgTurns: number
    minTurns: number
    maxTurns: number
    terminationCounts: Record<string, number>
  }
}

function formatTestResult<TInput, TOutput>(
  result: TestResultForFormat<TInput, TOutput>,
  previewLength: number,
  includeRaw: boolean
): string {
  const lines: string[] = []
  const testId = result.testCase.id ?? 'unnamed'

  const scoreDisplay = result.iterationStats
    ? `${result.overallScore.toFixed(1)} ± ${result.iterationStats.stdDev.toFixed(1)}`
    : result.overallScore.toFixed(1)
  lines.push(`### ${testId} (Score: ${scoreDisplay})`)
  lines.push('')

  if (result.testCase.description) {
    lines.push(`> ${result.testCase.description}`)
    lines.push('')
  }

  const fileDisplayInfos = getFilePartsDisplayInfo(result.testCase.input)
  if (fileDisplayInfos.length > 0) {
    lines.push('**Files:**')
    for (const info of fileDisplayInfos) {
      const namePrefix = info.filename ? `${info.filename} - ` : ''
      lines.push(`- ${namePrefix}${info.source}: ${info.description} (${info.mediaType})`)
    }
    lines.push('')
  }

  if (result.totalTurns !== undefined) {
    lines.push(`**Multi-turn:** ${result.totalTurns} turns | Termination: ${result.terminationReason ?? 'unknown'}`)
    lines.push('')
  }

  if (result.multiTurnIterationStats) {
    lines.push(...formatMultiTurnIterationStats(result.multiTurnIterationStats))
  }

  if (result.iterationStats && result.iterationResults) {
    lines.push(...formatIterationResults(result.iterationStats, result.iterationResults))
  }

  if (result.conversationHistory && result.conversationHistory.length > 0) {
    lines.push(...formatConversationHistory(result.conversationHistory, previewLength))
  } else {
    lines.push(...formatSingleTurnInputOutput(result.testCase.input, result.output, previewLength))
  }

  lines.push('**Verdicts:**')
  for (const verdict of result.verdicts) {
    lines.push(`- ${passFailIcon(verdict.passed)} **${verdict.criterionId}**: ${verdict.score} - ${verdict.reasoning}`)
  }
  lines.push('')

  if (includeRaw) {
    lines.push('<details>')
    lines.push('<summary>Raw Output</summary>')
    lines.push('')
    lines.push(...jsonCodeBlock(result.output))
    lines.push('</details>')
    lines.push('')
  }

  return lines.join('\n')
}

function formatMultiTurnIterationStats(stats: NonNullable<TestResultForFormat<unknown, unknown>['multiTurnIterationStats']>): string[] {
  const terminationSummary = Object.entries(stats.terminationCounts)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ') || 'none'

  return [
    '**Multi-turn Iteration Statistics:**',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Avg Turns | ${stats.avgTurns.toFixed(1)} |`,
    `| Min/Max Turns | ${stats.minTurns} / ${stats.maxTurns} |`,
    `| Termination Distribution | ${terminationSummary} |`,
    '',
  ]
}

function formatIterationResults(
  stats: NonNullable<TestResultForFormat<unknown, unknown>['iterationStats']>,
  results: NonNullable<TestResultForFormat<unknown, unknown>['iterationResults']>
): string[] {
  const lines: string[] = [
    '**Iteration Results:**',
    '',
    '| # | Score | Passed | Latency |',
    '|---|-------|--------|---------|',
  ]

  results.forEach((iter, idx) => {
    lines.push(`| ${idx + 1} | ${iter.overallScore.toFixed(1)} | ${passFailIcon(iter.passed)} | ${iter.metrics.latencyMs.toFixed(0)}ms |`)
  })

  lines.push('')
  lines.push(`**Stats:** ${stats.mean.toFixed(1)} ± ${stats.stdDev.toFixed(1)} (min: ${stats.min.toFixed(0)}, max: ${stats.max.toFixed(0)}, pass rate: ${(stats.passRate * 100).toFixed(0)}%)`)
  lines.push('')

  return lines
}

function formatConversationHistory<TInput, TOutput>(
  history: Array<{ turn: number; input: TInput; output: TOutput | undefined }>,
  previewLength: number
): string[] {
  const lines: string[] = ['**Conversation History:**', '']

  for (const turn of history) {
    lines.push('<details>')
    lines.push(`<summary>Turn ${turn.turn}</summary>`)
    lines.push('')
    lines.push('**Input:**')
    lines.push(...jsonCodeBlock(turn.input, previewLength))
    lines.push('')
    lines.push('**Output:**')
    lines.push(...jsonCodeBlock(turn.output, previewLength))
    lines.push('</details>')
    lines.push('')
  }

  return lines
}

function formatSingleTurnInputOutput<TInput, TOutput>(
  input: TInput,
  output: TOutput,
  previewLength: number
): string[] {
  return [
    '**Input:**',
    ...jsonCodeBlock(input, previewLength),
    '',
    '**Output:**',
    ...jsonCodeBlock(output, previewLength),
    '',
  ]
}

function formatSuggestion(suggestion: {
  type: string
  priority: string
  currentValue: string
  suggestedValue: string
  reasoning: string
  expectedImprovement: string
}): string {
  const lines: string[] = []
  const priorityIcon = { high: '🔴', medium: '🟡', low: '🟢' }[suggestion.priority] ?? '⚪'

  lines.push(`### ${priorityIcon} [${suggestion.priority.toUpperCase()}] ${suggestion.type}`)
  lines.push('')
  lines.push(`**Reasoning:** ${suggestion.reasoning}`)
  lines.push('')
  lines.push(`**Expected Improvement:** ${suggestion.expectedImprovement}`)
  lines.push('')
  lines.push('**Diff:**')
  lines.push('```diff')
  lines.push(`- ${suggestion.currentValue.split('\n').join('\n- ')}`)
  lines.push(`+ ${suggestion.suggestedValue.split('\n').join('\n+ ')}`)
  lines.push('```')
  lines.push('')

  return lines.join('\n')
}

/**
 * Compares two evaluation reports and returns the differences.
 * Useful for tracking improvements across prompt versions.
 *
 * @example
 * ```typescript
 * const beforeReport = await suite.run(testCases)
 * // ... apply improvements ...
 * const afterReport = await suite.withAgent(improvedAgent).run(testCases)
 *
 * const comparison = compareReports(beforeReport, afterReport)
 * console.log(`Score improved by ${comparison.scoreDelta} points`)
 * console.log(`Tests improved: ${comparison.improved.join(', ')}`)
 * console.log(`Tests regressed: ${comparison.regressed.join(', ')}`)
 * ```
 */
export function compareReports<TInput, TOutput>(
  before: EvalReport<TInput, TOutput>,
  after: EvalReport<TInput, TOutput>
): ReportComparison {
  const scoreDelta = after.summary.avgScore - before.summary.avgScore

  const beforePassRate = before.summary.totalTests > 0
    ? before.summary.passed / before.summary.totalTests
    : 0
  const afterPassRate = after.summary.totalTests > 0
    ? after.summary.passed / after.summary.totalTests
    : 0
  const passRateDelta = afterPassRate - beforePassRate

  const metricsDelta = {
    latencyMs: after.summary.metrics.avgLatencyMs - before.summary.metrics.avgLatencyMs,
    tokenUsage: after.summary.metrics.totalTokens - before.summary.metrics.totalTokens,
  }

  const beforeScores = buildScoreMap(before.results)
  const afterScores = buildScoreMap(after.results)

  const improved: string[] = []
  const regressed: string[] = []

  for (const [id, afterScore] of afterScores) {
    const beforeScore = beforeScores.get(id)
    if (beforeScore === undefined) continue
    if (afterScore > beforeScore) {
      improved.push(id)
    } else if (afterScore < beforeScore) {
      regressed.push(id)
    }
  }

  const removed = [...beforeScores.keys()].filter(id => !afterScores.has(id))

  return {
    scoreDelta,
    passRateDelta,
    metricsDelta,
    improved,
    regressed,
    removed,
  }
}

function buildScoreMap<TInput, TOutput>(
  results: Array<{ testCase: { id?: string }; overallScore: number }>
): Map<string, number> {
  const scoreMap = new Map<string, number>()
  for (const result of results) {
    scoreMap.set(result.testCase.id ?? 'unnamed', result.overallScore)
  }
  return scoreMap
}
