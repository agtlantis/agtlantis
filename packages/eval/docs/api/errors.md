# Error Handling

> Error handling, error codes, and core type definitions

## Overview

The Error Handling module provides a structured approach to errors in `@agtlantis/eval`. All library errors extend `EvalError` with specific error codes and contextual information. This enables precise error handling, debugging, and user-friendly error messages.

---

## `EvalError`

Custom error class for all library errors.

```typescript
import { EvalError, EvalErrorCode } from '@agtlantis/eval'

try {
  await judge.evaluate(...)
} catch (error) {
  if (error instanceof EvalError) {
    console.log(`Code: ${error.code}`)
    console.log(`Message: ${error.message}`)
    console.log(`Context: ${JSON.stringify(error.context)}`)
    console.log(`Cause: ${error.cause}`)
  }
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `code` | `EvalErrorCode` | Specific error code for categorization |
| `message` | `string` | Human-readable error message |
| `context` | `Record<string, unknown>` | Additional contextual information |
| `cause` | `Error \| undefined` | Original error that caused this error |

---

## `EvalError.from(error, code, context?)`

Wraps an unknown error as an EvalError. Use this to convert caught exceptions into structured EvalErrors.

```typescript
try {
  await someOperation()
} catch (error) {
  throw EvalError.from(error, EvalErrorCode.AGENT_EXECUTION_ERROR, {
    agentId: 'my-agent',
    input: { ... },
  })
}
```

---

## `EvalErrorCode`

All error codes:

| Code | Description |
|------|-------------|
| `LLM_API_ERROR` | LLM API call failed |
| `LLM_RATE_LIMIT` | Rate limit exceeded |
| `LLM_TIMEOUT` | Request timed out |
| `JSON_PARSE_ERROR` | JSON parsing failed |
| `VERDICT_PARSE_ERROR` | Verdict parsing failed |
| `SUGGESTION_PARSE_ERROR` | Suggestion parsing failed |
| `AGENT_EXECUTION_ERROR` | Agent execution failed |
| `INVALID_CONFIG` | Invalid configuration |
| `MISSING_API_KEY` | API key not provided |
| `SCHEMA_VALIDATION_ERROR` | Zod schema validation failed |
| `SCHEMA_GENERATION_ERROR` | Structured output failed |
| `PROMPT_NOT_FOUND` | Prompt not found |
| `PROMPT_INVALID_FORMAT` | Invalid prompt format |
| `PROMPT_READ_ERROR` | Prompt reading failed |
| `PROMPT_WRITE_ERROR` | Prompt writing failed |
| `FILE_READ_ERROR` | File reading failed |
| `FILE_TOO_LARGE` | File exceeds size limit |
| `SUGGESTION_APPLY_ERROR` | Suggestion application failed |
| `UNKNOWN_ERROR` | Unknown error |

### Error Code Categories

**LLM Errors** - Issues with AI provider communication:
- `LLM_API_ERROR` - General API failure
- `LLM_RATE_LIMIT` - Too many requests
- `LLM_TIMEOUT` - Request took too long

**Parsing Errors** - Issues parsing responses:
- `JSON_PARSE_ERROR` - Invalid JSON response
- `VERDICT_PARSE_ERROR` - Malformed verdict structure
- `SUGGESTION_PARSE_ERROR` - Malformed suggestion structure

**Configuration Errors** - Setup issues:
- `INVALID_CONFIG` - Bad configuration values
- `MISSING_API_KEY` - Required API key not set

**Schema Errors** - Validation issues:
- `SCHEMA_VALIDATION_ERROR` - Output doesn't match schema
- `SCHEMA_GENERATION_ERROR` - Couldn't generate structured output

**Prompt Errors** - Prompt management issues:
- `PROMPT_NOT_FOUND` - Prompt file missing
- `PROMPT_INVALID_FORMAT` - Malformed prompt file
- `PROMPT_READ_ERROR` - Couldn't read prompt
- `PROMPT_WRITE_ERROR` - Couldn't write prompt

**File Errors** - File handling issues:
- `FILE_READ_ERROR` - Couldn't read file
- `FILE_TOO_LARGE` - File exceeds size limit

---

## Error Handling Patterns

### Basic Error Handling

```typescript
import { EvalError, EvalErrorCode } from '@agtlantis/eval'

try {
  const report = await suite.run(testCases)
} catch (error) {
  if (error instanceof EvalError) {
    switch (error.code) {
      case EvalErrorCode.LLM_RATE_LIMIT:
        console.log('Rate limited. Waiting before retry...')
        await sleep(60000)
        break
      case EvalErrorCode.LLM_TIMEOUT:
        console.log('Request timed out. Consider reducing concurrency.')
        break
      case EvalErrorCode.MISSING_API_KEY:
        console.log('Please set the OPENAI_API_KEY environment variable.')
        process.exit(1)
      default:
        console.error(`Evaluation error: ${error.message}`)
    }
  } else {
    throw error  // Re-throw unknown errors
  }
}
```

### Accessing Error Context

```typescript
try {
  await agent.execute(input)
} catch (error) {
  if (error instanceof EvalError && error.code === EvalErrorCode.AGENT_EXECUTION_ERROR) {
    console.log('Agent failed:', error.message)
    console.log('Input was:', error.context.input)
    console.log('Original error:', error.cause?.message)
  }
}
```

### Creating Custom Errors

```typescript
import { EvalError, EvalErrorCode } from '@agtlantis/eval'

