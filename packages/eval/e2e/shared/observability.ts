/**
 * E2E Test Observability
 *
 * Provides logging, reporting, and monitoring utilities for E2E tests.
 * Implements the three pillars: Console Logging, Report Preservation, Cost Tracking.
 */

import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import type { EvalReport } from '@/reporter/types'
import type { EvalTestResult } from '@/core/types'
import type { EvalPricingConfig } from '@/reporter/cost-helpers'
import { JsonReporter } from '@/reporter/json-reporter'
import { calculateReportCosts } from '@/reporter/cost-helpers'
import type { VerbosityLevel, E2ELogger, TestCaseIO, RoundSummary, CycleSummary } from './types'
import { E2E_CONFIG, TEST_PRICING_CONFIG } from './setup'

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

const isColorSupported = process.stdout.isTTY && !process.env.NO_COLOR

function c(color: keyof typeof colors, text: string): string {
  return isColorSupported ? `${colors[color]}${text}${colors.reset}` : text
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function formatScoreDelta(delta: number | null): string {
  if (delta === null) return ''
  const sign = delta >= 0 ? '+' : ''
  return ` (${sign}${delta.toFixed(1)})`
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

export function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n')
}

export const nullLogger: E2ELogger = {
  roundStart: () => {},
  testCaseResult: () => {},
  roundComplete: () => {},
  cycleComplete: () => {},
}

export function createConsoleLogger(level: VerbosityLevel): E2ELogger {
  return {
    roundStart(round: number) {
      if (level === 'detailed' || level === 'full') {
        console.log(c('cyan', `┌─ Round ${round} ${'─'.repeat(45)}`))
      }
    },

    testCaseResult(result: TestCaseIO) {
      if (level !== 'full') return

      const { testCaseId, input, output, score, verdict } = result

      console.log(c('dim', '│'))
      console.log(c('dim', '│  ') + c('bold', `▸ Test Case: ${testCaseId}`))

      console.log(c('dim', '│  ┌─ Input ') + c('dim', '─'.repeat(42)))
      const inputStr = typeof input === 'string' ? input : JSON.stringify(input, null, 2)
      console.log(indent(truncate(inputStr, 500), c('dim', '│  │ ')))
      console.log(c('dim', '│  └') + c('dim', '─'.repeat(50)))

      console.log(c('dim', '│  ┌─ Agent Output ') + c('dim', '─'.repeat(35)))
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
      console.log(indent(truncate(outputStr, 500), c('dim', '│  │ ')))
      console.log(c('dim', '│  └') + c('dim', '─'.repeat(50)))

      console.log(c('dim', '│  ┌─ Judge Verdict ') + c('dim', '─'.repeat(34)))
      console.log(c('dim', '│  │ ') + `Score: ${c('bold', String(score))}/100`)
      for (const v of verdict) {
        console.log(c('dim', '│  │ ') + c('gray', `${v.criterionId}: ${v.score}`))
        if (v.reasoning) {
          console.log(c('dim', '│  │ ') + c('dim', truncate(v.reasoning, 100)))
        }
      }
      console.log(c('dim', '│  └') + c('dim', '─'.repeat(50)))
    },

    roundComplete(summary: RoundSummary) {
      const { round, score, scoreDelta, cost, suggestions, durationMs, testCount } = summary

      if (level === 'summary') {
        const delta = formatScoreDelta(scoreDelta)
        console.log(
          `Round ${round}: Score ${c('bold', score.toFixed(1))}${delta} | ` +
            `Cost ${formatCost(cost.total)} | ` +
            `${suggestions.length} suggestions | ` +
            `${formatDuration(durationMs)}`,
        )
        return
      }

      if (level === 'full' && suggestions.length > 0) {
        console.log(c('dim', '│'))
        console.log(c('dim', '├') + c('dim', '─'.repeat(55)))
        console.log(c('dim', '│  ') + c('bold', '▸ Improver Suggestions:'))

        for (let i = 0; i < Math.min(suggestions.length, 3); i++) {
          const s = suggestions[i]
          console.log(
            c('dim', '│  ┌─ ') + `Suggestion ${i + 1} (${s.priority}) ` + c('dim', '─'.repeat(25)),
          )
          console.log(c('dim', '│  │ ') + `Type: ${s.type}`)
          console.log(c('dim', '│  │ ') + c('dim', truncate(s.reasoning, 100)))
          console.log(c('dim', '│  └') + c('dim', '─'.repeat(50)))
        }
        if (suggestions.length > 3) {
          console.log(c('dim', '│  ') + c('gray', `... and ${suggestions.length - 3} more`))
        }
      }

      console.log(c('dim', '│'))
      console.log(c('dim', '├') + c('dim', '─'.repeat(55)))
      console.log(c('dim', '│  ') + `Tests: ${testCount}    Duration: ${formatDuration(durationMs)}`)
      console.log(
        c('dim', '│  ') +
          `Cost: Agent ${formatCost(cost.agent)} | Judge ${formatCost(cost.judge)} | Improver ${formatCost(cost.improver)}`,
      )
      console.log(c('dim', '├') + c('dim', '─'.repeat(55)))
      console.log(
        c('dim', '│  ') +
          `Score: ${c('bold', score.toFixed(1))}${formatScoreDelta(scoreDelta)}    ` +
          `Total Cost: ${formatCost(cost.total)}    ` +
          `Suggestions: ${suggestions.length}`,
      )
      console.log(c('cyan', `└${'─'.repeat(55)}`))
      console.log()
    },

    cycleComplete(summary: CycleSummary) {
      const { rounds, finalScore, totalCost, terminationReason, totalDurationMs, reportDir } =
        summary

      if (level === 'summary') {
        console.log(c('dim', '─'.repeat(60)))
      }

      console.log(c('cyan', '═'.repeat(60)))
      console.log(c('bold', '  Cycle Complete'))
      console.log(c('dim', '  ' + '─'.repeat(55)))
      console.log(
        `  Rounds: ${rounds}         ` + `Final Score: ${c('bold', finalScore.toFixed(1))}`,
      )
      console.log(
        `  Total Cost: ${formatCost(totalCost)}    ` + `Duration: ${formatDuration(totalDurationMs)}`,
      )
      console.log(`  Termination: ${terminationReason}`)

      if (reportDir) {
        console.log()
        console.log(c('dim', `  Reports saved: ${reportDir}`))
      }

      console.log(c('cyan', '═'.repeat(60)))
      console.log()
    },
  }
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function saveRoundReport(
  dir: string,
  round: number,
  report: EvalReport<unknown, unknown>,
): void {
  const reporter = new JsonReporter({ outputDir: dir, addTimestamp: false })
  reporter.save(report, `round-${round}-report`)
}

export function createReportDir(agentName: string, baseDir: string): string {
  const timestamp = Date.now()
  return path.join(baseDir, `${agentName.toLowerCase()}-${timestamp}`)
}

/** Logs a single test result's I/O to console if verbosity is enabled. */
export function logTestResultIO<TInput, TOutput>(
  result: EvalTestResult<TInput, TOutput>,
  verbosity: VerbosityLevel | false = E2E_CONFIG.verbose,
): void {
  if (!verbosity) return

  console.log('\n┌─ Test Case ─────────────────────────────────────────')
  console.log(`│  ID: ${result.testCase.id}`)
  console.log(`│  Input: ${JSON.stringify(result.testCase.input)}`)
  console.log('├────────────────────────────────────────────────────')
  console.log(`│  Output: ${truncate(String(result.output), 200)}`)
  console.log('├────────────────────────────────────────────────────')
  console.log(`│  Score: ${result.overallScore.toFixed(1)} | Passed: ${result.passed}`)

  if (verbosity === 'detailed' || verbosity === 'full') {
    console.log(`│  Latency: ${result.metrics.latencyMs}ms | Tokens: ${result.metrics.tokenUsage.totalTokens}`)
  }

  if (verbosity === 'full') {
    console.log('├── Verdicts ────────────────────────────────────────')
    for (const v of result.verdicts) {
      console.log(`│  [${v.criterionId}] ${v.score}/100 - ${truncate(v.reasoning, 100)}`)
    }
  }

  console.log('└────────────────────────────────────────────────────')
}

/** Logs all results from an EvalReport to console if verbosity is enabled. */
export function logEvalReportIO<TInput, TOutput>(
  report: EvalReport<TInput, TOutput>,
  pricingConfig: EvalPricingConfig = TEST_PRICING_CONFIG,
  verbosity: VerbosityLevel | false = E2E_CONFIG.verbose,
): void {
  if (!verbosity) return

  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log(`║  EvalReport: ${report.results.length} tests, avg score ${report.summary.avgScore.toFixed(1)}`)
  console.log('╚════════════════════════════════════════════════════╝')

  for (const result of report.results) {
    logTestResultIO(result, verbosity)
  }

  const costs = calculateReportCosts(report, pricingConfig)
  console.log('\n┌─ Cost Summary ─────────────────────────────────────')
  console.log(`│  Total: $${costs.total.toFixed(4)}`)
  console.log(`│  Agent: $${costs.byComponent.agent.toFixed(4)}`)
  console.log(`│  Judge: $${costs.byComponent.judge.toFixed(4)}`)
  console.log('└────────────────────────────────────────────────────\n')
}

/** Saves an EvalReport to a timestamped JSON file. Returns the saved file path. */
export function saveEvalReport<TInput, TOutput>(
  report: EvalReport<TInput, TOutput>,
  testName: string,
  outputDir: string,
  pricingConfig: EvalPricingConfig = TEST_PRICING_CONFIG,
): string {
  const reporter = new JsonReporter({ outputDir, pricing: pricingConfig })
  const filepath = reporter.save(report, testName)

  if (E2E_CONFIG.verbose) {
    console.log(`📄 Report saved: ${filepath}`)
  }

  return filepath
}

/** Converts a test name to a URL-safe slug (e.g., 'My Test' -> 'my-test'). */
export function slugify(testName: string): string {
  return testName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Extracts a slug from Vitest test context's task.name. */
export function getTestSlug(context: { task: { name: string } }): string {
  return slugify(context.task.name)
}
