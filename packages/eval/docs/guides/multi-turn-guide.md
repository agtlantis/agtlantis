# Multi-Turn Testing Guide

> Learn how to test agents that handle complex, multi-turn conversations with automatic termination conditions and AI-simulated users.

## What You'll Learn

- Why multi-turn testing matters for real-world agents
- How to create multi-turn test cases with follow-up inputs
- How to use termination conditions to control conversation flow
- How to create AI-simulated users for realistic testing

## Prerequisites

- Familiarity with basic `@agtlantis/eval` concepts (see [Quick Start Guide](./quick-start.md))
- An agent that handles conversational interactions

## Why Multi-Turn Testing?

Real-world AI agents rarely complete tasks in a single request-response cycle. Consider:

- **Booking assistants** that collect date, time, guests, and confirmation
- **Customer support bots** that diagnose issues through questions
- **Form-filling agents** that gather required information step by step
- **Negotiation agents** that go back and forth to reach agreement

Multi-turn testing lets you verify your agent handles complete conversation flows correctly.

## Creating Your First Multi-Turn Test

Here's a basic multi-turn test case for a booking agent:

```typescript
import {
  createEvalSuite,
  fieldEquals,
  afterTurns,
  type MultiTurnTestCase,
} from '@agtlantis/eval'

// Define your types
interface BookingInput {
  message: string
}

interface BookingOutput {
  reply: string
  booking: {
    status: 'pending' | 'confirmed' | 'cancelled'
    date?: string
    guests?: number
    name?: string
  }
}

// Create a multi-turn test case
const testCase: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'complete-booking-flow',
  description: 'Test the complete booking conversation',

  // First turn input
  input: { message: 'I want to make a reservation' },

  multiTurn: {
    // Follow-up inputs for subsequent turns
    followUpInputs: [
      {
        input: { message: 'Tomorrow at 7pm' },
        description: 'Provide date and time',
      },
      {
        input: { message: '4 people' },
        description: 'Provide party size',
      },
      {
        input: { message: 'John Smith' },
        description: 'Provide name',
      },
      {
        input: { message: 'Yes, please confirm' },
        description: 'Confirm booking',
      },
    ],

    // When to stop the conversation
    terminateWhen: [
      fieldEquals('booking.status', 'confirmed'),
      afterTurns(10),  // Safety limit
    ],

    // Pass/fail outcomes
    onConditionMet: 'pass',      // Pass if a condition is met
    onMaxTurnsReached: 'fail',   // Fail if max turns reached without condition
  },
}
```

## Using Termination Conditions

Termination conditions control when a multi-turn conversation ends. Conditions are evaluated using **OR logic** - the conversation ends when **any** condition is satisfied.

### Basic Conditions

**Stop after N turns:**

```typescript
import { afterTurns } from '@agtlantis/eval'

afterTurns(5)   // Stop after 5 turns
afterTurns(10)  // Stop after 10 turns
```

Use this as a safety limit to prevent infinite conversations.

**Stop when a field equals a value:**

```typescript
import { fieldEquals } from '@agtlantis/eval'

// Check nested fields using dot notation
fieldEquals('booking.status', 'confirmed')
fieldEquals('task.completed', true)
fieldEquals('response.type', 'final')
```

**Stop when a field is set:**

```typescript
import { fieldIsSet } from '@agtlantis/eval'

fieldIsSet('booking.confirmationNumber')
fieldIsSet('response.result')
```

### Combining Conditions

You can combine conditions for more complex logic.

**AND - all conditions must be true:**

```typescript
import { and, fieldEquals, fieldIsSet } from '@agtlantis/eval'

// Booking is complete when status is confirmed AND we have a confirmation number
and(
  fieldEquals('booking.status', 'confirmed'),
  fieldIsSet('booking.confirmationNumber')
)
```

**OR - any condition can be true:**

```typescript
import { or, fieldEquals, afterTurns } from '@agtlantis/eval'

// End when confirmed, cancelled, OR after 10 turns
or(
  fieldEquals('status', 'confirmed'),
  fieldEquals('status', 'cancelled'),
  afterTurns(10)
)
```

**NOT - negate a condition:**

```typescript
import { not, fieldIsSet } from '@agtlantis/eval'

// Continue as long as there's no error
not(fieldIsSet('error'))
```

### Complex Example

```typescript
// End conversation when:
// (booking is confirmed AND paid) OR (booking is cancelled) OR (reached 15 turns)
const terminateWhen = [
  or(
    and(
      fieldEquals('booking.status', 'confirmed'),
      fieldEquals('payment.status', 'completed')
    ),
    fieldEquals('booking.status', 'cancelled')
  ),
  afterTurns(15),
]
```

