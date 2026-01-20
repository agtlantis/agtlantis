import type { AgentPrompt, EvalAgent, EvalTokenUsage, TestResultWithVerdict, Verdict } from '@/core/types'
import type { EvalContext, Judge, JudgeResult } from '@/judge/types'
import type { Improver, ImproveResult, Suggestion } from '@/improver/types'

/**
 * Configuration for creating a mock agent.
 */
export interface MockAgentConfig<TInput, TOutput> {
  /** Name for the mock agent */
  name?: string

  /** Description for the mock agent */
  description?: string

  /** Response to return from execute() */
  response?: TOutput

  /** Token usage to include in metadata */
  tokenUsage?: EvalTokenUsage

  /** Delay in ms before returning response */
  delay?: number

  /** If true, throw an error instead of returning response */
  shouldError?: boolean

  /** Custom error message when shouldError is true */
  errorMessage?: string

  /** Custom execute function for more control */
  executeFn?: (input: TInput) => Promise<{ result: TOutput; metadata?: { tokenUsage?: EvalTokenUsage } }>
}

/**
 * Creates a mock agent for testing purposes.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const agent = createMockAgent<{ query: string }, { answer: string }>({
 *   response: { answer: 'Hello!' },
 * })
 *
 * // With delay and token usage
 * const agent = createMockAgent({
 *   response: { answer: 'Response' },
 *   delay: 100,
 *   tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
 * })
 *
 * // Error testing
 * const agent = createMockAgent({
 *   shouldError: true,
 *   errorMessage: 'Agent failed',
 * })
 * ```
 */
export function createMockAgent<TInput, TOutput>(
  config: MockAgentConfig<TInput, TOutput> = {}
): EvalAgent<TInput, TOutput> {
  const {
    name = 'MockAgent',
    description = 'A mock agent for testing',
    response = {} as TOutput,
    tokenUsage = { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    delay = 0,
    shouldError = false,
    errorMessage = 'Mock agent execution failed',
    executeFn,
  } = config

  return {
    config: { name, description },
    prompt: {
      id: 'mock-prompt',
      version: '1.0.0',
      system: 'You are a mock agent',
      buildUserPrompt: (input: TInput) => JSON.stringify(input),
    },
    execute: async (input: TInput) => {
      if (executeFn) {
        return executeFn(input)
      }

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      if (shouldError) {
        throw new Error(errorMessage)
      }

      return {
        result: response,
        metadata: { tokenUsage },
      }
    },
  }
}

/**
 * Configuration for creating a mock judge.
 */
export interface MockJudgeConfig {
  /** Overall score to return (0-100) */
  score?: number

  /** Whether the evaluation passed */
  passed?: boolean

  /** Verdicts to return */
  verdicts?: Verdict[]

  /** Metadata to return (for cost tracking tests) */
  metadata?: JudgeResult['metadata']

  /** If true, throw an error instead of returning result */
  shouldError?: boolean

  /** Custom error message when shouldError is true */
  errorMessage?: string

  /** Custom evaluate function for more control */
  evaluateFn?: (context: EvalContext) => Promise<JudgeResult>
}

/**
 * Creates a mock judge for testing purposes.
 *
 * @example
 * ```typescript
 * // Basic usage - passing test
 * const judge = createMockJudge({
 *   score: 85,
 *   passed: true,
 * })
 *
 * // Custom verdicts
 * const judge = createMockJudge({
 *   verdicts: [
 *     { criterionId: 'accuracy', score: 90, reasoning: 'Good', passed: true },
 *     { criterionId: 'clarity', score: 80, reasoning: 'Clear', passed: true },
 *   ],
 *   score: 85,
 *   passed: true,
 * })
 *
 * // Failing test
 * const judge = createMockJudge({
 *   score: 40,
 *   passed: false,
 * })
 *
 * // Error testing
 * const judge = createMockJudge({
 *   shouldError: true,
 *   errorMessage: 'Judge failed to evaluate',
 * })
 * ```
 */
export function createMockJudge(config: MockJudgeConfig = {}): Judge {
  const {
    score = 80,
    passed = true,
    verdicts = [
      { criterionId: 'default', score: 80, reasoning: 'Default verdict', passed: true },
    ],
    metadata,
    shouldError = false,
    errorMessage = 'Mock judge evaluation failed',
    evaluateFn,
  } = config

  return {
    evaluate: async (context: EvalContext) => {
      if (evaluateFn) {
        return evaluateFn(context)
      }

      if (shouldError) {
        throw new Error(errorMessage)
      }

      return {
        verdicts,
        overallScore: score,
        passed,
        metadata,
      }
    },
  }
}

/**
 * Configuration for creating a mock improver.
 */
export interface MockImproverConfig {
  /** Suggestions to return */
  suggestions?: Suggestion[]

  /** If true, throw an error instead of returning suggestions */
  shouldError?: boolean

  /** Custom error message when shouldError is true */
  errorMessage?: string

  /** Custom improve function for more control */
  improveFn?: (
    agentPrompt: AgentPrompt<any>,
    results: TestResultWithVerdict<any, any>[]
  ) => Promise<ImproveResult>
}

/**
 * Creates a mock improver for testing purposes.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const improver = createMockImprover({
 *   suggestions: [
 *     {
 *       type: 'system_prompt',
 *       priority: 'high',
 *       currentValue: 'Old prompt',
 *       suggestedValue: 'New prompt',
 *       reasoning: 'Better clarity',
 *       expectedImprovement: '10% improvement',
 *     },
 *   ],
 * })
 *
 * // Empty suggestions
 * const improver = createMockImprover({ suggestions: [] })
 *
 * // Error testing
 * const improver = createMockImprover({
 *   shouldError: true,
 *   errorMessage: 'Improver failed',
 * })
 * ```
 */
export function createMockImprover(config: MockImproverConfig = {}): Improver {
  const {
    suggestions = [],
    shouldError = false,
    errorMessage = 'Mock improver failed',
    improveFn,
  } = config

  return {
    improve: async (agentPrompt, results) => {
      if (improveFn) {
        return improveFn(agentPrompt, results)
      }

      if (shouldError) {
        throw new Error(errorMessage)
      }

      return { suggestions }
    },
  }
}
