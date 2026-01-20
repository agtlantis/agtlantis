# Improver

> Prompt improvement suggestions and automated improvement cycles

## Overview

The Improver module generates prompt improvement suggestions based on evaluation results. It analyzes failing test cases and proposes changes to system prompts, user prompts, or parameters. The Improvement Cycle builds on this to provide automated, iterative prompt refinement with Human-in-the-Loop (HITL) or fully automated modes.

---

## `createImprover(config)`

Creates an improver for generating prompt suggestions.

```typescript
function createImprover(config: ImproverConfig): Improver
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.provider` | `Provider` | Provider from `@agtlantis/core` |
| `config.prompt?` | `ImproverPrompt` | Optional prompt template (uses built-in default) |

### Example

```typescript
import { createOpenAIProvider } from '@agtlantis/core'
import { createImprover } from '@agtlantis/eval'

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

const improver = createImprover({
  provider,
  // prompt is optional - uses built-in default
})
```

---

## `Improver.improve(context)`

Generates improvement suggestions.

```typescript
interface ImproverContext {
  evaluatedResults: TestResultWithVerdict[]
  agentPrompt: AgentPrompt<any, any>
  aggregatedMetrics: AggregatedMetrics
}

const suggestions = await improver.improve({
  evaluatedResults: report.results,
  agentPrompt: agent.prompt,
  aggregatedMetrics: report.summary.metrics,
})
```

---

## `Suggestion` Type

```typescript
interface Suggestion {
  type: 'system_prompt' | 'user_prompt' | 'parameters'
  priority: 'high' | 'medium' | 'low'
  currentValue: string
  suggestedValue: string
  reasoning: string
  expectedImprovement: string
  approved?: boolean
  modified?: boolean
}

// Return type from Improver.improve()
interface ImproveResult {
  suggestions: Suggestion[]
  metadata?: ImproverMetadata
}
```

---

## Utility Functions

### `suggestionDiff(suggestion)`

Returns a unified diff of the change.

```typescript
import { suggestionDiff } from '@agtlantis/eval'

console.log(suggestionDiff(suggestion))
// - You are a helpful assistant.
// + You are a helpful assistant. Always cite your sources.
```

### `suggestionPreview(suggestion)`

Returns a formatted preview.

```typescript
import { suggestionPreview } from '@agtlantis/eval'

console.log(suggestionPreview(suggestion))
```

### `suggestionSummary(suggestion)`

Returns a one-line summary.

```typescript
import { suggestionSummary } from '@agtlantis/eval'

console.log(suggestionSummary(suggestion))
// [HIGH] system_prompt: Add source citation requirement
```

### `applyPromptSuggestions(prompt, suggestions, options?)`

Applies approved suggestions to a prompt.

```typescript
import { applyPromptSuggestions } from '@agtlantis/eval'

const result = applyPromptSuggestions(
  currentPrompt,
  suggestions.filter(s => s.approved),
  { bumpVersion: 'minor' }
)

console.log(`Applied: ${result.appliedCount}`)
console.log(`Skipped: ${result.skipped.length}`)
console.log(`New version: ${result.prompt.version}`)
```

### `bumpVersion(version, bump)`

Increments a semver version.

```typescript
import { bumpVersion } from '@agtlantis/eval'

bumpVersion('1.0.0', 'patch')  // '1.0.1'
bumpVersion('1.0.0', 'minor')  // '1.1.0'
bumpVersion('1.0.0', 'major')  // '2.0.0'
```

---

## Improvement Cycle

The Improvement Cycle module provides automated prompt refinement through iterative evaluation and improvement. It supports both Human-in-the-Loop (HITL) mode for controlled iterations and Auto mode for fully automated refinement.

### Key Concepts

- **Round**: One iteration of evaluate -> improve -> apply suggestions
- **Termination Condition**: Rules that determine when to stop iterating
- **History**: Persistent record of all rounds for resumption and analysis
- **Session**: A named improvement cycle with resumable state

### Configuration

