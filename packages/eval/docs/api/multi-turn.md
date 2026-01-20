# Multi-Turn Testing

> Multi-turn conversation testing, AI user simulation, and iteration support

## Overview

The Multi-Turn Testing module enables testing of conversational agents across multiple interaction turns. It provides termination conditions to control when conversations end, AI user simulation for realistic interactions, and iteration support for statistical analysis. Use these features when testing chatbots, assistants, or any agent that maintains conversation state.

---

## MultiTurnTestCase

```typescript
interface MultiTurnTestCase<TInput, TOutput> extends TestCase<TInput> {
  multiTurn: {
    followUpInputs: FollowUpInput<TInput, TOutput>[]
    terminateWhen: TerminationCondition<TOutput>[]
    maxTurns?: number
    onConditionMet?: 'pass' | 'fail'
    onMaxTurnsReached?: 'pass' | 'fail'
  }
}
```

### FollowUpInput

```typescript
interface FollowUpInput<TInput, TOutput> {
  input: TInput | ((ctx: ConversationContext<TInput, TOutput>) => TInput | Promise<TInput>)
  description?: string
  turns?: number  // How many times to use this input (default: 1, Infinity for unlimited)
}
```

---

## Termination Conditions

### `afterTurns(count)`

Terminates after N turns.

```typescript
import { afterTurns } from '@agtlantis/eval'

afterTurns(5)  // Stop after 5 turns
```

### `fieldEquals(path, value)`

Terminates when a field equals a specific value.

```typescript
import { fieldEquals } from '@agtlantis/eval'

fieldEquals('status', 'completed')
fieldEquals('booking.confirmed', true)
```

### `fieldIsSet(path)`

Terminates when a field is set (not null/undefined).

```typescript
import { fieldIsSet } from '@agtlantis/eval'

fieldIsSet('result')
fieldIsSet('response.data')
```

### `and(...conditions)`

Combines conditions with AND logic.

```typescript
import { and, fieldEquals, fieldIsSet } from '@agtlantis/eval'

and(
  fieldEquals('status', 'complete'),
  fieldIsSet('result')
)
```

### `or(...conditions)`

Combines conditions with OR logic.

```typescript
import { or, fieldEquals, afterTurns } from '@agtlantis/eval'

or(
  fieldEquals('done', true),
  afterTurns(10)
)
```

### `not(condition)`

Negates a condition.

```typescript
import { not, fieldIsSet } from '@agtlantis/eval'

not(fieldIsSet('error'))  // Continue while no error
```

### `naturalLanguage(options)`

Uses LLM to evaluate termination.

```typescript
import { createOpenAIProvider } from '@agtlantis/core'
import { naturalLanguage } from '@agtlantis/eval'

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

naturalLanguage({
  provider,
  prompt: 'Has the user completed their booking?',
  threshold: 0.8,  // Confidence threshold (default: 0.7)
})
```

---

## `executeMultiTurnTestCase(testCase, context, options?)`

Executes a multi-turn test case manually.

```typescript
import { executeMultiTurnTestCase } from '@agtlantis/eval'

const result = await executeMultiTurnTestCase(
  multiTurnTestCase,
  { agent, judge, agentDescription },
  { maxTurns: 10 }
)

console.log(result.totalTurns)
console.log(result.terminationReason)
console.log(result.conversationHistory)
```

---

## Type Guards

```typescript
import {
  isMultiTurnTestCase,
  isMaxTurnsCondition,
  isFieldSetCondition,
  isFieldValueCondition,
  isCustomCondition,
  isTerminated,
} from '@agtlantis/eval'

if (isMultiTurnTestCase(testCase)) {
  console.log(testCase.multiTurn.terminateWhen)
}
```

---

## AI User Simulation

### `aiUser(options)`

Creates an AI-simulated user for multi-turn testing.

```typescript
function aiUser<TInput, TOutput>(
  options: AIUserOptions<TInput, TOutput>
): (ctx: ConversationContext<TInput, TOutput>) => Promise<TInput>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `options.provider` | `Provider` | Provider from `@agtlantis/core` |
| `options.systemPrompt` | `string \| ((ctx) => string)` | User persona/instructions |
| `options.formatHistory` | `(ctx) => string` | Format conversation history |
| `options.buildInput` | `(response, ctx) => TInput` | Convert AI response to agent input |

### Example

```typescript
import { createOpenAIProvider } from '@agtlantis/core'
import { aiUser } from '@agtlantis/eval'

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

