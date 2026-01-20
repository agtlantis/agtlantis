# @agtlantis/eval Examples

Examples demonstrating how to use the `@agtlantis/eval` library.

---

## Q&A Agent Evaluation Example

An end-to-end example of creating and evaluating a simple Q&A Agent.

### File Structure

```
examples/
├── qa-agent/
│   ├── types.ts      # Input/Output type definitions
│   ├── prompt.ts     # AgentPrompt definition
│   └── agent.ts      # EvalAgent implementation
├── eval-qa-agent.ts  # Evaluation script
└── README.md         # This file
```

### How to Run

1. **Set up environment variables**

Create a `.env` file in the `packages/agent-eval/` directory:

```bash
# Navigate to the packages/agent-eval/ directory
cd packages/agent-eval

# Copy .env.example to create .env
cp .env.example .env

# Open .env and set your actual API key
# OPENAI_API_KEY=sk-xxx
```

2. **Run the example**

```bash
pnpm --filter @agtlantis/eval example:qa
```

### Expected Output

```
🧪 Q&A Agent Evaluation Starting...
   Test Cases: 4
   Model: gpt-4o-mini

# Evaluation Report

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 4 |
| Passed | 4 (100%) |
| Failed | 0 |
| Average Score | 87.5 |

...

📊 Summary
   Total Tests: 4
   Passed: 4 (100%)
   Failed: 0
   Average Score: 87.5
   Total Tokens: 1234
   Average Latency: 450ms
```

---

## Example Components

### 1. Agent Implementation (`qa-agent/agent.ts`)

```typescript
import { createQAAgent } from './qa-agent/agent'

const qaAgent = createQAAgent(provider)
const result = await qaAgent.execute({ question: 'What is the capital of Korea?' })
// { answer: 'Seoul', confidence: 'high' }
```

### 2. Judge Setup

```typescript
import { createJudge, accuracy, relevance, defaultJudgePrompt } from '@agtlantis/eval'
import { createOpenAIProvider } from '@agtlantis/core'

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
})

const judge = createJudge({
  provider,
  prompt: defaultJudgePrompt,
  criteria: [
    accuracy({ weight: 2 }),  // Accuracy (2x weight)
    relevance(),              // Relevance
    { id: 'conciseness', name: 'Conciseness', ... }  // Custom
  ],
  passThreshold: 70,
})
```

### 3. Improver Setup

```typescript
import { createImprover, defaultImproverPrompt } from '@agtlantis/eval'

const improver = createImprover({
  provider,
  prompt: defaultImproverPrompt,
})
```

### 4. Suite Execution

```typescript
const suite = createEvalSuite({ agent: qaAgent, judge, improver })
const report = await suite.run(testCases, { concurrency: 2 })
console.log(reportToMarkdown(report))
```

---

## Test Cases

| ID | Question | Tags |
|----|----------|------|
| `capital-korea` | What is the capital of Korea? | factual, geography |
| `math-simple` | What is 1+1? | factual, math |
| `context-based` | (Context-based) What is the protagonist's name? | context, comprehension |
| `reasoning` | If today is Monday, what day is the day after tomorrow? | reasoning, logic |

---

## Evaluation Criteria

| Criterion | Description | Weight |
|-----------|-------------|--------|
| accuracy | Is the answer factually correct? | 2 |
| relevance | Is the answer relevant to the question? | 1 |
| conciseness | Is the answer concise and to the point? | 1 |

---

## Cost Reference

Estimated costs using `gpt-4o-mini`:
- Per test case: ~$0.001
- All 4 tests: ~$0.01

> Actual costs may vary depending on response length.

---

## Multi-turn Booking Agent Evaluation Example

An example of creating and evaluating a multi-turn conversational booking agent.

### File Structure

```
examples/
├── multi-turn-agent/
│   ├── types.ts              # BookingInput/Output type definitions
│   ├── prompt.ts             # Conversational AgentPrompt definition
│   └── agent.ts              # EvalAgent implementation
├── eval-multi-turn.ts        # Multi-turn evaluation script
└── README.md                 # This file
```

### How to Run

