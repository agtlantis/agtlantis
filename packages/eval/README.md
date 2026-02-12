# @agtlantis/eval

> Unit testing for AI Agents

## Overview

Traditional unit tests are deterministic — same input, same output, pass or fail. AI Agents are non-deterministic. The same prompt can produce different outputs, and "correctness" is often a spectrum, not a binary.

@agtlantis/eval embraces this reality with LLM-as-Judge evaluation, statistical iterations, and multi-turn conversation testing.

## Features

- **LLM-as-Judge Evaluation** — Use AI to evaluate AI with customizable criteria
- **Multi-turn Conversations** — Test complex dialogues with termination conditions
- **AI Simulated Users** — Automatically generate realistic user inputs with personas
- **Statistical Iterations** — Run tests multiple times and analyze results statistically
- **Cost Tracking** — Built-in pricing tables with per-component cost breakdown
- **Schema Validation** — Validate outputs with Zod schemas (binary pass/fail)
- **Hybrid Evaluation** — Combine programmatic and LLM-based criteria
- **Prompt Improvement** — Get AI-generated suggestions to improve your agent's prompts
- **CLI Runner** — Run evaluations from the command line with TypeScript configs
- **Markdown Reports** — Generate detailed, human-readable evaluation reports

## Installation

Not published to npm yet. Use from the monorepo:

```bash
git clone <repo-url>
cd agtlantis
pnpm install
pnpm build
```

> **Note:** `zod` is a required peer dependency for schema validation features.

## Quick Start

### 1. Define Your Agent

```typescript
import type { EvalAgent, AgentPrompt } from '@agtlantis/eval'

interface QAInput {
  question: string
}

interface QAOutput {
  answer: string
  confidence: 'high' | 'medium' | 'low'
}

const qaAgent: EvalAgent<QAInput, QAOutput> = {
  config: {
    name: 'qa-agent',
    description: 'A Q&A agent that answers questions accurately',
  },
  prompt: {
    id: 'qa-prompt',
    version: '1.0.0',
    system: 'You are a helpful Q&A assistant. Answer questions accurately and concisely.',
    renderUserPrompt: (input) => input.question,
  },
  execute: async (input) => {
    // Your actual LLM call here
    return {
      result: { answer: 'The answer...', confidence: 'high' },
      metadata: { tokenUsage: { input: 10, output: 20, total: 30 } },
    }
  },
}
```

### 2. Create a Judge

```typescript
import { createOpenAIProvider } from '@agtlantis/core'
import { createJudge, accuracy, relevance } from '@agtlantis/eval'

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

const judge = createJudge({
  provider,
  criteria: [
    accuracy({ weight: 2 }),
    relevance(),
    {
      id: 'conciseness',
      name: 'Conciseness',
      description: 'The answer is brief and to the point',
    },
  ],
  passThreshold: 70,
})
```

### 3. Run Evaluations

```typescript
import { createEvalSuite, reportToMarkdown } from '@agtlantis/eval'

const suite = createEvalSuite({
  agent: qaAgent,
  judge,
  agentDescription: 'Q&A agent that answers general knowledge questions',
})

const testCases = [
  { id: 'capitals', input: { question: 'What is the capital of France?' } },
  { id: 'math', input: { question: 'What is 2 + 2?' } },
  { id: 'history', input: { question: 'Who wrote Romeo and Juliet?' } },
]

const report = await suite.run(testCases, { iterations: 5, concurrency: 2 })

console.log(reportToMarkdown(report))
```

## Core Concepts

### Evaluation Criteria

Criteria define how your agent's outputs are evaluated. There are two types:

#### LLM-Evaluated Criteria (0-100 score)

```typescript
import { accuracy, consistency, relevance } from '@agtlantis/eval'

const criteria = [
  accuracy({ weight: 2 }),
  consistency(),
  relevance(),
  {
    id: 'custom-criterion',
    name: 'Domain Expertise',
    description: 'Shows deep understanding of the subject matter',
    weight: 1.5,
  },
]
```

#### Programmatic Criteria (Binary: 0 or 100)

