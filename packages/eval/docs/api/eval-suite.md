# Evaluation Suite

> Core evaluation suite for testing agents with configurable judges and improvers

## Overview

The Evaluation Suite is the primary entry point for running agent evaluations. It orchestrates the execution of test cases against your agent, evaluates outputs through a judge, and optionally generates improvement suggestions. Use `createEvalSuite()` when you want a complete, batteries-included evaluation workflow.

---

## `createEvalSuite(config)`

Creates an evaluation suite for testing agents.

```typescript
function createEvalSuite<TInput, TOutput>(
  config: EvalSuiteConfig<TInput, TOutput>
): EvalSuite<TInput, TOutput>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.agent` | `EvalAgent<TInput, TOutput>` | The agent to evaluate |
| `config.judge` | `Judge` | The judge for evaluation |
| `config.improver?` | `Improver` | Optional improver for suggestions |
| `config.agentDescription?` | `string` | Description of the agent's purpose |

> **Note:** Pass threshold is configured on the Judge (see [Judge](./judge.md)). For cost tracking, use `addCostsToResults()` from the [Reporter](./reporter.md) module.

### Returns

`EvalSuite<TInput, TOutput>` with methods:

- `run(testCases, options?)` - Run evaluation on test cases
- `withAgent(agent)` - Create new suite with different agent

### Example

```typescript
import { createEvalSuite, createJudge, accuracy, relevance } from '@agtlantis/eval'
import { createOpenAIProvider } from '@agtlantis/core'

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

const suite = createEvalSuite({
  agent: myAgent,
  judge: createJudge({
    provider,
    criteria: [accuracy(), relevance()],
    passThreshold: 80,  // Pass threshold is set on the judge
  }),
  agentDescription: 'Q&A assistant',
})

const report = await suite.run(testCases, {
  concurrency: 3,
  iterations: 5,
})
```

---

## `RunOptions`

Options for running evaluations.

```typescript
interface RunOptions {
  concurrency?: number      // Parallel test execution (default: 1)
  iterations?: number       // Run each test N times (default: 1)
  stopOnFirstFailure?: boolean  // Stop on first failure (default: false)
  signal?: AbortSignal      // Cancellation signal
}
```

### Concurrency

Control how many tests run in parallel:

```typescript
// Sequential execution (default)
await suite.run(testCases, { concurrency: 1 })

// Run 5 tests at a time
await suite.run(testCases, { concurrency: 5 })
```

### Iterations

Run each test multiple times for statistical analysis:

```typescript
const report = await suite.run(testCases, { iterations: 10 })

// Access iteration statistics in results
for (const result of report.results) {
  if (result.iterationStats) {
    console.log(`Mean: ${result.iterationStats.mean}`)
    console.log(`Std Dev: ${result.iterationStats.stdDev}`)
  }
}
```

### Abort Signal

Cancel evaluation mid-execution:

```typescript
const controller = new AbortController()
setTimeout(() => controller.abort(), 60000) // 1 minute timeout

const report = await suite.run(testCases, {
  signal: controller.signal,
})
```

---

## `EvalSuite.withAgent(agent)`

Creates a new suite with a different agent, preserving all other configuration. This is useful for A/B testing different agent implementations.

```typescript
const suiteA = createEvalSuite({
  agent: agentA,
  judge,
  agentDescription: 'Agent A',
})

const suiteB = suiteA.withAgent(agentB)

const [reportA, reportB] = await Promise.all([
  suiteA.run(testCases),
  suiteB.run(testCases),
])
```

---

## See Also

- [Judge](./judge.md) - Configure evaluation criteria
- [Test Case](./test-case.md) - Create and manage test cases
- [Execution](./execution.md) - Low-level execution APIs
- [Quick Start Guide](../guides/quick-start.md) - Get started with evaluations
