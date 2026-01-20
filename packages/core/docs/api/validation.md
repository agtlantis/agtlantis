# Validation API Reference

> Complete type documentation for the validation module in @agtlantis/core.

## Overview

The validation module provides utilities for validating async operation results with automatic retries. It includes:

- **withValidation()** - Main function for wrapping operations with validation and retry logic
- **ValidationHistory** - Class for tracking validation attempts
- **ValidationExhaustedError** - Error thrown when all attempts fail
- **Type definitions** - ValidationResult, ValidationAttempt, ValidationOptions, ReadonlyValidationHistory

## Import

```typescript
import {
  // Function
  withValidation,

  // Class
  ValidationHistory,

  // Error
  ValidationExhaustedError,
  ValidationErrorCode,

  // Types
  type ValidationResult,
  type ValidationAttempt,
  type ValidationOptions,
  type ReadonlyValidationHistory,
} from '@agtlantis/core';
```

## Types

### ValidationResult

Result of a validation check. Returned by the `validate` function.

```typescript
interface ValidationResult {
  /** Whether the result passes validation */
  valid: boolean;

  /** Optional explanation for the validation result (useful for failures) */
  reason?: string;
}
```

**Example:**

```typescript
const validate = (result: { score: number }): ValidationResult => {
  if (result.score >= 0.8) {
    return { valid: true };
  }
  return {
    valid: false,
    reason: `Score ${result.score} is below 0.8 threshold`,
  };
};
```

---

### ValidationAttempt<TResult>

A single validation attempt record. Extends `ValidationResult` with the actual result and attempt number.

```typescript
interface ValidationAttempt<TResult> extends ValidationResult {
  /** The result produced by the execute function */
  result: TResult;

  /** The attempt number (1-based) */
  attempt: number;
}
```

**Example:**

```typescript
// A ValidationAttempt might look like:
const attempt: ValidationAttempt<{ answer: string; confidence: number }> = {
  result: { answer: 'Paris', confidence: 0.65 },
  valid: false,
  reason: 'Confidence 0.65 below 0.8 threshold',
  attempt: 1,
};
```

---

### ValidationOptions<TResult>

Options for the `withValidation()` function.

```typescript
interface ValidationOptions<TResult> {
  /**
   * Validation function that checks the result.
   * Can access history to compare with previous attempts.
   * Can be sync or async.
   */
  validate: (
    result: TResult,
    history: ReadonlyValidationHistory<TResult>
  ) => ValidationResult | Promise<ValidationResult>;

  /**
   * Maximum number of attempts before throwing ValidationExhaustedError.
   * @default 3
   * @minimum 1
   */
  maxAttempts?: number;

  /**
   * AbortSignal for cancellation support.
   * When aborted, throws the abort reason before the next attempt.
   */
  signal?: AbortSignal;

  /**
   * Delay between retry attempts in milliseconds.
   * Only applied when there will be another attempt after a failure.
   */
  retryDelay?: number;

  /**
   * Callback invoked after each attempt (success or failure).
   * Useful for logging or progress tracking.
   */
  onAttempt?: (attempt: ValidationAttempt<TResult>) => void;
}
```

**Properties:**

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `validate` | `(result, history) => ValidationResult \| Promise<ValidationResult>` | Yes | - | Validation function |
| `maxAttempts` | `number` | No | `3` | Maximum retry attempts (minimum 1) |
| `signal` | `AbortSignal` | No | - | Cancellation signal |
| `retryDelay` | `number` | No | - | Delay between retries in ms |
| `onAttempt` | `(attempt) => void` | No | - | Callback after each attempt |

---

### ReadonlyValidationHistory<TResult>

Read-only view of validation history. Exposed to `execute()` and `validate()` functions.

