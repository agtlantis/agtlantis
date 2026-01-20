import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { ImprovementCycleResult } from '@/improvement-cycle/types'
import { toISOStringIfDate } from './format-utils'

/**
 * Options for saving an ImprovementCycleResult as JSON.
 *
 * Supports two modes:
 * - **Auto mode**: Provide `outputDir` and `name` to create a timestamped subdirectory
 * - **Explicit mode**: Provide `directory` to use an existing directory directly
 */
export interface SaveCycleJsonOptions {
  /** Base output directory (creates {name}-{timestamp}/ subdirectory) */
  outputDir?: string
  /** Cycle name (used for folder name with timestamp) */
  name?: string
  /** Use this exact directory path (no timestamp suffix added) */
  directory?: string
  /** Whether to save individual round reports (default: true) */
  saveRounds?: boolean
}

/**
 * Saves an ImprovementCycleResult to JSON files.
 *
 * Creates a directory containing:
 * - `cycle-summary.json`: Structured cycle summary
 * - `round-{n}-report.json`: Individual round reports (if saveRounds=true)
 *
 * @example Auto mode (creates timestamped directory)
 * ```typescript
 * const dir = saveCycleJson(result, {
 *   outputDir: './reports',
 *   name: 'my-agent',
 * })
 * // -> ./reports/my-agent-1736691234567/
 * ```
 *
 * @example Explicit mode (uses existing directory)
 * ```typescript
 * const dir = saveCycleJson(result, {
 *   directory: './reports/my-existing-dir',
 * })
 * // -> ./reports/my-existing-dir/
 * ```
 */
export function saveCycleJson<TInput, TOutput>(
  result: ImprovementCycleResult<TInput, TOutput>,
  options: SaveCycleJsonOptions,
): string {
  const { outputDir, name, directory, saveRounds = true } = options

  const cycleDir = resolveCycleDirectory(outputDir, name, directory)
  mkdirSync(cycleDir, { recursive: true })

  saveCycleSummary(cycleDir, result)

  if (saveRounds) {
    saveRoundReports(cycleDir, result.rounds)
  }

  return cycleDir
}

function resolveCycleDirectory(
  outputDir: string | undefined,
  name: string | undefined,
  directory: string | undefined
): string {
  if (directory) {
    return directory
  }
  if (outputDir && name) {
    return path.join(outputDir, `${name}-${Date.now()}`)
  }
  throw new Error('saveCycleJson requires either "directory" or both "outputDir" and "name"')
}

function saveCycleSummary<TInput, TOutput>(
  cycleDir: string,
  result: ImprovementCycleResult<TInput, TOutput>
): void {
  const summaryPath = path.join(cycleDir, 'cycle-summary.json')
  const summary = {
    rounds: result.rounds.map((round) => ({
      round: round.round,
      completedAt: toISOStringIfDate(round.completedAt),
      score: round.report.summary.avgScore,
      scoreDelta: round.scoreDelta,
      cost: round.cost,
      suggestionsGenerated: round.suggestionsGenerated.length,
      suggestionsApproved: round.suggestionsApproved.length,
      promptVersionAfter: round.promptVersionAfter,
    })),
    terminationReason: result.terminationReason,
    totalCost: result.totalCost,
    roundCount: result.rounds.length,
    initialScore: result.rounds[0]?.report.summary.avgScore ?? null,
    finalScore: result.rounds[result.rounds.length - 1]?.report.summary.avgScore ?? null,
  }
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
}

function saveRoundReports<TInput, TOutput>(
  cycleDir: string,
  rounds: ImprovementCycleResult<TInput, TOutput>['rounds']
): void {
  for (const round of rounds) {
    const roundPath = path.join(cycleDir, `round-${round.round}-report.json`)
    const roundData = {
      round: round.round,
      completedAt: toISOStringIfDate(round.completedAt),
      report: {
        ...round.report,
        generatedAt: toISOStringIfDate(round.report.generatedAt),
      },
      suggestionsGenerated: round.suggestionsGenerated,
      suggestionsApproved: round.suggestionsApproved,
      promptSnapshot: round.promptSnapshot,
      cost: round.cost,
      scoreDelta: round.scoreDelta,
    }
    writeFileSync(roundPath, JSON.stringify(roundData, null, 2))
  }
}