```typescript
import { schema } from '@agtlantis/eval'
import { z } from 'zod'

const OutputSchema = z.object({
  answer: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.string()).optional(),
})

const criteria = [
  schema({ schema: OutputSchema, weight: 2 }),
  accuracy(),
]
```

### Test Iterations

LLM outputs are non-deterministic. Run tests multiple times for statistical reliability:

```typescript
const report = await suite.run(testCases, {
  iterations: 5,
  concurrency: 3,
})

console.log(report.results[0].iterationStats)
// {
//   iterations: 5,
//   passCount: 4,
//   passRate: 0.8,
//   mean: 82.4,
//   stdDev: 5.2,
//   min: 75,
//   max: 90,
// }
```

### Multi-Turn Conversations

Test agents that require multiple interaction turns:

```typescript
import {
  fieldEquals,
  afterTurns,
  type MultiTurnTestCase,
} from '@agtlantis/eval'

interface BookingInput {
  message: string
  conversationHistory?: Array<{ role: string; content: string }>
}

interface BookingOutput {
  reply: string
  booking: {
    status: 'pending' | 'confirmed' | 'cancelled'
    date?: string
    guests?: number
  }
}

const testCase: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'complete-booking',
  input: { message: 'I want to make a reservation' },
  multiTurn: {
    followUpInputs: [
      { input: { message: 'Tomorrow at 7pm' }, description: 'Provide date' },
      { input: { message: '4 guests' }, description: 'Provide party size' },
      { input: { message: 'Confirm please' }, description: 'Confirm booking' },
    ],
    terminationConditions: [
      fieldEquals('booking.status', 'confirmed'),
      afterTurns(10),
    ],
    onConditionMet: 'pass',
    onMaxTurnsReached: 'fail',
  },
}
```

### AI Simulated Users

Let AI play the user role with customizable personas:

```typescript
import { aiUser, type MultiTurnTestCase } from '@agtlantis/eval'

const friendlyCustomerPrompt = `You are a friendly, cooperative customer.
- Answer questions clearly and politely
- Provide information naturally over multiple turns
- Use casual, conversational language`

const testCase: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'ai-friendly-booking',
  input: { message: 'Hi, I need to book a table' },
  multiTurn: {
    followUpInputs: [
      {
        input: aiUser({
          provider,
          systemPrompt: friendlyCustomerPrompt,
          formatHistory: (ctx) =>
            ctx.history.map(h => `Agent: ${h.output.reply}`).join('\n'),
          buildInput: (response, ctx) => ({
            message: response,
            conversationHistory: ctx.history,
          }),
        }),
        description: 'AI friendly customer',
        turns: Infinity,
      },
    ],
    terminationConditions: [
      fieldEquals('booking.status', 'confirmed'),
      afterTurns(8),
    ],
  },
}
```

Dynamic personas that change based on conversation progress:

```typescript
aiUser({
  provider,
  systemPrompt: (ctx) => {
    if (ctx.currentTurn <= 2) return 'You are patient and friendly.'
    if (ctx.currentTurn <= 5) return 'You are becoming impatient.'
    return 'You are very rushed and want quick answers.'
  },
  // ...
})
```

### Cost Tracking

Track LLM costs with built-in pricing tables:

```typescript
import {
  createEvalSuite,
  addCostsToResults,
  DEFAULT_PRICING_CONFIG,
} from '@agtlantis/eval'

const suite = createEvalSuite({
  agent: qaAgent,
  judge,
  agentDescription: 'Q&A agent',
})

const report = await suite.run(testCases)

// Add cost breakdown to results using pricing config
const resultsWithCost = addCostsToResults(report.results, DEFAULT_PRICING_CONFIG)

for (const result of resultsWithCost) {
  const cost = result.metrics.costBreakdown
  console.log(`Test: ${result.testCase.id}`)
  console.log(`  Agent cost: $${cost.agent?.toFixed(6)}`)
  console.log(`  Judge cost: $${cost.judge?.toFixed(6)}`)
  console.log(`  Total cost: $${cost.total?.toFixed(6)}`)
}
```

### Prompt Improvement