```typescript
import {
  createEvalSuite,
  createJudge,
  createImprover,
  runImprovementCycle,
  targetScore,
  maxRounds,
  noImprovement,
} from '@agtlantis/eval'

const config = {
  suite: createEvalSuite({
    agent: myAgent,
    judge: createJudge({ provider, criteria }),
    agentDescription: 'My AI agent',
  }),
  improver: createImprover({
    provider,
  }),
  testCases,
  initialPrompt: {
    version: '1.0.0',
    system_prompt: 'You are a helpful assistant.',
  },
  terminateWhen: [
    targetScore(0.9),      // Stop when score reaches 90%
    maxRounds(10),         // Stop after 10 rounds
    noImprovement(3, 5),   // Stop after 3 rounds without 5% improvement
  ],
}
```

### Basic Usage (HITL Mode)

HITL mode yields control after each round, allowing you to review and approve suggestions before they're applied.

```typescript
import { runImprovementCycle, createSession } from '@agtlantis/eval'

// Create a session for persistence
const session = await createSession({
  name: 'my-agent-improvement',
  historyDir: './improvement-history',
})

// Run with HITL control
const cycle = runImprovementCycle(config, { session })

for await (const round of cycle) {
  console.log(`Round ${round.roundNumber}`)
  console.log(`Score: ${round.evalReport.summary.avgScore}`)
  console.log(`Suggestions: ${round.suggestions.length}`)

  // Review suggestions
  for (const suggestion of round.suggestions) {
    console.log(`- [${suggestion.priority}] ${suggestion.type}: ${suggestion.reasoning}`)
  }

  // Decide how to proceed
  const decision = await getUserDecision()

  if (decision === 'approve-all') {
    round.continue({ approved: round.suggestions.map((_, i) => i) })
  } else if (decision === 'approve-some') {
    round.continue({ approved: selectedIndices })
  } else if (decision === 'stop') {
    round.stop()
  } else if (decision === 'rollback') {
    round.rollback(previousRoundNumber)
  }
}

// Access final result
console.log(`Final score: ${cycle.result.finalScore}`)
console.log(`Total rounds: ${cycle.result.totalRounds}`)
console.log(`Total cost: $${cycle.result.totalCost.toFixed(4)}`)
```

### Auto Mode

Auto mode runs the improvement cycle without human intervention, automatically applying all suggestions.

```typescript
import { runImprovementCycleAuto } from '@agtlantis/eval'

const result = await runImprovementCycleAuto(config, {
  session,
  onRoundComplete: (round) => {
    console.log(`Round ${round.roundNumber}: ${round.evalReport.summary.avgScore}`)
  },
})

console.log(`Completed in ${result.totalRounds} rounds`)
console.log(`Final score: ${result.finalScore}`)
console.log(`Termination: ${result.terminationReason}`)
```

---

## Termination Conditions

### `targetScore(threshold)`

Terminates when the average score reaches or exceeds the threshold.

```typescript
import { targetScore } from '@agtlantis/eval'

terminateWhen: [targetScore(0.9)]  // Stop at 90% score
```

### `maxRounds(limit)`

Terminates after a fixed number of rounds.

```typescript
import { maxRounds } from '@agtlantis/eval'

terminateWhen: [maxRounds(10)]  // Stop after 10 rounds
```

### `noImprovement(staleRounds, minDelta?)`

Terminates after N consecutive rounds without sufficient improvement.

```typescript
import { noImprovement } from '@agtlantis/eval'

terminateWhen: [noImprovement(3, 5)]  // Stop after 3 rounds without 5% improvement
terminateWhen: [noImprovement(3)]     // Stop after 3 rounds with no improvement
```

### `maxCost(budget)`

Terminates when total cost exceeds the budget.

```typescript
import { maxCost } from '@agtlantis/eval'

terminateWhen: [maxCost(10.00)]  // Stop when cost exceeds $10
```

### `customCondition(fn)`

Terminates based on custom logic.

