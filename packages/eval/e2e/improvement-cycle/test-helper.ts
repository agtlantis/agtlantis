/**
 * E2E Test Helper - Fluent API for improvement-cycle E2E tests.
 *
 * @example
 * // Single round test
 * const round = await e2e.mathSolver().runSingleRound()
 * round.expectScore().toBeValid()
 *
 * @example
 * // Auto mode full cycle
 * const result = await e2e.qaAgent()
 *   .terminateAfter({ rounds: 2, cost: 0.10 })
 *   .runAuto()
 *
 * @example
 * // HITL mode with manual control
 * const cycle = e2e.mathSolver().runHITL()
 * const r1 = await cycle.nextRound()
 * await cycle.approveSuggestions()
 * const r2 = await cycle.nextRound()
 * const final = await cycle.stop()
 */

import { runImprovementCycle } from '@/improvement-cycle/runner'
import { maxRounds, maxCost, targetScore } from '@/improvement-cycle/conditions'
import { saveCycleJson } from '@/reporter'

import {
  createTestLLMClient,
  createTestJudge,
  createTestImprover,
  createLLMAgent,
  loadPromptFixture,
  TEST_PRICING_CONFIG,
  E2E_CONFIG,
} from '@e2e/improvement-cycle/setup'

import {
  nullLogger,
  createConsoleLogger,
  saveRoundReport,
  createReportDir,
  createRoundAssertions,
  createResultAssertions,
} from '@e2e/shared'

import type {
  VerbosityLevel,
  E2ELogger,
  TestCaseIO,
  TerminationOptions,
  RoundAssertions,
  ResultAssertions,
  HITLCycle,
} from '@e2e/shared'

import type { AgentPrompt, TestCase, EvalTestResult } from '@/core/types'
import type {
  RoundYield,
  ImprovementCycleResult,
  CycleTerminationCondition,
} from '@/improvement-cycle/types'
import type { Suggestion } from '@/improver/types'

// Re-export types for backward compatibility
export type {
  TerminationOptions,
  RoundAssertions,
  ResultAssertions,
  HITLCycle,
  E2ELogger,
  TestCaseIO,
  RoundSummary,
  CycleSummary,
  VerbosityLevel,
} from '@e2e/shared'

export type { ScoreAssertions, CostAssertions, SuggestionAssertions, PromptAssertions } from '@e2e/shared'

let sharedLLM: ReturnType<typeof createTestLLMClient> | null = null

function getOrCreateLLM() {
  if (!sharedLLM) {
    sharedLLM = createTestLLMClient()
  }
  return sharedLLM
}

interface AgentConfig {
  name: string
  promptFile: string
}

const AGENTS: Record<string, AgentConfig> = {
  mathSolver: { name: 'MathSolver', promptFile: 'math-solver' },
  qaAgent: { name: 'QAAgent', promptFile: 'qa-agent' },
  recommender: { name: 'Recommender', promptFile: 'recommender' },
}

function extractTestCaseIO(result: EvalTestResult<unknown, unknown>): TestCaseIO {
  return {
    testCaseId: result.testCase?.id ?? 'unknown',
    input: result.testCase?.input,
    output: result.output,
    score: result.overallScore,
    verdict: result.verdicts.map((v) => ({
      criterionId: v.criterionId,
      score: v.score,
      reasoning: v.reasoning,
    })),
  }
}

function mapSuggestionsForLogging(suggestions: Suggestion[]) {
  return suggestions.map((s) => ({
    type: s.type,
    priority: s.priority,
    reasoning: s.reasoning,
  }))
}

function logRoundResults(
  logger: E2ELogger,
  roundYield: RoundYield,
  roundNumber: number,
  durationMs: number,
  scoreDelta: number | null,
) {
  logger.roundStart(roundNumber)

  for (const testResult of roundYield.roundResult.report.results) {
    logger.testCaseResult(extractTestCaseIO(testResult))
  }

  logger.roundComplete({
    round: roundNumber,
    score: roundYield.roundResult.report.summary.avgScore,
    scoreDelta,
    cost: roundYield.roundResult.cost,
    suggestions: mapSuggestionsForLogging(roundYield.pendingSuggestions),
    durationMs,
    testCount: roundYield.roundResult.report.results.length,
  })
}

