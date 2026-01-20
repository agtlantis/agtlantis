# Patterns API Reference

> Complete API documentation for the Patterns module.

## Overview

The Patterns module provides reusable execution strategies for common LLM workflows. Currently, it exports the Progressive Pattern for streaming progress updates during long-running tasks.

## Import

```typescript
import {
  defineProgressivePattern,
  ProgressivePattern,
  type ProgressiveStreamOptions,
  type ProgressEvent,
  type CompleteEvent,
} from '@agtlantis/core';
```

## Types

### ProgressivePattern

The main class for progressive streaming patterns. Created via `defineProgressivePattern()`.

```typescript
class ProgressivePattern<
  TProgressSchema extends z.ZodType,
  TResultSchema extends z.ZodType,
  TProgress = z.infer<TProgressSchema>,
  TResult = z.infer<TResultSchema>,
> {
  readonly progressSchema: TProgressSchema;
  readonly resultSchema: TResultSchema;

  stream<TUserTools extends ToolSet = {}>(
    session: StreamingSession,
    options: ProgressiveStreamOptions<TUserTools>,
  ): AsyncGenerator<ProgressEvent<TProgress> | CompleteEvent<TResult>>;

  execute<TUserTools extends ToolSet = {}>(
    provider: BaseProvider,
    options: ProgressiveStreamOptions<TUserTools>,
  ): AsyncIterable<ProgressEvent<TProgress> | CompleteEvent<TResult>>;
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `progressSchema` | `TProgressSchema` | Zod schema for validating progress events |
| `resultSchema` | `TResultSchema` | Zod schema for validating the final result |

**Methods:**

| Method | Description |
|--------|-------------|
| `stream(session, options)` | Stream events within a `streamingExecution` context |
| `execute(provider, options)` | High-level API for simple usage |

### ProgressiveStreamOptions

Options for `pattern.stream()` and `pattern.execute()` methods.

```typescript
type ProgressiveStreamOptions<TUserTools extends ToolSet = {}> = Omit<
  StreamTextParams<TUserTools>,
  'tools' | 'toolChoice'
> & {
  tools?: TUserTools;
};
```

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `system` | `string` | No | System prompt for the LLM |
| `prompt` | `string` | No | User prompt (use this or `messages`) |
| `messages` | `CoreMessage[]` | No | Message array (use this or `prompt`) |
| `maxTokens` | `number` | No | Maximum tokens in response |
| `temperature` | `number` | No | Sampling temperature (0-2) |
| `tools` | `TUserTools` | No | Additional user-defined tools |

### ProgressEvent

Event emitted during streaming to report progress.

```typescript
interface ProgressEvent<TProgress> {
  type: 'progress';
  data: TProgress;
  metrics: EventMetrics;
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `type` | `'progress'` | Event type discriminator |
| `data` | `TProgress` | Progress data matching `progressSchema` |
| `metrics` | `EventMetrics` | Timing and usage metrics |

### CompleteEvent

Event emitted when streaming finishes with the final result.

```typescript
interface CompleteEvent<TResult> {
  type: 'complete';
  data: TResult;
  summary: unknown;
  metrics: EventMetrics;
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `type` | `'complete'` | Event type discriminator |
| `data` | `TResult` | Final result matching `resultSchema` |
| `summary` | `unknown` | Execution summary |
| `metrics` | `EventMetrics` | Timing and usage metrics |

### EventMetrics

Timing information included with each event.

```typescript
interface EventMetrics {
  /** Unix timestamp in milliseconds when this event was emitted */
  timestamp: number;

  /** Milliseconds elapsed since execution started */
  elapsedMs: number;

