import type { EvalReport } from '@/reporter/types'
import { CLI_DEFAULTS } from '../constants.js'
import { c } from './colors.js'

export function printBanner(): void {
  console.log()
  console.log(c('cyan', '  agent-eval'))
  console.log(c('dim', '  LLM-as-Judge AI Agent Evaluation'))
  console.log()
}

export function printProgress(message: string): void {
  console.log(c('dim', `  ${message}`))
}

interface PrintSummaryOptions {
  verbose?: boolean
  duration?: number
}

export function printSummary(
  report: EvalReport<unknown, unknown>,
  options: PrintSummaryOptions = {}
): void {
  const { summary, results } = report
  const { verbose, duration } = options

  const passRate = summary.totalTests > 0
    ? ((summary.passed / summary.totalTests) * 100).toFixed(1)
    : '0.0'

  const divider = '═'.repeat(CLI_DEFAULTS.DIVIDER_WIDTH)

  console.log()
  console.log(c('cyan', divider))
  console.log(c('bold', '  Evaluation Results'))
  console.log(c('cyan', divider))
  console.log()

  // Summary stats
  console.log(`  ${c('bold', 'Total Tests:')}    ${summary.totalTests}`)
  console.log(
    `  ${c('bold', 'Passed:')}         ${c('green', String(summary.passed))} (${passRate}%)`
  )
  console.log(
    `  ${c('bold', 'Failed:')}         ${summary.failed > 0 ? c('red', String(summary.failed)) : '0'}`
  )
  console.log(
    `  ${c('bold', 'Average Score:')}  ${summary.avgScore.toFixed(1)}/100`
  )

  console.log()

  // Metrics
  console.log(
    `  ${c('bold', 'Total Tokens:')}   ${formatNumber(summary.metrics.totalTokens)}`
  )
  console.log(
    `  ${c('bold', 'Avg Latency:')}    ${formatMs(summary.metrics.avgLatencyMs)}`
  )

  if (duration !== undefined) {
    console.log()
    console.log(`  ${c('bold', 'Duration:')}       ${formatMs(duration)}`)
  }

  console.log()
  console.log(c('cyan', divider))

  if (verbose && results.length > 0) {
    printVerboseResults(results)
  }
}

function printVerboseResults(
  results: EvalReport<unknown, unknown>['results']
): void {
  console.log()
  console.log(c('bold', '  Test Results:'))
  console.log()

  for (const result of results) {
    const status = result.passed ? c('green', '✓ PASS') : c('red', '✗ FAIL')
    const testId =
      'testCase' in result && result.testCase?.id ? result.testCase.id : 'unknown'

    console.log(`  ${status}  ${testId}`)
    console.log(`         Score: ${result.overallScore.toFixed(1)}/100`)

    if ('criteriaScores' in result && result.criteriaScores) {
      const scores = result.criteriaScores as Array<{ criterionId: string; score: number }>
      for (const score of scores) {
        console.log(`         ${c('dim', score.criterionId)}: ${score.score.toFixed(1)}`)
      }
    }

    console.log()
  }
}

export function printError(error: Error): void {
  console.error()
  console.error(c('red', '  ✗ Error:'))
  console.error()
  console.error(`  ${error.message}`)
  console.error()
}

function formatNumber(num: number): string {
  return num.toLocaleString('en-US')
}

function formatMs(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}