### Natural Language Conditions

For complex scenarios, use an LLM to evaluate termination based on conversation context:

```typescript
import { naturalLanguage } from '@agtlantis/eval'

naturalLanguage({
  provider: openai,
  prompt: 'Has the customer successfully completed their restaurant booking?',
  threshold: 0.8,  // Confidence threshold (default: 0.7)
})
```

The LLM returns a confidence score (0-1), and the condition is met when confidence >= threshold.

## Dynamic Follow-Up Inputs

Instead of static inputs, you can generate follow-ups based on the conversation:

```typescript
const testCase: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'dynamic-booking',
  input: { message: 'I need a reservation' },

  multiTurn: {
    followUpInputs: [
      {
        // Dynamic input based on agent's response
        input: (ctx) => {
          const lastOutput = ctx.lastOutput as BookingOutput

          // Check what information the agent is asking for
          if (lastOutput.reply.includes('date')) {
            return { message: 'Next Friday evening' }
          }
          if (lastOutput.reply.includes('guests') || lastOutput.reply.includes('people')) {
            return { message: '4 guests' }
          }
          if (lastOutput.reply.includes('name')) {
            return { message: 'John Smith' }
          }
          if (lastOutput.reply.includes('confirm')) {
            return { message: 'Yes, confirm it' }
          }

          return { message: 'Continue please' }
        },
        description: 'Dynamic response based on agent question',
      },
    ],

    terminateWhen: [
      fieldEquals('booking.status', 'confirmed'),
      afterTurns(10),
    ],
  },
}
```

### Understanding the Context Object

The context object provides access to conversation history:

```typescript
interface ConversationContext<TInput, TOutput> {
  currentTurn: number           // Current turn number (1-indexed)
  history: Array<{              // All previous turns
    turn: number                // Turn number
    input: TInput
    output: TOutput | undefined
    metadata?: AgentMetadata    // Optional agent metadata
  }>
  lastOutput?: TOutput          // Most recent output (optional)
}
```

## AI Simulated Users

For the most realistic testing, let AI play the user role.

### Basic AI User

```typescript
import { aiUser, type MultiTurnTestCase } from '@agtlantis/eval'

const testCase: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'ai-customer-booking',
  input: { message: 'Hello, I want to book a table' },

  multiTurn: {
    followUpInputs: [
      {
        input: aiUser({
          provider: openai,

          // Describe the AI user's persona
          systemPrompt: `You are a customer making a restaurant reservation.
            - Respond naturally to the agent's questions
            - Provide realistic information (dates, party size, name)
            - Be polite but direct`,

          // Convert conversation history to a string for the AI
          formatHistory: (ctx) =>
            ctx.history
              .map(h => `Agent: ${h.output.reply}`)
              .join('\n'),

          // Convert AI response back to agent input format
          buildInput: (response, ctx) => ({
            message: response,
          }),
        }),
        description: 'AI simulated customer',
        turns: Infinity,  // Use until termination condition
      },
    ],

    terminateWhen: [
      fieldEquals('booking.status', 'confirmed'),
      afterTurns(10),
    ],
  },
}
```

### Understanding the `turns` Option

The `turns` option controls how many times a follow-up input is used:

| Value | Behavior |
|-------|----------|
| `undefined` or `1` | Use once (default) |
| `N` (number) | Use exactly N times |
| `Infinity` | Use until termination |

```typescript
followUpInputs: [
  // Static input used once (turn 2)
  { input: { message: 'Start' } },

  // AI user for 3 turns (turns 3, 4, 5)
  { input: aiUser({...}), turns: 3 },

  // AI user until termination (turns 6+)
  { input: aiUser({...}), turns: Infinity },
]
```

**Important:** `turns: Infinity` should be the last item - items after it will never be used.

### Creating User Personas

Create different user types to test various scenarios:

```typescript
// Friendly, cooperative customer
const friendlyUserPrompt = `You are a friendly, cooperative customer.
- Answer questions clearly and completely
- Use polite, positive language
- Don't create unnecessary complications`

// Rushed, impatient customer
const rushedUserPrompt = `You are a rushed customer in a hurry.
- Give short, direct answers
- Provide multiple pieces of information at once
- Express mild impatience if asked too many questions`

