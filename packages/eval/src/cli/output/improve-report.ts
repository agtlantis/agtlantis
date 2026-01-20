import type { ImprovementCycleResult, RoundResult } from '@/improvement-cycle/types'
import { CLI_DEFAULTS } from '../constants.js'
import { c } from './colors.js'

export interface PrintImprovementSummaryOptions {
  verbose?: boolean
  duration?: number
}

export function printImprovementSummary(
  result: ImprovementCycleResult<unknown, unknown>,
  options: PrintImprovementSummaryOptions = {}
): void {
  const { rounds, terminationReason, totalCost, finalPrompt } = result
  const { verbose, duration } = options

  const divider = '═'.repeat(CLI_DEFAULTS.DIVIDER_WIDTH)

  console.log()
  console.log(c('cyan', divider))
  console.log(c('bold', '  Improvement Cycle Results'))
  console.log(c('cyan', divider))
  console.log()

  const finalScore = getFinalScore(rounds)
  const scoreChange = getScoreChange(rounds)

  console.log(`  ${c('bold', 'Total Rounds:')}    ${rounds.length}`)
  console.log(`  ${c('bold', 'Final Score:')}     ${finalScore.toFixed(1)}/100`)
  console.log(`  ${c('bold', 'Score Change:')}    ${scoreChange}`)
  console.log(`  ${c('bold', 'Total Cost:')}      $${totalCost.toFixed(2)}`)
  console.log(`  ${c('bold', 'Final Version:')}   ${finalPrompt.version}`)

  console.log()
  console.log(`  ${c('bold', 'Termination:')}     ${terminationReason}`)

  if (duration !== undefined) {
    console.log()
    console.log(`  ${c('bold', 'Duration:')}        ${formatDuration(duration)}`)
  }

  console.log()
  console.log(c('cyan', divider))

  if (verbose && rounds.length > 0) {
    printRoundsDetail(rounds)
  }
}

function getFinalScore(rounds: RoundResult[]): number {
  if (rounds.length === 0) return 0
  return rounds[rounds.length - 1].report.summary.avgScore
}

function getScoreChange(rounds: RoundResult[]): string {
  if (rounds.length < 1) return 'N/A'

  const firstScore = rounds[0].report.summary.avgScore
  const lastScore = rounds[rounds.length - 1].report.summary.avgScore
  const delta = lastScore - firstScore

  if (rounds.length === 1) {
    return c('dim', 'N/A (first round)')
  }

  if (delta > 0) {
    return c('green', `+${delta.toFixed(1)}`)
  } else if (delta < 0) {
    return c('red', `${delta.toFixed(1)}`)
  }
  return '0.0'
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function printRoundsDetail(rounds: RoundResult[]): void {
  console.log()
  console.log(c('bold', '  Round History:'))
  console.log()

  for (const round of rounds) {
    const scoreStr = round.report.summary.avgScore.toFixed(1)
    const deltaStr =
      round.scoreDelta !== null
        ? ` (${round.scoreDelta >= 0 ? '+' : ''}${round.scoreDelta.toFixed(1)})`
        : ''
    const costStr = `$${round.cost.total.toFixed(2)}`

    console.log(
      `  Round ${round.round}: Score ${scoreStr}${deltaStr} | Cost ${costStr}`
    )
    console.log(
      `         Suggestions: ${round.suggestionsGenerated.length} generated, ${round.suggestionsApproved.length} applied`
    )
  }
}

export function printRoundProgress(round: RoundResult): void {
  const scoreStr = round.report.summary.avgScore.toFixed(1)
  const passRate = (
    (round.report.summary.passed / round.report.summary.totalTests) *
    100
  ).toFixed(0)

  console.log()
  console.log(`  ${c('cyan', `Round ${round.round} completed`)}`)
  console.log(`    Score: ${scoreStr}/100 | Pass rate: ${passRate}%`)
  console.log(
    `    Tests: ${round.report.summary.totalTests} | Suggestions: ${round.suggestionsGenerated.length}`
  )
}
