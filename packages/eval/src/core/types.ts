/**
 * Simplified token usage type for eval package.
 *
 * This is a subset of AI SDK's LanguageModelUsage that only includes
 * the properties eval actually tracks. The cost-helpers module handles
 * conversion when calling @agtlantis/core's pricing calculator.
 *
 * @example
 * ```typescript
 * const usage: EvalTokenUsage = {
 *   inputTokens: 100,
 *   outputTokens: 50,
 *   totalTokens: 150,
 * }
 * ```
 */
export interface EvalTokenUsage {
    /** Number of input (prompt) tokens */
    inputTokens: number;
    /** Number of output (completion) tokens */
    outputTokens: number;
    /** Total tokens (input + output) */
    totalTokens: number;
}

/**
 * Simplified agent configuration for evaluation.
 * Only requires fields needed for eval purposes.
 *
 * For agents from `ai-agents` package with full AgentConfig,
 * use `toEvalAgent()` adapter to convert them.
 */
export interface EvalAgentConfig {
    /** Agent name for identification */
    name: string;
    /** Agent description (used by Judge for context) */
    description?: string;
    /** Additional custom fields */
    [key: string]: unknown;
}

/**
 * Agent prompt template.
 */
export interface AgentPrompt<TInput> {
    /** Prompt unique ID for version tracking */
    id: string;
    /** Version string (e.g., "1.0.0") */
    version: string;
    /** System prompt */
    system: string;
    /** User template string (for serialization/history) */
    userTemplate?: string;
    /** User prompt builder function */
    renderUserPrompt: (input: TInput) => string;
    /** Additional custom fields */
    [key: string]: unknown;
}

/**
 * Base metadata type shared by all LLM-using components (Agent, Judge, Improver).
 * Provides consistent structure for tracking token usage and model information.
 *
 * @example
 * ```typescript
 * const metadata: ComponentMetadata = {
 *   tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
 *   model: 'gpt-4o',
 * }
 * ```
 */
export interface ComponentMetadata {
    /** Token usage from the LLM call (AI SDK LanguageModelUsage format) */
    tokenUsage?: EvalTokenUsage;
    /** Model identifier used for the LLM call */
    model?: string;
    /** Additional custom fields */
    [key: string]: unknown;
}

/**
 * Agent execution result metadata.
 * Extends ComponentMetadata with agent-specific fields.
 */
export interface AgentMetadata extends ComponentMetadata {
    /** Prompt version used for execution */
    promptVersion?: string;
    /** Execution duration in milliseconds */
    duration?: number;
}

/**
 * Judge evaluation metadata.
 * Tracks token usage and model for cost calculation.
 */
export interface JudgeMetadata extends ComponentMetadata {}

/**
 * Improver analysis metadata.
 * Tracks token usage and model for cost calculation.
 */
export interface ImproverMetadata extends ComponentMetadata {}

/**
 * Agent execution result.
 */
export interface AgentResult<TOutput> {
    result: TOutput;
    metadata?: AgentMetadata;
}

/**
 * Simplified Agent interface for evaluation.
 *
 * @example
 * ```typescript
 * // Direct implementation
 * const myAgent: EvalAgent<string, string> = {
 *   config: { name: 'MyAgent', description: 'A simple agent' },
 *   prompt: { id: 'prompt-1', version: '1.0.0', system: '...', renderUserPrompt: (input) => input },
 *   execute: async (input) => ({ result: `Processed: ${input}` })
 * }
 *
 * // Or adapt from full ai-agents Agent
 * const evalAgent = toEvalAgent(fullAgent)
 * ```
 */
export interface EvalAgent<TInput, TOutput> {
    readonly config: EvalAgentConfig;
    readonly prompt: AgentPrompt<TInput>;
    execute(input: TInput, options?: unknown): Promise<AgentResult<TOutput>>;
}

/**
 * Full AgentConfig interface (compatible with ai-agents package).
 * Used for type-safe adaptation.
 */
export interface FullAgentConfig {
    name: string;
    role: 'generator' | 'analyzer' | 'validator' | 'enhancer';
    streaming: 'required' | 'optional' | 'none';
    execution: 'batch' | 'realtime';
    conversation?: 'single-turn' | 'multi-turn';
    description?: string;
    [key: string]: unknown;
}