function logAndSaveCycleComplete<TInput>(
  logger: E2ELogger,
  result: ImprovementCycleResult<TInput, unknown>,
  totalDurationMs: number,
  reportDir: string | null,
) {
  const finalRound = result.rounds[result.rounds.length - 1]
  logger.cycleComplete({
    rounds: result.rounds.length,
    finalScore: finalRound?.report.summary.avgScore ?? 0,
    totalCost: result.totalCost,
    terminationReason: result.terminationReason,
    totalDurationMs,
    reportDir: reportDir ?? undefined,
  })

  if (reportDir) {
    saveCycleJson(result, { directory: reportDir, saveRounds: false })
  }
}

class CycleBuilder<TInput> {
  private terminateConditions: CycleTerminationCondition[] = []
  private testCases: TestCase<TInput>[] = []
  private agentConfig: AgentConfig
  private prompt: AgentPrompt<TInput> | null = null
  private versionBump: 'major' | 'minor' | 'patch' = 'minor'
  private historyPath: string | null = null
  private logger: E2ELogger = nullLogger
  private reportOutputDir: string | null = null

  constructor(agentConfig: AgentConfig) {
    this.agentConfig = agentConfig
    if (E2E_CONFIG.verbose) {
      this.logger = createConsoleLogger(E2E_CONFIG.verbose)
    }
    if (E2E_CONFIG.reportDir) {
      this.reportOutputDir = E2E_CONFIG.reportDir
    }
  }

  private async ensurePromptLoaded(): Promise<void> {
    if (!this.prompt) {
      this.prompt = await loadPromptFixture<TInput>(this.agentConfig.promptFile) as AgentPrompt<TInput>
    }
  }

  private getTerminateConditions(defaults: CycleTerminationCondition[]): CycleTerminationCondition[] {
    return this.terminateConditions.length > 0 ? this.terminateConditions : defaults
  }

  private createCycleConfig(llm: ReturnType<typeof getOrCreateLLM>, additionalOptions = {}) {
    return {
      createAgent: (prompt: AgentPrompt<TInput>) => createLLMAgent(llm, prompt, { name: this.agentConfig.name }),
      initialPrompt: this.prompt!,
      testCases: this.testCases,
      judge: createTestJudge(llm),
      improver: createTestImprover(llm),
      options: {
        pricingConfig: TEST_PRICING_CONFIG,
        versionBump: this.versionBump,
        ...(this.historyPath && { history: { path: this.historyPath, autoSave: true } }),
        ...additionalOptions,
      },
    }
  }

  withTestCases(cases: TestCase<TInput>[]): this {
    this.testCases = cases
    return this
  }

  terminateAfter(options: TerminationOptions): this {
    if (options.rounds) this.terminateConditions.push(maxRounds(options.rounds))
    if (options.cost) this.terminateConditions.push(maxCost(options.cost))
    if (options.score) this.terminateConditions.push(targetScore(options.score))
    return this
  }

  withVersionBump(bump: 'major' | 'minor' | 'patch'): this {
    this.versionBump = bump
    return this
  }

  withHistoryPath(historyPath: string): this {
    this.historyPath = historyPath
    return this
  }

  /**
   * Enable console logging with specified verbosity level.
   * - 'summary': One line per round (default)
   * - 'detailed': Cost breakdown per component
   * - 'full': Actual I/O content (input, output, judge verdict)
   */
  withObservability(level: VerbosityLevel = 'summary'): this {
    this.logger = createConsoleLogger(level)
    return this
  }

  withReportOutput(dir: string): this {
    this.reportOutputDir = dir
    return this
  }

  withLogger(customLogger: E2ELogger): this {
    this.logger = customLogger
    return this
  }

