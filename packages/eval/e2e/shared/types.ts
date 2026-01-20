/**
 * Shared E2E Test Types
 *
 * Common type definitions for E2E testing infrastructure.
 */

import type { Suggestion } from '@/improver/types'
import type { RoundYield, ImprovementCycleResult } from '@/improvement-cycle/types'

/** 'summary' = one line/round, 'detailed' = cost breakdown, 'full' = actual I/O */
export type VerbosityLevel = 'summary' | 'detailed' | 'full'

export interface RoundCostEntry {
  round: number
  agent: number
  judge: number
  improver: number
  total: number
}

export interface CostTracker {
  readonly totalCost: number
  readonly costBreakdown: readonly RoundCostEntry[]
  addRound(round: number, costs: { agent: number; judge: number; improver: number }): void
  report(): string
  reset(): void
}

export interface E2ELogger {
  roundStart(round: number): void
  testCaseResult(result: TestCaseIO): void
  roundComplete(summary: RoundSummary): void
  cycleComplete(summary: CycleSummary): void
}

export interface TestCaseIO {
  testCaseId: string
  input: unknown
  output: unknown
  score: number
  verdict: { criterionId: string; score: number; reasoning: string }[]
}

export interface RoundSummary {
  round: number
  score: number
  scoreDelta: number | null
  cost: { agent: number; judge: number; improver: number; total: number }
  suggestions: Array<{ type: string; priority: string; reasoning: string }>
  durationMs: number
  testCount: number
}

export interface CycleSummary {
  rounds: number
  finalScore: number
  totalCost: number
  terminationReason: string
  totalDurationMs: number
  reportDir?: string
}

export interface TerminationOptions {
  rounds?: number
  cost?: number
  score?: number
}

export interface ScoreAssertions {
  toBeValid(): void
  toBeGreaterThan(value: number): void
  toBeLessThan(value: number): void
  toBe(value: number): void
}

export interface CostAssertions {
  toBeLessThan(value: number): void
  toBeGreaterThan(value: number): void
  toMatchBreakdown(): void
}

export interface SuggestionAssertions {
  toExist(): void
  toHaveValidStructure(): void
  toHaveCount(count: number): void
  toHaveCountGreaterThan(count: number): void
}

export interface PromptAssertions {
  toExist(): void
  toHaveUserTemplate(): void
}

export interface RoundAssertions {
  expectScore(): ScoreAssertions
  expectCost(): CostAssertions
  expectSuggestions(): SuggestionAssertions
  expectPromptSnapshot(): PromptAssertions
  readonly raw: RoundYield
}

export interface ResultAssertions<TInput> {
  expectTermination(reason: 'maxRounds' | 'maxCost' | 'targetScore' | 'userStop' | string): void
  expectRoundCount(count: number): void
  expectRoundCountAtLeast(count: number): void
  expectRoundCountAtMost(count: number): void
  expectCost(): CostAssertions
  expectScoreProgression(): void
  readonly raw: ImprovementCycleResult<TInput, unknown>
}

export interface HITLCycle {
  nextRound(): Promise<RoundAssertions>
  approveSuggestions(): HITLCycle
  approveFirst(count?: number): HITLCycle
  rejectAll(): HITLCycle
  stop(): Promise<ResultAssertions<unknown>>
  readonly pendingSuggestions: Suggestion[]
}

/** Vitest test context for auto-generating report names. */
export interface VitestTaskContext {
  task: {
    name: string
    suite?: { name: string }
    file?: { name: string }
  }
}
