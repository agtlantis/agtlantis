# Quick Start Guide

> Get started with `@agtlantis/eval` in under 5 minutes.

## What You'll Learn

- How to install and set up `@agtlantis/eval`
- How to create your first agent for evaluation
- How to set up and run a basic evaluation
- How to use the CLI for streamlined workflows

## Prerequisites

- Node.js 18.0 or higher
- An OpenAI API key (or Google API key for Gemini)
- TypeScript project (recommended)

## Installation

```bash
npm install @agtlantis/eval zod
```

## Step 1: Create Your First Agent

An agent is simply an object with a `config`, `prompt`, and `execute` method. You can implement `execute` using any LLM library (AI SDK, OpenAI SDK, etc.).

```typescript
// agent.ts
import { createOpenAIProvider } from '@agtlantis/core'
import type { EvalAgent } from '@agtlantis/eval'

// Define your input/output types
interface QuestionInput {
  question: string
}

interface AnswerOutput {
  answer: string
}

// Create a provider
const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

// Create your agent
export const qaAgent: EvalAgent<QuestionInput, AnswerOutput> = {
  config: {
    name: 'qa-agent',
    description: 'A simple Q&A agent',
  },
  prompt: {
    id: 'qa-prompt',
    version: '1.0.0',
    system: 'You are a helpful assistant. Answer questions accurately and concisely.',
    buildUserPrompt: (input) => input.question,
  },
  execute: async (input) => {
    // Use provider.simpleExecution() to call the LLM
    const execution = provider.simpleExecution(async (session) => {
      const result = await session.generateText({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: input.question },
        ],
      })
      return result
    })

    const executionResult = await execution.result()

    if (executionResult.status !== 'succeeded') {
      throw executionResult.status === 'failed'
        ? executionResult.error
        : new Error('Execution was canceled')
    }

    return {
      result: { answer: executionResult.value.text },
      metadata: {
        tokenUsage: executionResult.summary.totalLLMUsage,
      },
    }
  },
}
```

## Step 2: Set Up the Evaluation

```typescript
// eval.ts
import { createOpenAIProvider } from '@agtlantis/core'
import {
  createEvalSuite,
  createJudge,
  accuracy,
  relevance,
  reportToMarkdown,
} from '@agtlantis/eval'
import { qaAgent } from './agent'

// Create a provider for the judge
const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

// Create a judge with evaluation criteria
const judge = createJudge({
  provider,
  criteria: [
    accuracy({ weight: 2 }),  // Accuracy is 2x more important
    relevance(),
  ],
  passThreshold: 70,  // Tests pass if score >= 70
})

// Create the evaluation suite
const suite = createEvalSuite({
  agent: qaAgent,
  judge,
  agentDescription: 'Q&A agent that answers general knowledge questions',
})

// Define test cases
const testCases = [
  {
    id: 'capital-france',
    input: { question: 'What is the capital of France?' },
    description: 'Basic geography question',
  },
  {
    id: 'math-simple',
    input: { question: 'What is 15 + 27?' },
    description: 'Simple arithmetic',
  },
  {
    id: 'science-basic',
    input: { question: 'What planet is known as the Red Planet?' },
    description: 'Basic science question',
  },
]

// Run the evaluation
async function main() {
  console.log('Starting evaluation...\n')

  const report = await suite.run(testCases, {
    concurrency: 2,  // Run 2 tests in parallel
  })

  // Print results
  console.log(reportToMarkdown(report))

  // Print summary
  console.log('\n--- Summary ---')
  console.log(`Total: ${report.summary.totalTests}`)
  console.log(`Passed: ${report.summary.passed}`)
  console.log(`Failed: ${report.summary.failed}`)
  console.log(`Average Score: ${report.summary.avgScore.toFixed(1)}`)
}

main().catch(console.error)
```

## Step 3: Run the Evaluation

```bash
# Set your API key
export OPENAI_API_KEY=your-key-here

# Run with tsx (or ts-node)
npx tsx eval.ts
```

## Expected Output

```markdown
# Evaluation Report

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 3 |
| Passed | 3 (100%) |
| Failed | 0 |
| Average Score | 92.3 |

## Passed Tests

<details>
<summary>capital-france (95.0)</summary>

**Input:**
```json
{ "question": "What is the capital of France?" }
```

**Output:**
```json
{ "answer": "The capital of France is Paris." }
```

**Verdicts:**
| Criterion | Score | Reasoning |
|-----------|-------|-----------|
| accuracy | 100 | The answer is factually correct. |
| relevance | 90 | Directly answers the question asked. |

</details>

...
```

## Using the CLI

For a more streamlined experience, use the CLI with a config file.

### 1. Create Config File

