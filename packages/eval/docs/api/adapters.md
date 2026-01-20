# Adapter Functions

> Adapter functions for integrating external agents and report workflows

## Overview

Adapter functions bridge different API interfaces and combine common operations. Use `toEvalAgent()` to adapt production agents for evaluation, and `createReportRunner()` to streamline the run-log-save workflow. These utilities reduce boilerplate and ensure consistent integration patterns.

---

## `toEvalAgent(agent)`

Adapts a full Agent from the `ai-agents` package to a simplified `EvalAgent` for use with `@agtlantis/eval`. This is useful when you have production agents with complete configurations (role, streaming, execution modes) but only need the core evaluation interface.

```typescript
function toEvalAgent<TInput, TOutput>(
  agent: FullAgent<TInput, TOutput>
): EvalAgent<TInput, TOutput>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent` | `FullAgent<TInput, TOutput>` | Full agent with complete AgentConfig |

### FullAgent Interface

The input agent follows the `ai-agents` package structure:

```typescript
interface FullAgent<TInput, TOutput> {
  readonly config: FullAgentConfig
  readonly prompt: AgentPrompt<TInput, TOutput>
  execute(input: TInput, options?: unknown): Promise<{
    result: TOutput
    metadata: {
      duration: number
      promptVersion: string
      tokenUsage?: EvalTokenUsage
      model?: string
      retryCount?: string
      traceId?: string
      [key: string]: unknown
    }
  }>
}

interface FullAgentConfig {
  name: string
  role: 'generator' | 'analyzer' | 'validator' | 'enhancer'
  streaming: 'required' | 'optional' | 'none'
  execution: 'batch' | 'realtime'
  conversation?: 'single-turn' | 'multi-turn'
  description?: string
  [key: string]: unknown
}
```

### Returns

`EvalAgent<TInput, TOutput>` with simplified config:

```typescript
interface EvalAgent<TInput, TOutput> {
  readonly config: EvalAgentConfig  // Only name + description
  readonly prompt: AgentPrompt<TInput, TOutput>
  execute(input: TInput, options?: unknown): Promise<AgentResult<TOutput>>
}
```

### What It Does

1. **Extracts simplified config** - Takes only `name` and `description` from the full agent's config
2. **Preserves prompt** - Passes through the prompt object unchanged
3. **Wraps execute method** - Returns simplified metadata without production-specific fields (retryCount, traceId)

### Example

```typescript
import { toEvalAgent, createEvalSuite, createJudge, accuracy } from '@agtlantis/eval'
import { createOpenAIProvider } from '@agtlantis/core'
import { scenarioGenerator } from './agents/mce'  // Full production agent

// Convert full agent to eval agent
const evalAgent = toEvalAgent(scenarioGenerator)

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

// Use in eval suite
const suite = createEvalSuite({
  agent: evalAgent,
  judge: createJudge({ provider, criteria: [accuracy()] }),
  agentDescription: 'Generates MCE practice scenarios',
})

const report = await suite.run(testCases)
```

> **Note:** Generic types `<TInput, TOutput>` are preserved during conversion, ensuring full type safety between your production agent and the evaluation.

---

## `createReportRunner(options)`

Creates a convenience runner that combines three common operations into a single call: run evaluation suite, log results to console, and save report to file.

```typescript
function createReportRunner(
  options: ReportRunnerOptions
): <TInput, TOutput>(
  suite: EvalSuite<TInput, TOutput>,
  testCases: TestCase<TInput>[],
  name: string,
) => Promise<ReportRunnerResult<TInput, TOutput>>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `options.outputDir` | `string` | Directory where reports will be saved |
| `options.pricing` | `EvalPricingConfig` | Optional pricing config for cost calculation |
| `options.verbosity` | `LogVerbosity \| false` | Console output level, or `false` to disable |

### ReportRunnerOptions

```typescript
interface ReportRunnerOptions {
  /** Directory where reports will be saved */
  outputDir: string
  /** Pricing config for cost calculation */
  pricing?: EvalPricingConfig
  /** Verbosity level for console output (false to disable logging) */
  verbosity?: LogVerbosity | false
}

type LogVerbosity = 'summary' | 'detailed' | 'full'
```

### Verbosity Levels

| Level | Description |
|-------|-------------|
| `'summary'` | Pass/fail counts and overall scores only |
| `'detailed'` | Full results with individual verdicts |
| `'full'` | Everything including raw agent outputs |
| `false` | No console logging |

### Returns

The returned function takes a suite, test cases, and a name, then returns:

```typescript
interface ReportRunnerResult<TInput, TOutput> {
  report: EvalReport<TInput, TOutput>
  savedPath: string  // Full path to saved JSON file
}
```

Reports are saved with automatic timestamps to prevent overwrites:
- Filename format: `{name}-{timestamp}.json`
- Example: `my-agent-eval-1736691234567.json`

### Example

```typescript
import {
  createEvalSuite,
  createReportRunner,
  createJudge,
  accuracy,
  GOOGLE_PRICING,
} from '@agtlantis/eval'
import { createOpenAIProvider } from '@agtlantis/core'

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

// Setup evaluation suite
const suite = createEvalSuite({
  agent: myAgent,
  judge: createJudge({ provider, criteria: [accuracy()] }),
  agentDescription: 'Customer support bot',
})

// Create report runner with console output and cost tracking
const run = createReportRunner({
  outputDir: './reports',
  pricing: GOOGLE_PRICING,
  verbosity: 'detailed',
})

// Execute and save in one call
const { report, savedPath } = await run(suite, testCases, 'support-bot-eval')

console.log(`Passed: ${report.summary.passed}/${report.summary.totalTests}`)
console.log(`Saved to: ${savedPath}`)
```

### Silent Mode (CI)

```typescript
// Disable console output for CI environments
const run = createReportRunner({
  outputDir: './reports',
  verbosity: false,
})

const { report, savedPath } = await run(suite, testCases, 'ci-eval')
// No console output, just the results
```

### Alternative: Manual Approach

If you need more control, you can perform these operations separately:

```typescript
import { ConsoleReporter, JsonReporter } from '@agtlantis/eval'

// Manual approach for custom behavior
const report = await suite.run(testCases)

// Custom logging
new ConsoleReporter({ verbosity: 'detailed' }).log(report)

// Custom saving
const jsonReporter = new JsonReporter({ outputDir: './reports' })
const path = await jsonReporter.save(report, 'my-evaluation')
```

> **Tip:** Use `createReportRunner()` for standard evaluation workflows. Use the manual approach when you need custom logging formats, conditional saving, or additional processing between steps.

---

## See Also

- [Eval Suite](./eval-suite.md) - Core evaluation suite API
- [Reporter](./reporter.md) - Report generation and comparison
- [Execution](./execution.md) - Low-level execution utilities
