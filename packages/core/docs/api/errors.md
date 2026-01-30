# Errors API Reference

> Complete type documentation for the errors module in @agtlantis/core.

## Overview

The errors module provides a structured error hierarchy for all @agtlantis/core operations. Each error class includes a machine-readable code, optional cause chaining, and context for debugging.

Key features:
- **Error Codes** - Machine-readable codes for each error category
- **Cause Chaining** - Preserve original errors for debugging
- **Context** - Attach arbitrary debugging information
- **Serialization** - Convert errors to JSON for logging

> **Note:** LLM provider errors (rate limits, timeouts, authentication failures) are handled by the Vercel AI SDK and should be caught using their error types (`TooManyRequestsError`, `APICallError`, etc.).

## Import

```typescript
import {
  // Base Class
  AgtlantisError,

  // Error Classes
  ExecutionError,
  ConfigurationError,
  FileError,

  // Error Codes
  ExecutionErrorCode,
  ConfigurationErrorCode,
  FileErrorCode,

  // Types
  type AgtlantisErrorCode,
  type AgtlantisErrorOptions,
  type ExecutionErrorOptions,
  type ConfigurationErrorOptions,
  type FileErrorOptions,
} from '@agtlantis/core';
```

## Error Codes

### ExecutionErrorCode

Error codes for agent execution operations.

```typescript
enum ExecutionErrorCode {
  EXECUTION_ERROR = 'EXECUTION_ERROR',
  STREAM_ERROR = 'STREAM_ERROR',
  RESULT_EXTRACTION_ERROR = 'RESULT_EXTRACTION_ERROR',
  CANCELLED = 'CANCELLED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}
```

| Code | Description |
|------|-------------|
| `EXECUTION_ERROR` | Generic execution failures |
| `STREAM_ERROR` | Streaming operation interrupted |
| `RESULT_EXTRACTION_ERROR` | Failed to parse or extract result |
| `CANCELLED` | Execution was explicitly cancelled |
| `VALIDATION_ERROR` | Agent validation failed |

---

### ConfigurationErrorCode

Error codes for configuration issues.

```typescript
enum ConfigurationErrorCode {
  CONFIG_ERROR = 'CONFIG_ERROR',
  MISSING_API_KEY = 'MISSING_API_KEY',
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_REQUIRED = 'MISSING_REQUIRED',
}
```

---

### FileErrorCode

Error codes for file operations.

```typescript
enum FileErrorCode {
  FILE_ERROR = 'FILE_ERROR',
  UPLOAD_ERROR = 'UPLOAD_ERROR',
  DELETE_ERROR = 'DELETE_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  TOO_LARGE = 'TOO_LARGE',
  UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE',
}
```

---

### AgtlantisErrorCode

Union type of all error codes.

```typescript
type AgtlantisErrorCode = ExecutionErrorCode | ConfigurationErrorCode | FileErrorCode;
```

---

## Types

### AgtlantisErrorOptions<TCode>

Options for creating an `AgtlantisError`.

```typescript
interface AgtlantisErrorOptions<TCode extends AgtlantisErrorCode = AgtlantisErrorCode> {
  code: TCode;
  cause?: Error;
  context?: Record<string, unknown>;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `code` | `TCode` | Yes | Error code from the relevant enum |
| `cause` | `Error` | No | Original error for chaining |
| `context` | `Record<string, unknown>` | No | Debugging context |

---

## Classes

### AgtlantisError<TCode>

Base error class for all Agtlantis errors.

```typescript
class AgtlantisError<TCode extends AgtlantisErrorCode = AgtlantisErrorCode> extends Error {
  readonly code: TCode;
  readonly cause?: Error;
  readonly context?: Record<string, unknown>;

  constructor(message: string, options: AgtlantisErrorOptions<TCode>);