```typescript
// agent-eval.config.ts
import { defineConfig, accuracy, relevance } from '@agtlantis/eval'
import { qaAgent } from './agent'

export default defineConfig({
  name: 'Q&A Agent Evaluation',
  agentDescription: 'Q&A agent for general knowledge',
  agent: qaAgent,

  llm: {
    provider: 'openai',
    defaultModel: 'gpt-4o-mini',
  },

  judge: {
    criteria: [accuracy({ weight: 2 }), relevance()],
    passThreshold: 70,
  },

  testCases: [
    { id: 'test-1', input: { question: 'What is the capital of France?' } },
    { id: 'test-2', input: { question: 'What is 15 + 27?' } },
    { id: 'test-3', input: { question: 'What planet is the Red Planet?' } },
  ],

  output: {
    dir: './reports',
  },

  run: {
    concurrency: 2,
  },
})
```

### 2. Create Environment File

```bash
# .env
OPENAI_API_KEY=your-key-here
```

### 3. Run

```bash
npx agent-eval run
```

For more CLI options, see the [CLI Guide](./cli-guide.md).

## Adding Schema Validation

Ensure your agent outputs match a specific structure:

```typescript
import { createOpenAIProvider } from '@agtlantis/core'
import { createJudge, schema, accuracy } from '@agtlantis/eval'
import { z } from 'zod'

// Create provider
const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

// Define expected output schema
const OutputSchema = z.object({
  answer: z.string().min(1, 'Answer cannot be empty'),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
})

// Add to criteria
const judge = createJudge({
  provider,
  criteria: [
    schema({ schema: OutputSchema, weight: 2 }),  // Binary: 0 or 100
    accuracy(),
  ],
})
```

## Running Multiple Iterations

LLM outputs are non-deterministic. Run tests multiple times for reliability:

```typescript
const report = await suite.run(testCases, {
  iterations: 5,  // Run each test 5 times
  concurrency: 2,
})

// Check statistical results (using type guard)
import { isIteratedResult } from '@agtlantis/eval'

for (const result of report.results) {
  if (isIteratedResult(result)) {
    console.log(`Test: ${result.testCase.id}`)
    console.log(`  Mean: ${result.iterationStats.mean.toFixed(1)}`)
    console.log(`  Std Dev: ${result.iterationStats.stdDev.toFixed(1)}`)
    console.log(`  Pass Rate: ${(result.iterationStats.passRate * 100).toFixed(0)}%`)
  }
}
```

## Tracking Costs

Track LLM costs with built-in pricing tables:

```typescript
import {
  createEvalSuite,
  addCostsToResults,
  DEFAULT_PRICING_CONFIG,
} from '@agtlantis/eval'

// Create the suite (no pricing field in config)
const suite = createEvalSuite({
  agent: qaAgent,
  judge,
  agentDescription: 'Q&A agent',
})

const report = await suite.run(testCases)

// Add cost breakdown to results using pricing config
const resultsWithCost = addCostsToResults(report.results, DEFAULT_PRICING_CONFIG)

// View costs per test
for (const result of resultsWithCost) {
  const cost = result.metrics.costBreakdown
  console.log(`${result.testCase.id}: $${cost.total?.toFixed(6)}`)
  console.log(`  Agent: $${cost.agent?.toFixed(6)}`)
  console.log(`  Judge: $${cost.judge?.toFixed(6)}`)
}

// Calculate total cost
const totalCost = resultsWithCost.reduce(
  (sum, r) => sum + (r.metrics.costBreakdown?.total ?? 0),
  0
)
console.log(`\nTotal evaluation cost: $${totalCost.toFixed(4)}`)
```

## Troubleshooting

### "Missing API Key" Error

Make sure your API key is set:

```bash
export OPENAI_API_KEY=your-key-here
```

Or use a `.env` file and load it:

```typescript
// At the top of your file
import 'dotenv/config'
```

### "Zod is not defined" Error

Install zod as a peer dependency:

```bash
npm install zod
```

### Rate Limit Errors

Reduce concurrency or add delays:

```typescript
const report = await suite.run(testCases, {
  concurrency: 1,  // Run one at a time
})
```

### Timeout Errors

The default timeout is 30 seconds. For slow agents, increase it in your agent's execute method or use AbortSignal:

```typescript
const controller = new AbortController()
setTimeout(() => controller.abort(), 60000)  // 60 second timeout

const report = await suite.run(testCases, {
  signal: controller.signal,
})
```

## Next Steps

Now that you have a basic evaluation running, explore these topics:

- **[Multi-Turn Testing Guide](./multi-turn-guide.md)** - Test conversation flows
- **[CLI Guide](./cli-guide.md)** - Full CLI documentation
- **[Improvement Cycle Guide](./improvement-cycle.md)** - Iteratively improve your prompts

## See Also

- [Judge API Reference](../api/judge.md) - Complete Judge API documentation
- [Criteria API Reference](../api/judge.md) - Built-in and custom criteria
- [EvalSuite API Reference](../api/eval-suite.md) - Full EvalSuite documentation
- [Architecture Overview](../architecture/overview.md) - Understand the library structure
