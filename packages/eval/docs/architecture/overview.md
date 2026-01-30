# @agtlantis/eval Architecture

> Comprehensive system architecture documentation

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Module Dependency Graph](#module-dependency-graph)
- [Core Data Flow](#core-data-flow)
- [Type Hierarchies](#type-hierarchies)
- [Module Details](#module-details)
  - [Core Module](#1-core-module)
  - [LLM Abstraction Layer](#2-provider-integration)
  - [Judge Module](#3-judge-module)
  - [Improver Module](#4-improver-module)
  - [Multi-Turn Testing](#5-multi-turn-testing)
  - [Pricing Module](#6-pricing-module)
  - [Reporter Module](#7-reporter-module)
  - [CLI & Configuration](#8-cli--configuration)
- [Design Patterns](#design-patterns)
- [Extension Points](#extension-points)

---

## Overview

`@agtlantis/eval` is an AI Agent testing library based on LLM-as-Judge. Key features:

- **EvalSuite**: Concurrent test execution engine
- **Judge**: LLM-based output evaluation (weighted criteria system)
- **Improver**: AI-powered prompt improvement suggestions
- **Multi-Turn**: Conversational agent testing
- **Cost Tracking**: Per-component cost tracking

```
┌─────────────────────────────────────────────────────────────────────┐
│                        @agtlantis/eval                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐       │
│   │  Agent  │───▶│  Judge  │───▶│ Improver │───▶│ Reporter │       │
│   └─────────┘    └─────────┘    └──────────┘    └──────────┘       │
│        │              │               │               │             │
│        ▼              ▼               ▼               ▼             │
│   ┌─────────────────────────────────────────────────────────┐      │
│   │                    LLM Abstraction                      │      │
│   │              (OpenAI / Gemini / Mock)                   │      │
│   └─────────────────────────────────────────────────────────┘      │
│                              │                                      │
│                              ▼                                      │
│   ┌─────────────────────────────────────────────────────────┐      │
│   │                   Pricing Engine                         │      │
│   │          (Cost Calculation & Tracking)                   │      │
│   └─────────────────────────────────────────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## System Architecture

### High-Level Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLI Layer                                        │
│  ┌────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐   │
│  │  agent-eval    │  │  Config Loader   │  │    YAML Test Loader        │   │
│  │    run cmd     │  │  (TypeScript)    │  │  (Discover & Parse)        │   │
│  └───────┬────────┘  └────────┬─────────┘  └─────────────┬──────────────┘   │
└──────────┼────────────────────┼──────────────────────────┼──────────────────┘
           │                    │                          │
           ▼                    ▼                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Orchestration Layer                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          EvalSuite                                   │    │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌──────────────────────┐    │    │
│  │  │  run()      │  │  withAgent()    │  │   Report Generation   │    │    │
│  │  └──────┬──────┘  └─────────────────┘  └──────────────────────┘    │    │
│  └─────────┼────────────────────────────────────────────────────────────┘    │
│            │                                                                  │
│            ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       Runner Engine                                  │    │
│  │  ┌──────────────────────┐    ┌────────────────────────────────┐    │    │
│  │  │  runWithConcurrency  │    │   executeTestCase              │    │    │
│  │  │  (Semaphore-based)   │    │   executeMultiTurnTestCase     │    │    │
│  │  └──────────────────────┘    └────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
           │                    │                          │
           ▼                    ▼                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Evaluation Layer                                    │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐     │
│  │       Judge         │  │      Improver       │  │    Multi-Turn    │     │
│  │  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌────────────┐  │     │
│  │  │  Validators   │  │  │  │  Suggestions  │  │  │  │ Conditions │  │     │
│  │  │  LLM Eval     │  │  │  │  Diff Utils   │  │  │  │ AI User    │  │     │
│  │  │  Criteria     │  │  │  │  Apply Logic  │  │  │  │ Runner     │  │     │
│  │  └───────────────┘  │  │  └───────────────┘  │  │  └────────────┘  │     │
│  └─────────────────────┘  └─────────────────────┘  └──────────────────┘     │
└──────────────────────────────────────────────────────────────────────────────┘
           │                    │                          │
           ▼                    ▼                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Infrastructure Layer                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │   LLM Clients    │  │     Pricing      │  │    Prompt Repository     │   │
│  │  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌──────────────────┐   │   │
│  │  │  OpenAI    │  │  │  │ Calculator │  │  │  │  File-based      │   │   │
│  │  │  Gemini    │  │  │  │ Defaults   │  │  │  │  SQLite-based    │   │   │
│  │  │  Mock      │  │  │  │ Breakdown  │  │  │  │  Template Comp.  │   │   │
│  │  └────────────┘  │  │  └────────────┘  │  │  └──────────────────┘   │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Module Dependency Graph

```
                              ┌─────────────┐
                              │   index.ts  │  (Public API)
                              └──────┬──────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
          ▼                          ▼                          ▼
   ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
   │    core/    │           │   judge/    │           │  improver/  │
   │  suite.ts   │◀─────────│  llm-judge  │           │ llm-improver│
   │  runner.ts  │           │  criteria/  │           │   utils.ts  │
   │  types.ts   │           │  prompts/   │           │  prompts/   │
   └──────┬──────┘           └──────┬──────┘           └──────┬──────┘
          │                          │                          │
          │    ┌─────────────────────┼──────────────────────────┤
          │    │                     │                          │
          ▼    ▼                     ▼                          │
   ┌─────────────┐           ┌─────────────┐                    │
   │ multi-turn/ │           │    llm/     │◀───────────────────┘
   │  runner.ts  │──────────▶│  types.ts   │
   │  ai-user.ts │           │  openai.ts  │
   │ conditions  │           │  gemini.ts  │
   │ termination │           │create-client│
   └──────┬──────┘           └──────┬──────┘
          │                          │
          │                          ▼
          │                  ┌─────────────┐
          │                  │  pricing/   │
          └─────────────────▶│ calculator  │
                             │  defaults   │
                             │   types     │
                             └─────────────┘
                                     │
                                     ▼
                             ┌─────────────┐
                             │  reporter/  │
                             │ markdown.ts │
                             │   types     │
                             └─────────────┘

   ┌─────────────┐           ┌─────────────┐
   │    cli/     │           │   prompt/   │
   │  commands/  │           │ file-repo   │
   │  config/    │           │sqlite-repo  │
   │   yaml/     │           │  template   │
   └─────────────┘           └─────────────┘

   ┌─────────────┐
   │  testing/   │  (Standalone - no dependencies)
   │  mock-llm   │
   │ mock-agent  │
   └─────────────┘
```

### Import Relationships

| Module | Imports From |
|--------|--------------|
| `core/suite` | core/runner, core/iteration, judge, improver, pricing |
| `core/runner` | core/types, core/errors, pricing, multi-turn |
| `judge/llm-judge` | llm/types, core/types, core/errors |
| `improver/llm-improver` | llm/types, core/types, core/errors |
| `multi-turn/runner` | core/types, judge, pricing |
| `multi-turn/ai-user` | llm/types |
| `pricing/calculator` | pricing/types, pricing/defaults |
| `cli/commands/run` | All modules |

---

## Core Data Flow

### Single-Turn Execution Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SINGLE-TURN EXECUTION                               │
└──────────────────────────────────────────────────────────────────────────────┘

  TestCase<TInput>
       │
       ▼
┌──────────────┐
│ EvalSuite.   │
│   run()      │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         runWithConcurrency()                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Semaphore (concurrency control)                                     │    │
│  │                                                                       │    │
│  │  for each testCase:                                                  │    │
│  │    ├─ acquire semaphore                                              │    │
│  │    ├─ isMultiTurnTestCase?                                           │    │
│  │    │   ├─ YES → executeMultiTurnTestCase()                           │    │
│  │    │   └─ NO  → executeTestCase()                                    │    │
│  │    └─ release semaphore                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          executeTestCase()                                    │
│                                                                               │
│  1. AGENT EXECUTION                                                          │
│     ┌─────────────────┐                                                      │
│     │ agent.execute() │ ───▶ AgentResult { result, metadata }                │
│     └─────────────────┘       └─── tokenUsage, model, duration               │
│              │                                                                │
│              ▼                                                                │
│  2. COST CALCULATION (if pricing configured)                                 │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │ agentCost = calculateCost({ tokenUsage, model, config })        │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│              │                                                                │
│              ▼                                                                │
│  3. JUDGE EVALUATION                                                         │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │ judge.evaluate({ input, output, agentDescription, files })      │     │
│     │                                                                  │     │
│     │  ├─ Run Validators (binary: 0 or 100)                           │     │
│     │  ├─ Run LLM Evaluation (0-100 score)                            │     │
│     │  ├─ Calculate Weighted Score                                     │     │
│     │  └─ Return: verdicts[], overallScore, passed, metadata          │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│              │                                                                │
│              ▼                                                                │
│  4. BUILD RESULT                                                             │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │ TestResultWithVerdict {                                          │     │
│     │   testCase, output, metrics: { latencyMs, tokenUsage,           │     │
│     │     costBreakdown: { agent, judge, total } },                   │     │
│     │   verdicts, overallScore, passed                                │     │
│     │ }                                                                │     │
│     └─────────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         ITERATION AGGREGATION                                 │
│  (When iterations > 1)                                                        │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  aggregateIterationResults([iter1[], iter2[], iter3[]])              │    │
│  │                                                                       │    │
│  │  For each test position:                                             │    │
│  │    ├─ Calculate: mean, stdDev, min, max, passRate                   │    │
│  │    ├─ Select representative result (closest to mean)                 │    │
│  │    └─ Build: EvalTestResult { kind, iterationStats?, ... }          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           REPORT GENERATION                                   │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  EvalReport {                                                        │    │
│  │    summary: { totalTests, passed, failed, avgScore, metrics },      │    │
│  │    results: EvalTestResult[],                                       │    │
│  │    suggestions: Suggestion[] (from Improver),                       │    │
│  │    generatedAt, promptVersion                                        │    │
│  │  }                                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  reportToMarkdown(report) → Markdown String                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Multi-Turn Execution Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          MULTI-TURN EXECUTION                                 │
└──────────────────────────────────────────────────────────────────────────────┘

  MultiTurnTestCase<TInput, TOutput>
  │
  │  multiTurn: {
  │    followUpInputs: FollowUpInput[],
  │    terminateWhen: TerminationCondition[],
  │    maxTurns: 10,
  │    onConditionMet: 'pass',
  │    onMaxTurnsReached: 'fail'
  │  }
  │
  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      executeMultiTurnTestCase()                               │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         TURN LOOP                                    │    │
│  │                                                                       │    │
│  │  for turn = 1 to maxTurns:                                           │    │
│  │                                                                       │    │
│  │    ┌─────────────────────────────────────────────────────────┐      │    │
│  │    │ 1. DETERMINE INPUT                                       │      │    │
│  │    │    ├─ turn === 1: use testCase.input                    │      │    │
│  │    │    └─ turn > 1: getFollowUpInput() or aiUser()          │      │    │
│  │    └─────────────────────────────────────────────────────────┘      │    │
│  │                          │                                           │    │
│  │                          ▼                                           │    │
│  │    ┌─────────────────────────────────────────────────────────┐      │    │
│  │    │ 2. EXECUTE AGENT                                         │      │    │
│  │    │    agent.execute(input) → output, metadata               │      │    │
│  │    │    Record in conversationHistory                         │      │    │
│  │    └─────────────────────────────────────────────────────────┘      │    │
│  │                          │                                           │    │
│  │                          ▼                                           │    │
│  │    ┌─────────────────────────────────────────────────────────┐      │    │
│  │    │ 3. CHECK TERMINATION                                     │      │    │
│  │    │    checkTermination(conditions, context)                 │      │    │
│  │    │                                                          │      │    │
│  │    │    ├─ fieldSet: output.field exists?                    │      │    │
│  │    │    ├─ maxTurns: turn >= limit?                          │      │    │
│  │    │    ├─ custom: check(context) returns true?              │      │    │
│  │    │    └─ naturalLanguage: LLM says "yes"?                  │      │    │
│  │    │                                                          │      │    │
│  │    │    if terminated → break loop                           │      │    │
│  │    └─────────────────────────────────────────────────────────┘      │    │
│  │                                                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                          │                                                   │
│                          ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 4. AGGREGATE TOKEN USAGE                                             │    │
│  │    Sum tokenUsage from all turns                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                          │                                                   │
│                          ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 5. EVALUATE WITH JUDGE                                               │    │
│  │    judge.evaluate({ input: first, output: final, ... })             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                          │                                                   │
│                          ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 6. DETERMINE PASS/FAIL                                               │    │
│  │    passed = terminationOutcome AND judgeResult.passed               │    │
│  │                                                                       │    │
│  │    terminationOutcome:                                               │    │
│  │      ├─ condition met → onConditionMet ('pass'/'fail')              │    │
│  │      ├─ maxTurns reached → onMaxTurnsReached ('pass'/'fail')        │    │
│  │      ├─ error → always 'fail'                                        │    │
│  │      └─ inputs exhausted → always 'fail'                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                          │                                                   │
│                          ▼                                                   │
│  MultiTurnTestResult {                                                       │
│    output, conversationHistory[], termination,                              │
│    totalTurns, metrics, verdicts, overallScore, passed                      │
│  }                                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Type Hierarchies

### Agent Type Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                     EvalAgent<TInput, TOutput>                   │
├─────────────────────────────────────────────────────────────────┤
│ config: EvalAgentConfig                                          │
│   ├─ name: string                                                │
│   └─ description?: string                                        │
│                                                                   │
│ prompt: AgentPrompt<TInput, TOutput>                             │
│   ├─ id: string                                                  │
│   ├─ version: string                                             │
│   ├─ system: string                                              │
│   └─ buildUserPrompt: (input: TInput) => string                 │
│                                                                   │
│ execute(input: TInput): Promise<AgentResult<TOutput>>           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AgentResult<TOutput>                          │
├─────────────────────────────────────────────────────────────────┤
│ result: TOutput                                                  │
│ metadata?: AgentMetadata                                         │
│   ├─ tokenUsage?: TokenUsage                                     │
│   ├─ model?: string                                              │
│   ├─ promptVersion?: string                                      │
│   └─ duration?: number                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Test Result Type Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                  TestResult<TInput, TOutput>                     │
├─────────────────────────────────────────────────────────────────┤
│ testCase: TestCase<TInput>                                       │
│ output: TOutput                                                  │
│ metrics: MetricsResult                                           │
│ error?: Error                                                    │
└───────────────────────────────┬─────────────────────────────────┘
                                │ extends
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              TestResultWithVerdict<TInput, TOutput>              │
├─────────────────────────────────────────────────────────────────┤
│ verdicts: Verdict[]                                              │
│ overallScore: number (0-100)                                     │
│ passed: boolean                                                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ extends
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              EvalTestResult<TInput, TOutput> (Union)             │
│                  Discriminated by `kind` field                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  SingleTurnResult           │ kind: 'single-turn'                │
│    └─ Basic test result with verdicts                            │
│                                                                   │
│  SingleTurnIteratedResult   │ kind: 'single-turn-iterated'       │
│    ├─ iterationStats: IterationStats (required)                  │
│    └─ iterationResults: TestResultWithVerdict[] (required)       │
│                                                                   │
│  MultiTurnResult            │ kind: 'multi-turn'                 │
│    ├─ conversationHistory: ConversationEntry[] (required)        │
│    ├─ totalTurns: number (required)                              │
│    └─ termination: TerminationInfo (required)                    │
│                                                                   │
│  MultiTurnIteratedResult    │ kind: 'multi-turn-iterated'        │
│    ├─ All SingleTurnIteratedResult fields                        │
│    ├─ All MultiTurnResult fields                                 │
│    └─ multiTurnIterationStats: MultiTurnIterationStats (required)│
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Metadata Type Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                     ComponentMetadata                            │
├─────────────────────────────────────────────────────────────────┤
│ tokenUsage?: TokenUsage                                          │
│   ├─ input: number                                               │
│   ├─ output: number                                              │
│   └─ total: number                                               │
│ model?: string                                                   │
│ [key: string]: unknown                                           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ extends
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
┌───────────────────┐ ┌───────────────┐ ┌───────────────────┐
│   AgentMetadata   │ │ JudgeMetadata │ │ ImproverMetadata  │
├───────────────────┤ ├───────────────┤ ├───────────────────┤
│ promptVersion?    │ │ (inherits)    │ │ (inherits)        │
│ duration?         │ │               │ │                   │
└───────────────────┘ └───────────────┘ └───────────────────┘
```

### Criterion Type Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                        Criterion                                 │
├─────────────────────────────────────────────────────────────────┤
│ id: string                                                       │
│ name: string                                                     │
│ description: string                                              │
│ weight?: number                                                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ extends
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ValidatorCriterion                             │
├─────────────────────────────────────────────────────────────────┤
│ validator?: ValidatorFn                                          │
│   └─ (output: unknown) => SchemaValidationResult                │
│      ├─ valid: boolean                                          │
│      ├─ errors?: ZodIssue[]                                     │
│      └─ errorSummary?: string                                   │
└─────────────────────────────────────────────────────────────────┘

Built-in Criteria:
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐
│ accuracy()  │  │consistency()│  │ relevance() │  │   schema()     │
│ (LLM-based) │  │ (LLM-based) │  │ (LLM-based) │  │  (Zod-based)   │
└─────────────┘  └─────────────┘  └─────────────┘  └────────────────┘
```

### Termination Condition Hierarchy

```
 TerminationCondition<TInput, TOutput> =
    MaxTurnsCondition | FieldSetCondition | FieldValueCondition | CustomCondition

┌─────────────────────────────────────────────────────────────────┐
│                    MaxTurnsCondition                             │
├─────────────────────────────────────────────────────────────────┤
│ type: 'maxTurns'                                                 │
│ count: number                                                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    FieldSetCondition (extends FieldsCondition)   │
├─────────────────────────────────────────────────────────────────┤
│ type: 'fieldSet'                                                 │
│ fieldPath: string  (dot notation: "result.status")              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   FieldValueCondition (extends FieldsCondition)  │
├─────────────────────────────────────────────────────────────────┤
│ type: 'fieldValue'                                               │
│ fieldPath: string  (dot notation: "result.status")              │
│ expectedValue: unknown                                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    CustomCondition                               │
├─────────────────────────────────────────────────────────────────┤
│ type: 'custom'                                                   │
│ check: (ctx) => boolean | Promise<boolean>                      │
│ description?: string                                             │
└─────────────────────────────────────────────────────────────────┘

Composite Condition Factories:
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐
│  and()  │  │  or()   │  │  not()  │  │ naturalLanguage │
│ (all)   │  │  (any)  │  │(invert) │  │   (LLM-based)   │
└─────────┘  └─────────┘  └─────────┘  └─────────────────┘
```

---

## Module Details

### 1. Core Module

**Location:** `src/core/`

| File | Responsibility |
|------|----------------|
| `types.ts` | Central type definitions (Agent, TestCase, Result, Metrics) |
| `suite.ts` | EvalSuite orchestrator - coordinates test execution and reporting |
| `runner.ts` | Test execution engine with concurrency control |
| `iteration.ts` | Statistics aggregation for multi-iteration tests |
| `errors.ts` | Structured error handling with EvalError class |
| `file-context.ts` | File loading utilities (Phase 5.3) |
| `file-source.ts` | Flexible file source abstraction (Phase 5.4) |

**Key Patterns:**
- Factory pattern: `createEvalSuite(config)`
- Semaphore-based concurrency control
- Type guards for iteration/multi-turn data

---

### 2. Provider Integration

**Source:** `@agtlantis/core`

```
┌─────────────────────────────────────────────────────────────────┐
│                        LLMProvider                               │
├─────────────────────────────────────────────────────────────────┤
│ languageModel(modelId?): LanguageModel                           │
│ withDefaultModel(modelId): LLMProvider                           │
│                                                                   │
│ Note: Wraps Vercel AI SDK for unified provider access            │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ createOpenAI    │  │ createGoogle    │  │ createMock      │
│   Provider()    │  │   Provider()    │  │   Provider()    │
│                 │  │                 │  │                 │
│ - OpenAI models │  │ - Gemini models │  │ - Testing mock  │
│ - o1/gpt-4/etc  │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Implementation Details:**
- Providers from `@agtlantis/core` (not eval)
- Uses Vercel AI SDK (`@ai-sdk/openai`, `@ai-sdk/google`)
- Token usage tracking included

---

### 3. Judge Module

**Location:** `src/judge/`

```
                    ┌─────────────────────┐
                    │    createJudge()    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Separate Criteria  │
                    └──────────┬──────────┘
                    ┌──────────┴──────────┐
                    ▼                     ▼
         ┌─────────────────┐    ┌─────────────────┐
         │ ValidatorCriteria│    │   LLM Criteria  │
         │ (Binary: 0/100) │    │  (Score: 0-100) │
         └────────┬────────┘    └────────┬────────┘
                  │                      │
                  ▼                      ▼
         ┌─────────────────┐    ┌─────────────────┐
         │Run Zod/Custom   │    │ Build Prompt    │
         │  Validators     │    │ Call LLM (JSON) │
         └────────┬────────┘    │ Parse Response  │
                  │             └────────┬────────┘
                  │                      │
                  └──────────┬───────────┘
                             ▼
                  ┌─────────────────────┐
                  │ Combine Verdicts    │
                  │ Calculate Weighted  │
                  │     Score           │
                  └──────────┬──────────┘
                             ▼
                  ┌─────────────────────┐
                  │   JudgeResult       │
                  │ verdicts, score,    │
                  │ passed, metadata    │
                  └─────────────────────┘
```

**Built-in Criteria:**
- `accuracy({ weight? })` - Factual correctness evaluation
- `consistency({ weight? })` - Internal consistency evaluation
- `relevance({ weight? })` - Input relevance evaluation
- `schema({ schema, weight? })` - Zod schema validation

---

### 4. Improver Module

**Location:** `src/improver/`

```
                    ┌─────────────────────┐
                    │  createImprover()   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  improve(prompt,    │
                    │    results)         │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Aggregate Metrics   │
                    │ Filter Low-Scoring  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Build Analysis      │
                    │     Prompt          │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Call LLM (JSON)    │
                    └──────────┬──────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                         ImproveResult                             │
│  suggestions: Suggestion[]                                        │
│    ├─ type: 'system_prompt' | 'user_prompt' | 'parameters'       │
│    ├─ priority: 'high' | 'medium' | 'low'                        │
│    ├─ currentValue, suggestedValue                               │
│    ├─ reasoning, expectedImprovement                             │
│    └─ approved?, modified?                                        │
│  metadata?: ImproverMetadata                                      │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Utility Functions │
                    │  suggestionDiff()   │
                    │ suggestionPreview() │
                    │applyPromptSuggestions│
                    │    bumpVersion()    │
                    └─────────────────────┘
```

---

### 5. Multi-Turn Testing

**Location:** `src/multi-turn/`

```
┌──────────────────────────────────────────────────────────────────┐
│                    MultiTurnTestCase                              │
├──────────────────────────────────────────────────────────────────┤
│ input: TInput                    // First turn input              │
│ multiTurn: {                                                      │
│   followUpInputs?: [             // Subsequent turns              │
│     { input, turns?, description? },                              │
│     { input: aiUser({...}), turns: Infinity }                    │
│   ],                                                              │
│   terminateWhen: [               // OR relationship               │
│     { type: 'fieldSet', fieldPath: 'done' },                     │
│     { type: 'maxTurns', count: 10 }                              │
│   ],                                                              │
│   onConditionMet: 'pass',                                        │
│   onMaxTurnsReached: 'fail'                                      │
│ }                                                                 │
└──────────────────────────────────────────────────────────────────┘

AI User Simulation:
┌─────────────────────────────────────────────────────────────────┐
│                         aiUser()                                 │
├─────────────────────────────────────────────────────────────────┤
│ provider: LLMProvider                                            │
│ systemPrompt: string | (context) => string  // Dynamic persona  │
│ formatHistory?: (context) => string                              │
│ buildInput: (llmResponse, context) => TInput                    │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6. Pricing Module

**Location:** `src/pricing/`

```
┌─────────────────────────────────────────────────────────────────┐
│                       Cost Calculation                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  TokenUsage + Model → detectProvider() → getModelPricing()      │
│                                    │                             │
│                                    ▼                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Pricing Tables                         │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │
│  │  │   OpenAI    │  │   Gemini    │  │  Anthropic  │      │    │
│  │  │ gpt-4o: $2.5│  │ gemini-1.5: │  │ claude-3.5: │      │    │
│  │  │ o1: $15     │  │  $1.25      │  │   $3.0      │      │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │    │
│  │                                                          │    │
│  │  Fallback: $1.0 / $3.0 per million                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                    │                             │
│                                    ▼                             │
│  calculateCost() → inputCost + outputCost                       │
│                                    │                             │
│                                    ▼                             │
│  buildCostBreakdown({ agent, judge, improver }) → CostBreakdown │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

### 7. Reporter Module

**Location:** `src/reporter/`

```
EvalReport → reportToMarkdown() → Markdown String

Sections:
1. Header (title, timestamp, version)
2. Summary Table (tests, pass rate, score, metrics)
3. Failed Tests (expanded, with verdicts)
4. Passed Tests (collapsed by default)
5. Improvement Suggestions (sorted by priority)

compareReports(before, after) → ReportComparison
  └─ scoreDelta, passRateDelta, improved[], regressed[]
```

---

### 8. CLI & Configuration

**Location:** `src/cli/`

```
agent-eval run [config] [options]
    │
    ├─ --output <path>       Report output path
    ├─ --env-file <path>     Environment file
    ├─ --verbose             Detailed output
    ├─ --concurrency <n>     Parallel execution
    ├─ --iterations <n>      Runs per test
    ├─ --no-report           Skip markdown report
    ├─ --mock                Use mock LLM
    ├─ --include <pattern>   YAML file patterns
    ├─ --tags <tag>          Filter by tags (OR)
    └─ --agent <name>        Filter by agent

Configuration:
┌─────────────────────────────────────────────────────────────────┐
│                      EvalConfig                                  │
├─────────────────────────────────────────────────────────────────┤
│ agent: EvalAgent                                                 │
│ llm: { provider, apiKey, defaultModel }                         │
│ judge: { criteria, passThreshold }                              │
│ improver?: { llm?, prompt? }                                    │
│ testCases?: TestCase[]        // Inline tests                   │
│ include?: string[]            // YAML file patterns             │
│ agents?: Record<string, Agent>  // Agent registry               │
│ pricing?: PricingConfig                                          │
│ output?: { dir, filename, verbose }                             │
│ run?: { concurrency, iterations }                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Design Patterns

### 1. Factory Pattern
- `createEvalSuite()`, `createJudge()`, `createImprover()`
- `createOpenAIProvider()`, `createGoogleProvider()`, `createMockProvider()`

### 2. Strategy Pattern
- `LLMProvider` interface with multiple implementations
- `TerminationCondition` with different checking strategies

### 3. Composite Pattern
- `and()`, `or()`, `not()` for termination conditions
- Criteria combining validators and LLM evaluation

### 4. Observer Pattern (Recording)
- `createMockProvider()` with built-in call tracking

### 5. Template Method
- `JudgePrompt.buildUserPrompt()`, `ImproverPrompt.buildUserPrompt()`

### 6. Adapter Pattern
- `toEvalAgent()` converts full Agent to EvalAgent

---

## Extension Points

### 1. Custom Provider
```typescript
import { mock } from '@agtlantis/core/testing';

// Use mock.provider() for testing
const customProvider = mock.provider(mock.text('custom response'));
```

### 2. Custom Criteria
```typescript
const customCriterion: ValidatorCriterion = {
  id: 'my-criterion',
  name: 'My Criterion',
  description: 'Custom validation logic',
  weight: 2,
  validator: (output) => ({
    valid: output.someField !== undefined,
    errorSummary: 'Field missing'
  })
}
```

### 3. Custom Termination Condition
```typescript
const customCondition: CustomCondition<Input, Output> = {
  type: 'custom',
  check: async (ctx) => {
    return ctx.history.length >= 3 && ctx.lastOutput?.complete === true
  },
  description: 'Wait for completion after 3 turns'
}
```

### 4. Custom Prompt Repository
```typescript
class RedisPromptRepository implements PromptRepository<Input, Output> {
  async read() { /* ... */ }
  async write(prompt) { /* ... */ }
}
```

### 5. Custom Pricing
```typescript
const customPricing: PricingConfig = {
  providers: {
    myProvider: {
      'my-model': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 }
    }
  },
  fallback: { inputPricePerMillion: 1.0, outputPricePerMillion: 3.0 }
}
```

---

## File Structure

```
src/
├── index.ts                    # Public API exports
├── core/
│   ├── types.ts               # EvalAgent, TestCase, TestResult
│   ├── suite.ts               # createEvalSuite() orchestrator
│   ├── runner.ts              # Test execution engine
│   ├── iteration.ts           # Iteration tracking
│   ├── test-case-collection.ts # TestCaseCollection builder
│   ├── errors.ts              # EvalError class
│   └── constants.ts           # Default constants
├── judge/
│   ├── types.ts               # Judge, JudgeConfig, JudgePrompt
│   ├── llm-judge.ts           # createJudge() implementation
│   ├── criteria/              # Built-in criteria (accuracy, consistency, schema)
│   └── prompts/               # Default evaluation prompts
├── multi-turn/
│   ├── types.ts               # MultiTurnTestCase, TerminationCondition
│   ├── runner.ts              # Multi-turn executor
│   ├── termination.ts         # Condition checking logic
│   ├── conditions.ts          # Condition factories
│   └── ai-user.ts             # AI User simulation
├── improver/
│   ├── types.ts               # Improver, Suggestion
│   ├── llm-improver.ts        # createImprover() implementation
│   ├── utils.ts               # Suggestion utilities
│   └── prompts/               # Default improvement prompts
├── improvement-cycle/
│   ├── types.ts               # CycleConfig, CycleResult
│   ├── runner.ts              # Cycle execution engine
│   ├── conditions.ts          # Stop conditions
│   └── history.ts             # Iteration history tracking
├── reporter/
│   ├── types.ts               # Reporter interfaces
│   ├── factory.ts             # Reporter factory
│   ├── markdown.ts            # Markdown report
│   ├── json-reporter.ts       # JSON report
│   ├── console-reporter.ts    # Console output
│   └── cycle-*.ts             # Cycle-specific reporters
├── testing/
│   ├── mock-agent.ts          # createMockAgent()
│   ├── test-utils.ts          # Test helpers
│   └── constants.ts           # Test constants
├── cli/
│   ├── index.ts               # CLI entry point
│   ├── commands/              # run, improve, rollback
│   ├── config/                # Config loading
│   ├── yaml/                  # YAML test loading
│   ├── output/                # Console output formatting
│   └── utils/                 # Provider factory, environment
└── utils/
    ├── json.ts                # JSON extraction
    ├── semaphore.ts           # Concurrency control
    └── condition-composites.ts # and(), or(), not() for conditions
```

> **Note:** LLM providers (OpenAI, Google, Mock) are from `@agtlantis/core`, not this package.

---

## See Also

- [Object Graph](./object-graph.md) - Detailed type hierarchies and object relationships
- [Multi-Turn Testing](../guides/multi-turn-guide.md) - Multi-turn conversation evaluation details
- [API Reference](../api/README.md) - Complete API documentation

---

*Last Updated: 2026-01-30*
