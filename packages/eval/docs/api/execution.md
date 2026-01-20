# Execution Utilities

> Low-level execution utilities for custom test orchestration

## Overview

The Execution Utilities provide low-level APIs for executing test cases directly. These functions are used internally by `createEvalSuite`, but you can also use them for custom orchestration when you need fine-grained control over test execution, custom retry logic, or specialized concurrency patterns.

---

## `executeTestCase(testCase, context, signal?)`

Executes a single test case by running an agent and evaluating its output through a judge.

```typescript
async function executeTestCase<TInput, TOutput>(
  testCase: TestCase<TInput>,
  context: ExecuteContext<TInput, TOutput>,
  signal?: AbortSignal
): Promise<SingleTurnResult<TInput, TOutput>>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `testCase` | `TestCase<TInput>` | The test case to execute |
| `context` | `ExecuteContext<TInput, TOutput>` | Execution context with agent, judge, and description |
| `signal` | `AbortSignal` | Optional cancellation signal |

### ExecuteContext

```typescript
interface ExecuteContext<TInput, TOutput> {
  agent: EvalAgent<TInput, TOutput>
  judge: Judge
  agentDescription: string
}
```

### Returns

`SingleTurnResult<TInput, TOutput>` containing:
- `testCase` - The executed test case
- `output` - Agent's output
- `verdicts` - Array of evaluation verdicts
- `overallScore` - Score from 0-100
- `passed` - Whether the test passed
- `metrics` - Latency and token usage
- `error` - Error if execution failed

### Example

```typescript
import { executeTestCase, createJudge, accuracy } from '@agtlantis/eval'
import { createOpenAIProvider } from '@agtlantis/core'

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

const judge = createJudge({
  provider,
  criteria: [accuracy()],
})

const result = await executeTestCase(
  { id: 'test-1', input: { query: 'What is 2+2?' } },
  {
    agent: myAgent,
    judge,
    agentDescription: 'Math tutor agent',
  }
)

if (result.passed) {
  console.log(`Passed with score: ${result.overallScore}`)
} else {
  console.log(`Failed (score: ${result.overallScore})`)
  if (result.error) {
    console.log(`  Error: ${result.error.message}`)
  }
}
```

### With Abort Signal

```typescript
const controller = new AbortController()
setTimeout(() => controller.abort(), 5000) // 5-second timeout

try {
  const result = await executeTestCase(testCase, context, controller.signal)
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Test execution was cancelled')
  }
}
```

> **Note:** When the agent fails, the result has `passed: false`, `overallScore: 0`, empty `verdicts`, and the `error` property contains the failure details.

---

## `runWithConcurrency(testCases, context, options?)`

Runs multiple test cases with configurable concurrency control. This is useful when you want to execute tests in parallel while respecting rate limits.

```typescript
async function runWithConcurrency<TInput, TOutput>(
  testCases: TestCase<TInput>[],
  context: ExecuteContext<TInput, TOutput>,
  options?: RunOptions
): Promise<EvalTestResult<TInput, TOutput>[]>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `testCases` | `TestCase<TInput>[]` | Array of test cases to run |
| `context` | `ExecuteContext<TInput, TOutput>` | Execution context with agent, judge, and description |
| `options` | `RunOptions` | Optional configuration |

### RunOptions

```typescript
interface RunOptions {
  /** Maximum concurrent test executions. Defaults to 1 (sequential). */
  concurrency?: number

  /** Stop after first failure. Defaults to false. */
  stopOnFirstFailure?: boolean

  /** AbortSignal for cancelling all tests */
  signal?: AbortSignal

  /** Run each test N times for statistical analysis. Defaults to 1. */
  iterations?: number
}
```

### Returns

`EvalTestResult<TInput, TOutput>[]` - Results in the **same order** as input test cases, regardless of execution completion order.

### Example

