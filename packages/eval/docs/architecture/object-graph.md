# @agtlantis/eval Object Graph

> **Version:** Phase 10 (Pricing Module Complete)
> **Last Updated:** 2026-01-18

## Table of contents

- [Overview](#overview)
- [Evaluation pipeline](#evaluation-pipeline)
- [Core domain objects](#core-domain-objects)
  - [1. TestCase / TestResult](#1-testcase--testresult)
  - [2. Agent hierarchy](#2-agent-hierarchy)
  - [3. Criterion / ValidatorCriterion / Verdict](#3-criterion--validatorcriterion--verdict)
  - [4. Judge](#4-judge)
  - [5. LLMProvider](#5-llmprovider)
  - [6. PromptRepository](#6-promptrepository)
  - [7. Multi-turn conversation](#7-multi-turn-conversation)
  - [8. Iteration support](#8-iteration-support)
  - [9. Improver](#9-improver)
- [Complete data flow](#complete-data-flow)
  - [10. Error handling](#10-error-handling)
- [Module structure](#module-structure)
- [Design principles](#design-principles)
  - [1. Interface-first design](#1-interface-first-design)
  - [2. Dependency injection](#2-dependency-injection)
  - [3. Hybrid evaluation](#3-hybrid-evaluation)
  - [4. Separation of concerns](#4-separation-of-concerns)
- [Version history](#version-history)
- [See also](#see-also)

---

## Overview

This document describes the core objects of the `@agtlantis/eval` package and their relationships. Each object's **Why** (design rationale) is included to provide context for architectural decisions.

---

## Evaluation Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              EVALUATION PIPELINE                                     │
│                                                                                      │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│   │  TestCase   │────▶│   Agent     │────▶│   Judge     │────▶│  Reporter   │       │
│   │             │     │  (execute)  │     │ (evaluate)  │     │ (generate)  │       │
│   └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘       │
│         │                   │                   │                   │               │
│         ▼                   ▼                   ▼                   ▼               │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│   │ TestResult  │────▶│AgentResult  │────▶│  Verdict[]  │────▶│ EvalReport  │       │
│   └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘       │
│                                                 │                                    │
│                                                 ▼                                    │
│                                          ┌─────────────┐                            │
│                                          │  Improver   │                            │
│                                          │ (improve)   │                            │
│                                          └─────────────┘                            │
│                                                 │                                    │
│                                                 ▼                                    │
│                                          ┌─────────────┐                            │
│                                          │ Suggestion[]│                            │
│                                          └─────────────┘                            │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Flow Summary:**
1. **Define**: Define evaluation scenarios with TestCase
2. **Execute**: Agent receives input and generates output
3. **Judge**: Score output based on evaluation criteria
4. **Report**: Generate markdown report from results
5. **Improve**: Analyze failed cases and suggest improvements

---

## Core Domain Objects

### 1. TestCase / TestResult

```
┌──────────────────────────────────────┐
│            TestCase                  │
├──────────────────────────────────────┤
│ id: string                           │
│ description?: string                 │
│ input: unknown                       │
│ expectedOutput?: unknown             │
│ tags?: string[]                      │
│ multiTurn?: MultiTurnConfig          │
└──────────────────────────────────────┘
                 │
                 ▼ execute()
┌──────────────────────────────────────┐
│           TestResult                 │
├──────────────────────────────────────┤
│ testCase: TestCase                   │
│ output: unknown                      │
│ error?: EvalError                    │
│ metrics?: MetricsResult              │
└──────────────────────────────────────┘
```

#### Why Separate?

| Aspect | Description |
|--------|-------------|
| **Single Responsibility** | Clear separation between input definition and execution results |
| **Reusability** | Can run the same TestCase multiple times and compare results |
| **Immutability** | TestCase is immutable, only TestResult is created |

#### Usage Example

```typescript
const testCase: TestCase = {
  id: 'math-001',
  description: 'Basic addition test',
  input: { query: 'What is 2 + 3?' },
  expectedOutput: { answer: '5' },
  tags: ['math', 'basic'],
}

const result: TestResult = {
  testCase,
  output: { answer: '5' },
  metrics: { latencyMs: 150, tokenUsage: { input: 10, output: 5, total: 15 } },
}
```

---

### 2. Agent Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                         Agent                                   │
│              (type = EvalAgent | FullAgent)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
┌──────────────────────┐              ┌──────────────────────┐
│      EvalAgent       │              │     FullAgent        │
├──────────────────────┤              ├──────────────────────┤
│ config: EvalAgentConfig│            │config: FullAgentConfig│
│ prompt: AgentPrompt  │              │prompt: AgentPrompt   │
│ execute(input)       │              │execute(input)        │
└──────────────────────┘              └──────────────────────┘
        ▲                                     │
        │                                     │ toEvalAgent()
        └─────────────────────────────────────┘
```

#### Why EvalAgent / FullAgent Separation?

| Aspect | EvalAgent | FullAgent |
|--------|-----------|-----------|
| **Purpose** | Lightweight version for evaluation | Full production features |
| **Configuration** | Minimal (name, description) | Complete (streaming, conversation, etc.) |
| **Complexity** | Low | High |

#### Conversion Function

```typescript
// FullAgent → EvalAgent conversion
const evalAgent = toEvalAgent(fullAgent)

// Extracts only what's needed for evaluation:
// - config.name
// - config.description
// - prompt
// - execute() method
```

---

### 3. Criterion / ValidatorCriterion / Verdict

```
┌──────────────────────────────────────┐
│           Criterion                  │
├──────────────────────────────────────┤
│ id: string                           │
│ name: string                         │
│ description: string                  │
│ weight?: number                      │
└──────────────────────────────────────┘
          │
          │ extends
          ▼
┌──────────────────────────────────────┐
│       ValidatorCriterion             │
├──────────────────────────────────────┤
│ validator: (output) => {             │
│   valid: boolean                     │
│   errors?: ZodIssue[]                │
│   errorSummary?: string              │
│ }                                    │
└──────────────────────────────────────┘
          │
          │ evaluate()
          ▼
┌──────────────────────────────────────┐
│            Verdict                   │
├──────────────────────────────────────┤
│ criterionId: string                  │
│ score: number (0-100)                │
│ reasoning: string                    │
│ passed: boolean                      │
└──────────────────────────────────────┘
```

#### Why Hybrid Evaluation?

| Evaluation Type | Criterion (LLM) | ValidatorCriterion (Programmatic) |
|-----------------|-----------------|-----------------------------------|
| **Score Range** | 0-100 continuous | 0 or 100 (Binary) |
| **Cost** | LLM API call cost | Free |
| **Determinism** | Non-deterministic | Deterministic |
| **Best For** | Quality, accuracy, consistency | Schema, format, required fields |

#### Usage Example

```typescript
import { accuracy, schema } from '@agtlantis/eval'
import { z } from 'zod'

const criteria = [
  // LLM evaluation (0-100)
  accuracy({ weight: 2 }),

  // Programmatic validation (0 or 100)
  schema({
    id: 'response-schema',
    schema: z.object({
      answer: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  }),
]
```

---

### 4. Judge

```
┌─────────────────────────────────────────────────────────────────┐
│                          Judge                                  │
├─────────────────────────────────────────────────────────────────┤
│ evaluate(input, output, agentDescription):                      │
│   Promise<{ verdicts, overallScore, passed }>                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ created by createJudge()
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       JudgeConfig                               │
├─────────────────────────────────────────────────────────────────┤
│ provider: Provider                                              │
│ prompt: JudgePrompt                                             │
│ criteria: Criterion[]                                           │
│ passThreshold?: number (default: 70)                            │
└─────────────────────────────────────────────────────────────────┘
```

#### Why Dependency Injection?

```typescript
import { createJudge, accuracy, consistency } from '@agtlantis/eval'
import { createOpenAIProvider, mock } from '@agtlantis/core'

// Production
const judge = createJudge({
  provider: createOpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY!,
    defaultModel: 'gpt-4o',
  }),
  criteria: [accuracy(), consistency()],
})

// Testing
const judge = createJudge({
  provider: mock.provider(mock.text('...')),  // Inject mock
  criteria: [accuracy()],
})
```

| Benefit | Description |
|---------|-------------|
| **Testability** | Unit testing possible with MockProvider injection |
| **Flexibility** | Freely swap LLM providers, prompts, and criteria |
| **Separation of Concerns** | Judge handles evaluation logic only, dependencies injected |

#### Evaluation Flow

```
1. ValidatorCriteria run first (programmatic)
   ├── Schema validation, required field checks, etc.
   └── Returns 0 or 100 score immediately for each criterion

2. LLM Criteria execution
   ├── Compose evaluation context with JudgePrompt
   ├── LLM call (JSON mode)
   └── Parse response to generate Verdict[]

3. Merge all Verdicts
   ├── Calculate overallScore via weighted average
   └── Determine passed status based on passThreshold
```

---

### 5. LLMProvider

```
┌─────────────────────────────────────────────────────────────────┐
│                        LLMProvider                              │
├─────────────────────────────────────────────────────────────────┤
│ languageModel(modelId?): LanguageModel                          │
│ withDefaultModel(modelId): LLMProvider                          │
│                                                                 │
│ Note: LLMProvider wraps the Vercel AI SDK LanguageModel         │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌────────────┬────────────┬────────────┐
            ▼            ▼            ▼            ▼
   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
   │  OpenAI     │ │   Google    │ │  Anthropic  │ │    Mock     │
   │ (Vercel AI) │ │ (Vercel AI) │ │  (future)   │ │ (testing)   │
   └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

#### Why Provider Agnostic?

```typescript
// Create providers via provider-specific factory functions
const openaiProvider = createOpenAIProvider({
  apiKey: '...',
  defaultModel: 'gpt-4o',
})

const googleProvider = createGoogleProvider({
  apiKey: '...',
  defaultModel: 'gemini-1.5-pro',
})

// Judge uses any provider through the unified Provider interface
const judge1 = createJudge({ provider: openaiProvider, ... })
const judge2 = createJudge({ provider: googleProvider, ... })
```

#### Why generateObject?

| Approach | complete() + JSON parse | generateObject() |
|----------|-------------------------|------------------|
| **Reliability** | JSON format errors possible | Guaranteed by Zod schema |
| **Error Handling** | Manual parsing/validation needed | SDK handles automatically |
| **Type Safety** | Runtime validation | Compile-time + runtime |

#### LLMOptions

Options for individual requests:

```typescript
interface LLMOptions {
  model?: string              // Model to use (overrides defaultModel)
  temperature?: number        // 0.0 ~ 2.0, output randomness
  maxTokens?: number          // Maximum output tokens
  responseFormat?: ResponseFormat  // Response format
  providerOptions?: Record<string, unknown>  // Provider-specific advanced options
}

type ResponseFormat = { type: 'text' } | { type: 'json_object' }
```

#### GenerateObjectOptions

```typescript
interface GenerateObjectOptions extends LLMOptions {
  mode?: 'auto' | 'json' | 'tool'  // Structured output mode
}
```

| Mode | Description |
|------|-------------|
| `'auto'` | SDK selects optimal approach (default) |
| `'json'` | JSON mode + schema validation |
| `'tool'` | Function calling based structured output |

---

### 6. PromptRepository

```
┌─────────────────────────────────────────────────────────────────┐
│                      AgentPrompt                                │
├─────────────────────────────────────────────────────────────────┤
│ id: string                                                      │
│ version: string                                                 │
│ system: string                                                  │
│ buildUserPrompt(context): string                                │
└─────────────────────────────────────────────────────────────────┘
          │
          │ stored/loaded by
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PromptRepository                              │
├─────────────────────────────────────────────────────────────────┤
│ read(id, version?): Promise<PromptContent>                      │
│ write(content): Promise<void>                                   │
└─────────────────────────────────────────────────────────────────┘
            ┌───────────────────┴───────────────────┐
            ▼                                       ▼
┌──────────────────────┐              ┌──────────────────────┐
│FilePromptRepository  │              │SQLitePromptRepository│
│   (YAML files)       │              │   (database)         │
└──────────────────────┘              └──────────────────────┘
```

#### Why Repository Pattern?

| Scenario | Solution |
|----------|----------|
| Local development | FilePromptRepository (YAML files) |
| Production | SQLitePromptRepository (DB storage) |
| Version control | Maintain previous versions via version field |
| A/B testing | Compare with same id, different version |
| Rollback | Instantly restore to previous version |

---

### 7. Multi-Turn Conversation

```
┌──────────────────────────────────────────────────────────────────┐
│                    MultiTurnTestCase                             │
├──────────────────────────────────────────────────────────────────┤
│ ...TestCase (extends)                                            │
│ multiTurn: {                                                     │
│   followUpInputs: FollowUpInput[]                                │
│   terminateWhen: TerminationCondition[]                          │
│ }                                                                │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│               TerminationCondition (Union Type)                  │
├──────────────────────────────────────────────────────────────────┤
│ MaxTurnsCondition    │ { type: 'maxTurns', count: number }       │
│ FieldSetCondition    │ { type: 'fieldSet', fieldPath }           │
│ FieldValueCondition  │ { type: 'fieldValue', fieldPath, expectedValue } │
│ CustomCondition      │ { type: 'custom', check(), description }  │
└──────────────────────────────────────────────────────────────────┘
```

#### Why Multi-Turn?

Real agents operate conversationally, not as single request-response:

```typescript
const bookingTest: MultiTurnTestCase = {
  id: 'booking-flow',
  input: { query: 'Book a meeting for tomorrow afternoon' },
  multiTurn: {
    followUpInputs: [
      { input: { query: '3 PM' }, turns: 1 },
      { input: { query: 'Conference Room A' }, turns: 2 },
    ],
    terminateWhen: [
      { type: 'maxTurns', count: 5 },
      { type: 'fieldValue', fieldPath: 'booking.confirmed', expectedValue: true },
    ],
  },
}
```

#### Termination Conditions

| Condition | Use Case |
|-----------|----------|
| `maxTurns` | Prevent infinite loops, limit max conversation turns |
| `fieldSet` | Terminate when specific field is set (not null/undefined) |
| `fieldValue` | Terminate when field equals a specific value |
| `custom` | Complex business logic based termination |

#### Condition Builder Functions

Factory functions for declaratively composing complex termination conditions:

```typescript
import {
  afterTurns, and, or, not,
  fieldEquals, fieldIsSet, naturalLanguage,
} from '@agtlantis/eval'
```

| Function | Description | Example |
|----------|-------------|---------|
| `afterTurns(n)` | Terminate after N turns | `afterTurns(5)` |
| `fieldEquals(path, value)` | Terminate when field equals value | `fieldEquals('status', 'done')` |
| `fieldIsSet(path)` | Terminate when field is set | `fieldIsSet('result.data')` |
| `and(...conditions)` | Terminate when all conditions met | `and(fieldIsSet('a'), fieldIsSet('b'))` |
| `or(...conditions)` | Terminate when any condition met | `or(fieldEquals('done', true), afterTurns(10))` |
| `not(condition)` | Negate condition | `not(fieldIsSet('error'))` |

##### Complex Condition Example

```typescript
const terminateWhen = [
  // (Booking confirmed AND payment completed) OR over 10 turns
  or(
    and(
      fieldEquals('booking.confirmed', true),
      fieldEquals('payment.completed', true)
    ),
    afterTurns(10)
  ),
  // Terminate immediately on error
  fieldIsSet('error'),
]
```

#### Type Guard Functions

Guard functions for type-safe condition handling:

```typescript
import {
  isMultiTurnTestCase,
  isCustomCondition,
  isFieldSetCondition,
  isFieldValueCondition,
  isMaxTurnsCondition,
} from '@agtlantis/eval'

// Check if TestCase is Multi-turn
if (isMultiTurnTestCase(testCase)) {
  console.log(testCase.multiTurn.terminationConditions)
}

// Narrow TerminationCondition types
for (const condition of terminateWhen) {
  if (isMaxTurnsCondition(condition)) {
    console.log(`Max turns: ${condition.count}`)
  } else if (isFieldSetCondition(condition)) {
    console.log(`Watched field: ${condition.fieldPath}`)
  } else if (isFieldValueCondition(condition)) {
    console.log(`Field ${condition.fieldPath} should equal ${condition.expectedValue}`)
  }
}
```

---

### 8. Iteration Support

```
┌──────────────────────────────────────────────────────────────────┐
│                  EvalTestResult (Discriminated Union)             │
│                    Discriminated by `kind` field                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  SingleTurnResult           │ kind: 'single-turn'                │
│  SingleTurnIteratedResult   │ kind: 'single-turn-iterated'       │
│    ├─ iterationStats: IterationStats                             │
│    └─ iterationResults: TestResultWithVerdict[]                  │
│  MultiTurnResult            │ kind: 'multi-turn'                 │
│    └─ conversationHistory, totalTurns, termination               │
│  MultiTurnIteratedResult    │ kind: 'multi-turn-iterated'        │
│    └─ All iteration + multi-turn fields                          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     IterationStats                               │
├──────────────────────────────────────────────────────────────────┤
│ iterations: number          // Total iteration count             │
│ passCount: number           // Pass count                        │
│ passRate: number            // Pass rate (0-1)                   │
│ scores: number[]            // Score for each iteration          │
│ mean: number                // Mean score                        │
│ stdDev: number              // Standard deviation                │
│ min: number                 // Minimum score                     │
│ max: number                 // Maximum score                     │
└──────────────────────────────────────────────────────────────────┘
```

#### Why Iteration?

LLMs are non-deterministic:

```typescript
// Same input, different outputs
await agent.execute({ query: "What's the weather?" })  // → "Sunny"
await agent.execute({ query: "What's the weather?" })  // → "It's clear"
await agent.execute({ query: "What's the weather?" })  // → "Nice weather"
```

**A single test is not reliable.**

```typescript
const suite = createEvalSuite({
  iterations: 5,  // Run 5 times
  // ...
})

// Results
{
  iterationStats: {
    iterations: 5,
    passCount: 4,
    passRate: 0.8,      // 80% passed
    mean: 82.4,         // Average 82.4
    stdDev: 5.2,        // Std dev 5.2 (stable)
    min: 75,
    max: 90,
  }
}
```

#### Iteration Utility Functions

Utilities for aggregating and analyzing iteration results:

```typescript
import {
  calculateIterationStats,
  selectRepresentativeResult,
  aggregateIterationResults,
  calculateAvgStdDev,
  calculateAvgPassRate,
} from '@agtlantis/eval'
```

| Function | Purpose |
|----------|---------|
| `calculateIterationStats` | Calculate iteration stats for a single test |
| `selectRepresentativeResult` | Select result closest to the mean |
| `aggregateIterationResults` | Aggregate iteration results for multiple tests |
| `calculateAvgStdDev` | Calculate overall average standard deviation |
| `calculateAvgPassRate` | Calculate overall average pass rate |

---

### 9. Improver

```
┌─────────────────────────────────────────────────────────────────┐
│                        Improver                                 │
├─────────────────────────────────────────────────────────────────┤
│ improve(context: ImproverContext): Promise<Suggestion[]>        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ analyzes
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ImproverContext                              │
├─────────────────────────────────────────────────────────────────┤
│ evaluatedResults: TestResultWithVerdict[]                       │
│ agentPrompt: AgentPrompt                                        │
│ aggregatedMetrics: AggregatedMetrics                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ generates
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Suggestion                                │
├─────────────────────────────────────────────────────────────────┤
│ type: 'system' | 'userTemplate' | 'examples' | ...              │
│ currentValue?: string                                           │
│ suggestedValue: string                                          │
│ reasoning: string                                               │
│ expectedImprovement: string                                     │
│ priority: 'high' | 'medium' | 'low'                             │
│ approved?: boolean          // Human review                     │
│ modified?: string           // Human modification               │
└─────────────────────────────────────────────────────────────────┘
```

#### Why Automated Improvement?

```
Analyze evaluation results → Discover patterns → Suggest improvements

Example:
- "3 tests failed on accuracy criterion"
- "All failing cases involve numeric calculations"
- "Suggest adding 'For accurate calculations, solve step by step' to system prompt"
```

#### Human-in-the-Loop

```typescript
const suggestions = await improver.improve(context)

for (const suggestion of suggestions) {
  console.log(`Suggestion: ${suggestion.suggestedValue}`)
  console.log(`Reasoning: ${suggestion.reasoning}`)

  // Human review
  suggestion.approved = await askHuman('Do you approve this suggestion?')

  // Modify if needed
  if (needsModification) {
    suggestion.modified = await getHumanInput('Enter modified value')
  }
}
```

#### Improver Utility Functions

Utilities for reviewing and applying suggestions:

```typescript
import {
  suggestionDiff,
  suggestionPreview,
  suggestionSummary,
  applyPromptSuggestions,
  bumpVersion,
} from '@agtlantis/eval'
```

| Function | Purpose |
|----------|---------|
| `suggestionDiff` | Show changes in unified diff format |
| `suggestionPreview` | Generate detailed preview of suggestion |
| `suggestionSummary` | One-line summary (e.g., `[HIGH] system: ...`) |
| `applyPromptSuggestions` | Apply approved suggestions to prompt |
| `bumpVersion` | Bump semver version (major/minor/patch) |

##### Applying Suggestions Example

```typescript
// Apply approved suggestions
const result = applyPromptSuggestions(
  currentPrompt,
  suggestions,
  { bumpVersion: 'minor' }
)

console.log(`Applied: ${result.appliedCount}`)
console.log(`New version: ${result.prompt.version}`)  // e.g., '1.1.0'
```

---

## Complete Data Flow

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              EVALUATION CYCLE                                     │
│                                                                                   │
│  1. DEFINE           2. EXECUTE           3. JUDGE            4. IMPROVE         │
│  ┌────────┐         ┌────────┐          ┌────────┐          ┌────────┐          │
│  │TestCase│ ──────▶ │ Agent  │ ──────▶  │ Judge  │ ──────▶  │Improver│          │
│  │  []    │         │execute │          │evaluate│          │improve │          │
│  └────────┘         └────────┘          └────────┘          └────────┘          │
│      │                  │                   │                   │                │
│      │                  │                   │                   │                │
│      ▼                  ▼                   ▼                   ▼                │
│  ┌────────┐         ┌────────┐          ┌────────┐          ┌────────┐          │
│  │ input  │         │TestResult         │Verdict[]│         │Suggestion         │
│  │expected│         │+ output │          │+ scores│          │ []     │          │
│  └────────┘         │+ metrics│          │+ passed│          └────────┘          │
│                     └────────┘          └────────┘               │               │
│                                              │                   │               │
│                                              ▼                   ▼               │
│                                         ┌────────┐          ┌────────┐          │
│                                         │Reporter│ ◀────────│ Apply  │          │
│                                         │generate│          │ & Loop │          │
│                                         └────────┘          └────────┘          │
│                                              │                                   │
│                                              ▼                                   │
│                                         ┌────────┐                               │
│                                         │EvalReport                              │
│                                         │.md     │                               │
│                                         └────────┘                               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

### 10. Error Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                          EvalError                               │
├─────────────────────────────────────────────────────────────────┤
│ code: EvalErrorCode                                              │
│ message: string                                                  │
│ cause?: Error                                                    │
│ context?: Record<string, unknown>                                │
├─────────────────────────────────────────────────────────────────┤
│ static from(error, code, context?): EvalError                   │
│ toJSON(): Record<string, unknown>                                │
└─────────────────────────────────────────────────────────────────┘
```

#### EvalErrorCode Categories

| Category | Error Code | Description |
|----------|------------|-------------|
| **LLM Errors** | `LLM_API_ERROR` | API call failed |
| | `LLM_RATE_LIMIT` | Rate limit exceeded |
| | `LLM_TIMEOUT` | Request timeout |
| **Parse Errors** | `JSON_PARSE_ERROR` | JSON parsing failed |
| | `VERDICT_PARSE_ERROR` | Verdict parsing failed |
| | `SUGGESTION_PARSE_ERROR` | Suggestion parsing failed |
| **Agent Errors** | `AGENT_EXECUTION_ERROR` | Agent execution failed |
| **Config Errors** | `INVALID_CONFIG` | Invalid configuration |
| | `MISSING_API_KEY` | API key missing |
| **Prompt Errors** | `PROMPT_NOT_FOUND` | Prompt not found |
| | `PROMPT_INVALID_FORMAT` | Invalid prompt format |
| | `PROMPT_WRITE_ERROR` | Prompt save failed |
| | `PROMPT_READ_ERROR` | Prompt read failed |
| **Schema Errors** | `SCHEMA_VALIDATION_ERROR` | Schema validation failed |
| | `SCHEMA_GENERATION_ERROR` | Structured output generation failed |
| **Other** | `SUGGESTION_APPLY_ERROR` | Suggestion application failed |
| | `UNKNOWN_ERROR` | Unknown error |

#### Why Structured Errors?

| Benefit | Description |
|---------|-------------|
| **Classification** | Immediately identify error type via error code |
| **Context** | Include additional info needed for debugging |
| **Chaining** | Preserve original error via `cause` |
| **Serialization** | Easy logging/transmission via `toJSON()` |

#### Usage Example

```typescript
import { EvalError, EvalErrorCode } from '@agtlantis/eval'

try {
  await agent.execute(input)
} catch (error) {
  // Wrap unknown error as EvalError
  throw EvalError.from(error, EvalErrorCode.AGENT_EXECUTION_ERROR, {
    input,
    agentId: agent.config.name,
  })
}

// Check error type and handle by code
if (error instanceof EvalError) {
  switch (error.code) {
    case EvalErrorCode.LLM_RATE_LIMIT:
      // Retry logic
      break
    case EvalErrorCode.AGENT_EXECUTION_ERROR:
      // Log error
      console.error(error.toJSON())
      break
  }
}
```

---

## Module Structure

```
src/
├── core/           # Core evaluation engine
│   ├── types.ts        # EvalAgent, TestCase, TestResult
│   ├── suite.ts        # createEvalSuite() implementation
│   ├── runner.ts       # Test execution runner
│   ├── iteration.ts    # Iteration tracking
│   ├── test-case-collection.ts  # TestCaseCollection builder
│   ├── errors.ts       # Error types
│   └── constants.ts    # Default constants
│
├── judge/          # LLM-as-Judge evaluation
│   ├── types.ts        # Judge, JudgeConfig, JudgePrompt
│   ├── llm-judge.ts    # createJudge() implementation
│   ├── criteria/       # Evaluation criteria (accuracy, consistency, schema)
│   └── prompts/        # Evaluation prompts
│
├── multi-turn/     # Multi-turn conversation evaluation
│   ├── types.ts        # MultiTurnTestCase, TerminationCondition
│   ├── runner.ts       # Multi-turn execution engine
│   ├── conditions.ts   # Termination condition definitions
│   ├── termination.ts  # Termination checking logic
│   └── ai-user.ts      # AI user simulation
│
├── improver/       # Automated improvement suggestions
│   ├── types.ts        # Improver, Suggestion
│   ├── llm-improver.ts # createImprover() implementation
│   ├── utils.ts        # Helper utilities
│   └── prompts/        # Improvement prompts
│
├── improvement-cycle/  # Improvement iteration cycle
│   ├── types.ts        # CycleConfig, CycleResult
│   ├── runner.ts       # Cycle execution engine
│   ├── conditions.ts   # Stop conditions
│   └── history.ts      # Iteration history tracking
│
├── reporter/       # Report generation
│   ├── types.ts        # Reporter, EvalReport
│   ├── factory.ts      # Reporter factory
│   ├── markdown.ts     # Markdown report
│   ├── json-reporter.ts # JSON report
│   ├── console-reporter.ts # Console output
│   ├── cycle-*.ts      # Cycle-specific reporters
│   └── format-utils.ts # Formatting helpers
│
├── cli/            # Command-line interface
│   ├── index.ts        # CLI entry point
│   ├── commands/       # run, improve, rollback commands
│   ├── config/         # Configuration loading
│   ├── yaml/           # YAML config parsing
│   ├── output/         # Console output formatting
│   └── utils/          # Provider factory, environment
│
├── testing/        # Testing utilities
│   ├── mock-agent.ts   # createMockAgent()
│   ├── test-utils.ts   # Test helpers
│   └── constants.ts    # Test constants
│
├── utils/          # Utilities
│   ├── json.ts         # JSON extraction/parsing
│   ├── semaphore.ts    # Concurrency control
│   └── condition-composites.ts  # and(), or(), not() for conditions
│
└── index.ts        # Public API exports
```

---

## Design Principles

### 1. Interface-First Design

All core components are defined via interfaces:

```typescript
// Interface definition
interface LLMProvider {
  languageModel(modelId?: string): LanguageModel
  withDefaultModel(modelId: string): LLMProvider
}

// Factory functions create providers
import { createOpenAIProvider, createGoogleProvider, mock } from '@agtlantis/core'

const openai = createOpenAIProvider({ apiKey: '...' })
const google = createGoogleProvider({ apiKey: '...' })
const mockProvider = mock.provider(mock.text('test'))
```

### 2. Dependency Injection

External dependencies are injected at creation:

```typescript
// Dependencies created internally
function createJudge() {
  const llm = new OpenAIClient()  // Hardcoded
}

// Injected from outside
function createJudge(config: JudgeConfig) {
  const { llm } = config  // Injected
}
```

### 3. Hybrid Evaluation

Programmatic validation + LLM evaluation combined:

```typescript
const criteria = [
  // Programmatic (fast, free, deterministic)
  schema({ schema: ResponseSchema }),

  // LLM (flexible, semantic evaluation)
  accuracy({ weight: 2 }),
]
```

### 4. Separation of Concerns

Each object has a single responsibility:

| Object | Responsibility |
|--------|---------------|
| TestCase | Define what to test |
| Agent | Generate output from input |
| Judge | Evaluate and score output |
| Reporter | Convert results to report |
| Improver | Suggest improvements |

---

## Version History

| Version | Major Changes |
|---------|--------------|
| Phase 1-4 | Basic structure implementation |
| Phase 5 | Multi-Turn conversation evaluation added |
| Phase 6.1 | Iteration support (repeated execution and statistics) |
| Phase 6.2 | generateObject() added |
| Phase 6.3 | ValidatorCriterion, schema() added |
| Phase 6.4 | Gemini provider added, error handling documented |
| Phase 7-9 | File handling, CLI enhancements |
| Phase 10 | Pricing module with cost tracking |

---

## See Also

- [Architecture Overview](./overview.md) - System-level architecture and execution flows
- [API Reference](../api/README.md) - Complete API documentation with function signatures