```typescript
interface ReadonlyValidationHistory<TResult> {
  /** Next attempt number (1-based). Starts at 1 before any attempts. */
  readonly nextAttempt: number;

  /** Last validation attempt, or undefined if no attempts yet. */
  readonly last: ValidationAttempt<TResult> | undefined;

  /** All validation attempts as a readonly array. */
  readonly all: readonly ValidationAttempt<TResult>[];

  /** Reasons from all failed attempts (only includes attempts with reasons). */
  readonly failureReasons: string[];

  /** True if this is a retry (at least one previous attempt exists). */
  readonly isRetry: boolean;
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `nextAttempt` | `number` | The next attempt number (1-based) |
| `last` | `ValidationAttempt<TResult> \| undefined` | Most recent attempt |
| `all` | `readonly ValidationAttempt<TResult>[]` | All attempts |
| `failureReasons` | `string[]` | Reasons from failed attempts |
| `isRetry` | `boolean` | Whether previous attempts exist |

**Example:**

```typescript
const result = await withValidation<string>(
  async (history) => {
    console.log('Attempt:', history.nextAttempt);
    console.log('Is retry:', history.isRetry);

    if (history.last) {
      console.log('Previous result:', history.last.result);
      console.log('Previous reason:', history.last.reason);
    }

    console.log('All failure reasons:', history.failureReasons);

    return generateContent();
  },
  { validate: (r) => ({ valid: r.length > 100 }) }
);
```

## Classes

### ValidationHistory<TResult>

Tracks validation attempts. Implements `ReadonlyValidationHistory` for external access. The `add()` method is internal-only and not exposed via the interface.

```typescript
class ValidationHistory<TResult> implements ReadonlyValidationHistory<TResult> {
  /** Next attempt number (1-based) */
  get nextAttempt(): number;

  /** Last validation attempt, or undefined if no attempts yet */
  get last(): ValidationAttempt<TResult> | undefined;

  /** All validation attempts as a readonly array */
  get all(): readonly ValidationAttempt<TResult>[];

  /** Reasons from all failed attempts */
  get failureReasons(): string[];

  /** True if this is a retry */
  get isRetry(): boolean;
}
```

> **Note:** You typically don't create `ValidationHistory` instances directly. The `withValidation()` function manages the history internally and exposes it as `ReadonlyValidationHistory`.

**Example (advanced usage):**

```typescript
import { ValidationHistory } from '@agtlantis/core';

// Direct usage (rare - mostly for testing)
const history = new ValidationHistory<{ value: number }>();

console.log(history.nextAttempt); // 1
console.log(history.isRetry); // false
console.log(history.last); // undefined
console.log(history.all); // []
console.log(history.failureReasons); // []
```

## Functions

### withValidation()

Wraps an async operation with validation and retry logic.

```typescript
function withValidation<TResult>(
  execute: (history: ReadonlyValidationHistory<NoInfer<TResult>>) => Promise<TResult>,
  options: ValidationOptions<NoInfer<TResult>>
): Promise<TResult>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `execute` | `(history) => Promise<TResult>` | Async function to execute. Receives history for retry context. |
| `options` | `ValidationOptions<TResult>` | Validation options including the validate function. |

**Returns:** `Promise<TResult>` - The first result that passes validation.

**Throws:** `ValidationExhaustedError` - If all attempts fail validation.

**Behavior:**

1. Executes the function and validates the result
2. If validation fails, retries up to `maxAttempts` times
3. Passes history to execute function for retry context
4. Checks abort signal before each attempt
5. Applies retry delay after failed validation (if specified)
6. Calls onAttempt callback after each attempt

**Example:**

```typescript
import { createGoogleProvider, withValidation } from '@agtlantis/core';
import { z } from 'zod';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

const responseSchema = z.object({
  answer: z.string(),
  confidence: z.number(),
});

const execution = provider.simpleExecution(async (session) => {
  return withValidation(
    async (history) => {
      // Use history to improve subsequent attempts
      const prompt = history.isRetry
        ? `Previous attempt failed: ${history.last?.reason}. Try again.`
        : 'What is 2 + 2?';

      const response = await session.generateText({
        prompt,
        output: 'object',
        schema: responseSchema,
      });

      return response.object;
    },
    {
      validate: (result) => ({
        valid: result.confidence > 0.8,
        reason: `Confidence ${result.confidence} below 0.8`,
      }),
      maxAttempts: 3,
    }
  );
});

const answer = await execution.toResult();
```

## Errors

### ValidationExhaustedError<TResult>

Error thrown when validation fails after all attempts are exhausted. Contains the full validation history for debugging and partial result recovery.

```typescript
class ValidationExhaustedError<TResult> extends AgtlantisError {
  /** The validation history with all attempts */
  readonly history: ReadonlyValidationHistory<TResult>;

  /** Error code: 'VALIDATION_EXHAUSTED' */
  readonly code: ValidationErrorCode;

  /** Context with attempts count and failure reasons */
  readonly context: {
    attempts: number;
    failureReasons: string[];
  };
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `history` | `ReadonlyValidationHistory<TResult>` | Full validation history |
| `code` | `ValidationErrorCode` | Always `'VALIDATION_EXHAUSTED'` |
| `context` | `{ attempts: number; failureReasons: string[] }` | Summary context |
| `name` | `string` | Always `'ValidationExhaustedError'` |
| `message` | `string` | Error message |

**Example:**

```typescript
import { withValidation, ValidationExhaustedError } from '@agtlantis/core';

