import type {
  AgentMetadata,
  EvalAgent,
  EvalTokenUsage,
  MetricsResult,
} from '@/core/types'
import { EvalError, EvalErrorCode } from '@/core/errors'
import { resolveFilePartsInInput } from '@agtlantis/core'
import type { Judge } from '@/judge/types'
import type {
  ConversationContext,
  FollowUpInput,
  MultiTurnTestCase,
  MultiTurnTestResult,
  TerminationCheckResult,
  TerminationCondition,
} from './types'
import { isTerminated } from './types'
import { checkTermination } from './termination'

export interface MultiTurnExecuteContext<TInput, TOutput> {
  agent: EvalAgent<TInput, TOutput>
  judge: Judge
  agentDescription: string
}

export interface MultiTurnExecuteOptions {
  signal?: AbortSignal
}

const DEFAULT_MAX_TURNS = 10
const DEFAULT_ON_CONDITION_MET: 'pass' | 'fail' = 'pass'
const DEFAULT_ON_MAX_TURNS_REACHED: 'pass' | 'fail' = 'fail'

function aggregateTokenUsage(usages: EvalTokenUsage[]): EvalTokenUsage {
  return usages.reduce(
    (acc, usage) => ({
      inputTokens: acc.inputTokens + usage.inputTokens,
      outputTokens: acc.outputTokens + usage.outputTokens,
      totalTokens: acc.totalTokens + usage.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  )
}

function getEffectiveMaxTurns<TInput, TOutput>(
  conditions: TerminationCondition<TInput, TOutput>[],
  safetyLimit: number
): number {
  const maxTurnsCondition = conditions.find((c) => c.type === 'maxTurns')
  if (maxTurnsCondition && maxTurnsCondition.type === 'maxTurns') {
    return Math.min(maxTurnsCondition.count, safetyLimit)
  }
  return safetyLimit
}

async function resolveInput<TInput, TOutput>(
  followUpInput: FollowUpInput<TInput, TOutput>,
  context: ConversationContext<TInput, TOutput>
): Promise<TInput> {
  const inputValue = followUpInput.input
  if (typeof inputValue === 'function') {
    const result = (inputValue as (ctx: ConversationContext<TInput, TOutput>) => TInput | Promise<TInput>)(context)
    return result instanceof Promise ? await result : result
  }
  return inputValue as TInput
}

function buildContext<TInput, TOutput>(
  currentTurn: number,
  history: Array<{ turn: number; input: TInput; output: TOutput | undefined; metadata?: AgentMetadata }>
): ConversationContext<TInput, TOutput> {
  return {
    currentTurn,
    history,
    lastOutput: history.length > 0 ? history[history.length - 1].output : undefined,
  }
}

function getFollowUpInput<TInput, TOutput>(
  followUpInputs: FollowUpInput<TInput, TOutput>[],
  followUpIndex: number
): FollowUpInput<TInput, TOutput> | null {
  let currentIndex = 0

  for (const followUp of followUpInputs) {
    const repeatCount = followUp.turns ?? 1

    if (!Number.isFinite(repeatCount) && followUpIndex >= currentIndex) {
      return followUp
    }

    if (followUpIndex < currentIndex + repeatCount) {
      return followUp
    }

    currentIndex += repeatCount
  }

  return null
}

function validateFollowUpInputs<TInput, TOutput>(
  followUpInputs: FollowUpInput<TInput, TOutput>[]
): void {
  for (let i = 0; i < followUpInputs.length; i++) {
    const followUp = followUpInputs[i]

    if (followUp.turns === undefined) {
      continue
    }

    if (typeof followUp.turns !== 'number' || followUp.turns < 1) {
      throw new EvalError('turns must be a positive number or Infinity', {
        code: EvalErrorCode.INVALID_CONFIG,
        context: {
          description: followUp.description,
          turns: followUp.turns,
        },
      })
    }

    if (!Number.isFinite(followUp.turns) && i < followUpInputs.length - 1) {
      throw new EvalError(
        'turns: Infinity must be the last followUpInput (subsequent items would be unreachable)',
        {
          code: EvalErrorCode.INVALID_CONFIG,
          context: {
            description: followUp.description,
            position: i,
            totalItems: followUpInputs.length,
          },
        }
      )
    }
  }
}

type GetTurnInputResult<TInput> =
  | { type: 'success'; input: TInput }
  | { type: 'exhausted' }

async function getTurnInput<TInput, TOutput>(
  turn: number,
  testCaseInput: TInput,
  followUpInputs: FollowUpInput<TInput, TOutput>[],
  conversationHistory: Array<{ turn: number; input: TInput; output: TOutput | undefined; metadata?: AgentMetadata }>
): Promise<GetTurnInputResult<TInput>> {
  if (turn === 1) {
    return { type: 'success', input: testCaseInput }
  }

  const followUpIndex = turn - 2
  const followUp = getFollowUpInput(followUpInputs, followUpIndex)

  if (!followUp) {
    return { type: 'exhausted' }
  }

  const ctx = buildContext(turn, conversationHistory)
  const input = await resolveInput(followUp, ctx)
  return { type: 'success', input }
}

interface TurnExecutionResult<TOutput> {
  output: TOutput | undefined
  metadata: AgentMetadata | undefined
  latencyMs: number
  error?: Error
}

function isFileResolutionError<TOutput>(
  result: TurnExecutionResult<TOutput> | { type: 'fileResolutionError'; reason: string }
): result is { type: 'fileResolutionError'; reason: string } {
  return 'type' in result && result.type === 'fileResolutionError'
}

async function executeSingleTurn<TInput, TOutput>(
  input: TInput,
  agent: EvalAgent<TInput, TOutput>,
  testCaseId: string,
  turn: number
): Promise<TurnExecutionResult<TOutput> | { type: 'fileResolutionError'; reason: string }> {
  let resolvedInput: TInput
  try {
    resolvedInput = await resolveFilePartsInInput(input, {
      basePath: process.cwd(),
    })
  } catch (e) {
    return {
      type: 'fileResolutionError',
      reason: `FilePart resolution failed on turn ${turn}: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const startTime = performance.now()
  let output: TOutput | undefined
  let metadata: AgentMetadata | undefined
  let error: Error | undefined

  try {
    const agentResult = await agent.execute(resolvedInput)
    output = agentResult.result
    metadata = agentResult.metadata
  } catch (e) {
    error = EvalError.from(e, EvalErrorCode.AGENT_EXECUTION_ERROR, {
      testCaseId,
      turn,
      agentName: agent.config.name,
    })
  }

  const latencyMs = performance.now() - startTime
  return { output, metadata, latencyMs, error }
}

function determinePassFromTermination(
  termination: TerminationCheckResult,
  onConditionMet: 'pass' | 'fail',
  onMaxTurnsReached: 'pass' | 'fail'
): boolean {
  if (!isTerminated(termination)) {
    return true
  }

  switch (termination.terminationType) {
    case 'error':
    case 'exhausted':
      return false
    case 'maxTurns':
      return onMaxTurnsReached === 'pass'
    case 'condition':
      return onConditionMet === 'pass'
    default:
      return true
  }
}

export async function executeMultiTurnTestCase<TInput, TOutput>(
  testCase: MultiTurnTestCase<TInput, TOutput>,
  context: MultiTurnExecuteContext<TInput, TOutput>,
  options?: MultiTurnExecuteOptions
): Promise<MultiTurnTestResult<TInput, TOutput>> {
  const { agent, judge, agentDescription } = context
  const { multiTurn } = testCase
  const signal = options?.signal

  const maxTurns = getEffectiveMaxTurns(
    multiTurn.terminateWhen,
    multiTurn.maxTurns ?? DEFAULT_MAX_TURNS
  )
  const onConditionMet = multiTurn.onConditionMet ?? DEFAULT_ON_CONDITION_MET
  const onMaxTurnsReached = multiTurn.onMaxTurnsReached ?? DEFAULT_ON_MAX_TURNS_REACHED
  const followUpInputs = multiTurn.followUpInputs ?? []

  validateFollowUpInputs(followUpInputs)

  const conversationHistory: Array<{
    turn: number
    input: TInput
    output: TOutput | undefined
    metadata?: AgentMetadata
  }> = []
  const tokenUsages: EvalTokenUsage[] = []
  let totalLatencyMs = 0
  let termination: TerminationCheckResult = {
    terminated: false,
    reason: 'Execution not started',
  }

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (signal?.aborted) {
      throw new EvalError('Multi-turn test execution aborted', {
        code: EvalErrorCode.AGENT_EXECUTION_ERROR,
        context: { testCaseId: testCase.id, turn, reason: 'aborted' },
      })
    }

    const inputResult = await getTurnInput(turn, testCase.input, followUpInputs, conversationHistory)
    if (inputResult.type === 'exhausted') {
      termination = {
        terminated: true,
        terminationType: 'exhausted',
        reason: 'All follow-up inputs exhausted',
      }
      break
    }
    const input = inputResult.input

    const turnResult = await executeSingleTurn(input, agent, testCase.id ?? 'unknown', turn)
    if (isFileResolutionError(turnResult)) {
      termination = {
        terminated: true,
        terminationType: 'error',
        reason: turnResult.reason,
      }
      break
    }

    const { output: agentOutput, metadata: agentMetadata, latencyMs, error: agentError } = turnResult
    totalLatencyMs += latencyMs

    const turnUsage = agentMetadata?.tokenUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    tokenUsages.push(turnUsage)

    conversationHistory.push({
      turn,
      input,
      output: agentOutput,
      metadata: agentMetadata,
    })

    if (agentError) {
      termination = {
        terminated: true,
        terminationType: 'error',
        reason: `Agent execution failed on turn ${turn}: ${agentError.message}`,
      }
      break
    }

    const ctx = buildContext(turn, conversationHistory)
    termination = await checkTermination(multiTurn.terminateWhen, ctx)

    if (termination.terminated) {
      break
    }

    if (turn >= maxTurns) {
      termination = {
        terminated: true,
        terminationType: 'maxTurns',
        matchedCondition: { type: 'maxTurns', count: maxTurns },
        reason: `Maximum turns reached (${maxTurns})`,
      }
      break
    }
  }

  const aggregatedTokenUsage = aggregateTokenUsage(tokenUsages)
  const metrics: MetricsResult = {
    latencyMs: totalLatencyMs,
    tokenUsage: aggregatedTokenUsage,
  }

  const lastTurn = conversationHistory[conversationHistory.length - 1]
  const finalOutput = lastTurn?.output

  const judgeResult = await judge.evaluate({
    input: testCase.input,
    output: finalOutput,
    agentDescription,
    files: testCase.files,
  })

  const passedTermination = determinePassFromTermination(termination, onConditionMet, onMaxTurnsReached)
  const passed = passedTermination && judgeResult.passed

  return {
    testCase,
    output: finalOutput,
    metrics,
    verdicts: judgeResult.verdicts,
    overallScore: judgeResult.overallScore,
    passed,
    judgeMetadata: judgeResult.metadata,
    conversationHistory,
    termination,
    totalTurns: conversationHistory.length,
  }
}