  /** Milliseconds since the previous event (0 for first event) */
  deltaMs: number;
}
```

## Functions

### defineProgressivePattern

Creates a new Progressive Pattern instance.

```typescript
function defineProgressivePattern<
  TProgressSchema extends z.ZodType,
  TResultSchema extends z.ZodType,
>(config: {
  progressSchema: TProgressSchema;
  resultSchema: TResultSchema;
}): ProgressivePattern<TProgressSchema, TResultSchema>;
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `object` | Pattern configuration |
| `config.progressSchema` | `z.ZodType` | Zod schema for progress events |
| `config.resultSchema` | `z.ZodType` | Zod schema for the final result |

**Returns:** A `ProgressivePattern` instance with `stream()` and `execute()` methods.

**Example:**

```typescript
import { z } from 'zod';
import { defineProgressivePattern } from '@agtlantis/core';

const pattern = defineProgressivePattern({
  progressSchema: z.object({
    status: z.string(),
    message: z.string(),
  }),
  resultSchema: z.object({
    answer: z.string(),
    confidence: z.number().min(0).max(1),
  }),
});
```

## Examples

### Simple Schema

Basic progress and result schemas for straightforward tasks:

```typescript
import { z } from 'zod';
import { createGoogleProvider, defineProgressivePattern } from '@agtlantis/core';

// Define schemas
const progressSchema = z.object({
  status: z.string(),
  message: z.string(),
});

const resultSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
});

// Create pattern
const pattern = defineProgressivePattern({
  progressSchema,
  resultSchema,
});

// Create provider
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

// Execute with pattern.execute()
for await (const event of pattern.execute(provider, {
  system: 'You are a helpful assistant. Report progress before answering.',
  prompt: 'What is the capital of Japan?',
})) {
  if (event.type === 'progress') {
    console.log(`[${event.data.status}] ${event.data.message}`);
  } else if (event.type === 'complete') {
    console.log(`Answer: ${event.data.answer} (confidence: ${event.data.confidence})`);
  }
}
```

### Discriminated Union Schema

Multi-phase workflows with different data structures per phase:

```typescript
import { z } from 'zod';
import { createGoogleProvider, defineProgressivePattern } from '@agtlantis/core';

// Discriminated union for multi-phase progress
const progressSchema = z.discriminatedUnion('phase', [
  z.object({
    phase: z.literal('scanning'),
    currentPage: z.number(),
    totalPages: z.number(),
    status: z.string(),
  }),
  z.object({
    phase: z.literal('extracting'),
    entityType: z.enum(['person', 'organization', 'date', 'location', 'concept']),
    entities: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    phase: z.literal('analyzing'),
    aspect: z.string(),
    finding: z.string(),
    importance: z.enum(['low', 'medium', 'high', 'critical']),
  }),
]);

// Complex result schema
const resultSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyEntities: z.object({
    people: z.array(z.string()),
    organizations: z.array(z.string()),
    dates: z.array(z.string()),
  }),
  findings: z.array(z.object({
    aspect: z.string(),
    description: z.string(),
    importance: z.enum(['low', 'medium', 'high', 'critical']),
  })),
  recommendations: z.array(z.string()),
  overallAssessment: z.enum(['positive', 'neutral', 'negative', 'mixed']),
});

type Progress = z.infer<typeof progressSchema>;
type Result = z.infer<typeof resultSchema>;

const pattern = defineProgressivePattern({
  progressSchema,
  resultSchema,
});

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

// Track progress by phase
const progressByPhase: Record<string, Progress[]> = {
  scanning: [],
  extracting: [],
  analyzing: [],
};
let result: Result | null = null;

const execution = provider.streamingExecution<
  { type: 'progress'; data: Progress; metrics: any },
  Result
>(async function* (session) {
  yield* pattern.stream(session, {
    system: `You are a professional document analyst.
Analyze the document through multiple phases:
1. Scanning - report page progress
2. Extracting - report entities found by type
3. Analyzing - report key findings with importance
Then submit your complete analysis.`,
    messages: [
      { role: 'user', content: 'Analyze this quarterly report: [document content]' },
    ],
  });
});

for await (const event of execution) {
  if (event.type === 'progress') {
    progressByPhase[event.data.phase].push(event.data);

    // Handle each phase type
    switch (event.data.phase) {
      case 'scanning':
        console.log(`Scanning: ${event.data.currentPage}/${event.data.totalPages}`);
        break;
      case 'extracting':
        console.log(`Extracted ${event.data.entities.length} ${event.data.entityType}s`);
        break;
      case 'analyzing':
        console.log(`[${event.data.importance}] ${event.data.finding}`);
        break;
    }
  } else if (event.type === 'complete') {
    result = event.data;
    console.log('\n=== Analysis Complete ===');
    console.log('Title:', result.title);
    console.log('Assessment:', result.overallAssessment);
    console.log('Findings:', result.findings.length);
    console.log('Recommendations:', result.recommendations.length);
  }
}
```

### Using pattern.stream() with Sessions

For fine-grained control over the streaming session:

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
  // Pre-processing or setup
  console.log('Starting analysis...');

  yield* pattern.stream(session, {
    system: 'You are a document summarizer.',
    messages: [
      { role: 'user', content: 'Summarize the key benefits of TypeScript.' },
    ],
    maxTokens: 2000,
  });

  // Post-processing
  console.log('Analysis complete.');
});

for await (const event of execution) {
  console.log(event.type, event.data);
}
```

## See Also

- [Patterns Guide](../guides/patterns-guide.md) - Conceptual guide with best practices
- [Getting Started](../getting-started.md) - Basic setup and first agent
- [Validation Guide](../guides/validation-guide.md) - Validate and retry LLM outputs