/**
 * Full Agent interface (compatible with ai-agents package).
 * Used for type-safe adaptation.
 */
export interface FullAgent<TInput, TOutput> {
    readonly config: FullAgentConfig;
    readonly prompt: AgentPrompt<TInput>;
    execute(
        input: TInput,
        options?: unknown
    ): Promise<{
        result: TOutput;
        metadata: {
            duration: number;
            promptVersion: string;
            tokenUsage?: EvalTokenUsage;
            model?: string;
            retryCount?: number;
            traceId?: string;
            [key: string]: unknown;
        };
    }>;
}

/**
 * Adapts a full Agent (from ai-agents) to EvalAgent for evaluation.
 * Extracts only the fields needed for evaluation.
 *
 * @example
 * ```typescript
 * import { scenarioGenerator } from './agents/mce'
 *
 * const evalAgent = toEvalAgent(scenarioGenerator)
 * const suite = createEvalSuite({ agent: evalAgent, ... })
 * ```
 */
export function toEvalAgent<TInput, TOutput>(
    agent: FullAgent<TInput, TOutput>
): EvalAgent<TInput, TOutput> {
    return {
        config: {
            name: agent.config.name,
            description: agent.config.description,
        },
        prompt: agent.prompt,
        execute: async (input, options) => {
            const result = await agent.execute(input, options);
            return {
                result: result.result,
                metadata: result.metadata,
            };
        },
    };
}

/**
 * Metadata for file content.
 */
export interface FileContentMetadata {
    /** File size in bytes */
    size?: number;
    /** Full resolved path (for loaded files) */
    fullPath?: string;
    /** Whether the content was created inline (not from disk) */
    inline?: boolean;
    /** Additional custom metadata */
    [key: string]: unknown;
}

export interface FileContent {
    /** File path (relative or absolute) - used as identifier */
    path: string;
    /** File content as string (text files only for Phase 5.3) */
    content: string;
    /** Optional MIME type hint (defaults to 'text/plain') */
    mediaType?: string;
    /** Optional encoding (defaults to 'utf-8') */
    encoding?: BufferEncoding;
    /** Optional metadata (e.g., original size, full path, etc.) */
    metadata?: FileContentMetadata;
}

export interface TestCase<TInput> {
    id?: string;
    input: TInput;
    tags?: string[];
    description?: string;
    expectedOutput?: unknown; // Optional reference for checking
    /**
     * Optional file context for agent and judge (Phase 5.3).
     * Files are passed to Judge for evaluation context.
     * For Agent access, include files in the input type directly.
     *
     * @deprecated Use FileSource in input directly for flexible file handling
     */
    files?: FileContent[];
}

export interface MetricsResult {
    latencyMs: number;
    tokenUsage: EvalTokenUsage;
}

export interface Criterion {
    id: string;
    name: string;
    description: string;
    weight?: number;
}

/**
 * Zod error issue - minimal type compatible with ZodError.errors.
 * Using `readonly` and rest index to be compatible with Zod's discriminated union.
 */
export type ZodIssue = {
    readonly code: string;
    readonly path: readonly (string | number)[];
    readonly message: string;
};

/**
 * Result of programmatic schema validation.
 */
export interface SchemaValidationResult {
    /** Whether the output matches the schema */
    valid: boolean;
    /** Validation errors if invalid (Zod issue format) */
    errors?: readonly ZodIssue[];
    /** Human-readable error summary */
    errorSummary?: string;
}

/**
 * Validator function type for programmatic validation.
 * Returns validation result with binary pass/fail outcome.
 */
export type ValidatorFn = (output: unknown) => SchemaValidationResult;

/**
 * Extended criterion with optional programmatic validator.
 * Validators run before LLM evaluation with binary scoring (0 or 100).
 *
 * @example
 * ```typescript
 * import { z } from 'zod'
 * import { schema } from '@agtlantis/eval'
 *
 * const criterion = schema({
 *   schema: z.object({ name: z.string() }),
 *   weight: 2,
 * })
 * ```
 */
export interface ValidatorCriterion extends Criterion {
    /**
     * Optional programmatic validator.
     * If provided and fails, score is automatically 0.
     * If provided and passes, score is automatically 100.
     */
    validator?: ValidatorFn;
}