  async runSingleRound(): Promise<RoundAssertions> {
    await this.ensurePromptLoaded()
    const llm = getOrCreateLLM()
    const startTime = performance.now()

    const cycle = runImprovementCycle({
      ...this.createCycleConfig(llm),
      terminateWhen: [maxRounds(1), maxCost(0.05)],
    })

    const result = await cycle.next()
    await cycle.next({ action: 'stop' })

    const roundYield = result.value as RoundYield
    const durationMs = performance.now() - startTime

    logRoundResults(this.logger, roundYield, 1, durationMs, null)

    if (this.reportOutputDir) {
      const reportDir = createReportDir(this.agentConfig.name, this.reportOutputDir)
      saveRoundReport(reportDir, 1, roundYield.roundResult.report)
    }

    return createRoundAssertions(roundYield)
  }

  async runAuto(): Promise<ResultAssertions<TInput>> {
    await this.ensurePromptLoaded()
    const llm = getOrCreateLLM()
    const startTime = performance.now()
    const reportDir = this.reportOutputDir
      ? createReportDir(this.agentConfig.name, this.reportOutputDir)
      : null

    const cycle = runImprovementCycle({
      ...this.createCycleConfig(llm),
      terminateWhen: this.getTerminateConditions([maxRounds(2), maxCost(0.1)]),
    })

    let iteratorResult = await cycle.next()
    const rounds: RoundYield[] = []
    let roundStartTime = startTime

    while (!iteratorResult.done) {
      const roundYield = iteratorResult.value as RoundYield
      const roundNumber = roundYield.roundResult.round
      const roundDurationMs = performance.now() - roundStartTime

      logRoundResults(this.logger, roundYield, roundNumber, roundDurationMs, roundYield.roundResult.scoreDelta)

      if (reportDir) {
        saveRoundReport(reportDir, roundNumber, roundYield.roundResult.report)
      }

      rounds.push(roundYield)
      roundStartTime = performance.now()

      if (roundYield.terminationCheck.terminated) {
        iteratorResult = await cycle.next({ action: 'stop' })
      } else {
        const approvedSuggestions = roundYield.pendingSuggestions.map((s) => ({ ...s, approved: true }))
        iteratorResult = await cycle.next({ action: 'continue', approvedSuggestions })
      }
    }

    const result = iteratorResult.value as ImprovementCycleResult<TInput, unknown>
    const totalDurationMs = performance.now() - startTime

    logAndSaveCycleComplete(this.logger, result, totalDurationMs, reportDir)

    return createResultAssertions(result)
  }

  runHITL(): HITLCycleImpl<TInput> {
    return new HITLCycleImpl(
      this.agentConfig,
      this.testCases,
      this.getTerminateConditions([maxRounds(3), maxCost(0.15)]),
      this.prompt,
      this.versionBump,
      this.historyPath,
      this.logger,
      this.reportOutputDir,
    )
  }
}

class HITLCycleImpl<TInput> implements HITLCycle {
  private generator: AsyncGenerator<RoundYield, ImprovementCycleResult<TInput, unknown>> | null = null
  private _pendingSuggestions: Suggestion[] = []
  private approvalDecision: 'all' | 'none' | number = 'all'
  private isInitialized = false
  private startTime = 0
  private roundStartTime = 0
  private completedRounds: RoundYield[] = []
  private reportDir: string | null = null
  private completedResult: ImprovementCycleResult<TInput, unknown> | null = null

  constructor(
    private agentConfig: AgentConfig,
    private testCases: TestCase<TInput>[],
    private terminateConditions: CycleTerminationCondition[],
    private prompt: AgentPrompt<TInput> | null,
    private versionBump: 'major' | 'minor' | 'patch',
    private historyPath: string | null,
    private logger: E2ELogger,
    private reportOutputDir: string | null,
  ) {}

