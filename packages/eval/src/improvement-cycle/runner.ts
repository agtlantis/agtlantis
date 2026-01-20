import type { LanguageModelUsage } from 'ai'
import { calculateCostFromUsage } from '@agtlantis/core'
import { createEvalSuite } from '@/core/suite'
import { applyPromptSuggestions } from '@/improver/utils'
import { calculateReportCosts, type EvalPricingConfig } from '@/reporter/cost-helpers'
import type { EvalAgent, AgentPrompt, EvalTokenUsage } from '@/core/types'
import type { EvalReport } from '@/reporter/types'
import type { Suggestion, ImproveResult } from '@/improver/types'

import { createSession, serializePrompt, deserializePrompt } from './history'
import type { ImprovementSession, SessionConfig } from './history'
import { checkCycleTermination } from './conditions'
import type {
  ImprovementCycleConfig,
  ImprovementCycleResult,
  RoundYield,
  RoundDecision,
  RoundResult,
  RoundCost,
  CycleContext,
  SerializedPrompt,
} from './types'

interface CycleState<TInput, TOutput> {
  currentPrompt: AgentPrompt<TInput>
  currentRound: number
  previousScores: number[]
  totalCost: number
  completedRounds: RoundResult[]
}

/** Initialize cycle state, resuming from existing session if provided. */
function initializeCycleState<TInput, TOutput>(
  initialPrompt: AgentPrompt<TInput>,
  existingSession: ImprovementSession | undefined
): CycleState<TInput, TOutput> {
  const resumeFromRound = existingSession ? existingSession.history.rounds.length : 0
  return {
    currentPrompt: initialPrompt,
    currentRound: resumeFromRound,
    previousScores: existingSession
      ? existingSession.history.rounds.map((r) => r.avgScore)
      : [],
    totalCost: existingSession ? existingSession.history.totalCost : 0,
    completedRounds: [],
  }
}

/** Returns null for the first round (no previous score to compare). */
function calculateScoreDelta(currentScore: number, previousScores: number[]): number | null {
  if (previousScores.length === 0) {
    return null
  }
  const previousScore = previousScores[previousScores.length - 1]
  return currentScore - previousScore
}

function buildCycleContext<TInput, TOutput>(
  state: CycleState<TInput, TOutput>,
  currentScore: number
): CycleContext {
  return {
    currentRound: state.currentRound,
    latestScore: currentScore,
    previousScores: [...state.previousScores],
    totalCost: state.totalCost,
    history: state.completedRounds,
  }
}

function createRoundResult<TInput, TOutput>(
  state: CycleState<TInput, TOutput>,
  report: EvalReport<TInput, TOutput>,
  improveResult: ImproveResult,
  cost: RoundCost,
  scoreDelta: number | null,
  promptSnapshot: SerializedPrompt
): RoundResult {
  return {
    round: state.currentRound,
    report: report as EvalReport<unknown, unknown>,
    completedAt: new Date(),
    suggestionsGenerated: improveResult.suggestions,
    suggestionsApproved: [], // Will be updated after decision
    promptSnapshot,
    promptVersionAfter: state.currentPrompt.version,
    cost,
    scoreDelta,
  }
}

async function handleStopDecision<TInput, TOutput>(
  state: CycleState<TInput, TOutput>,
  session: ImprovementSession,
  roundResult: RoundResult,
  promptSnapshot: SerializedPrompt,
  terminatedByCondition: boolean,
  conditionReason: string | undefined
): Promise<ImprovementCycleResult<TInput, TOutput>> {
  const reason = terminatedByCondition ? conditionReason! : 'User requested stop'

  session.addRound(roundResult, promptSnapshot)
  session.complete(reason)
  await session.flush()
  state.completedRounds.push(roundResult)

  return {
    rounds: state.completedRounds,
    finalPrompt: deserializePrompt(session.history.currentPrompt),
    terminationReason: reason,
    totalCost: state.totalCost,
    history: session.history,
  }
}

/** Throws if target round is invalid. */
function handleRollbackDecision<TInput, TOutput>(
  state: CycleState<TInput, TOutput>,
  rollbackToRound: number
): void {
  const targetRoundIndex = rollbackToRound - 1
  if (targetRoundIndex < 0 || targetRoundIndex >= state.completedRounds.length) {
    throw new Error(`Cannot rollback to round ${rollbackToRound}: round not found`)
  }

  const targetRound = state.completedRounds[targetRoundIndex]
  state.currentPrompt = deserializePrompt(targetRound.promptSnapshot)
  state.previousScores = state.previousScores.slice(0, rollbackToRound - 1)
}

function handleContinueDecision<TInput, TOutput>(
  state: CycleState<TInput, TOutput>,
  session: ImprovementSession,
  roundResult: RoundResult,
  approvedSuggestions: Suggestion[],
  versionBump: 'major' | 'minor' | 'patch'
): RoundResult {
  const updatedRoundResult: RoundResult = {
    ...roundResult,
    suggestionsApproved: approvedSuggestions,
  }

  if (approvedSuggestions.length > 0) {
    const applyResult = applyPromptSuggestions(state.currentPrompt, approvedSuggestions, {
      bumpVersion: versionBump,
    })
    state.currentPrompt = applyResult.prompt
    updatedRoundResult.promptVersionAfter = state.currentPrompt.version
  }

  const updatedPromptSnapshot = serializePrompt(state.currentPrompt)
  session.addRound(updatedRoundResult, updatedPromptSnapshot)
  state.completedRounds.push(updatedRoundResult)

  return updatedRoundResult
}

interface RoundExecutionResult<TInput, TOutput> {
  report: EvalReport<TInput, TOutput>
  improveResult: ImproveResult
  cost: RoundCost
}

