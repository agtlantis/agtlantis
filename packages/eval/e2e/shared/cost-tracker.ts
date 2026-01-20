/**
 * Cost Tracking for E2E Tests
 *
 * Utilities to track and report LLM costs during E2E test execution.
 */

import path from 'node:path'
import type { CostTracker, RoundCostEntry } from './types'
import { E2E_PATHS } from './paths'
import { E2E_CONFIG } from './config'

/** Tracks costs per round with agent/judge/improver breakdown. */
export function createCostTracker(): CostTracker {
  let breakdown: RoundCostEntry[] = []
  let total = 0

  return {
    get totalCost() {
      return total
    },
    get costBreakdown() {
      return breakdown
    },

    addRound(round, costs) {
      const roundTotal = costs.agent + costs.judge + costs.improver
      breakdown.push({
        round,
        agent: costs.agent,
        judge: costs.judge,
        improver: costs.improver,
        total: roundTotal,
      })
      total += roundTotal
    },

    report() {
      const lines = [
        '',
        '=== Real E2E Cost Report ===',
        `Total: $${total.toFixed(4)}`,
        '',
        'Breakdown by round:',
        ...breakdown.map(
          (b) =>
            `  Round ${b.round}: $${b.total.toFixed(4)} ` +
            `(agent: $${b.agent.toFixed(4)}, judge: $${b.judge.toFixed(4)}, improver: $${b.improver.toFixed(4)})`,
        ),
        '============================',
      ]
      return lines.join('\n')
    },

    reset() {
      breakdown = []
      total = 0
    },
  }
}

export function createTempHistoryPath(testName: string, baseDir?: string): string {
  const timestamp = Date.now()
  const dir = baseDir ?? E2E_PATHS.history
  return path.join(dir, `${testName}-${timestamp}.json`)
}

export function logCostIfVerbose(tracker: CostTracker): void {
  if (E2E_CONFIG.verbose) {
    console.log(tracker.report())
  }
}
