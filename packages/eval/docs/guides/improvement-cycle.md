# Improvement Cycle Guide

> Learn how to iteratively improve your agent's prompts through automated evaluation and refinement cycles.

## Table of contents

- [What you'll learn](#what-youll-learn)
- [Prerequisites](#prerequisites)
- [What is an improvement cycle?](#what-is-an-improvement-cycle)
- [Basic configuration](#basic-configuration)
- [Running improvement cycles](#running-improvement-cycles)
  - [Auto mode (fully automated)](#auto-mode-fully-automated)
  - [HITL mode (human-in-the-loop)](#hitl-mode-human-in-the-loop)
- [Termination conditions](#termination-conditions)
  - [Target score](#target-score)
  - [Maximum rounds](#maximum-rounds)
  - [No improvement](#no-improvement)
  - [Maximum cost](#maximum-cost)
  - [Custom conditions](#custom-conditions)
  - [Combining conditions](#combining-conditions)
- [Working with suggestions](#working-with-suggestions)
  - [Understanding suggestions](#understanding-suggestions)
  - [Reviewing suggestions](#reviewing-suggestions)
  - [Applying suggestions](#applying-suggestions)
- [Persisting and resuming sessions](#persisting-and-resuming-sessions)
  - [Creating a session](#creating-a-session)
  - [Resuming a session](#resuming-a-session)
  - [History format](#history-format)
  - [Low-level history operations](#low-level-history-operations)
- [Using the CLI](#using-the-cli)
  - [Starting an improvement cycle](#starting-an-improvement-cycle)
  - [Resuming a session](#resuming-a-session-1)
  - [Rolling back to a previous prompt](#rolling-back-to-a-previous-prompt)
- [Best practices](#best-practices)
- [Example: Complete improvement workflow](#example-complete-improvement-workflow)
- [Troubleshooting](#troubleshooting)
- [See also](#see-also)

---

## What You'll Learn

- How improvement cycles work to refine agent prompts
- How to configure and run improvement cycles programmatically and via CLI
- How to set termination conditions to control when improvement stops
- How to use Human-in-the-Loop (HITL) mode for controlled iterations
- How to persist and resume improvement sessions

## Prerequisites

- Familiarity with basic `@agtlantis/eval` concepts (see [Quick Start Guide](./quick-start.md))
- An agent with a prompt you want to improve
- Understanding of evaluation criteria and judges

## What is an Improvement Cycle?

An improvement cycle is an automated process that iteratively refines your agent's prompt:

1. **Evaluate** - Run your test suite against the current prompt
2. **Analyze** - The Improver examines results and generates suggestions
3. **Apply** - Approved suggestions are applied to the prompt
4. **Repeat** - Continue until termination conditions are met

Each iteration is called a **round**. The cycle continues until you reach your target score, exhaust your budget, or hit another termination condition.

## Basic Configuration

Here's how to set up an improvement cycle:

```typescript
import {
  createEvalSuite,
  createJudge,
  createImprover,
  runImprovementCycle,
  targetScore,
  maxRounds,
  noImprovement,
  accuracy,
  relevance,
} from '@agtlantis/eval'
import { createOpenAIProvider } from '@agtlantis/core'

// Create provider
const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini')

// Create judge
const judge = createJudge({
  provider,
  criteria: [accuracy(), relevance()],
})

// Create improver
const improver = createImprover({
  provider,
})

// Create evaluation suite
const suite = createEvalSuite({
  agent: myAgent,
  judge,
  agentDescription: 'My AI agent',
})

// Configure improvement cycle
const config = {
  suite,
  improver,
  testCases,
  initialPrompt: {
    id: 'my-agent',
    version: '1.0.0',
    system: 'You are a helpful assistant.',
    renderUserPrompt: (input) => input.question,
  },
  terminateWhen: [
    targetScore(90),       // Stop when score reaches 90%
    maxRounds(10),         // Stop after 10 rounds
    noImprovement(3, 5),   // Stop after 3 rounds without 5% improvement
  ],
}
```

## Running Improvement Cycles

### Auto Mode (Fully Automated)

Auto mode runs the improvement cycle without human intervention, automatically applying all suggestions:

```typescript
import { runImprovementCycleAuto } from '@agtlantis/eval'

const result = await runImprovementCycleAuto(config, {
  onRoundComplete: (round) => {
    console.log(`Round ${round.roundNumber}: ${round.evalReport.summary.avgScore}`)
  },
})

console.log(`Completed in ${result.totalRounds} rounds`)
console.log(`Final score: ${result.finalScore}`)
console.log(`Termination: ${result.terminationReason}`)
```

### HITL Mode (Human-in-the-Loop)

HITL mode yields control after each round, allowing you to review and approve suggestions before they're applied:

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

## Termination Conditions

Termination conditions determine when the improvement cycle stops.

### Target Score

Terminates when the average score reaches or exceeds the threshold:

```typescript
import { targetScore } from '@agtlantis/eval'

terminateWhen: [targetScore(90)]  // Stop at 90% score
```

### Maximum Rounds

Terminates after a fixed number of rounds:

```typescript
import { maxRounds } from '@agtlantis/eval'

terminateWhen: [maxRounds(10)]  // Stop after 10 rounds
```

### No Improvement

Terminates after N consecutive rounds without sufficient improvement:

```typescript
import { noImprovement } from '@agtlantis/eval'

terminateWhen: [noImprovement(3, 5)]  // Stop after 3 rounds without 5% improvement
terminateWhen: [noImprovement(3)]     // Stop after 3 rounds with no improvement
```

### Maximum Cost

Terminates when total cost exceeds the budget:

```typescript
import { maxCost } from '@agtlantis/eval'

terminateWhen: [maxCost(10.00)]  // Stop when cost exceeds $10
```

### Custom Conditions

Create your own termination logic:

```typescript
import { customCondition } from '@agtlantis/eval'

terminateWhen: [
  customCondition((context) => ({
    shouldTerminate: context.totalRounds >= 5 && context.currentScore >= 0.8,
    reason: 'Acceptable score reached after minimum rounds',
  })),
]
```

### Combining Conditions

You can combine conditions using `cycleAnd`, `cycleOr`, and `cycleNot`:

```typescript
import { cycleAnd, cycleOr, cycleNot, targetScore, maxRounds } from '@agtlantis/eval'

// Both must be true
terminateWhen: [cycleAnd(targetScore(90), maxRounds(5))]

// Either can trigger
terminateWhen: [cycleOr(targetScore(95), maxRounds(20))]

// Negate a condition
terminateWhen: [cycleNot(targetScore(50))]  // Continue while score < 50%
```

## Working with Suggestions

### Understanding Suggestions

The Improver generates suggestions based on evaluation results:

```typescript
interface Suggestion {
  type: 'system_prompt' | 'user_prompt' | 'parameters'
  priority: 'high' | 'medium' | 'low'
  currentValue: string
  suggestedValue: string
  reasoning: string
  expectedImprovement: string
}
```

### Reviewing Suggestions

Use utility functions to review suggestions:

```typescript
import { suggestionDiff, suggestionPreview, suggestionSummary } from '@agtlantis/eval'

for (const suggestion of round.suggestions) {
  // One-line summary
  console.log(suggestionSummary(suggestion))
  // [HIGH] system_prompt: Add source citation requirement

  // Detailed diff
  console.log(suggestionDiff(suggestion))
  // - You are a helpful assistant.
  // + You are a helpful assistant. Always cite your sources.

  // Formatted preview
  console.log(suggestionPreview(suggestion))
}
```

### Applying Suggestions

Apply approved suggestions to a prompt:

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

## Persisting and Resuming Sessions

### Creating a Session

Sessions persist improvement history to disk:

```typescript
import { createSession } from '@agtlantis/eval'

const session = await createSession({
  name: 'my-improvement-session',
  historyDir: './history',
  autoSave: true,  // Save after each round
})
```

### Resuming a Session

Resume from where you left off:

```typescript
import { resumeSession } from '@agtlantis/eval'

const session = await resumeSession({
  historyPath: './history/my-improvement-session.json',
})

// Continue from where you left off
const cycle = runImprovementCycle(config, { session })
```

### History Format

The history file contains a complete record of the improvement cycle:

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

### Low-Level History Operations

For advanced use cases:

```typescript
import { loadHistory, saveHistory, serializePrompt, deserializePrompt } from '@agtlantis/eval'

// Load history
const history = await loadHistory('./history/session.json')
console.log(`Loaded ${history.rounds.length} rounds`)

// Modify and save
await saveHistory(history, './history/session-backup.json')

// Serialize/deserialize prompts
const serialized = serializePrompt(prompt)
const restored = deserializePrompt(serialized)
```

## Using the CLI

### Starting an Improvement Cycle

```bash
# Basic usage
npx agent-eval improve ./eval.config.ts --max-rounds 10 --history ./history.json

# With multiple termination conditions
npx agent-eval improve ./eval.config.ts \
  --target-score 90 \
  --max-rounds 20 \
  --stale-rounds 3 \
  --max-cost 50.00 \
  --history ./improvement-history.json

# Verbose output with custom env file
npx agent-eval improve ./eval.config.ts \
  --history ./history.json \
  --max-rounds 3 \
  -v -e .env.production
```

### Resuming a Session

```bash
npx agent-eval improve ./eval.config.ts \
  --resume ./improvement-history.json \
  --max-rounds 10
```

### Rolling Back to a Previous Prompt

Extract prompts from history for debugging or recovery:

```bash
# Get initial prompt (before any improvements)
npx agent-eval rollback ./history.json --initial --output ./original-prompt.json

# Get prompt after specific round
npx agent-eval rollback ./history.json --round 5 --output ./round5-prompt.json

# Export as TypeScript
npx agent-eval rollback ./history.json --round 3 --output ./prompt.ts --format ts
```

## Best Practices

### 1. Start with a Good Baseline

Before running improvement cycles, make sure your initial prompt is reasonable. The Improver works best when making incremental refinements, not fixing fundamentally broken prompts.

### 2. Use Representative Test Cases

Your test cases should cover the scenarios you care about. The Improver optimizes for your test suite, so make sure it reflects real-world usage.

### 3. Set Realistic Termination Conditions

```typescript
terminateWhen: [
  targetScore(85),      // Aim for achievable improvement
  maxRounds(10),        // Prevent infinite loops
  maxCost(5.00),        // Stay within budget
  noImprovement(3, 2),  // Stop if progress stalls
]
```

### 4. Review Suggestions in HITL Mode First

Before running fully automated cycles, use HITL mode to understand what kinds of suggestions the Improver generates. This helps you calibrate expectations and catch any issues early.

### 5. Track Costs

Monitor costs during improvement cycles:

```typescript
const result = await runImprovementCycleAuto(config, {
  onRoundComplete: (round) => {
    console.log(`Round ${round.roundNumber} cost: $${round.cost.total.toFixed(4)}`)
  },
})

console.log(`Total cost: $${result.totalCost.toFixed(4)}`)
```

### 6. Version Your Prompts

The improvement cycle automatically bumps versions. Use this to track prompt evolution:

```typescript
// Initial: 1.0.0
// After round 1: 1.1.0
// After round 2: 1.2.0
// etc.
```

## Example: Complete Improvement Workflow

Here's a complete example showing a typical improvement workflow:

```typescript
import {
  createEvalSuite,
  createJudge,
  createImprover,
  runImprovementCycleAuto,
  createSession,
  targetScore,
  maxRounds,
  noImprovement,
  maxCost,
  accuracy,
  relevance,
} from '@agtlantis/eval'
import { createOpenAIProvider } from '@agtlantis/core'

async function main() {
  // Setup
  const provider = createOpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY!,
  }).withDefaultModel('gpt-4o-mini')

  const judge = createJudge({
    provider,
    criteria: [accuracy({ weight: 2 }), relevance()],
    passThreshold: 75,
  })

  const improver = createImprover({ provider })

  const suite = createEvalSuite({
    agent: myAgent,
    judge,
    agentDescription: 'Customer support chatbot',
  })

  // Create session for persistence
  const session = await createSession({
    name: 'support-bot-improvement',
    historyDir: './improvement-history',
  })

  // Run improvement cycle
  const result = await runImprovementCycleAuto(
    {
      suite,
      improver,
      testCases,
      initialPrompt: myAgent.prompt,
      terminateWhen: [
        targetScore(90),
        maxRounds(15),
        noImprovement(3, 5),
        maxCost(10.00),
      ],
    },
    {
      session,
      onRoundComplete: (round) => {
        console.log(`Round ${round.roundNumber}:`)
        console.log(`  Score: ${round.evalReport.summary.avgScore.toFixed(1)}`)
        console.log(`  Suggestions: ${round.suggestions.length}`)
        console.log(`  Round cost: $${round.cost.total.toFixed(4)}`)
      },
    }
  )

  // Summary
  console.log('\n=== Improvement Complete ===')
  console.log(`Final score: ${result.finalScore.toFixed(1)}`)
  console.log(`Improvement: +${(result.finalScore - result.initialScore).toFixed(1)}`)
  console.log(`Total rounds: ${result.totalRounds}`)
  console.log(`Total cost: $${result.totalCost.toFixed(4)}`)
  console.log(`Termination reason: ${result.terminationReason}`)

  // The improved prompt is now in the session history
  console.log(`\nHistory saved to: ./improvement-history/${session.name}.json`)
}

main().catch(console.error)
```

## Troubleshooting

### Improvement Cycle Runs Too Long

- Add `maxRounds` termination condition
- Add `maxCost` budget limit
- Lower `targetScore` to a more achievable value

### Suggestions Don't Improve Score

- Review your test cases - they may not capture what you want to improve
- Check that your criteria align with your goals
- Try running with HITL mode to manually filter suggestions

### Costs Are Too High

- Use a cheaper model for the Improver
- Reduce the number of test cases
- Lower `iterations` count
- Set a `maxCost` limit

### Session Won't Resume

- Check the history file exists and is valid JSON
- Ensure the history file wasn't corrupted
- Try loading with `loadHistory()` to see error details

## See Also

- [Quick Start Guide](./quick-start.md) - Basic evaluation setup
- [CLI Guide](./cli-guide.md) - Command-line usage including `improve` and `rollback`
- [Improver API Reference](../api/improver.md) - Complete Improver API documentation
- [Pricing API Reference](../api/reporter.md) - Cost calculation and tracking
