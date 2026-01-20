/**
 * CLI Configuration Types
 *
 * Defines the configuration schema for `agent-eval.config.ts` files.
 * Use `defineConfig()` helper for type inference and IDE autocompletion.
 */

import type {
  EvalAgent,
  TestCase,
  Criterion,
  ValidatorCriterion,
  FileContent,
} from '@/core/types'
import type { JudgePrompt } from '@/judge/types'
import type { ImproverPrompt } from '@/improver/types'
import type { EvalPricingConfig } from '@/reporter/cost-helpers'
import type {
  MultiTurnTestCase,
  TerminationCondition,
  FollowUpInput,
} from '@/multi-turn/types'

/**
 * LLM provider configuration.
 * API keys fall back to OPENAI_API_KEY or GOOGLE_API_KEY env vars.
 */
export interface LLMConfig {
  /** LLM provider */
  provider: 'openai' | 'gemini'
  /** API key (optional - falls back to environment variable) */
  apiKey?: string
  /** Default model to use */
  defaultModel?: string
  /**
   * OpenAI reasoning effort (o1/o3 models only)
   * @see https://platform.openai.com/docs/guides/reasoning
   */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  /**
   * Default response format
   * @see https://platform.openai.com/docs/guides/structured-outputs
   */
  defaultResponseFormat?: { type: 'json_object' | 'text' }
}

export interface CLIJudgeConfig {
  /**
   * LLM configuration for judge.
   * If not specified, uses the main `llm` config.
   */
  llm?: LLMConfig
  /**
   * Evaluation criteria.
   * Use built-in criteria factories like `accuracy()`, `relevance()`,
   * or define custom criteria objects.
   */
  criteria: Array<Criterion | ValidatorCriterion>
  /**
   * Score threshold for passing (0-100).
   * @default 70
   */
  passThreshold?: number
  /**
   * Custom judge prompt.
   * If not specified, uses the default judge prompt.
   */
  prompt?: JudgePrompt
}

export interface CLIImproverConfig {
  /**
   * LLM configuration for improver.
   * If not specified, uses the main `llm` config.
   */
  llm?: LLMConfig
  /**
   * Custom improver prompt.
   * If not specified, uses the default improver prompt.
   */
  prompt?: ImproverPrompt
}

export interface OutputConfig {
  /**
   * Directory for report output.
   * @default './reports'
   */
  dir?: string
  /**
   * Custom filename pattern.
   * Supports `{timestamp}` placeholder.
   * @default 'eval-{timestamp}.md'
   */
  filename?: string
  /**
   * Include verbose details in console output.
   * @default false
   */
  verbose?: boolean
}

export interface RunConfig {
  /**
   * Number of concurrent test executions.
   * @default 1
   */
  concurrency?: number
  /**
   * Number of iterations per test case (for statistical analysis).
   * @default 1
   */
  iterations?: number
  /**
   * Stop execution on first test failure.
   * @default false
   */
  stopOnFirstFailure?: boolean
}

export interface CLISingleTurnTestCase<TInput> extends TestCase<TInput> {
  /** Test case must NOT have multiTurn field */
  multiTurn?: never
}

export interface CLIMultiTurnTestCase<TInput, TOutput = unknown>
  extends TestCase<TInput> {
  /** Multi-turn configuration */
  multiTurn: {
    /**
     * Inputs for 2nd turn onwards.
     * First turn uses `input` field.
     */
    followUpInputs?: FollowUpInput<TInput, TOutput>[]
    /**
     * Termination conditions (OR relationship).
     * Any one triggers termination.
     */
    terminateWhen: TerminationCondition<TInput, TOutput>[]
    /**
     * Safety limit: maximum turns.
     * @default 10
     */
    maxTurns?: number
    /**
     * Outcome when termination condition is met.
     * @default 'pass'
     */
    onConditionMet?: 'pass' | 'fail'
    /**
     * Outcome when maxTurns is reached.
     * @default 'fail'
     */
    onMaxTurnsReached?: 'pass' | 'fail'
  }
}

export type CLITestCase<TInput, TOutput = unknown> =
  | CLISingleTurnTestCase<TInput>
  | CLIMultiTurnTestCase<TInput, TOutput>

/**
 * Main evaluation configuration for CLI.
 * @typeParam TInput - Agent input type
 * @typeParam TOutput - Agent output type
 */
export interface EvalConfig<TInput = unknown, TOutput = unknown> {
  /**
   * Human-readable name for this evaluation.
   */
  name?: string

  /**
   * Description of what the agent does.
   * Used by Judge for evaluation context.
   */
  agentDescription?: string

  /**
   * The agent to evaluate.
   */
  agent: EvalAgent<TInput, TOutput>

  /**
   * LLM configuration (shared by Judge and Improver unless overridden).
   */
  llm: LLMConfig

  /**
   * Judge configuration for evaluating agent outputs.
   */
  judge: CLIJudgeConfig

  /**
   * Improver configuration for prompt improvement suggestions.
   * Optional - if not specified, no improvements are generated.
   */
  improver?: CLIImproverConfig

  /**
   * Test cases to run (inline TypeScript definition).
   * Can mix single-turn and multi-turn test cases.
   *
   * Either `testCases` or `include` must be provided.
   * - Use `testCases` for inline TypeScript test case definitions
   * - Use `include` for YAML-based test case files
   */
  testCases?: CLITestCase<TInput, TOutput>[]

  /**
   * Output configuration for reports.
   */
  output?: OutputConfig

  /**
   * Run configuration for test execution.
   */
  run?: RunConfig

  /**
   * Pricing configuration for cost calculation.
   * If provided, cost breakdown will be included in test metrics.
   *
   * @example
   * ```typescript
   * pricing: {
   *   openai: { 'gpt-4o': { inputPricePerMillion: 2.5, outputPricePerMillion: 10 } },
   *   fallback: { inputPricePerMillion: 1.0, outputPricePerMillion: 3.0 },
   * }
   * ```
   */
  pricing?: EvalPricingConfig

  /**
   * Glob patterns to discover YAML eval files.
   * Required when using YAML-based test cases instead of inline testCases.
   *
   * @example
   * ```typescript
   * include: ['evals/booking/*.eval.yaml']
   * ```
   */
  include?: string[]

  /**
   * Agent registry for YAML file references.
   * YAML files reference agents by name (e.g., `agent: booking-agent`).
   *
   * @example
   * ```typescript
   * agents: {
   *   'booking-agent': bookingAgent,
   *   'qa-agent': qaAgent,
   * }
   * ```
   */
  agents?: Record<string, EvalAgent<unknown, unknown>>
}

/** Identity function for type inference and IDE autocompletion. */
export function defineConfig<TInput = unknown, TOutput = unknown>(
  config: EvalConfig<TInput, TOutput>
): EvalConfig<TInput, TOutput> {
  return config
}

export function isMultiTurnConfig<TInput, TOutput>(
  testCase: CLITestCase<TInput, TOutput>
): testCase is CLIMultiTurnTestCase<TInput, TOutput> {
  return 'multiTurn' in testCase && testCase.multiTurn !== undefined
}