export interface Verdict {
    criterionId: string;
    score: number; // 0-100
    reasoning: string;
    passed: boolean;
}

export interface TestResult<TInput, TOutput> {
    testCase: TestCase<TInput>;
    output: TOutput;
    metrics: MetricsResult;
    error?: Error;
}

export interface TestResultWithVerdict<TInput, TOutput> extends TestResult<TInput, TOutput> {
    verdicts: Verdict[];
    overallScore: number;
    passed: boolean;
    /** Judge metadata for cost tracking */
    judgeMetadata?: JudgeMetadata;
}

/**
 * Statistics from running the same test multiple times.
 * Used to measure consistency and reliability of LLM-based agents.
 */
export interface IterationStats {
    /** Total number of iterations run */
    iterations: number;
    /** Score from each iteration */
    scores: number[];
    /** Average score across all iterations */
    mean: number;
    /** Standard deviation (lower = more consistent) */
    stdDev: number;
    /** Lowest score achieved */
    min: number;
    /** Highest score achieved */
    max: number;
    /** Pass rate as decimal (0-1, e.g., 0.67 = 67%) */
    passRate: number;
    /** Number of iterations that passed */
    passCount: number;
}

/**
 * Extended iteration statistics for multi-turn tests.
 * Includes turn-count metrics and termination type distribution.
 *
 * @example
 * ```typescript
 * if (hasMultiTurnIterationData(result)) {
 *   console.log(`Average turns: ${result.multiTurnIterationStats.avgTurns}`)
 *   console.log(`Termination types: ${JSON.stringify(result.multiTurnIterationStats.terminationCounts)}`)
 * }
 * ```
 */
export interface MultiTurnIterationStats extends IterationStats {
    /** Average number of turns across all iterations */
    avgTurns: number;
    /** Minimum turns in any iteration */
    minTurns: number;
    /** Maximum turns in any iteration */
    maxTurns: number;
    /** Distribution of termination types across iterations (e.g., { condition: 2, maxTurns: 1 }) */
    terminationCounts: Record<string, number>;
}

/**
 * Discriminator for eval result types.
 * Used for exhaustive pattern matching on result variants.
 */
export type EvalResultKind =
    | 'single-turn'
    | 'single-turn-iterated'
    | 'multi-turn'
    | 'multi-turn-iterated';

/**
 * Properties present when test ran with multiple iterations.
 * Extracted as a separate interface for composition.
 */
export interface IterationData<TInput, TOutput> {
    /** Aggregated statistics across all iterations */
    iterationStats: IterationStats;
    /** Individual results from each iteration */
    iterationResults: TestResultWithVerdict<TInput, TOutput>[];
}

/**
 * Single conversation entry in multi-turn tests.
 */
export interface ConversationEntry<TInput, TOutput> {
    /** Turn number (1-based) */
    turn: number;
    /** Input provided for this turn */
    input: TInput;
    /** Output from agent (undefined if execution failed) */
    output: TOutput | undefined;
    /** Agent execution metadata */
    metadata?: AgentMetadata;
}

/**
 * Termination info for multi-turn tests.
 * Compatible with TerminationCheckResult from multi-turn module.
 */
export interface TerminationInfo {
    /** Whether the conversation terminated */
    terminated: boolean;
    /** Human-readable reason for termination */
    reason: string;
    /** Type of termination (condition, maxTurns, error, exhausted) */
    terminationType?: string;
    /** The condition that caused termination (if applicable) */
    matchedCondition?: unknown;
}

/**
 * Properties present for multi-turn test results.
 * Extracted as a separate interface for composition.
 */
export interface MultiTurnData<TInput, TOutput> {
    /** Full conversation history */
    conversationHistory: ConversationEntry<TInput, TOutput>[];
    /** Total turns executed */
    totalTurns: number;
    /** Human-readable termination reason */
    terminationReason: string;
    /** Full termination check result */
    termination: TerminationInfo;
}

/**
 * Single-turn test result with single iteration (base case).
 * No iteration stats, no multi-turn data.
 */
export interface SingleTurnResult<TInput, TOutput> extends TestResultWithVerdict<TInput, TOutput> {
    readonly kind: 'single-turn';
}