function validateInput(input: unknown) {
  if (!input || typeof input !== 'object') {
    throw new EvalError(
      EvalErrorCode.INVALID_CONFIG,
      'Input must be a non-null object',
      { receivedType: typeof input }
    )
  }
}
```

---

## Types

### Core Types

```typescript
// Agent
interface EvalAgent<TInput, TOutput> {
  config: EvalAgentConfig
  prompt: AgentPrompt<TInput, TOutput>
  execute(input: TInput): Promise<AgentResult<TOutput>>
}

interface EvalAgentConfig {
  name: string
  description?: string
}

interface AgentPrompt<TInput, TOutput> {
  id: string
  version: string
  system: string
  buildUserPrompt: (input: TInput) => string
}

interface AgentResult<TOutput> {
  result: TOutput
  metadata?: AgentMetadata
}

// Test Case
interface TestCase<TInput> {
  id?: string
  input: TInput
  description?: string
  tags?: string[]
  expectedOutput?: unknown
  files?: FileContent[]
}

// Results
interface TestResult<TInput, TOutput> {
  testCase: TestCase<TInput>
  output: TOutput
  metrics?: MetricsResult
  error?: EvalError
}

interface TestResultWithVerdict<TInput, TOutput> extends TestResult<TInput, TOutput> {
  verdicts: Verdict[]
  overallScore: number
  passed: boolean
}

// Verdict
interface Verdict {
  criterionId: string
  score: number        // 0-100
  reasoning: string
  passed: boolean
}

// Criterion
interface Criterion {
  id: string
  name: string
  description: string
  weight?: number
}

// Metrics
interface MetricsResult {
  latencyMs: number
  tokenUsage: TokenUsage
  /** @deprecated Use costBreakdown.total instead */
  estimatedCost?: number
  /** Per-component cost breakdown */
  costBreakdown?: CostBreakdown
}

interface TokenUsage {
  input: number
  output: number
  total: number
}

// Component Metadata
interface ComponentMetadata {
  tokenUsage?: TokenUsage
  model?: string
}

interface AgentMetadata extends ComponentMetadata {
  promptVersion?: string
  duration?: number
}

interface JudgeMetadata extends ComponentMetadata {}

interface ImproverMetadata extends ComponentMetadata {}
```

### Report Types

```typescript
interface EvalReport<TInput, TOutput> {
  summary: ReportSummary
  results: TestResultWithVerdict<TInput, TOutput>[]
  suggestions: Suggestion[]
  generatedAt: Date
  promptVersion: string
}

interface ReportSummary {
  totalTests: number
  passed: number
  failed: number
  avgScore: number
  metrics: AggregatedMetrics
}

interface AggregatedMetrics {
  avgLatencyMs: number
  totalTokens: number
  totalEstimatedCost: number
}
```

---

## CLI Configuration

### `defineConfig(config)`

Defines a CLI configuration file.

```typescript
import { defineConfig } from '@agtlantis/eval'

export default defineConfig({
  name: 'My Evaluation',
  agentDescription: 'Description',
  agent: myAgent,
  llm: {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: 'gpt-4o-mini',
  },
  judge: {
    criteria: [accuracy(), relevance()],
    passThreshold: 70,
  },
  testCases: [
    { id: 'test-1', input: { ... } },
  ],
  output: {
    dir: './reports',
  },
  run: {
    concurrency: 3,
    iterations: 1,
  },
})
```

### `EvalConfig` Type

```typescript
interface EvalConfig<TInput, TOutput> {
  name?: string
  agentDescription?: string
  agent: EvalAgent<TInput, TOutput>
  llm: LLMConfig
  judge: CLIJudgeConfig
  improver?: CLIImproverConfig
  pricing?: PricingConfig              // Cost calculation
  testCases?: CLITestCase<TInput, TOutput>[]  // Required if include not set
  include?: string[]                          // Required if testCases not set
  agents?: Record<string, EvalAgent<unknown, unknown>>
  output?: OutputConfig
  run?: RunConfig
}

interface LLMConfig {
  provider: 'openai' | 'gemini'
  apiKey?: string
  defaultModel: string
  reasoningEffort?: 'low' | 'medium' | 'high'
}
```

**Note:** Either `testCases` or `include` must be provided (or both). This conditional requirement is validated at runtime.

---

## See Also

- [Eval Suite](./eval-suite.md) - Error handling in evaluations
- [Judge](./judge.md) - Verdict and criteria types
- [Reporter](./reporter.md) - Report types and generation