try {
  const result = await withValidation(
    async () => ({ value: 0.5 }),
    {
      validate: () => ({ valid: false, reason: 'Always fails' }),
      maxAttempts: 3,
    }
  );
} catch (error) {
  if (error instanceof ValidationExhaustedError) {
    // Access the error properties
    console.log('Error name:', error.name);
    // 'ValidationExhaustedError'

    console.log('Error code:', error.code);
    // 'VALIDATION_EXHAUSTED'

    console.log('Attempts made:', error.history.all.length);
    // 3

    console.log('Last result:', error.history.last?.result);
    // { value: 0.5 }

    console.log('All failure reasons:', error.history.failureReasons);
    // ['Always fails', 'Always fails', 'Always fails']

    console.log('Context:', error.context);
    // { attempts: 3, failureReasons: ['Always fails', 'Always fails', 'Always fails'] }
  }
}
```

---

### ValidationErrorCode

Enum of validation error codes.

```typescript
enum ValidationErrorCode {
  /** Validation failed after all attempts exhausted */
  VALIDATION_EXHAUSTED = 'VALIDATION_EXHAUSTED',
}
```

**Example:**

```typescript
import { ValidationExhaustedError, ValidationErrorCode } from '@agtlantis/core';

try {
  await withValidation(execute, options);
} catch (error) {
  if (error instanceof ValidationExhaustedError) {
    if (error.code === ValidationErrorCode.VALIDATION_EXHAUSTED) {
      // Handle exhausted validation
    }
  }
}
```

## Examples

### Basic Validation with Retry

```typescript
import { withValidation } from '@agtlantis/core';

interface GenerationResult {
  text: string;
  quality: number;
}

const result = await withValidation<GenerationResult>(
  async () => {
    // Your generation logic
    return { text: 'Hello world', quality: Math.random() };
  },
  {
    validate: (result) => ({
      valid: result.quality >= 0.8,
      reason: `Quality ${result.quality.toFixed(2)} below 0.8 threshold`,
    }),
    maxAttempts: 3,
  }
);

console.log('Generated:', result.text);
console.log('Quality:', result.quality);
```

### History-Aware LLM Retries

```typescript
import { createGoogleProvider, withValidation } from '@agtlantis/core';
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

const execution = provider.simpleExecution(async (session) => {
  return withValidation<Analysis>(
    async (history) => {
      // Build messages array
      const messages: Array<{ role: 'user'; content: string }> = [
        { role: 'user', content: 'Analyze this quarterly report...' },
      ];

      // Add retry feedback
      if (history.isRetry) {
        messages.push({
          role: 'user',
          content: `Previous analysis was rejected: ${history.last?.reason}. Please improve.`,
        });
      }

      const response = await session.generateText({
        messages,
        output: 'object',
        schema: analysisSchema,
      });

      return response.object;
    },
    {
      validate: (result) => {
        if (result.keyPoints.length < 3) {
          return { valid: false, reason: 'Need at least 3 key points' };
        }
        if (result.confidence < 0.85) {
          return { valid: false, reason: `Confidence ${result.confidence} too low` };
        }
        return { valid: true };
      },
      maxAttempts: 4,
      retryDelay: 500,
      onAttempt: (attempt) => {
        console.log(`Attempt ${attempt.attempt}: ${attempt.valid ? 'PASS' : 'FAIL'}`);
      },
    }
  );
});

const analysis = await execution.toResult();
```

### Error Recovery with Fallback

```typescript
import {
  withValidation,
  ValidationExhaustedError,
} from '@agtlantis/core';

interface Result {
  data: string;
  validated: boolean;
}

async function generateWithFallback(): Promise<Result> {
  try {
    const result = await withValidation<Result>(
      async () => ({ data: 'generated content', validated: true }),
      {
        validate: (r) => ({ valid: r.data.length > 1000 }),
        maxAttempts: 3,
      }
    );
    return result;
  } catch (error) {
    if (error instanceof ValidationExhaustedError) {
      // Return last attempt as fallback
      const lastResult = error.history.last?.result;
      if (lastResult) {
        return { ...lastResult, validated: false };
      }
    }
    throw error;
  }
}

const result = await generateWithFallback();
if (!result.validated) {
  console.warn('Using unvalidated fallback result');
}
```

## See Also

- [Validation Guide](../guides/validation-guide.md) - Comprehensive usage guide
- [Patterns Guide](../guides/patterns-guide.md) - Progressive streaming patterns
- [Session API Reference](./session.md) - Session types and methods
- [Getting Started](../getting-started.md) - Quick introduction
