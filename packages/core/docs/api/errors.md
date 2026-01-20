# Errors API Reference

> Complete type documentation for the errors module in @agtlantis/core.

## Overview

The errors module provides a structured error hierarchy for all @agtlantis/core operations. Each error class includes a machine-readable code, optional cause chaining, and context for debugging. You can use these errors to implement precise error handling and retry logic.

Key features:
- **Error Codes** - Machine-readable codes for each error category
- **Cause Chaining** - Preserve original errors for debugging
- **Context** - Attach arbitrary debugging information
- **Retryable Detection** - Check if an error is worth retrying
- **Serialization** - Convert errors to JSON for logging

## Import

```typescript
import {
  // Base Class
  AgtlantisError,

  // Error Classes
  ProviderError,
  ExecutionError,
  ConfigurationError,
  FileError,

  // Error Codes
  ProviderErrorCode,
  ExecutionErrorCode,
  ConfigurationErrorCode,
  FileErrorCode,

  // Types
  type AgtlantisErrorCode,
  type AgtlantisErrorOptions,
  type ProviderErrorOptions,
  type ExecutionErrorOptions,
  type ConfigurationErrorOptions,
  type FileErrorOptions,
} from '@agtlantis/core';
```

## Error Codes

### ProviderErrorCode

Error codes for provider-related operations.

```typescript
enum ProviderErrorCode {
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  API_ERROR = 'API_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT',
  INVALID_MODEL = 'INVALID_MODEL',
  AUTH_ERROR = 'AUTH_ERROR',
}
```

| Code | Retryable | Description |
|------|-----------|-------------|
| `PROVIDER_ERROR` | No | Generic provider error |
| `API_ERROR` | No | API call failed |
| `RATE_LIMIT` | Yes | Rate limit exceeded |
| `TIMEOUT` | Yes | Request timeout |
| `INVALID_MODEL` | No | Model configuration is wrong |
| `AUTH_ERROR` | No | Authentication failed |

---

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
type AgtlantisErrorCode =
  | ProviderErrorCode
  | ExecutionErrorCode
  | ConfigurationErrorCode
  | FileErrorCode;
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
import { AgtlantisError, ProviderErrorCode } from '@agtlantis/core';

const error = new AgtlantisError('Something went wrong', {
  code: ProviderErrorCode.API_ERROR,
  context: { endpoint: '/api/generate', statusCode: 500 },
});

console.log(error.code);        // 'API_ERROR'
console.log(error.context);     // { endpoint: '/api/generate', statusCode: 500 }
console.log(error.isRetryable); // false
console.log(error.toJSON());    // Serialized error object
```

---

### ProviderError

Error thrown when a provider operation fails.

```typescript
class ProviderError extends AgtlantisError<ProviderErrorCode> {
  constructor(message: string, options?: ProviderErrorOptions);
  get isRetryable(): boolean;
  static from(error: unknown, code?: ProviderErrorCode, context?: Record<string, unknown>): ProviderError;
}
```

`isRetryable` returns `true` for `RATE_LIMIT` and `TIMEOUT`.

**Example:**

```typescript
import { ProviderError, ProviderErrorCode } from '@agtlantis/core';

const rateLimitError = new ProviderError('API rate limit exceeded', {
  code: ProviderErrorCode.RATE_LIMIT,
  context: { model: 'gpt-4o-mini', retryAfter: 60 },
});

console.log(rateLimitError.name);        // 'ProviderError'
console.log(rateLimitError.code);        // 'RATE_LIMIT'
console.log(rateLimitError.isRetryable); // true
```

**Example with cause chaining:**

```typescript
const originalError = new Error('Network timeout');

const providerError = new ProviderError('Failed to call API', {
  code: ProviderErrorCode.TIMEOUT,
  cause: originalError,
  context: { endpoint: '/v1/chat/completions' },
});

console.log(providerError.cause?.message); // 'Network timeout'
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
  ProviderError,
  ExecutionError,
  ConfigurationError,
} from '@agtlantis/core';

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

    if (error instanceof ProviderError) {
      console.error('Provider issue:', error.message);
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

### Retry Logic with Rate Limits

```typescript
import { ProviderError, ProviderErrorCode } from '@agtlantis/core';

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

      if (error instanceof ProviderError && error.isRetryable) {
        const retryAfter = error.context?.retryAfter as number | undefined;
        const delay = retryAfter ? retryAfter * 1000 : baseDelay * attempt;

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
import {
  AgtlantisError,
  ProviderError,
  ProviderErrorCode,
} from '@agtlantis/core';

function isAgtlantisError(error: unknown): error is AgtlantisError {
  return error instanceof AgtlantisError;
}

function isRateLimitError(error: unknown): error is ProviderError {
  return (
    error instanceof ProviderError &&
    error.code === ProviderErrorCode.RATE_LIMIT
  );
}

try {
  await callAPI();
} catch (error) {
  if (isRateLimitError(error)) {
    const retryAfter = error.context?.retryAfter as number;
    console.log(`Rate limited. Retry after ${retryAfter}s`);
  } else if (isAgtlantisError(error)) {
    console.log(`Error [${error.code}]: ${error.message}`);
  } else {
    throw error;
  }
}
```

### Custom Error Wrappers

```typescript
import { ProviderError, ProviderErrorCode } from '@agtlantis/core';

async function callProviderAPI(endpoint: string, options: RequestInit): Promise<Response> {
  try {
    const response = await fetch(endpoint, options);

    if (!response.ok) {
      let code = ProviderErrorCode.API_ERROR;
      if (response.status === 429) code = ProviderErrorCode.RATE_LIMIT;
      if (response.status === 401) code = ProviderErrorCode.AUTH_ERROR;
      if (response.status === 408) code = ProviderErrorCode.TIMEOUT;

      const retryAfter = response.headers.get('Retry-After');

      throw new ProviderError(`API request failed: ${response.status}`, {
        code,
        context: {
          endpoint,
          statusCode: response.status,
          retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
        },
      });
    }

    return response;
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    throw ProviderError.from(error, ProviderErrorCode.API_ERROR, { endpoint });
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