  get isRetryable(): boolean;
  toJSON(): Record<string, unknown>;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `code` | `TCode` | Machine-readable error code |
| `cause` | `Error \| undefined` | Original error |
| `context` | `Record<string, unknown> \| undefined` | Debugging context |

**Example:**

```typescript
import { AgtlantisError, ExecutionErrorCode } from '@agtlantis/core';

const error = new AgtlantisError('Something went wrong', {
  code: ExecutionErrorCode.EXECUTION_ERROR,
  context: { operation: 'generateText', attempt: 1 },
});

console.log(error.code);        // 'EXECUTION_ERROR'
console.log(error.context);     // { operation: 'generateText', attempt: 1 }
console.log(error.isRetryable); // false
console.log(error.toJSON());    // Serialized error object
```

---

### ExecutionError

Error thrown during agent execution.

```typescript
class ExecutionError extends AgtlantisError<ExecutionErrorCode> {
  constructor(message: string, options?: ExecutionErrorOptions);
  static from(error: unknown, code?: ExecutionErrorCode, context?: Record<string, unknown>): ExecutionError;
}
```

**Example:**

```typescript
import { ExecutionError, ExecutionErrorCode } from '@agtlantis/core';

const error = new ExecutionError('Stream interrupted', {
  code: ExecutionErrorCode.STREAM_ERROR,
  context: { agentId: 'agent-123' },
});
```

**Example wrapping errors:**

```typescript
const originalError = new Error('Something went wrong');

const executionError = ExecutionError.from(
  originalError,
  ExecutionErrorCode.EXECUTION_ERROR,
  { operation: 'generateText', attempt: 1 }
);

console.log(executionError.message); // 'Something went wrong'
console.log(executionError.cause);   // originalError
console.log(executionError.context); // { operation: 'generateText', attempt: 1 }
```

**Preserving existing errors:**

```typescript
const existingError = new ExecutionError('Stream failed', {
  code: ExecutionErrorCode.STREAM_ERROR,
});

// from() returns the same error if it's already an ExecutionError
const wrapped = ExecutionError.from(existingError, ExecutionErrorCode.EXECUTION_ERROR);
console.log(wrapped === existingError); // true
```

---

### ConfigurationError

Error thrown when configuration is invalid or missing.

```typescript
class ConfigurationError extends AgtlantisError<ConfigurationErrorCode> {
  constructor(message: string, options?: ConfigurationErrorOptions);
  static from(error: unknown, code?: ConfigurationErrorCode, context?: Record<string, unknown>): ConfigurationError;
}
```

**Example:**

```typescript
import { ConfigurationError, ConfigurationErrorCode } from '@agtlantis/core';

const error = new ConfigurationError('API key not found', {
  code: ConfigurationErrorCode.MISSING_API_KEY,
  context: { envVar: 'GOOGLE_API_KEY' },
});
```

---

### FileError

Error thrown during file operations.

```typescript
class FileError extends AgtlantisError<FileErrorCode> {
  constructor(message: string, options?: FileErrorOptions);
  static from(error: unknown, code?: FileErrorCode, context?: Record<string, unknown>): FileError;
}
```

**Example:**

```typescript
import { FileError, FileErrorCode } from '@agtlantis/core';

const error = new FileError('File upload failed', {
  code: FileErrorCode.UPLOAD_ERROR,
  context: { filename: 'document.pdf', size: 10_000_000 },
});
```

---

## Examples

### Basic Error Handling

```typescript
import {
  createGoogleProvider,
  ExecutionError,
  ConfigurationError,
} from '@agtlantis/core';
import { TooManyRequestsError, APICallError } from 'ai';

async function generateText(prompt: string) {
  try {
    const provider = createGoogleProvider({
      apiKey: process.env.GOOGLE_AI_API_KEY,
    }).withDefaultModel('gemini-2.5-flash');

    const execution = provider.simpleExecution(async (session) => {
      const result = await session.generateText({ prompt });
      return result.text;
    });

    return await execution.toResult();
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error('Configuration issue:', error.message);
      return null;
    }

    if (error instanceof TooManyRequestsError) {
      console.error('Rate limited, retry after:', error.retryAfter);
      return null;
    }

    if (error instanceof APICallError) {
      console.error('API call failed:', error.message);
      if (error.isRetryable) {
        console.log('This error is retryable');
      }
      return null;
    }

    if (error instanceof ExecutionError) {
      console.error('Execution issue:', error.message);
      return null;
    }

    throw error;
  }
}
```

### Retry Logic with SDK Errors

```typescript
import { TooManyRequestsError, APICallError } from 'ai';

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000 } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Handle rate limiting
      if (error instanceof TooManyRequestsError) {
        const delay = error.retryAfter ? error.retryAfter * 1000 : baseDelay * attempt;
        console.log(`Rate limited, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Handle retryable API errors
      if (error instanceof APICallError && error.isRetryable) {
        const delay = baseDelay * attempt;
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}
```

### Structured Error Logging

```typescript
import { AgtlantisError } from '@agtlantis/core';

function logError(error: Error): void {
  if (error instanceof AgtlantisError) {
    const entry = {
      timestamp: new Date().toISOString(),
      errorType: error.name,
      code: error.code,
      message: error.message,
      isRetryable: error.isRetryable,
      context: error.context,
      cause: error.cause?.message,
    };
    console.error(JSON.stringify(entry));
  } else {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      errorType: error.name,
      message: error.message,
    }));
  }
}
```

### Error Type Guards

```typescript
import { AgtlantisError, ExecutionError, ExecutionErrorCode } from '@agtlantis/core';
import { TooManyRequestsError } from 'ai';

function isAgtlantisError(error: unknown): error is AgtlantisError {
  return error instanceof AgtlantisError;
}

function isCancelledError(error: unknown): error is ExecutionError {
  return (
    error instanceof ExecutionError &&
    error.code === ExecutionErrorCode.CANCELLED
  );
}

try {
  await callAPI();
} catch (error) {
  if (error instanceof TooManyRequestsError) {
    console.log(`Rate limited. Retry after ${error.retryAfter}s`);
  } else if (isCancelledError(error)) {
    console.log('Execution was cancelled');
  } else if (isAgtlantisError(error)) {
    console.log(`Error [${error.code}]: ${error.message}`);
  } else {
    throw error;
  }
}
```

### Streaming Error Events

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';
import type { ExecutionErrorEvent } from '@agtlantis/core';

let lastError: ExecutionErrorEvent | null = null;

const logger = createLogger({
  onExecutionError(event) {
    lastError = event;
    console.error(`Execution failed after ${event.duration}ms`);
    console.error(`Error: ${event.error.message}`);
  },
});

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(logger);

const execution = provider.streamingExecution<{ type: string; error?: Error }, string>(
  async function* (session) {
    const result = await session.generateText({ prompt: 'Hello' });
    return session.done(result.text);
  }
);

for await (const event of execution) {
  if (event.type === 'error') {
    console.error('Error event received:', event.error?.message);
  }
}
```

---

## See Also

- [Prompt API Reference](./prompt.md) - Prompt-specific errors
- [Validation API Reference](./validation.md) - ValidationExhaustedError
- [Observability Guide](../guides/observability-guide.md) - Error logging patterns
- [Provider Guide](../guides/provider-guide.md) - Provider error handling
