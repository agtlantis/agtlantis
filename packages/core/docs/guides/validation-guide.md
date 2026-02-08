# Validation Guide

> Ensure LLM outputs meet your requirements with automatic retries and intelligent error recovery.

## Table of contents

- [Overview](#overview)
- [Quick start](#quick-start)
- [Basic usage](#basic-usage)
  - [Simple validation](#simple-validation)
  - [Automatic retries](#automatic-retries)
  - [Validation result type](#validation-result-type)
- [Advanced usage](#advanced-usage)
  - [History-aware retries](#history-aware-retries)
  - [History properties](#history-properties)
  - [Using all failure reasons](#using-all-failure-reasons)
  - [AbortSignal for cancellation](#abortsignal-for-cancellation)
  - [Retry delay](#retry-delay)
  - [Progress tracking with onAttempt](#progress-tracking-with-onattempt)
  - [Combining all options](#combining-all-options)
- [Best practices](#best-practices)
  - [When to use validation](#when-to-use-validation)
  - [Tuning maxAttempts](#tuning-maxattempts)
  - [Writing good validation functions](#writing-good-validation-functions)
  - [Error handling patterns](#error-handling-patterns)
  - [Combining with patterns](#combining-with-patterns)
- [See also](#see-also)

---

## Overview

LLM outputs are inherently non-deterministic. Even with clear prompts and schemas, models can produce results that don't meet your quality requirements. The validation module provides a clean way to:

- **Validate results** against custom criteria
- **Automatically retry** failed attempts
- **Provide context** to subsequent attempts via history
- **Track progress** with callbacks and timing

The core function `withValidation()` wraps any async operation and handles the retry loop for you. You define what "valid" means, and the module takes care of the rest.

## Quick Start

Here's a complete example that validates an LLM response until it meets a confidence threshold:

```typescript
import { createGoogleProvider, withValidation } from '@agtlantis/core';
import { z } from 'zod';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

// Define your result schema
const responseSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
});

type Response = z.infer<typeof responseSchema>;

// Execute with validation
const execution = provider.simpleExecution(async (session) => {
  const result = await withValidation<Response>(
    async (history) => {
      // Build messages with retry context
      const messages = [
        { role: 'user' as const, content: 'What is the capital of France?' },
      ];

      // Add feedback on retries
      if (history.isRetry && history.last?.reason) {
        messages.push({
          role: 'user' as const,
          content: `Previous attempt was rejected: ${history.last.reason}. Please try again with higher confidence.`,
        });
      }

      const response = await session.generateText({
        messages,
        output: 'object',
        schema: responseSchema,
      });

      return response.object;
    },
    {
      validate: (result) => ({
        valid: result.confidence >= 0.8,
        reason: `Confidence ${result.confidence} is below 0.8 threshold`,
      }),
      maxAttempts: 3,
    }
  );

  return result;
});

const result = await execution.result();
if (result.status === 'succeeded') {
  console.log(result.value); // { answer: "Paris", confidence: 0.95 }
}
```

## Basic Usage

### Simple Validation

At its simplest, `withValidation()` takes an execute function and a validate function:

```typescript
import { withValidation } from '@agtlantis/core';

const result = await withValidation(
  async () => {
    // Your async operation
    return { value: Math.random(), timestamp: Date.now() };
  },
  {
    validate: (result) => ({
      valid: result.value > 0.5,
      reason: `Value ${result.value} is too low`,
    }),
  }
);
```

The validate function returns a `ValidationResult` with:
- `valid: boolean` - Whether the result passes validation
- `reason?: string` - Optional explanation for failures (shown in history)

### Automatic Retries

By default, `withValidation()` retries up to 3 times. You can customize this:

```typescript
const result = await withValidation(
  async () => fetchData(),
  {
    validate: (data) => ({ valid: data.items.length > 0 }),
    maxAttempts: 5, // Try up to 5 times
  }
);
```

If all attempts fail, a `ValidationExhaustedError` is thrown with the complete history:

```typescript
import { withValidation, ValidationExhaustedError } from '@agtlantis/core';

try {
  const result = await withValidation(
    async () => ({ score: 0.3 }),
    {
      validate: (r) => ({
        valid: r.score > 0.9,
        reason: `Score ${r.score} below threshold`,
      }),
      maxAttempts: 3,
    }
  );
} catch (error) {
  if (error instanceof ValidationExhaustedError) {
    console.log(`Failed after ${error.history.all.length} attempts`);
    console.log('Last result:', error.history.last?.result);
    console.log('All failure reasons:', error.history.failureReasons);
    // ['Score 0.3 below threshold', 'Score 0.3 below threshold', 'Score 0.3 below threshold']
  }
}
```

### Validation Result Type

Your validation function can be synchronous or asynchronous:

```typescript
// Synchronous validation
const syncResult = await withValidation(
  async () => generateContent(),
  {
    validate: (content) => ({
      valid: content.length > 100,
      reason: 'Content too short',
    }),
  }
);

// Async validation (e.g., checking against external service)
const asyncResult = await withValidation(
  async () => generateContent(),
  {
    validate: async (content) => {
      const isSafe = await contentModerationAPI.check(content);
      return {
        valid: isSafe,
        reason: isSafe ? undefined : 'Content failed moderation',
      };
    },
  }
);
```

## Advanced Usage

### History-Aware Retries

The execute function receives a `history` object that provides context about previous attempts. This is crucial for LLM operations where you want to give the model feedback:

```typescript
import { withValidation, type ReadonlyValidationHistory } from '@agtlantis/core';

interface AnalysisResult {
  summary: string;
  confidence: number;
  sources: string[];
}

const result = await withValidation<AnalysisResult>(
  async (history: ReadonlyValidationHistory<AnalysisResult>) => {
    // Check if this is a retry
    if (history.isRetry) {
      console.log(`Retry attempt ${history.nextAttempt}`);
      console.log(`Previous result:`, history.last?.result);
      console.log(`Previous failure:`, history.last?.reason);
    }

    // Use history to improve the prompt
    let prompt = 'Analyze this document and provide a summary with sources.';

    if (history.isRetry) {
      prompt += `\n\nPrevious attempt failed: ${history.last?.reason}`;
      prompt += '\nPlease address this issue in your response.';
    }

    const response = await session.generateText({
      prompt,
      output: 'object',
      schema: analysisSchema,
    });

    return response.object;
  },
  {
    validate: (result) => {
      if (result.sources.length === 0) {
        return { valid: false, reason: 'No sources provided' };
      }
      if (result.confidence < 0.7) {
        return { valid: false, reason: `Confidence ${result.confidence} too low` };
      }
      return { valid: true };
    },
    maxAttempts: 3,
  }
);
```

### History Properties

The `ReadonlyValidationHistory<TResult>` object provides:

| Property | Type | Description |
|----------|------|-------------|
| `isRetry` | `boolean` | `true` if there's been at least one previous attempt |
| `nextAttempt` | `number` | The next attempt number (1-based) |
| `last` | `ValidationAttempt<TResult> \| undefined` | The most recent attempt |
| `all` | `readonly ValidationAttempt<TResult>[]` | All previous attempts |
| `failureReasons` | `string[]` | Reasons from all failed attempts |

Each `ValidationAttempt` contains:

| Property | Type | Description |
|----------|------|-------------|
| `result` | `TResult` | The result from that attempt |
| `valid` | `boolean` | Whether it passed validation |
| `reason` | `string \| undefined` | The validation reason |
| `attempt` | `number` | The attempt number (1-based) |

### Using All Failure Reasons

You can accumulate feedback from all previous failures:

```typescript
const result = await withValidation<string>(
  async (history) => {
    let prompt = 'Write a creative story about space exploration.';

    if (history.failureReasons.length > 0) {
      prompt += '\n\nPrevious attempts were rejected for these reasons:';
      history.failureReasons.forEach((reason, i) => {
        prompt += `\n${i + 1}. ${reason}`;
      });
      prompt += '\n\nPlease address ALL of these issues.';
    }

    const response = await session.generateText({ prompt });
    return response.text;
  },
  {
    validate: (story) => {
      const issues: string[] = [];

      if (story.length < 500) issues.push('Story is too short (min 500 chars)');
      if (!story.includes('astronaut')) issues.push('Must mention an astronaut');
      if (!story.includes('planet')) issues.push('Must mention a planet');

      return {
        valid: issues.length === 0,
        reason: issues.join('; '),
      };
    },
    maxAttempts: 4,
  }
);
```

### AbortSignal for Cancellation

You can cancel validation using an `AbortSignal`:

```typescript
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort('Timeout'), 5000);

try {
  const result = await withValidation(
    async () => longRunningOperation(),
    {
      validate: (r) => ({ valid: r.complete }),
      maxAttempts: 10,
      signal: controller.signal,
    }
  );
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    console.log('Validation was cancelled');
  }
}
```

The signal is checked before each attempt, so cancellation happens at attempt boundaries.

### Retry Delay

Add a delay between retry attempts (useful for rate limiting or giving external systems time to update):

```typescript
const result = await withValidation(
  async () => checkExternalStatus(),
  {
    validate: (status) => ({
      valid: status === 'ready',
      reason: `Status is ${status}, not ready`,
    }),
    maxAttempts: 5,
    retryDelay: 2000, // Wait 2 seconds between retries
  }
);
```

The delay is only applied after failed validation, not after success.

### Progress Tracking with onAttempt

Track each attempt in real-time with the `onAttempt` callback:

```typescript
import { withValidation, type ValidationAttempt } from '@agtlantis/core';

interface GenerationResult {
  text: string;
  quality: number;
}

const attempts: ValidationAttempt<GenerationResult>[] = [];

const result = await withValidation<GenerationResult>(
  async (history) => {
    const response = await session.generateText({
      prompt: 'Generate high-quality content',
      output: 'object',
      schema: generationSchema,
    });
    return response.object;
  },
  {
    validate: (r) => ({
      valid: r.quality >= 0.9,
      reason: `Quality ${r.quality} below 0.9`,
    }),
    maxAttempts: 5,
    onAttempt: (attempt) => {
      attempts.push(attempt);
      console.log(`Attempt ${attempt.attempt}: ${attempt.valid ? 'PASS' : 'FAIL'}`);
      if (!attempt.valid) {
        console.log(`  Reason: ${attempt.reason}`);
      }
    },
  }
);

console.log(`Succeeded after ${attempts.length} attempts`);
```

The callback is invoked after each attempt, whether it passes or fails, making it useful for logging, metrics, or progress UI updates.

### Combining All Options

Here's a comprehensive example using all advanced features:

```typescript
import {
  createGoogleProvider,
  withValidation,
  ValidationExhaustedError,
  type ValidationAttempt,
} from '@agtlantis/core';
import { z } from 'zod';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

const analysisSchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  confidence: z.number(),
});

type Analysis = z.infer<typeof analysisSchema>;

async function analyzeWithRetry(
  document: string,
  signal?: AbortSignal
): Promise<Analysis> {
  const execution = provider.simpleExecution(async (session) => {
    return withValidation<Analysis>(
      async (history) => {
        // Build context-aware prompt
        let systemPrompt = 'You are an expert document analyst.';
        let userPrompt = `Analyze this document:\n\n${document}`;

        if (history.isRetry) {
          userPrompt += '\n\n---\nPrevious attempts had issues:';
          history.failureReasons.forEach((reason) => {
            userPrompt += `\n- ${reason}`;
          });
          userPrompt += '\n\nPlease address these issues.';
        }

        const response = await session.generateText({
          system: systemPrompt,
          prompt: userPrompt,
          output: 'object',
          schema: analysisSchema,
        });

        return response.object;
      },
      {
        validate: (result, history) => {
          // Access history in validate function too
          const issues: string[] = [];

          if (result.keyPoints.length < 3) {
            issues.push('Need at least 3 key points');
          }
          if (result.confidence < 0.8) {
            issues.push(`Confidence ${result.confidence} is below 0.8`);
          }
          if (result.summary.length < 100) {
            issues.push('Summary is too brief');
          }

          return {
            valid: issues.length === 0,
            reason: issues.join('; '),
          };
        },
        maxAttempts: 4,
        retryDelay: 1000,
        signal,
        onAttempt: (attempt) => {
          console.log(
            `[Attempt ${attempt.attempt}] ` +
            `${attempt.valid ? 'Success' : `Failed: ${attempt.reason}`}`
          );
        },
      }
    );
  });

  const result = await execution.result();
  if (result.status !== 'succeeded') {
    throw result.status === 'failed' ? result.error : new Error('canceled');
  }
  return result.value;
}

// Usage
try {
  const controller = new AbortController();
  const analysis = await analyzeWithRetry(documentText, controller.signal);
  console.log('Analysis complete:', analysis);
} catch (error) {
  if (error instanceof ValidationExhaustedError) {
    console.error('Could not produce valid analysis');
    console.error('Best attempt:', error.history.last?.result);
  }
}
```

## Best Practices

### When to Use Validation

Use `withValidation()` when:

- **Quality thresholds matter** - LLM outputs need to meet specific criteria (confidence scores, minimum length, required fields)
- **Non-determinism is a problem** - You need consistent output structure despite model variability
- **Feedback improves results** - The model can self-correct when given failure reasons
- **Partial failures are acceptable** - You want to retry before failing completely

Don't use validation for:

- Simple operations that either work or fail completely
- Cases where retrying won't help (e.g., missing API keys)
- Time-critical operations where any delay is unacceptable

### Tuning maxAttempts

| Use Case | Recommended maxAttempts |
|----------|------------------------|
| Simple format validation | 2-3 |
| Quality thresholds | 3-4 |
| Complex multi-criteria | 4-5 |
| Best-effort generation | 5+ |

More attempts mean more API calls and cost. Balance quality requirements against latency and budget.

### Writing Good Validation Functions

Effective validation functions:

1. **Return specific reasons** - Help the model understand what to fix
2. **Check one thing at a time** - Or combine issues into a clear list
3. **Use consistent thresholds** - Don't change criteria between retries

```typescript
// Good: Specific, actionable feedback
validate: (result) => {
  if (result.sources.length === 0) {
    return { valid: false, reason: 'No sources cited. Include at least 2 sources.' };
  }
  if (result.confidence < 0.8) {
    return { valid: false, reason: `Confidence ${result.confidence} below 0.8. Be more certain.` };
  }
  return { valid: true };
}

// Bad: Vague feedback
validate: (result) => ({
  valid: result.good,
  reason: 'Not good enough',
})
```

### Error Handling Patterns

Always handle `ValidationExhaustedError` gracefully:

```typescript
import { withValidation, ValidationExhaustedError } from '@agtlantis/core';

async function generateWithFallback(): Promise<Result> {
  try {
    return await withValidation(execute, options);
  } catch (error) {
    if (error instanceof ValidationExhaustedError) {
      // Option 1: Return the last (best) attempt
      const lastResult = error.history.last?.result;
      if (lastResult) {
        console.warn('Using unvalidated result:', error.history.failureReasons);
        return lastResult;
      }

      // Option 2: Return a default
      return { fallback: true, data: null };

      // Option 3: Rethrow with more context
      throw new Error(
        `Validation failed after ${error.history.all.length} attempts: ` +
        error.history.failureReasons.join(', ')
      );
    }
    throw error;
  }
}
```

### Combining with Patterns

Validation works well with the Progressive Pattern for multi-step workflows:

```typescript
import { defineProgressivePattern, withValidation } from '@agtlantis/core';
import { z } from 'zod';

const pattern = defineProgressivePattern({
  progressSchema: z.object({ step: z.string() }),
  resultSchema: z.object({ answer: z.string(), confidence: z.number() }),
});

// Validate the entire pattern execution
const validatedResult = await withValidation(
  async (history) => {
    // Execute the pattern
    let finalResult;
    for await (const event of pattern.execute(provider, {
      prompt: history.isRetry
        ? `Try again: ${history.last?.reason}`
        : 'Solve this problem',
    })) {
      if (event.type === 'complete') {
        finalResult = event.data;
      }
    }
    return finalResult!;
  },
  {
    validate: (result) => ({
      valid: result.confidence >= 0.9,
      reason: `Confidence ${result.confidence} below 0.9`,
    }),
    maxAttempts: 3,
  }
);
```

## See Also

- [Validation API Reference](../api/validation.md) - Complete type documentation
- [Patterns Guide](./patterns-guide.md) - Progressive streaming patterns
- [Streaming Guide](./streaming-guide.md) - Streaming execution basics
- [Getting Started](../getting-started.md) - Quick introduction