  get pendingSuggestions(): Suggestion[] {
    return this._pendingSuggestions
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return

    if (!this.prompt) {
      this.prompt = await loadPromptFixture<TInput>(this.agentConfig.promptFile)
    }

    const llm = getOrCreateLLM()

    this.generator = runImprovementCycle({
      createAgent: (prompt) => createLLMAgent(llm, prompt, { name: this.agentConfig.name }),
      initialPrompt: this.prompt,
      testCases: this.testCases,
      judge: createTestJudge(llm),
      improver: createTestImprover(llm),
      terminateWhen: this.terminateConditions,
      options: {
        pricingConfig: TEST_PRICING_CONFIG,
        versionBump: this.versionBump,
        ...(this.historyPath && { history: { path: this.historyPath, autoSave: true } }),
      },
    })

    this.startTime = performance.now()
    this.roundStartTime = this.startTime
    this.isInitialized = true

    if (this.reportOutputDir) {
      this.reportDir = createReportDir(this.agentConfig.name, this.reportOutputDir)
    }
  }

  private buildApprovedSuggestions(): Suggestion[] {
    if (this.approvalDecision === 'all') {
      return this._pendingSuggestions.map((s) => ({ ...s, approved: true }))
    }
    if (this.approvalDecision === 'none') {
      return this._pendingSuggestions.map((s) => ({ ...s, approved: false }))
    }
    const approveCount = this.approvalDecision as number
    return this._pendingSuggestions.map((s, i) => ({ ...s, approved: i < approveCount }))
  }

  async nextRound(): Promise<RoundAssertions> {
    await this.ensureInitialized()

    const decision = this._pendingSuggestions.length > 0
      ? { action: 'continue' as const, approvedSuggestions: this.buildApprovedSuggestions() }
      : undefined

    const result = decision ? await this.generator!.next(decision) : await this.generator!.next()

    if (result.done) {
      this.completedResult = result.value as ImprovementCycleResult<TInput, unknown>
      throw new Error('Cycle already completed. Use stop() to get final result.')
    }

    const roundYield = result.value as RoundYield
    const roundNumber = roundYield.roundResult.round
    const roundDurationMs = performance.now() - this.roundStartTime

    logRoundResults(this.logger, roundYield, roundNumber, roundDurationMs, roundYield.roundResult.scoreDelta)

    if (this.reportDir) {
      saveRoundReport(this.reportDir, roundNumber, roundYield.roundResult.report)
    }

    this._pendingSuggestions = roundYield.pendingSuggestions
    this.approvalDecision = 'all'
    this.completedRounds.push(roundYield)
    this.roundStartTime = performance.now()

    return createRoundAssertions(roundYield)
  }

  approveSuggestions(): this {
    this.approvalDecision = 'all'
    return this
  }

  approveFirst(count = 1): this {
    this.approvalDecision = count
    return this
  }

  rejectAll(): this {
    this.approvalDecision = 'none'
    return this
  }

  async stop(): Promise<ResultAssertions<unknown>> {
    await this.ensureInitialized()

    const cycleResult = this.completedResult
      ? (this.completedResult as ImprovementCycleResult<unknown, unknown>)
      : (await this.generator!.next({ action: 'stop' })).value as ImprovementCycleResult<unknown, unknown>

    const totalDurationMs = performance.now() - this.startTime
    logAndSaveCycleComplete(this.logger, cycleResult, totalDurationMs, this.reportDir)

    return createResultAssertions(cycleResult)
  }
}

function createAgentBuilder<TInput>(config: AgentConfig) {
  return () => new CycleBuilder<TInput>(config)
}

export const e2e = {
  mathSolver: createAgentBuilder<{ problem: string }>(AGENTS.mathSolver),
  qaAgent: createAgentBuilder<{ question: string; context: string }>(AGENTS.qaAgent),
  recommender: createAgentBuilder<{ request: string; preferences?: string }>(AGENTS.recommender),
}

export {
  MATH_TEST_CASES_MINIMAL,
  QA_TEST_CASES_MINIMAL,
  RECOMMENDER_MULTI_TURN_CASES_MINIMAL,
} from '@e2e/improvement-cycle/fixtures/test-cases'

export type {
  MathInput,
  QAInput,
  RecommenderInput,
} from '@e2e/improvement-cycle/fixtures/test-cases'

export { isMultiTurnResult } from '@/core/types'
export { loadHistory, resumeSession } from '@/improvement-cycle/history'
