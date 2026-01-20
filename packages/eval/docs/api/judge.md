# Judge

> Judge creation and evaluation criteria for scoring agent outputs

## Overview

The Judge module provides the core evaluation logic for scoring agent outputs. A judge uses an LLM to evaluate outputs against defined criteria, producing verdicts with scores and reasoning. You can use built-in criteria like `accuracy()` and `relevance()`, or define custom criteria for domain-specific evaluation.

---

## `createJudge(config)`

Creates a judge for evaluating agent outputs.

```typescript
function createJudge(config: JudgeConfig): Judge
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.provider` | `Provider` | Provider from `@agtlantis/core` |
| `config.prompt?` | `JudgePrompt` | Optional prompt template (uses built-in default) |
| `config.criteria` | `Criterion[]` | Evaluation criteria |
| `config.passThreshold?` | `number` | Score threshold (default: 70) |

### Example

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
    { id: 'helpfulness', name: 'Helpfulness', description: 'Response is helpful' },
  ],
  passThreshold: 75,
})
```

---

## `Judge.evaluate(context)`

Evaluates an agent's output.

```typescript
interface Judge {
  evaluate(context: EvalContext): Promise<JudgeResult>
}

interface EvalContext {
  input: unknown
  output: unknown
  agentDescription: string
  files?: FileContent[]
}

interface JudgeResult {
  verdicts: Verdict[]
  overallScore: number
  passed: boolean
}
```

### Example

```typescript
const result = await judge.evaluate({
  input: { query: 'What is the capital of France?' },
  output: { answer: 'Paris' },
  agentDescription: 'Geography Q&A assistant',
})

console.log(`Score: ${result.overallScore}`)
console.log(`Passed: ${result.passed}`)
for (const verdict of result.verdicts) {
  console.log(`${verdict.criterionId}: ${verdict.score} - ${verdict.reasoning}`)
}
```

---

## Custom Prompt

The `prompt` parameter is optional. When omitted, the judge uses its built-in default prompt. You can provide a custom prompt for specialized evaluation scenarios:

```typescript
import { createJudge, accuracy } from '@agtlantis/eval'
import type { JudgePrompt } from '@agtlantis/eval'

const customPrompt: JudgePrompt = {
  id: 'technical-review',
  version: '1.0.0',
  system: 'You are a strict technical reviewer...',
  buildUserPrompt: (context) => `Evaluate this response: ${JSON.stringify(context.output)}`,
}

const judge = createJudge({
  provider,
  prompt: customPrompt,  // Optional: omit to use default
  criteria: [accuracy()],
})
```

---

## Criteria

### Built-in Criteria

#### `accuracy(options?)`

Evaluates factual correctness.

```typescript
import { accuracy } from '@agtlantis/eval'

accuracy()                    // Default weight: 1
accuracy({ weight: 2 })       // Higher importance
accuracy({ weight: 0.5 })     // Lower importance
```

#### `consistency(options?)`

Evaluates internal consistency.

```typescript
import { consistency } from '@agtlantis/eval'

consistency()
consistency({ weight: 1.5 })
```

#### `relevance(options?)`

Evaluates relevance to the input.

```typescript
import { relevance } from '@agtlantis/eval'

relevance()
relevance({ weight: 2 })
```

---

### Schema Validation

#### `schema(options)`

Creates a programmatic criterion using Zod schema validation.

```typescript
import { schema } from '@agtlantis/eval'
import { z } from 'zod'

const OutputSchema = z.object({
  answer: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string()).optional(),
})

schema({
  schema: OutputSchema,
  id: 'output-schema',         // Optional custom ID
  name: 'Output Schema',       // Optional custom name
  weight: 2,                   // Optional weight
})
```

**Scoring:**
- Schema valid: 100 points
- Schema invalid: 0 points (with detailed error messages)

---

### Custom Criteria

Define your own criteria for domain-specific evaluation:

```typescript
const customCriterion: Criterion = {
  id: 'domain-expertise',
  name: 'Domain Expertise',
  description: 'Demonstrates deep knowledge of the subject matter',
  weight: 1.5,
}
```

### Criterion Interface

```typescript
interface Criterion {
  id: string
  name: string
  description: string
  weight?: number  // Default: 1
}
```

---

## Provider Integration

`@agtlantis/eval` uses the Provider API from `@agtlantis/core` for LLM interactions.

> **Note:** Provider factory functions are exported from `@agtlantis/core`, not from `@agtlantis/eval`.

### Creating a Provider

```typescript
import { createOpenAIProvider } from '@agtlantis/core'
import { createJudge, accuracy } from '@agtlantis/eval'

// Create an OpenAI provider
const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

// Use with Judge
const judge = createJudge({
  provider,
  criteria: [accuracy()],
})
```

### Available Providers

| Provider | Factory Function | Import |
|----------|-----------------|--------|
| OpenAI | `createOpenAIProvider(config)` | `@agtlantis/core` |
| Google (Gemini) | `createGoogleProvider(config)` | `@agtlantis/core` |

### OpenAI Provider

```typescript
import { createOpenAIProvider } from '@agtlantis/core'

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://custom-endpoint.com', // Optional: for Azure or proxies
}).withDefaultModel('gpt-4o')
```

### Google Provider

```typescript
import { createGoogleProvider } from '@agtlantis/core'

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.0-flash')
```

### Provider Interface

The Provider interface uses a fluent API pattern:

```typescript
interface Provider {
  withDefaultModel(modelId: string): Provider
  withLogger(logger: Logger): Provider
  withPricing(pricing: ProviderPricing): Provider

  simpleExecution<TResult>(
    fn: (session: SimpleSession) => Promise<TResult>,
    options?: ExecutionOptions
  ): SimpleExecution<TResult>

  streamingExecution<TEvent, TResult>(
    generator: (session: StreamingSession<TEvent, TResult>) => AsyncGenerator<TEvent, TEvent>
  ): StreamingExecution<TEvent, TResult>
}
```

---

## See Also

- [Eval Suite](./eval-suite.md) - Use judges within evaluation suites
- [Improver](./improver.md) - Generate improvement suggestions based on verdicts
- [Errors](./errors.md) - Handle evaluation errors
- [@agtlantis/core Provider API](../../core/docs/api/provider.md) - Detailed provider documentation