const friendlyUser = aiUser({
  provider,
  systemPrompt: `You are a friendly customer making a restaurant reservation.
    Respond naturally and provide information when asked.`,
  formatHistory: (ctx) =>
    ctx.history.map(h => `Agent: ${h.output.reply}`).join('\n'),
  buildInput: (response, ctx) => ({
    message: response,
    history: ctx.history,
  }),
})

// Use in test case
const testCase: MultiTurnTestCase<Input, Output> = {
  id: 'friendly-booking',
  input: { message: 'I want to make a reservation' },
  multiTurn: {
    followUpInputs: [
      { input: friendlyUser, turns: Infinity },
    ],
    terminateWhen: [fieldEquals('status', 'confirmed')],
  },
}
```

### Dynamic Personas

```typescript
aiUser({
  provider,
  systemPrompt: (ctx) => {
    if (ctx.currentTurn <= 2) return 'You are patient and friendly.'
    if (ctx.currentTurn <= 5) return 'You are becoming slightly impatient.'
    return 'You are in a hurry and want quick answers.'
  },
  formatHistory,
  buildInput,
})
```

---

## Iteration Support

### Iteration Statistics

When running tests with `iterations > 1`, results include statistical analysis.

```typescript
interface IterationStats {
  iterations: number    // Total iterations run
  passCount: number     // Number of passing iterations
  passRate: number      // Pass rate (0-1)
  scores: number[]      // Individual iteration scores
  mean: number          // Average score
  stdDev: number        // Standard deviation
  min: number           // Minimum score
  max: number           // Maximum score
}
```

### Multi-Turn Iteration Statistics

For multi-turn tests with iterations:

```typescript
interface MultiTurnIterationStats extends IterationStats {
  avgTurns: number      // Average turns across iterations
  minTurns: number      // Minimum turns
  maxTurns: number      // Maximum turns
  terminationCounts: Record<string, number>  // Termination reason distribution
}
```

### Utility Functions

#### `calculateIterationStats(results, passThreshold)`

```typescript
import { calculateIterationStats } from '@agtlantis/eval'

const stats = calculateIterationStats(iterationResults, 70)
console.log(`Pass rate: ${stats.passRate * 100}%`)
console.log(`Mean score: ${stats.mean} (+/-${stats.stdDev})`)
```

#### `selectRepresentativeResult(results, mean)`

Selects the result closest to the mean score.

```typescript
import { selectRepresentativeResult } from '@agtlantis/eval'

const representative = selectRepresentativeResult(results, stats.mean)
```

---

## Type Guards for Results

The discriminated union types provide type-safe access to result properties:

```typescript
import {
  isSingleTurnResult,
  isMultiTurnResult,
  isIteratedResult,
} from '@agtlantis/eval'

// Check for single-turn results (includes iterated)
if (isSingleTurnResult(result)) {
  // result.kind is 'single-turn' or 'single-turn-iterated'
}

// Check for multi-turn results (includes iterated)
if (isMultiTurnResult(result)) {
  // result.conversationHistory is guaranteed
  console.log(result.totalTurns)
}

// Check for iterated results (includes both single and multi-turn)
if (isIteratedResult(result)) {
  // result.iterationStats is guaranteed
  console.log(result.iterationStats.mean)
}

// Direct kind check for specific types
if (result.kind === 'multi-turn-iterated') {
  console.log(result.multiTurnIterationStats.avgTurns)
}
```

### Discriminated Union Pattern

All `EvalTestResult` types have a `kind` field for discrimination:

| `kind` value | Type | Has iteration data | Has multi-turn data |
|--------------|------|-------------------|---------------------|
| `'single-turn'` | `SingleTurnResult` | No | No |
| `'single-turn-iterated'` | `SingleTurnIteratedResult` | Yes | No |
| `'multi-turn'` | `MultiTurnResult` | No | Yes |
| `'multi-turn-iterated'` | `MultiTurnIteratedResult` | Yes | Yes |

This enables exhaustive `switch` statements with TypeScript's type narrowing:

```typescript
function processResult(result: EvalTestResult<Input, Output>) {
  switch (result.kind) {
    case 'single-turn':
      return handleSingleTurn(result)
    case 'single-turn-iterated':
      return handleSingleTurnIterated(result)
    case 'multi-turn':
      return handleMultiTurn(result)
    case 'multi-turn-iterated':
      return handleMultiTurnIterated(result)
    // TypeScript ensures all cases are handled
  }
}
```

---

## See Also

- [Test Case](./test-case.md) - Basic test case creation
- [Eval Suite](./eval-suite.md) - Running multi-turn tests in suites
- [Judge](./judge.md) - Evaluating conversation quality