```bash
# Set up environment variables (skip if .env already exists)
cd packages/agent-eval
cp .env.example .env
# Set OPENAI_API_KEY in .env

# Run the example
pnpm --filter @agtlantis/eval example:multi-turn
```

### Expected Output

```
🧪 Multi-turn Booking Agent Evaluation
============================================================
   Test Cases: 4
   Model: gpt-4o-mini

📝 Running: complete-booking-flow
   Complete booking with all required information
------------------------------------------------------------

   💬 Conversation:
      Turn 1:
        User: I'd like to make a reservation for tomorrow at 7 PM.
        Agent: Sure, I can help you with that. How many people will be dining?...
        Status: pending
      Turn 2:
        User: 4 people. My name is John Smith.
        ...

   📊 Result:
      Total Turns: 4
      Termination: Field 'booking.status' set to 'confirmed'
      Score: 92.5
      Passed: ✅

...

📊 Summary
============================================================
   Total Tests: 4
   Passed: 3 (75%)
   Failed: 1
   Average Score: 85.2
   Total Tokens: 3456
   Average Latency: 2500ms
```

### Test Scenarios

| ID | Description | Termination Condition |
|----|-------------|----------------------|
| `complete-booking-flow` | Complete booking flow | `booking.status === 'confirmed'` |
| `dynamic-followup` | Dynamic follow-up input | `booking.status === 'confirmed'` |
| `quick-booking` | All information provided at once | `booking.status === 'confirmed'` |
| `max-turns-reached` | maxTurns reached test | maxTurns (expected to fail) |

---

## Multi-turn Key Concepts

### 1. MultiTurnTestCase Structure

```typescript
const testCase: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'booking-test',
  input: { message: 'I want to make a reservation.' },  // First turn

  multiTurn: {
    // Inputs from the 2nd turn onwards
    followUpInputs: [
      { input: { message: '4 people.' }, description: 'Party size' },
      { input: { message: 'John Smith.' }, description: 'Name' },
    ],

    // Termination conditions (OR relationship)
    terminateWhen: [
      { type: 'fieldValue', fieldPath: 'booking.status', expectedValue: 'confirmed' },
    ],

    maxTurns: 10,
    onConditionMet: 'pass',
    onMaxTurnsReached: 'fail',
  },
}
```

### 2. Dynamic Follow-up Inputs

Determine the next input based on previous output:

```typescript
followUpInputs: [
  {
    input: (ctx) => {
      const lastOutput = ctx.lastOutput as BookingOutput
      if (lastOutput?.missingFields?.includes('name')) {
        return { message: 'My name is John Doe.' }
      }
      return { message: 'Please proceed.' }
    },
  },
]
```

### 3. Termination Conditions

| Condition Type | Description | Example |
|----------------|-------------|---------|
| `maxTurns` | Maximum number of turns | `{ type: 'maxTurns', count: 5 }` |
| `fieldSet` | Specific field is set | `{ type: 'fieldSet', fieldPath: 'booking.status' }` |
| `custom` | Custom function | `{ type: 'custom', check: (ctx) => ... }` |

### 4. Composite Conditions (Factory Functions)

```typescript
import { and, or, not, fieldIsSet, naturalLanguage } from '@agtlantis/eval'

// (confirmed AND paid) OR cancelled
const bookingComplete = or(
  and(
    fieldIsSet('confirmed'),
    fieldIsSet('paid')
  ),
  fieldIsSet('cancelled')
)

// LLM-based termination condition
const nlCondition = naturalLanguage({
  provider,
  prompt: 'Did the user confirm the reservation?',
})
```

---

## Evaluation Criteria

| Criterion | Description | Weight |
|-----------|-------------|--------|
| accuracy | Accuracy of information collection | 2 |
| relevance | Response relevance | 1 |
| conversation-flow | Natural conversation flow | 2 |
| booking-completeness | Required information collection | 2 |

---

## Cost Reference

Estimated costs using `gpt-4o-mini`:
- Per test (average 4 turns): ~$0.004
- All 4 tests: ~$0.02

> Multi-turn tests scale with the number of turns.

---