```typescript
import { runWithConcurrency, createJudge, accuracy } from '@agtlantis/eval'
import { createOpenAIProvider } from '@agtlantis/core'

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

const testCases = [
  { id: 'test-1', input: { query: 'What is 2+2?' } },
  { id: 'test-2', input: { query: 'Capital of France?' } },
  { id: 'test-3', input: { query: 'Explain gravity' } },
]

// Run with 3 parallel workers
const results = await runWithConcurrency(
  testCases,
  {
    agent: myAgent,
    judge: createJudge({ provider, criteria: [accuracy()] }),
    agentDescription: 'Q&A Bot',
  },
  { concurrency: 3 }
)

const passed = results.filter(r => r.passed).length
const failed = results.filter(r => !r.passed).length
console.log(`Results: ${passed} passed, ${failed} failed`)
```

### Stop on First Failure

```typescript
const results = await runWithConcurrency(
  testCases,
  context,
  {
    concurrency: 1,
    stopOnFirstFailure: true,
  }
)

// Results may have fewer items than testCases
const failedTest = results.find(r => !r.passed)
if (failedTest) {
  console.log(`Stopped at: ${failedTest.testCase.id}`)
}
```

### With Abort Signal

```typescript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 30000)

try {
  const results = await runWithConcurrency(
    testCases,
    context,
    { concurrency: 5, signal: controller.signal }
  )
} finally {
  clearTimeout(timeout)
}
```

> **Tip:** Results always maintain the original test case order. Even with high concurrency where tests complete out of order, `results[0]` corresponds to `testCases[0]`.

---

## Testing Utilities

### `mock` Utilities

Creates mock models and providers for testing. Re-exported from `@agtlantis/core/testing`.

**Available methods:**
- `mock.text(text, options?)` - Mock model returning text
- `mock.json(data, options?)` - Mock model returning JSON
- `mock.stream(chunks, options?)` - Mock streaming model
- `mock.error(error)` - Mock model that throws
- `mock.provider(model)` - Wraps a mock model in a provider with call tracking

```typescript
import { mock, createJudge, accuracy } from '@agtlantis/eval'
// or: import { mock } from '@agtlantis/core/testing'

// Create a mock provider with a fixed JSON response
const mockProvider = mock.provider(
  mock.json({
    verdicts: [
      { criterionId: 'accuracy', score: 85, reasoning: 'Good', passed: true },
    ],
  })
)

// Use with Judge
const judge = createJudge({
  provider: mockProvider,
  criteria: [accuracy()],
})

// Check recorded calls after evaluation
const calls = mockProvider.getCalls()
expect(calls).toHaveLength(1)
```

#### `MockCall` Interface

```typescript
interface MockCall {
  messages: Message[]
  options?: LLMOptions
  response: string
  timestamp: Date
}
```

### `createMockAgent(config)`

Creates a mock agent for testing.

```typescript
import { createMockAgent } from '@agtlantis/eval'

const mockAgent = createMockAgent({
  name: 'test-agent',
  defaultOutput: { answer: 'Mock answer' },
})

// Or with dynamic responses
const dynamicMock = createMockAgent({
  name: 'test-agent',
  execute: async (input) => ({
    result: { answer: `Response to: ${input.question}` },
  }),
})
```

### `createMockJudge(config)`

Creates a mock judge for testing.

```typescript
import { createMockJudge } from '@agtlantis/eval'

const mockJudge = createMockJudge({
  defaultScore: 85,
  defaultPassed: true,
})
```

### `createMockImprover(config)`

Creates a mock improver for testing.

```typescript
import { createMockImprover } from '@agtlantis/eval'

const mockImprover = createMockImprover({
  defaultSuggestions: [
    {
      type: 'system_prompt',
      priority: 'high',
      currentValue: '...',
      suggestedValue: '...',
      reasoning: 'Test suggestion',
      expectedImprovement: 'Better results',
    },
  ],
})
```

---

## When to Use These APIs

| Use Case | Recommended API |
|----------|----------------|
| Full evaluation with reporting | `createEvalSuite().run()` |
| Single test execution | `executeTestCase()` |
| Batch execution with custom logic | `runWithConcurrency()` |
| Custom orchestration/retry logic | `executeTestCase()` in a loop |

---

## See Also

- [Eval Suite](./eval-suite.md) - High-level evaluation API
- [Test Case](./test-case.md) - Creating test cases
- [Adapters](./adapters.md) - Report runner utilities