Get AI-generated suggestions to improve your agent:

```typescript
import { createImprover, applyPromptSuggestions } from '@agtlantis/eval'

const improver = createImprover({
  provider,
})

const suite = createEvalSuite({
  agent: qaAgent,
  judge,
  improver,
  agentDescription: 'Q&A agent',
})

const report = await suite.run(testCases)

for (const suggestion of report.suggestions) {
  console.log(`[${suggestion.priority}] ${suggestion.type}`)
  console.log(`Reasoning: ${suggestion.reasoning}`)
  suggestion.approved = true
}

const result = applyPromptSuggestions(
  qaAgent.prompt,
  report.suggestions.filter(s => s.approved),
  { bumpVersion: 'minor' }
)

console.log(`Applied ${result.appliedCount} suggestions`)
console.log(`New version: ${result.prompt.version}`)
```

## CLI Usage

Run evaluations from the command line:

```bash
npx agent-eval run
npx agent-eval run ./my-config.ts
npx agent-eval run -v -c 3 -i 5 -o ./reports/eval.md
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <path>` | Report output path | `./reports/eval-{timestamp}.md` |
| `-e, --env-file <path>` | Environment file path | `.env` |
| `-v, --verbose` | Verbose output mode | `false` |
| `-c, --concurrency <n>` | Concurrent executions | `1` |
| `-i, --iterations <n>` | Iterations per test | `1` |
| `--no-report` | Skip saving report | `false` |

### Config File

Create `agent-eval.config.ts`:

```typescript
import { defineConfig, accuracy, relevance } from '@agtlantis/eval'
import { myAgent } from './src/agent'

export default defineConfig({
  name: 'My Agent Evaluation',
  agentDescription: 'Helpful assistant that answers questions',
  agent: myAgent,

  llm: {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: 'gpt-4o-mini',
  },

  judge: {
    criteria: [accuracy({ weight: 2 }), relevance()],
    passThreshold: 70,
  },

  testCases: [
    { id: 'test-1', input: { question: 'What is TypeScript?' } },
    { id: 'test-2', input: { question: 'Explain async/await' } },
  ],

  output: {
    dir: './reports',
    filename: 'evaluation-report.md',
  },

  run: {
    concurrency: 3,
    iterations: 1,
  },
})
```

## LLM Providers

Providers are imported from `@agtlantis/core`:

```typescript
import { createOpenAIProvider, createGoogleProvider } from '@agtlantis/core'

const openai = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o')

const google = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.0-flash')
```

## Testing Utilities

### Mock Provider

```typescript
import { mock } from '@agtlantis/eval'

const mockProvider = mock({
  response: JSON.stringify({
    verdicts: [{ criterionId: 'accuracy', score: 85, reasoning: 'Good', passed: true }],
  }),
})

const judge = createJudge({ provider: mockProvider, ... })
```

### Mock Agent

```typescript
import { createMockAgent } from '@agtlantis/eval'

const mockAgent = createMockAgent({
  name: 'test-agent',
  defaultOutput: { answer: 'Test answer', confidence: 'high' },
})
```

## Error Handling

All errors are wrapped in `EvalError` with error codes:

```typescript
import { EvalError, EvalErrorCode } from '@agtlantis/eval'

try {
  await judge.evaluate({ ... })
} catch (error) {
  if (error instanceof EvalError) {
    switch (error.code) {
      case EvalErrorCode.LLM_API_ERROR:
        console.error('LLM API failed:', error.message)
        break
      case EvalErrorCode.VERDICT_PARSE_ERROR:
        console.error('Failed to parse verdict:', error.context)
        break
    }
  }
}
```

## Documentation

For detailed guides and API reference, see the [docs](./docs/) folder:

- [Getting Started](./docs/getting-started.md)
- [API Reference](./docs/api/README.md)

## Examples

Check the [`examples/`](./examples/) directory:

- **Q&A Agent** — Basic evaluation example
- **Multi-turn Booking Agent** — Complex conversation testing
- **AI Simulated User** — Automated user simulation with personas
- **Full Pipeline** — Complete evaluation workflow with improvement

## License

MIT
