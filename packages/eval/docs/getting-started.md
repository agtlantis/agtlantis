# @agtlantis/eval

> LLM-as-Judge evaluation framework for AI agents

## What is @agtlantis/eval?

`@agtlantis/eval` is a comprehensive testing library for AI agents that uses LLM-as-Judge methodology. Instead of relying solely on deterministic assertions, it leverages language models to evaluate the quality, accuracy, and relevance of your agent's outputs.

The library provides everything you need to build reliable evaluation pipelines: from defining test cases and running concurrent evaluations, to generating detailed reports and automatically suggesting prompt improvements. Whether you're testing single-turn Q&A agents or complex multi-turn conversational systems, @agtlantis/eval gives you the tools to measure and improve agent quality systematically.

Key capabilities include weighted evaluation criteria, iteration-based statistical analysis for handling LLM non-determinism, cost tracking across all components, and a CLI for easy integration into CI/CD workflows.

## Documentation Guide

| Section | Description |
|---------|-------------|
| [Quick Start](./guides/quick-start.md) | Get up and running in 5 minutes |
| [API Reference](./api/README.md) | Complete API documentation |
| [Architecture](./architecture/overview.md) | How the library is designed |
| [Object Graph](./architecture/object-graph.md) | Core objects and their relationships |
| [CLI Guide](./guides/cli-guide.md) | Command-line interface |
| [Multi-Turn Testing](./guides/multi-turn-guide.md) | Testing conversational agents |

## Quick Example

```typescript
import {
  createEvalSuite,
  createJudge,
  accuracy,
  consistency,
  schema,
  type EvalAgent,
} from '@agtlantis/eval'
import { createOpenAIProvider } from '@agtlantis/core'
import { z } from 'zod'

// 1. Create an LLM provider for the judge
const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o')

// 2. Define your agent (the system under test)
interface MathInput {
  question: string
}

interface MathOutput {
  answer: string
  explanation: string
}

const myAgent: EvalAgent<MathInput, MathOutput> = {
  config: { name: 'Math Tutor' },
  prompt: {
    id: 'math-tutor',
    version: '1.0.0',
    system: 'You are a helpful math tutor.',
    renderUserPrompt: (input) => input.question,
  },
  execute: async (input) => ({
    result: { answer: '42', explanation: 'The answer to everything.' },
    metadata: { tokenUsage: { input: 10, output: 20, total: 30 } },
  }),
}

// 3. Create a judge with evaluation criteria
const judge = createJudge({
  provider,
  criteria: [
    accuracy({ weight: 2 }),  // LLM-based evaluation
    consistency(),
    schema({                   // Programmatic validation
      schema: z.object({
        answer: z.string(),
        explanation: z.string(),
      }),
    }),
  ],
})

// 4. Create and run the evaluation suite
const suite = createEvalSuite({
  agent: myAgent,
  judge,
  agentDescription: 'A math tutor that answers arithmetic questions',
})

const testCases = [
  {
    id: 'basic-math',
    input: { question: 'What is 6 times 7?' },
    expectedOutput: { answer: '42' },
  },
]

const report = await suite.run(testCases)
console.log(`Pass rate: ${report.summary.passRate}%`)
```

## Core Concepts

- **EvalSuite**: The orchestrator that runs test cases against your agent and generates reports
- **Judge**: Evaluates agent outputs using weighted criteria (both LLM-based and programmatic)
- **Criteria**: Evaluation dimensions like accuracy, consistency, relevance, or custom schema validation
- **Improver**: Analyzes failed tests and suggests prompt improvements
- **Multi-Turn**: Support for testing conversational agents with termination conditions

## Next Steps

- Start with the [Quick Start Guide](./guides/quick-start.md) for a hands-on tutorial
- Explore the [API Reference](./api/README.md) for detailed function signatures
- Learn about the [Architecture](./architecture/overview.md) to understand how components fit together
- Check out [Multi-Turn Testing](./guides/multi-turn-guide.md) if you're building conversational agents
