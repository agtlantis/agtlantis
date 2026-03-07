/**
 * agent-eval - LLM-as-Judge based AI Agent testing library
 *
 * @example
 * ```typescript
 * import {
 *   createEvalSuite,
 *   createJudge,
 *   createOpenAIClient,
 *   accuracy,
 *   relevance,
 * } from 'agent-eval'
 *
 * const openai = createOpenAIClient({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   defaultModel: 'gpt-5-nano',
 *   reasoningEffort: 'minimal',
 * })
 *
 * const judge = createJudge({
 *   llm: openai,
 *   criteria: [accuracy(), relevance()],
 * })
 *
 * const suite = createEvalSuite({
 *   agent: myAgent,
 *   judge,
 *   agentDescription: 'Recommends careers based on student profiles',
 * })
 *
 * const report = await suite.run(testCases, { concurrency: 3 })
 * console.log(report.summary)
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Suite - Main Entry Point
// ============================================================================

export {
    createEvalSuite,
    type EvalSuiteConfig,
    type EvalSuite,
    type RunOptions,
} from './core/suite.js';

// ============================================================================
// Runner - Low-level Execution
// ============================================================================

export { executeTestCase, runWithConcurrency, type ExecuteContext } from './core/runner.js';

// ============================================================================
// Core Types
// ============================================================================

export type {
    // Token usage
    EvalTokenUsage,
    // Agent types
    EvalAgent,
    EvalAgentConfig,
    AgentPrompt,
    AgentResult,
    AgentMetadata,
    // Component metadata types (Phase 10)
    ComponentMetadata,
    JudgeMetadata,
    ImproverMetadata,
    // Test types
    TestCase,
    TestResult,
    TestResultWithVerdict,
    MetricsResult,
    // Iteration types (Phase 6.2)
    IterationStats,
    IterationData,
    // Multi-turn iteration types (Phase 7.2)
    MultiTurnIterationStats,
    // Eval result types (Discriminated Union)
    EvalResultKind,
    EvalTestResult,
    SingleTurnResult,
    SingleTurnIteratedResult,
    MultiTurnResult,
    MultiTurnIteratedResult,
    ConversationEntry,
    TerminationInfo,
    MultiTurnData,
    // Evaluation types
    Verdict,
    Criterion,
    // Schema validation types (Phase 6.3)
    SchemaValidationResult,
    ValidatorFn,
    ValidatorCriterion,
    ZodIssue,
    // File context types (Phase 5.3)
    FileContent,
    FileContentMetadata,
} from './core/types.js';

export {
    toEvalAgent,
    // Type guards for EvalTestResult
    isSingleTurnResult,
    isMultiTurnResult,
    isIteratedResult,
} from './core/types.js';

// ============================================================================
// FileSource (Embedded Files in Input)
// ============================================================================

export {
    // Resolver
    resolveFileSource,
    resolveFileSourcesInInput,
    // Scanner
    scanForFileSources,
    // Display info
    getFileSourceDisplayInfo,
    getFileSourcesDisplayInfo,
    // Utilities
    inferMediaType,
    // Type guards
    isFileSource,
    isFileSourcePath,
    isFileSourceData,
    isFileSourceBase64,
    isFileSourceUrl,
    // Types
    type FileSource,
    type FileSourcePath,
    type FileSourceData,
    type FileSourceBase64,
    type FileSourceUrl,
    type FoundFileSource,
    type FileSourceDisplayInfo,
    type ResolveOptions,
} from '@agtlantis/core';

// ============================================================================
// Iteration Utilities (Phase 6.2, 7.2)
// ============================================================================

export {
    calculateIterationStats,
    calculateMultiTurnIterationStats,
    selectRepresentativeResult,
    aggregateIterationResults,
    calculateAvgStdDev,
    calculateAvgPassRate,
} from './core/iteration.js';

// ============================================================================
// Errors
// ============================================================================

export { EvalError, EvalErrorCode, type EvalErrorOptions } from './core/errors.js';

// ============================================================================
// Judge
// ============================================================================

export {
    createJudge,
    // Criteria
    accuracy,
    consistency,
    relevance,
    schema,
    type CriterionOptions,
    type SchemaOptions,
    // Types
    type Judge,
    type JudgeConfig,
    type JudgeContext,
    type JudgePrompt,
    // Context-based API types (Phase 5.3)
    type EvalContext,
    type JudgeResult,
} from './judge/index.js';

// ============================================================================
// Reporter
// ============================================================================

export type {
    EvalReport,
    ReportSummary,
    ReportMarkdownOptions,
    ReportComparison,
} from './reporter/types.js';

export { reportToMarkdown, saveReportMarkdown, compareReports } from './reporter/markdown.js';

// Reporter classes
export {
    JsonReporter,
    MarkdownReporter,
    ConsoleReporter,
    CompositeReporter,
    type MarkdownReporterOptions,
} from './reporter/index.js';

// Reporter factory functions
export {
    createJsonReporter,
    createMarkdownReporter,
    createConsoleReporter,
    createCompositeReporter,
    createDefaultReporter,
} from './reporter/index.js';

// Report runner (convenience wrapper)
export { createReportRunner, type ReportRunnerOptions } from './reporter/index.js';

// Reporter types
export type {
    Reporter,
    FileReporterOptions,
    ConsoleReporterOptions,
    LogVerbosity,
} from './reporter/index.js';

// ImprovementCycleResult helpers
export {
    saveCycleJson,
    logCycle,
    cycleToMarkdown,
    saveCycleMarkdown,
    type SaveCycleJsonOptions,
    type LogCycleOptions,
    type CycleMarkdownOptions,
} from './reporter/index.js';

// ============================================================================
// Improver
// ============================================================================

export {
    createImprover,
    // Utility functions
    suggestionDiff,
    suggestionPreview,
    suggestionSummary,
    applyPromptSuggestions,
    bumpVersion,
    // Types
    type Suggestion,
    type AggregatedMetrics,
    type Improver,
    type ImproverConfig,
    type ImproverPrompt,
    type ImproverContext,
    type ApplyPromptSuggestionsOptions,
    type ApplySuggestionsResult,
    // Phase 10 - ImproveResult with metadata
    type ImproveResult,
} from './improver/index.js';

// ============================================================================
// Testing Utilities
// ============================================================================

// Re-export core testing mock utilities
export { mock, MockProvider } from '@agtlantis/core/testing';
export type { MockCall } from '@agtlantis/core/testing';

// Agent/Judge/Improver mocks
export {
    createMockAgent,
    createMockJudge,
    createMockImprover,
    type MockAgentConfig,
    type MockJudgeConfig,
    type MockImproverConfig,
} from './testing/mock-agent.js';

// ============================================================================
// Prompt (from @agtlantis/core)
// ============================================================================

export {
    compileTemplate,
    createFilePromptRepository,
    type FilePromptRepositoryOptions,
    type FileSystem,
    type PromptTemplate,
    type PromptRepository,
} from '@agtlantis/core';

// ============================================================================
// Multi-turn Testing
// ============================================================================

// Types
export type {
    ConversationContext,
    FieldsCondition,
    FieldSetCondition,
    FieldValueCondition,
    ContinueResult,
    CustomCondition,
    FollowUpInput,
    MaxTurnsCondition,
    MultiTurnTestCase,
    MultiTurnTestResult,
    NaturalLanguageConditionOptions,
    TerminatedResult,
    TerminationCheckResult,
    TerminationCondition,
    MultiTurnExecuteContext,
    MultiTurnExecuteOptions,
} from './multi-turn/index.js';

// Type guards
export {
    isCustomCondition,
    isFieldSetCondition,
    isFieldValueCondition,
    isMaxTurnsCondition,
    isMultiTurnTestCase,
    isTerminated,
} from './multi-turn/index.js';

// Termination utilities
export { checkCondition, checkTermination, getFieldValue } from './multi-turn/index.js';

// Condition factory functions
export {
    afterTurns,
    and,
    fieldEquals,
    fieldIsSet,
    naturalLanguage,
    not,
    or,
} from './multi-turn/index.js';

// Runner
export { executeMultiTurnTestCase } from './multi-turn/index.js';

// AI User
export { aiUser, type AIUserOptions } from './multi-turn/index.js';

// ============================================================================
// Cost Calculation (re-export from reporter/cost-helpers)
// ============================================================================

export {
    calculateResultCost,
    calculateReportCosts,
    addCostsToResults,
    type CostBreakdown,
    type CostSummary,
    type MetricsWithCost,
    type TestResultWithCost,
    type EvalPricingConfig,
} from './reporter/cost-helpers.js';

// Re-export core pricing utilities for convenience
export {
    calculateCostFromUsage,
    OPENAI_PRICING,
    GOOGLE_PRICING,
    ANTHROPIC_PRICING,
    DEFAULT_PRICING_CONFIG,
    type PricingConfig,
    type ModelPricing,
    type CostResult,
} from '@agtlantis/core';

// ============================================================================
// CLI Configuration
// ============================================================================

export {
    defineConfig,
    type EvalConfig,
    type LLMConfig,
    type CLIJudgeConfig,
    type CLIImproverConfig,
    type OutputConfig,
    type RunConfig,
    type CLITestCase,
    type CLISingleTurnTestCase,
    type CLIMultiTurnTestCase,
} from './cli/config/types.js';

export { discoverEvalFiles, type DiscoverOptions } from './cli/config/loader.js';

// ============================================================================
// Improvement Cycle (Automated Prompt Refinement)
// ============================================================================

// Types
export type {
    // Termination conditions
    TargetScoreCondition,
    MaxRoundsCondition,
    NoImprovementCondition,
    MaxCostCondition,
    CustomCycleCondition,
    CycleTerminationCondition,
    // Context and results
    CycleContext,
    CycleContinueResult,
    CycleTerminatedResult,
    CycleTerminationResult,
    // Round types
    RoundYield,
    RoundDecision,
    RoundCost,
    RoundResult,
    // Serialization
    SerializedPrompt,
    SerializedRoundResult,
    // History and config
    ImprovementHistory,
    HistoryConfig,
    ImprovementCycleConfig,
    ImprovementCycleOptions,
    ImprovementCycleResult,
    HistoryStorage,
    ImprovementSession,
    SessionConfig,
} from './improvement-cycle/index.js';

// Type guards
export {
    isTargetScoreCondition,
    isMaxRoundsCondition,
    isNoImprovementCondition,
    isMaxCostCondition,
    isCustomCycleCondition,
    isCycleTerminated,
} from './improvement-cycle/index.js';

// Condition utilities
export { checkCycleCondition, checkCycleTermination } from './improvement-cycle/index.js';

// Condition factory functions
export {
    targetScore,
    maxRounds,
    noImprovement,
    maxCost,
    customCondition,
    // Composite conditions
    and as cycleAnd,
    or as cycleOr,
    not as cycleNot,
} from './improvement-cycle/index.js';

// Runner
export { runImprovementCycle, runImprovementCycleAuto } from './improvement-cycle/index.js';

// History/Persistence
export {
    createSession,
    resumeSession,
    loadHistory,
    saveHistory,
    serializePrompt,
    deserializePrompt,
    defaultHistoryStorage,
} from './improvement-cycle/index.js';

// ============================================================================
// Test Case Utilities
// ============================================================================

export {
    TestCaseCollection,
    testCase,
    testCases,
    type RandomOptions,
} from './core/test-case-collection.js';