/**
 * Single-turn test result with multiple iterations.
 * Has iteration stats but no multi-turn data.
 */
export interface SingleTurnIteratedResult<TInput, TOutput>
    extends TestResultWithVerdict<TInput, TOutput>, IterationData<TInput, TOutput> {
    readonly kind: 'single-turn-iterated';
}

/**
 * Multi-turn test result with single iteration.
 * Has multi-turn data but no iteration stats.
 */
export interface MultiTurnResult<TInput, TOutput>
    extends TestResultWithVerdict<TInput, TOutput>, MultiTurnData<TInput, TOutput> {
    readonly kind: 'multi-turn';
}

/**
 * Multi-turn test result with multiple iterations.
 * Has both multi-turn data and iteration stats.
 */
export interface MultiTurnIteratedResult<TInput, TOutput>
    extends
        TestResultWithVerdict<TInput, TOutput>,
        IterationData<TInput, TOutput>,
        MultiTurnData<TInput, TOutput> {
    readonly kind: 'multi-turn-iterated';
    /** Multi-turn specific iteration statistics */
    multiTurnIterationStats: MultiTurnIterationStats;
}

/**
 * Unified eval result type - discriminated union of all result kinds.
 *
 * Use pattern matching on `kind` for exhaustive handling:
 * @example
 * ```typescript
 * switch (result.kind) {
 *   case 'single-turn':
 *     // No iteration stats, no multi-turn data
 *     break
 *   case 'single-turn-iterated':
 *     console.log(result.iterationStats.mean)  // Type-safe
 *     break
 *   case 'multi-turn':
 *     console.log(result.conversationHistory)  // Type-safe
 *     break
 *   case 'multi-turn-iterated':
 *     console.log(result.multiTurnIterationStats.avgTurns)  // Type-safe
 *     break
 * }
 * ```
 */
export type EvalTestResult<TInput, TOutput> =
    | SingleTurnResult<TInput, TOutput>
    | SingleTurnIteratedResult<TInput, TOutput>
    | MultiTurnResult<TInput, TOutput>
    | MultiTurnIteratedResult<TInput, TOutput>;

/**
 * Check if result is from a single-turn test (either iterated or not).
 *
 * @example
 * ```typescript
 * if (isSingleTurnResult(result)) {
 *   // result is SingleTurnResult | SingleTurnIteratedResult
 *   console.log('Single turn test')
 * }
 * ```
 */
export function isSingleTurnResult<TInput, TOutput>(
    result: EvalTestResult<TInput, TOutput>
): result is SingleTurnResult<TInput, TOutput> | SingleTurnIteratedResult<TInput, TOutput> {
    return result.kind === 'single-turn' || result.kind === 'single-turn-iterated';
}

/**
 * Check if result is from a multi-turn test (either iterated or not).
 *
 * @example
 * ```typescript
 * if (isMultiTurnResult(result)) {
 *   // result is MultiTurnResult | MultiTurnIteratedResult
 *   console.log(`Turns: ${result.totalTurns}`)  // Type-safe
 *   for (const entry of result.conversationHistory) {  // Type-safe
 *     console.log(`Turn ${entry.turn}: ${entry.input}`)
 *   }
 * }
 * ```
 */
export function isMultiTurnResult<TInput, TOutput>(
    result: EvalTestResult<TInput, TOutput>
): result is MultiTurnResult<TInput, TOutput> | MultiTurnIteratedResult<TInput, TOutput> {
    return result.kind === 'multi-turn' || result.kind === 'multi-turn-iterated';
}

/**
 * Check if result has iteration data (multiple iterations ran).
 *
 * @example
 * ```typescript
 * if (isIteratedResult(result)) {
 *   // result is SingleTurnIteratedResult | MultiTurnIteratedResult
 *   console.log(`Mean score: ${result.iterationStats.mean}`)  // Type-safe
 *   console.log(`Pass rate: ${result.iterationStats.passRate}`)  // Type-safe
 * }
 * ```
 */
export function isIteratedResult<TInput, TOutput>(
    result: EvalTestResult<TInput, TOutput>
): result is SingleTurnIteratedResult<TInput, TOutput> | MultiTurnIteratedResult<TInput, TOutput> {
    return result.kind === 'single-turn-iterated' || result.kind === 'multi-turn-iterated';
}