```typescript
import { customCondition } from '@agtlantis/eval'

terminateWhen: [
  customCondition((context) => ({
    shouldTerminate: context.totalRounds >= 5 && context.currentScore >= 0.8,
    reason: 'Acceptable score reached after minimum rounds',
  })),
]
```

### Composite Conditions

Combine conditions with `cycleAnd`, `cycleOr`, and `cycleNot`.

```typescript
import { cycleAnd, cycleOr, cycleNot, targetScore, maxRounds } from '@agtlantis/eval'

// Both must be true
terminateWhen: [cycleAnd(targetScore(0.9), maxRounds(5))]

// Either can trigger
terminateWhen: [cycleOr(targetScore(0.95), maxRounds(20))]

// Negate a condition
terminateWhen: [cycleNot(targetScore(0.5))]  // Continue while score < 0.5
```

---

## History Persistence

History tracks all rounds and enables session resumption.

### `createSession(config)`

Creates a new improvement session.

```typescript
import { createSession } from '@agtlantis/eval'

const session = await createSession({
  name: 'my-improvement-session',
  historyDir: './history',
  autoSave: true,  // Save after each round
})
```

### `resumeSession(config)`

Resumes an existing session from history.

```typescript
import { resumeSession } from '@agtlantis/eval'

const session = await resumeSession({
  historyPath: './history/my-improvement-session.json',
})

// Continue from where you left off
const cycle = runImprovementCycle(config, { session })
```

### `loadHistory(path)` / `saveHistory(history, path)`

Low-level history I/O functions.

```typescript
import { loadHistory, saveHistory } from '@agtlantis/eval'

const history = await loadHistory('./history/session.json')
console.log(`Loaded ${history.rounds.length} rounds`)

// Modify and save
await saveHistory(history, './history/session-backup.json')
```

### `serializePrompt(prompt)` / `deserializePrompt(serialized)`

Convert prompts to/from JSON-safe format for persistence.

```typescript
import { serializePrompt, deserializePrompt } from '@agtlantis/eval'

// Serialize (handles templates with compileTemplate)
const serialized = serializePrompt(prompt)

// Deserialize (restores template functions)
const restored = deserializePrompt(serialized)
```

---

## Types

### `ImprovementHistory` Type

```typescript
interface ImprovementHistory {
  schemaVersion: '1.1.0'
  sessionId: string
  sessionName: string
  createdAt: string
  completedAt?: string
  terminationReason?: string
  initialPrompt: SerializedPrompt
  currentPrompt: SerializedPrompt
  rounds: SerializedRoundResult[]
  metadata?: Record<string, unknown>
}
```

### `RoundResult` Type

```typescript
interface RoundResult {
  roundNumber: number
  promptSnapshot: AgentPrompt
  evalReport: EvalReport
  suggestions: Suggestion[]
  appliedSuggestions: number[]
  decision: RoundDecision
  cost: RoundCost
  scoreDelta: number | null  // null for first round
}

interface RoundCost {
  agent: number
  judge: number
  improver: number
  total: number
}
```

---

## CLI Commands

### `improve` Command

Run an improvement cycle from the command line.

```bash
# Basic usage
npx agent-eval improve ./eval.config.ts --max-rounds 10 --history ./history.json

# With termination conditions
npx agent-eval improve ./eval.config.ts \
  --target-score 0.9 \
  --max-rounds 20 \
  --stale-rounds 3 \
  --max-cost 50.00 \
  --history ./improvement-history.json

# Resume existing session
npx agent-eval improve ./eval.config.ts \
  --resume ./improvement-history.json \
  --max-rounds 10
```

### `rollback` Command

Extract prompts from history for debugging or recovery.

```bash
# Get initial prompt
npx agent-eval rollback ./history.json --round 0

# Get prompt after specific round
npx agent-eval rollback ./history.json --round 5

# Output as TypeScript
npx agent-eval rollback ./history.json --round 3 --format ts
```

---

## See Also

- [Eval Suite](./eval-suite.md) - Configure improvement within evaluation suites
- [Judge](./judge.md) - Evaluation criteria that drive improvements
- [Reporter](./reporter.md) - Tracking improvement progress and costs
