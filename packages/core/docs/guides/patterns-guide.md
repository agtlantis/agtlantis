# Patterns Guide

> Build structured streaming workflows with reusable execution patterns.

## Table of contents

- [Overview](#overview)
- [Quick start](#quick-start)
- [Basic usage](#basic-usage)
  - [Understanding the progressive pattern](#understanding-the-progressive-pattern)
  - [Defining schemas](#defining-schemas)
  - [Executing patterns](#executing-patterns)
  - [Handling events](#handling-events)
- [Advanced usage](#advanced-usage)
  - [Fine-grained control with sessions](#fine-grained-control-with-sessions)
  - [Discriminated union schemas](#discriminated-union-schemas)
  - [Custom tools integration](#custom-tools-integration)
- [Best practices](#best-practices)
  - [Schema design tips](#schema-design-tips)
  - [Handling progress events](#handling-progress-events)
  - [Error handling](#error-handling)
  - [System prompt tips](#system-prompt-tips)
- [See also](#see-also)

---

## Overview

Patterns are reusable execution strategies that solve common LLM workflow challenges. Instead of writing boilerplate for streaming, validation, and event handling, you define a pattern once and use it across your application.

The **Progressive Pattern** is the flagship pattern in @agtlantis/core. It enables you to stream progress updates during long-running LLM tasks, followed by a final structured result. This is perfect for document analysis, multi-step reasoning, and any workflow where users benefit from seeing intermediate progress.

Under the hood, the Progressive Pattern uses Tool Calling to guarantee structured JSON output through the Vercel AI SDK. You define your schemas with Zod, and the pattern handles all the streaming complexity for you.

## Quick Start

Here's the fastest way to get started with the Progressive Pattern:

```typescript
import { z } from 'zod';
import { createGoogleProvider, defineProgressivePattern } from '@agtlantis/core';

// 1. Define your schemas
const progressSchema = z.object({
  status: z.string(),
  message: z.string(),
});

const resultSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
});

// 2. Create the pattern
const pattern = defineProgressivePattern({
  progressSchema,
  resultSchema,
});

// 3. Create a provider
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

// 4. Execute and consume events
for await (const event of pattern.run(provider, {
  system: 'You are a helpful assistant. Report your progress before answering.',
  prompt: 'What is 2 + 2?',
})) {
  if (event.type === 'progress') {
    console.log('Progress:', event.data);
    // { status: "thinking", message: "Calculating..." }
  } else if (event.type === 'complete') {
    console.log('Result:', event.data);
    // { answer: "4", confidence: 0.99 }
  }
}
```

## Basic Usage

### Understanding the Progressive Pattern

The Progressive Pattern works by creating two internal tools that the LLM calls:

1. **reportProgress** - Called 0-3 times to emit progress events
2. **submitResult** - Called exactly once to emit the final result

This approach has several advantages over text-based streaming:

- **Guaranteed structure** - The Vercel AI SDK validates JSON through Tool Calling
- **Type safety** - Your Zod schemas provide full TypeScript inference
- **Clean separation** - Progress and results have different schemas
- **Reliable completion** - The pattern ensures a result is always returned

### Defining Schemas

You define two Zod schemas: one for progress events and one for the final result.

```typescript
import { z } from 'zod';

// Progress schema - what you want to show during execution
const progressSchema = z.object({
  status: z.string(),
  message: z.string(),
});

// Result schema - the final output
const resultSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
});
```

The schemas can be as simple or complex as your use case requires. The LLM sees these schemas and structures its output accordingly.

### Executing Patterns

The simplest way to execute a pattern is with `pattern.run()`:

```typescript
import { z } from 'zod';
import { createGoogleProvider, defineProgressivePattern } from '@agtlantis/core';

const progressSchema = z.object({
  step: z.number(),
  description: z.string(),
});

const resultSchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
});

const pattern = defineProgressivePattern({ progressSchema, resultSchema });

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

for await (const event of pattern.run(provider, {
  system: 'You are a document summarizer. Report your progress as you work.',
  prompt: 'Summarize the benefits of TypeScript.',
})) {
  console.log(event.type, event.data);
}
```

### Handling Events

Each event has a `type` property that tells you what kind of event it is:

```typescript
import { z } from 'zod';
import { createGoogleProvider, defineProgressivePattern } from '@agtlantis/core';

const progressSchema = z.object({
  status: z.string(),
  message: z.string(),
});

const resultSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
});

const pattern = defineProgressivePattern({ progressSchema, resultSchema });

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

const progressUpdates: Array<{ status: string; message: string }> = [];
let finalResult: { answer: string; confidence: number } | null = null;

for await (const event of pattern.run(provider, {
  system: 'You are a helpful assistant.',
  prompt: 'What is the capital of France?',
})) {
  if (event.type === 'progress') {
    // Progress events contain intermediate updates
    progressUpdates.push(event.data);
    console.log(`[${event.data.status}] ${event.data.message}`);
  } else if (event.type === 'complete') {
    // Complete event contains the final result
    finalResult = event.data;
    console.log('Answer:', event.data.answer);
    console.log('Confidence:', event.data.confidence);
  }
}
```

Both event types also include `metrics` with timing and usage information:

```typescript
for await (const event of pattern.run(provider, options)) {
  console.log('Metrics:', event.metrics);
  // { timestamp: 1705123456789, elapsedMs: 150, deltaMs: 50 }
}
```

## Advanced Usage

### Fine-Grained Control with Sessions

For more control over the streaming session, use `pattern.runInSession()` inside `provider.streamingExecution()`:

```typescript
import { z } from 'zod';
import { createGoogleProvider, defineProgressivePattern } from '@agtlantis/core';

const progressSchema = z.object({
  status: z.string(),
  message: z.string(),
});

const resultSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
});

type Progress = z.infer<typeof progressSchema>;
type Result = z.infer<typeof resultSchema>;

const pattern = defineProgressivePattern({ progressSchema, resultSchema });

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

const execution = provider.streamingExecution<
  { type: 'progress'; data: Progress; metrics: any },
  Result
>(async function* (session) {
  // You have full access to the session here
  // You can do pre-processing, logging, etc.

  yield* pattern.runInSession(session, {
    system: 'You are a helpful assistant.',
    messages: [
      { role: 'user', content: 'What is 2 + 2?' },
    ],
    maxTokens: 2000,
  });

  // You can also do post-processing here
});

for await (const event of execution) {
  console.log(event.type, event.data);
}
```

This approach is useful when you need to:
- Use `messages` array instead of `prompt`
- Chain multiple patterns in sequence
- Access the session for custom logic
- Configure advanced options like `maxTokens`

### Discriminated Union Schemas

For multi-phase workflows where each phase has different data, use Zod's `discriminatedUnion`:

```typescript
import { z } from 'zod';
import { createGoogleProvider, defineProgressivePattern } from '@agtlantis/core';

// Each phase has different fields
const progressSchema = z.discriminatedUnion('phase', [
  z.object({
    phase: z.literal('scanning'),
    currentPage: z.number(),
    totalPages: z.number(),
  }),
  z.object({
    phase: z.literal('extracting'),
    entityType: z.enum(['person', 'organization', 'date']),
    entities: z.array(z.string()),
  }),
  z.object({
    phase: z.literal('analyzing'),
    finding: z.string(),
    importance: z.enum(['low', 'medium', 'high']),
  }),
]);

const resultSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyEntities: z.object({
    people: z.array(z.string()),
    organizations: z.array(z.string()),
  }),
  findings: z.array(z.object({
    description: z.string(),
    importance: z.enum(['low', 'medium', 'high']),
  })),
});

type Progress = z.infer<typeof progressSchema>;
type Result = z.infer<typeof resultSchema>;

const pattern = defineProgressivePattern({ progressSchema, resultSchema });

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

// Track progress by phase
const progressByPhase: Record<string, Progress[]> = {
  scanning: [],
  extracting: [],
  analyzing: [],
};

for await (const event of pattern.run(provider, {
  system: `You are a document analyst. Process the document through these phases:
1. Scanning - report page progress
2. Extracting - report entities found
3. Analyzing - report key findings
Then submit your final analysis.`,
  prompt: 'Analyze this quarterly report: [document content here]',
})) {
  if (event.type === 'progress') {
    // TypeScript knows event.data has a 'phase' discriminator
    progressByPhase[event.data.phase].push(event.data);

    // Handle each phase differently
    switch (event.data.phase) {
      case 'scanning':
        console.log(`Scanning page ${event.data.currentPage}/${event.data.totalPages}`);
        break;
      case 'extracting':
        console.log(`Found ${event.data.entities.length} ${event.data.entityType} entities`);
        break;
      case 'analyzing':
        console.log(`[${event.data.importance}] ${event.data.finding}`);
        break;
    }
  } else if (event.type === 'complete') {
    console.log('Analysis complete:', event.data.title);
    console.log('Summary:', event.data.summary);
  }
}
```

### Custom Tools Integration

You can pass additional tools alongside the pattern's internal tools:

```typescript
import { z } from 'zod';
import { tool } from 'ai';
import { createGoogleProvider, defineProgressivePattern } from '@agtlantis/core';

const progressSchema = z.object({
  status: z.string(),
  message: z.string(),
});

const resultSchema = z.object({
  answer: z.string(),
  sources: z.array(z.string()),
});

const pattern = defineProgressivePattern({ progressSchema, resultSchema });

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

// Define custom tools
const customTools = {
  searchDatabase: tool({
    description: 'Search the database for information',
    parameters: z.object({
      query: z.string(),
    }),
    execute: async ({ query }) => {
      // Your database search logic
      return { results: [`Result for: ${query}`] };
    },
  }),
};

const execution = provider.streamingExecution(async function* (session) {
  yield* pattern.runInSession(session, {
    system: 'You are a research assistant with database access.',
    messages: [{ role: 'user', content: 'Find information about AI agents.' }],
    tools: customTools,
  });
});

for await (const event of execution) {
  console.log(event.type, event.data);
}
```

## Best Practices

### Schema Design Tips

1. **Keep progress schemas simple** - Progress events are for quick updates, not detailed data
2. **Use enums for known values** - `z.enum(['low', 'medium', 'high'])` helps the LLM output valid values
3. **Add constraints** - `z.number().min(0).max(1)` for confidence scores prevents invalid data
4. **Use discriminated unions** - For multi-phase workflows, the `phase` discriminator makes handling easier

### Handling Progress Events

1. **Don't assume progress events will occur** - The LLM might skip straight to the result
2. **Use progress for UI updates** - Show spinners, progress bars, or status messages
3. **Aggregate progress** - Track progress by phase or type for better UX
4. **Handle the complete event** - Always process the final result, even if no progress was emitted

### Error Handling

```typescript
try {
  for await (const event of pattern.run(provider, options)) {
    // Handle events
  }
} catch (error) {
  if (error.message.includes('No result received')) {
    // The LLM didn't call submitResult
    console.error('Pattern execution failed: no result submitted');
  }
  throw error;
}
```

### System Prompt Tips

The pattern automatically injects instructions about the tools. Your system prompt should:

1. **Describe the task** - What should the LLM analyze or generate?
2. **Guide progress reporting** - What phases or steps should be reported?
3. **Define the result format** - What should the final output contain?

```typescript
const systemPrompt = `You are a document analyst.

Your task is to analyze the provided document and extract key insights.

As you work, report your progress:
- When scanning: report page progress
- When extracting: report entities found
- When analyzing: report key findings

Then submit your final analysis with a summary and recommendations.`;
```

## See Also

- [Getting Started](../getting-started.md) - Basic setup and first agent
- [Streaming Guide](./streaming-guide.md) - Streaming and simple executions
- [Validation Guide](./validation-guide.md) - Validate and retry LLM outputs
- [API Reference: Patterns](../api/patterns.md) - Complete API documentation