async function executeRound<TInput, TOutput>(
  config: ImprovementCycleConfig<TInput, TOutput>,
  state: CycleState<TInput, TOutput>,
  pricingConfig: EvalPricingConfig | undefined
): Promise<RoundExecutionResult<TInput, TOutput>> {
  const { createAgent, judge, improver, testCases, options = {} } = config
  const agent = createAgent(state.currentPrompt)

  // Improver is called separately (not via suite) to capture full ImproveResult
  // with metadata, enabling accurate cost calculation via tokenUsage
  const suite = createEvalSuite({
    agent,
    judge,
    agentDescription: options.agentDescription,
  })
  const report = await suite.run(testCases, options.runOptions)

  const improveResult: ImproveResult = improver
    ? await improver.improve(state.currentPrompt, report.results)
    : { suggestions: [] }

  const cost = calculateRoundCost(report, improveResult, pricingConfig)

  return { report, improveResult, cost }
}

function detectProviderForImprover(model: string | undefined): string {
  if (!model) return 'anthropic' // improver typically uses Claude

  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) return 'openai'
  if (model.startsWith('gemini-')) return 'google'

  return 'anthropic'
}

function toLanguageModelUsage(usage: EvalTokenUsage): LanguageModelUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  } as LanguageModelUsage
}

function calculateImproverCost(
  improveResult: ImproveResult,
  pricingConfig?: EvalPricingConfig
): number {
  const usage = improveResult.metadata?.tokenUsage as EvalTokenUsage | undefined
  if (!usage) return 0

  const model = improveResult.metadata?.model ?? 'unknown'
  const provider = detectProviderForImprover(model)

  // Get the pricing for this specific provider
  const providerPricing = pricingConfig?.providerPricing?.[provider]

  const result = calculateCostFromUsage(
    toLanguageModelUsage(usage),
    model,
    provider,
    providerPricing
  )

  return result.total
}

function calculateRoundCost(
  report: EvalReport<unknown, unknown>,
  improveResult: ImproveResult,
  pricingConfig?: EvalPricingConfig
): RoundCost {
  const reportCosts = pricingConfig
    ? calculateReportCosts(report, pricingConfig)
    : { total: 0, byComponent: { agent: 0, judge: 0 } }

  const improverCost = calculateImproverCost(improveResult, pricingConfig)

  return {
    agent: reportCosts.byComponent.agent ?? 0,
    judge: reportCosts.byComponent.judge ?? 0,
    improver: improverCost,
    total: reportCosts.total + improverCost,
  }
}

/**
 * Run an improvement cycle as an AsyncGenerator for Human-in-the-Loop control.
 * Yields after each round for decision-making (continue, stop, or rollback).
 */
export async function* runImprovementCycle<TInput, TOutput>(
  config: ImprovementCycleConfig<TInput, TOutput>
): AsyncGenerator<RoundYield, ImprovementCycleResult<TInput, TOutput>, RoundDecision | undefined> {
  const { initialPrompt, terminateWhen = [], options = {} } = config
  const { pricingConfig, versionBump = 'patch', history: historyConfig, session: existingSession } = options

  const session: ImprovementSession = existingSession ?? createSession(
    initialPrompt,
    historyConfig ? { path: historyConfig.path, autoSave: historyConfig.autoSave } : undefined
  )
  const state = initializeCycleState(initialPrompt, existingSession)

  try {
    while (true) {
      state.currentRound++

      const { report, improveResult, cost } = await executeRound(config, state, pricingConfig)
      state.totalCost += cost.total

      const currentScore = report.summary.avgScore
      const scoreDelta = calculateScoreDelta(currentScore, state.previousScores)
      const promptSnapshot = serializePrompt(state.currentPrompt)
      const roundResult = createRoundResult(state, report, improveResult, cost, scoreDelta, promptSnapshot)
      const context = buildCycleContext(state, currentScore)

      state.previousScores.push(currentScore)

      const terminationCheck = await checkCycleTermination(terminateWhen, context)
      const pendingSuggestions: Suggestion[] = improveResult.suggestions.map((s) => ({
        ...s,
        approved: false,
      }))

      const roundYield: RoundYield = {
        roundResult,
        pendingSuggestions,
        terminationCheck,
        context,
      }

      const decision: RoundDecision | undefined = yield roundYield

      if (!decision || decision.action === 'stop') {
        return await handleStopDecision(
          state,
          session,
          roundResult,
          promptSnapshot,
          terminationCheck.terminated,
          terminationCheck.reason
        )
      }

      if (decision.action === 'rollback' && decision.rollbackToRound !== undefined) {
        handleRollbackDecision(state, decision.rollbackToRound)
        continue
      }

      handleContinueDecision(
        state,
        session,
        roundResult,
        decision.approvedSuggestions ?? [],
        versionBump
      )
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    session.complete(`Error: ${errorMessage}`)
    throw error
  }
}

/**
 * Run improvement cycle with automatic approval of all suggestions.
 * Continues until a termination condition is met.
 */
export async function runImprovementCycleAuto<TInput, TOutput>(
  config: ImprovementCycleConfig<TInput, TOutput>
): Promise<ImprovementCycleResult<TInput, TOutput>> {
  const cycle = runImprovementCycle(config)

  let iteratorResult = await cycle.next()

  while (!iteratorResult.done) {
    const roundYield = iteratorResult.value
    let decision: RoundDecision

    if (roundYield.terminationCheck.terminated) {
      decision = { action: 'stop' }
    } else {
      const approvedSuggestions = roundYield.pendingSuggestions.map((s) => ({
        ...s,
        approved: true,
      }))
      decision = { action: 'continue', approvedSuggestions }
    }

    iteratorResult = await cycle.next(decision)
  }

  return iteratorResult.value
}