## AI Simulated User Evaluation Example

A multi-turn conversation test example where AI plays the user role.
You can use the `aiUser()` factory function to simulate AI customers with various personas.

### File Structure

```
examples/
├── multi-turn-agent/         # Reuses existing Booking Agent
│   ├── types.ts
│   ├── prompt.ts
│   └── agent.ts
├── eval-ai-user.ts           # AI User E2E evaluation script
└── README.md                 # This file
```

### How to Run

```bash
# Set up environment variables (skip if .env already exists)
cd packages/agent-eval
cp .env.example .env
# Set OPENAI_API_KEY in .env

# Run the example
pnpm --filter @agtlantis/eval example:ai-user
```

### Expected Output

```
🤖 AI Simulated User E2E Test
============================================================
   Test Cases: 4
   Model: gpt-4o-mini

📝 Running: ai-friendly-customer
   AI simulates a friendly customer completing a booking
------------------------------------------------------------

   💬 Conversation:
      Turn 1:
        🧑 Customer: Hello, I'd like to make a reservation.
        🤖 Agent: Hello! I'd be happy to help you with a reservation...
        📋 Status: pending
      Turn 2:
        🧑 Customer: I'd like to book for next Friday...
        ...

   📊 Result:
      Total Turns: 4
      Termination: Field "booking.status" equals expected value
      Score: 91.4
      Passed: ✅

...

📊 Summary
============================================================
   Total Tests: 4
   Passed: 3 (75%)
   Failed: 1
   Average Score: 87.1
   Total Tokens: 16056
   Average Latency: 16108ms
```

### AI Personas

| Persona | Characteristics | Conversation Pattern |
|---------|-----------------|---------------------|
| **Friendly** | Kind and cooperative | Clear information, positive tone |
| **Rushed** | In a hurry, efficient | Multiple info at once, brief responses |
| **Unhappy** | Dissatisfied and demanding | Complaints before info, many confirmations |
| **Dynamic** | Changes per turn | friendly → rushed → urgent transition |

---

## AI User Key Concepts

### 1. aiUser() Factory Function + turns Option

You can use the `turns` option to handle multiple turns with a single `aiUser()`:

```typescript
import { aiUser } from '@agtlantis/eval'
import { createOpenAIProvider } from '@agtlantis/core'

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
})

const testCase: MultiTurnTestCase<BookingInput, BookingOutput> = {
  id: 'ai-booking',
  input: { message: 'I want to make a reservation.' },
  multiTurn: {
    followUpInputs: [
      {
        input: aiUser({
          provider,
          systemPrompt: 'You are a friendly customer.',
          formatHistory: formatBookingHistory,
          buildInput: (response, ctx) => buildInputWithHistory(response, ctx),
        }),
        description: 'AI friendly customer',
        turns: Infinity,  // Continue until termination (maxTurns is the safety limit)
      },
    ],
    terminateWhen: [
      { type: 'fieldValue', fieldPath: 'booking.status', expectedValue: 'confirmed' },
    ],
    maxTurns: 8,
  },
}
```

### 2. turns Option Usage

| Value | Behavior |
|-------|----------|
| `undefined` or `1` | Single use (default) |
| `N` (number) | Repeat exactly N times |
| `Infinity` | Continue until termination (maxTurns is the safety limit) |

```typescript
// Fixed count: repeat 5 times
{ input: aiUser({...}), turns: 5 }

// Infinite mode: continue until termination
{ input: aiUser({...}), turns: Infinity }

// Mixed usage
followUpInputs: [
  { input: { message: 'Start' } },           // 1 time (turn 2)
  { input: aiUser({...}), turns: 3 },        // 3 times (turns 3,4,5)
  { input: aiUser({...}), turns: Infinity }, // Until termination (must be last!)
]
```

> **Warning**: `turns: Infinity` must be the last item. Any items after it will never execute.

### 3. Persona System Prompt

```typescript
const friendlyCustomerPrompt = `You are a friendly and cooperative customer.

Behavior guidelines:
- Answer the staff's questions clearly and specifically
- Maintain a polite and positive tone
- Provide required information (date, time, party size, name, phone) naturally, one or two at a time

