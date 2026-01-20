import type { AgentMetadata, TestCase, TestResultWithVerdict } from '@/core/types'

export type TerminationCondition<TInput = unknown, TOutput = unknown> =
  | MaxTurnsCondition
  | FieldSetCondition
  | FieldValueCondition
  | CustomCondition<TInput, TOutput>

export interface MaxTurnsCondition {
  type: 'maxTurns'
  /** Safety limit - terminates after this many turns */
  count: number
}

export interface FieldsCondition {
  /** Dot notation for nested access (e.g., "result.recommendation") */
  fieldPath: string
}

export interface FieldSetCondition extends FieldsCondition {
  type: 'fieldSet'
}

export interface FieldValueCondition extends FieldsCondition {
  type: 'fieldValue'
  expectedValue: unknown
}

export interface CustomCondition<TInput = unknown, TOutput = unknown> {
  type: 'custom'
  /** Sync or async check function (e.g., for LLM-based conditions) */
  check: (
    context: ConversationContext<TInput, TOutput>
  ) => boolean | Promise<boolean>
  /** For debugging/logging */
  description?: string
}

export type TerminationType = 'condition' | 'maxTurns' | 'error' | 'exhausted'

export interface ContinueResult {
  terminated: false
  reason: string
  terminationType?: never
  matchedCondition?: never
}

export interface TerminatedResult {
  terminated: true
  terminationType: TerminationType
  matchedCondition?: TerminationCondition<unknown, unknown>
  reason: string
}

export type TerminationCheckResult = ContinueResult | TerminatedResult

export interface ConversationContext<TInput, TOutput = unknown> {
  currentTurn: number
  history: Array<{
    turn: number
    input: TInput
    output: TOutput | undefined
    metadata?: AgentMetadata
  }>
  lastOutput?: TOutput
}

export interface FollowUpInput<TInput, TOutput = unknown> {
  /**
   * Input for this follow-up turn.
   * Can be static, dynamic (sync), or async (for AI-generated inputs via aiUser()).
   */
  input:
    | TInput
    | ((context: ConversationContext<TInput, TOutput>) => TInput)
    | ((context: ConversationContext<TInput, TOutput>) => Promise<TInput>)

  /** For debugging/reports */
  description?: string

  /**
   * Repeat count (default: 1).
   * Use Infinity to repeat until termination (must be last followUpInput).
   */
  turns?: number
}

export interface MultiTurnTestCase<TInput, TOutput = unknown>
  extends TestCase<TInput> {
  multiTurn: {
    /** Inputs for 2nd turn onwards (first turn uses TestCase.input) */
    followUpInputs?: FollowUpInput<TInput, TOutput>[]

    /** Any condition triggers termination (OR logic) */
    terminateWhen: TerminationCondition<TInput, TOutput>[]

    /** Safety limit (default: 10). Uses min of this and any maxTurns condition. */
    maxTurns?: number

    /** Pass/fail when condition met (default: 'pass') */
    onConditionMet?: 'pass' | 'fail'

    /** Pass/fail when maxTurns reached (default: 'fail') */
    onMaxTurnsReached?: 'pass' | 'fail'
  }
}

export interface MultiTurnTestResult<TInput, TOutput>
  extends Omit<TestResultWithVerdict<TInput, TOutput>, 'output'> {
  output: TOutput | undefined
  conversationHistory: Array<{
    turn: number
    input: TInput
    output: TOutput | undefined
    metadata?: AgentMetadata
  }>
  termination: TerminationCheckResult
  totalTurns: number
}

export function isMaxTurnsCondition<TInput, TOutput>(
  condition: TerminationCondition<TInput, TOutput>
): condition is MaxTurnsCondition {
  return condition.type === 'maxTurns'
}

export function isFieldSetCondition<TInput, TOutput>(
  condition: TerminationCondition<TInput, TOutput>
): condition is FieldSetCondition {
  return condition.type === 'fieldSet'
}

export function isFieldValueCondition<TInput, TOutput>(
  condition: TerminationCondition<TInput, TOutput>
): condition is FieldValueCondition {
  return condition.type === 'fieldValue'
}

export function isCustomCondition<TInput, TOutput>(
  condition: TerminationCondition<TInput, TOutput>
): condition is CustomCondition<TInput, TOutput> {
  return condition.type === 'custom'
}

export function isMultiTurnTestCase<TInput, TOutput = unknown>(
  testCase: TestCase<TInput>
): testCase is MultiTurnTestCase<TInput, TOutput> {
  return 'multiTurn' in testCase
}

export function isTerminated(
  result: TerminationCheckResult
): result is TerminatedResult {
  return result.terminated === true
}