// Difficult, demanding customer
const difficultUserPrompt = `You are a demanding customer.
- Ask for clarification frequently
- Request changes to previous answers
- Express dissatisfaction occasionally
- Eventually provide all needed information`
```

### Dynamic Personas

Change user behavior during the conversation:

```typescript
aiUser({
  provider: openai,
  systemPrompt: (ctx) => {
    const turn = ctx.currentTurn

    if (turn <= 2) {
      return 'You are patient and friendly.'
    } else if (turn <= 5) {
      return 'You are becoming slightly impatient. Answers are shorter.'
    } else {
      return 'You are very rushed. Give minimal answers, express urgency.'
    }
  },
  formatHistory,
  buildInput,
})
```

### Including Conversation History

For stateless agents, you may need to include history in inputs:

```typescript
interface BookingInput {
  message: string
  conversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}

// Format history for AI user (what to show the simulated user)
function formatHistory(ctx: ConversationContext<BookingInput, BookingOutput>): string {
  return ctx.history
    .map(h => `Agent: ${h.output.reply}`)
    .join('\n')
}

// Build input including history (what to send to agent)
function buildInputWithHistory(
  message: string,
  ctx: ConversationContext<BookingInput, BookingOutput>
): BookingInput {
  const conversationHistory = ctx.history.flatMap(h => [
    { role: 'user' as const, content: h.input.message },
    { role: 'assistant' as const, content: h.output.reply },
  ])

  return {
    message,
    conversationHistory,
  }
}

// Use in aiUser
aiUser({
  provider: openai,
  systemPrompt: friendlyUserPrompt,
  formatHistory,
  buildInput: (response, ctx) => buildInputWithHistory(response, ctx),
})
```

## Running Multi-Turn Tests

### With EvalSuite

Multi-turn test cases work seamlessly with regular test cases:

```typescript
const suite = createEvalSuite({
  agent: bookingAgent,
  judge,
  agentDescription: 'Restaurant booking assistant',
})

// Mix single-turn and multi-turn tests
const testCases = [
  // Single-turn
  { id: 'greeting', input: { message: 'Hello' } },

  // Multi-turn
  {
    id: 'full-booking',
    input: { message: 'Book a table' },
    multiTurn: {
      followUpInputs: [...],
      terminateWhen: [...],
    },
  },
]

const report = await suite.run(testCases, {
  concurrency: 2,
  iterations: 3,  // Run each test 3 times
})
```

### With Iterations

For statistical reliability, combine multi-turn with iterations:

```typescript
const report = await suite.run(multiTurnTests, {
  iterations: 5,
})

// Multi-turn specific statistics (using discriminated union)
for (const result of report.results) {
  if (result.kind === 'multi-turn-iterated') {
    console.log(`Test: ${result.testCase.id}`)
    console.log(`  Avg Turns: ${result.multiTurnIterationStats.avgTurns}`)
    console.log(`  Min/Max Turns: ${result.multiTurnIterationStats.minTurns} / ${result.multiTurnIterationStats.maxTurns}`)
    console.log(`  Termination Distribution:`)
    for (const [reason, count] of Object.entries(result.multiTurnIterationStats.terminationCounts)) {
      console.log(`    ${reason}: ${count}`)
    }
  }
}
```

## Best Practices

### 1. Always Set a maxTurns Safety Limit

```typescript
terminateWhen: [
  fieldEquals('status', 'done'),
  afterTurns(20),  // Safety limit prevents infinite loops
]
```

### 2. Use Descriptive Follow-Up Descriptions

```typescript
followUpInputs: [
  { input: { message: '4 guests' }, description: 'Provide party size' },
  { input: { message: 'Friday 7pm' }, description: 'Provide date and time' },
]
```

Descriptions appear in reports and help debug failing tests.

### 3. Test Both Success and Failure Paths

```typescript
// Success path
{
  id: 'successful-booking',
  onConditionMet: 'pass',
  onMaxTurnsReached: 'fail',
}

// Expected failure (e.g., invalid date)
{
  id: 'booking-with-invalid-date',
  input: { message: 'Book for February 30th' },
  onConditionMet: 'fail',  // If somehow accepted, that's wrong
  onMaxTurnsReached: 'pass',  // Expected to never complete
}
```

### 4. Keep AI User Prompts Focused

```typescript
// Good: Specific, focused instructions
const goodPrompt = `You are making a restaurant reservation.
- Provide your name: John Smith
- Party size: 4 people
- Preferred date: Next Friday
- Preferred time: 7pm`