Response format:
- Output only the customer's words
- Respond in English`
```

### 4. Dynamic Persona (Changes per Turn)

```typescript
{
  input: aiUser({
    provider,
    systemPrompt: (ctx) => {
      if (ctx.currentTurn <= 2) return 'You are a friendly customer.'
      else if (ctx.currentTurn <= 4) return 'You are now in a hurry.'
      else return 'You are very rushed.'
    },
    buildInput: (response, ctx) => buildInputWithHistory(response, ctx),
  }),
}
```

### 5. Custom History Formatter

```typescript
function formatBookingHistory(ctx: ConversationContext<BookingInput, BookingOutput>): string {
  return ctx.history
    .map(h => {
      const input = h.input as BookingInput
      const output = h.output as BookingOutput
      return `Customer: ${input.message}\nStaff: ${output.reply}\n[Status: ${output.booking?.status}]`
    })
    .join('\n---\n')
}
```

---

## Cost Reference

Estimated costs using `gpt-4o-mini`:
- AI User generation: ~$0.001/turn
- Agent execution: ~$0.001/turn
- Per test average: ~$0.008 (4 turns)
- All 4 tests: ~$0.05

> AI User tests require approximately 2x the LLM calls compared to regular multi-turn tests.

---

## Full Pipeline E2E Example

A complete pipeline example including Multi-turn + aiUser + Reporter + Improver.

### File Structure

```
examples/
├── multi-turn-agent/         # Reuses Booking Agent
├── eval-full-pipeline.ts     # Full pipeline example
├── reports/                  # Generated report directory
└── README.md
```

### How to Run

```bash
# Set up environment variables (skip if .env already exists)
cd packages/agent-eval
cp .env.example .env
# Set OPENAI_API_KEY in .env

# Run the example
pnpm --filter @agtlantis/eval example:full-pipeline
```

### Pipeline Steps

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│  Multi-turn    │────▶│   LLM Judge    │────▶│   Reporter     │
│  + aiUser      │     │   Evaluation   │     │   (Markdown)   │
└────────────────┘     └────────────────┘     └────────────────┘
                              │
                              ▼
                       ┌────────────────┐
                       │   Improver     │
                       │ (Suggestions)  │
                       └────────────────┘
```

### Expected Output

```
======================================================================
  Full Pipeline E2E Test: Multi-turn + aiUser + Reporter + Improver
======================================================================

Step 1: Executing Multi-turn Tests with AI Users
----------------------------------------------------------------------
  Running: friendly-customer-booking
  AI simulates a friendly customer completing a booking

  Conversation (4 turns):
    [1] Customer: Hello, I'd like to make a reservation....
        Agent: Hello! I'd be happy to help you...
    ...

  Result: PASSED (Score: 91.2)
  Termination: Field 'booking.status' set to 'confirmed'

Step 2: Generating Evaluation Report
----------------------------------------------------------------------

Step 3: Getting Improvement Suggestions
----------------------------------------------------------------------
  Received 2 suggestions:
  [HIGH] system_prompt
  Reasoning: Confirmation message should be clearer after booking...
  Expected: 5-10% improvement in booking confirmation rate...

Step 4: Building Final Report
----------------------------------------------------------------------
  Report saved to: ./examples/reports/full-pipeline-report.md

======================================================================
  Final Summary
======================================================================
  Tests:        2
  Passed:       2 (100%)
  Failed:       0
  Avg Score:    88.5
  Total Tokens: 12345
  Avg Latency:  3500ms
  Suggestions:  2

Pipeline completed!
```

### Key Components

| Component | Role |
|-----------|------|
| **aiUser** | AI plays the customer role (persona-based) |
| **Judge** | LLM-as-Judge evaluates conversation quality |
| **Reporter** | Generates and saves Markdown reports |
| **Improver** | Generates prompt improvement suggestions |

### Cost Reference

Estimated costs using `gpt-4o-mini`:
- 2 tests, each ~5 turns: ~$0.02
- Judge evaluation: ~$0.01
- Improver suggestions: ~$0.01
- Total: ~$0.05