// Avoid: Too vague or complex
const vaguePrompt = `Act like a customer and do whatever seems natural.`
```

### 5. Handle State in Your Agent

For multi-turn conversations, your agent needs to track state:

```typescript
// Option A: Include history in each input
interface Input {
  message: string
  conversationHistory: Message[]
}

// Option B: Use session IDs
interface Input {
  sessionId: string
  message: string
}
```

## Complete Example

Here's a full working example bringing everything together:

```typescript
import {
  createEvalSuite,
  createJudge,
  accuracy,
  relevance,
  aiUser,
  fieldEquals,
  afterTurns,
  reportToMarkdown,
  type MultiTurnTestCase,
  type ConversationContext,
} from '@agtlantis/eval'
import { createOpenAIProvider } from '@agtlantis/core'

// Types
interface BookingInput {
  message: string
  history?: { role: 'user' | 'assistant'; content: string }[]
}

interface BookingOutput {
  reply: string
  booking: {
    status: 'pending' | 'confirmed'
    date?: string
    guests?: number
    name?: string
  }
}

// Setup
const openai = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  defaultModel: 'gpt-4o-mini',
})

const judge = createJudge({
  provider: openai,
  criteria: [
    accuracy({ weight: 2 }),
    relevance(),
    {
      id: 'conversation-quality',
      name: 'Conversation Quality',
      description: 'Agent maintains natural, helpful dialogue',
    },
  ],
  passThreshold: 75,
})

// AI User helpers
function formatHistory(ctx: ConversationContext<BookingInput, BookingOutput>) {
  return ctx.history.map(h => `Agent: ${h.output.reply}`).join('\n')
}

function buildInput(response: string, ctx: ConversationContext<BookingInput, BookingOutput>) {
  return {
    message: response,
    history: ctx.history.flatMap(h => [
      { role: 'user' as const, content: h.input.message },
      { role: 'assistant' as const, content: h.output.reply },
    ]),
  }
}

// Test cases
const testCases: MultiTurnTestCase<BookingInput, BookingOutput>[] = [
  {
    id: 'friendly-customer-booking',
    description: 'Friendly customer completes booking',
    input: { message: 'Hi, I want to book a table for dinner' },
    multiTurn: {
      followUpInputs: [
        {
          input: aiUser({
            provider: openai,
            systemPrompt: `You are a friendly customer making a reservation.
              - Be polite and cooperative
              - Provide: name (John Smith), party size (4), date (Friday), time (7pm)
              - Confirm when asked`,
            formatHistory,
            buildInput,
          }),
          turns: Infinity,
        },
      ],
      terminateWhen: [
        fieldEquals('booking.status', 'confirmed'),
        afterTurns(10),
      ],
      onConditionMet: 'pass',
      onMaxTurnsReached: 'fail',
    },
  },
  {
    id: 'rushed-customer-booking',
    description: 'Rushed customer gives info quickly',
    input: { message: 'Book table, Friday 7pm, 4 people, name Smith' },
    multiTurn: {
      followUpInputs: [
        {
          input: aiUser({
            provider: openai,
            systemPrompt: `You are in a hurry.
              - Give short, direct answers
              - Confirm immediately when asked`,
            formatHistory,
            buildInput,
          }),
          turns: Infinity,
        },
      ],
      terminateWhen: [
        fieldEquals('booking.status', 'confirmed'),
        afterTurns(5),  // Should be quick
      ],
      onConditionMet: 'pass',
      onMaxTurnsReached: 'fail',
    },
  },
]

// Run
const suite = createEvalSuite({
  agent: bookingAgent,
  judge,
  agentDescription: 'Restaurant table booking assistant',
})

const report = await suite.run(testCases, {
  iterations: 3,
  concurrency: 1,
})

console.log(reportToMarkdown(report))
```

## Troubleshooting

### Test Never Terminates

- Check termination conditions are reachable
- Add `afterTurns()` as a safety limit
- Verify field paths match actual output structure

### AI User Gives Unexpected Responses

- Make system prompt more specific
- Include example responses in the prompt
- Use lower temperature for consistency

### High Token Usage

- AI users require extra LLM calls
- Reduce `turns` where possible
- Use cheaper models for AI users

### Inconsistent Results

- Use `iterations` for statistical reliability
- Check for state leakage between tests
- Make AI user prompts more deterministic

## See Also

- [Multi-Turn API Reference](../api/multi-turn.md) - Complete API documentation for multi-turn testing
- [CLI Guide](./cli-guide.md) - Multi-turn testing via CLI
- [Quick Start Guide](./quick-start.md) - Basic evaluation setup
