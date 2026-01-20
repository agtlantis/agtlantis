# Provider API Reference

> Complete API documentation for the Provider module.

## Overview

The Provider module is the core abstraction for interacting with AI models. It provides a unified, provider-agnostic interface for Google AI and OpenAI, with fluent configuration and automatic session management.

## Import

```typescript
import {
  // Factory functions
  createGoogleProvider,
  createOpenAIProvider,

  // Types
  type Provider,
  type StreamingSession,
  type SimpleSession,
  type FileManager,
  type UploadedFile,
  type FilePart,
  type FilePartPath,
  type FilePartData,
  type FilePartBase64,
  type FilePartUrl,

  // Type guards
  isFilePart,
  isFilePartPath,
  isFilePartData,
  isFilePartBase64,
  isFilePartUrl,

  // Config types
  type GoogleProviderConfig,
  type OpenAIProviderConfig,
  type SafetySetting,
  type HarmCategory,
  type HarmBlockThreshold,

  // Errors
  RateLimitError,
  TimeoutError,
  AuthenticationError,
  ModelNotFoundError,
} from '@agtlantis/core';
```

## Types

### Provider

The main interface for interacting with AI providers.

```typescript
interface Provider {
  withDefaultModel(modelId: string): Provider;
  withLogger(logger: Logger): Provider;
  withPricing(pricing: ProviderPricing): Provider;

  streamingExecution<TEvent, TResult>(
    generator: (session: StreamingSession<TEvent, TResult>) => AsyncGenerator<TEvent, TEvent>
  ): StreamingExecution<TEvent, TResult>;

  simpleExecution<TResult>(
    fn: (session: SimpleSession) => Promise<TResult>
  ): Promise<Execution<TResult>>;
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `withDefaultModel(modelId)` | `Provider` | Returns new provider with default model set |
| `withLogger(logger)` | `Provider` | Returns new provider with logger for observability |
| `withPricing(pricing)` | `Provider` | Returns new provider with custom pricing config |
| `streamingExecution(generator)` | `StreamingExecution` | Creates streaming execution with event emission |
| `simpleExecution(fn)` | `Promise<Execution>` | Creates simple Promise-based execution |

### StreamingSession

Session interface for streaming executions. Passed to the generator function.

```typescript
interface StreamingSession<TEvent, TResult> {
  // AI SDK wrappers
  generateText<TOOLS, OUTPUT>(params: GenerateTextParams<TOOLS, OUTPUT>): Promise<GenerateTextResult>;
  streamText<TOOLS, OUTPUT>(params: StreamTextParams<TOOLS, OUTPUT>): StreamTextResult;

  // File management
  readonly fileManager: FileManager;

  // Lifecycle
  onDone(fn: () => Promise<void> | void): void;

  // Stream control
  emit(event: Omit<TEvent, 'metrics'>): TEvent;
  done(data: TResult): Promise<TEvent>;
  fail(error: Error, data?: TResult): Promise<TEvent>;

  // Recording
  record(data: Record<string, unknown>): void;
  recordToolCall(summary: ToolCallSummary): void;
}
```

| Method | Description |
|--------|-------------|
| `generateText(params)` | Wrapper for AI SDK `generateText()` with usage tracking |
| `streamText(params)` | Wrapper for AI SDK `streamText()` with usage tracking |
| `fileManager` | File manager for upload/delete operations |
| `onDone(fn)` | Register cleanup function (LIFO order) |
| `emit(event)` | Emit intermediate event (adds metrics automatically) |
| `done(data)` | Signal successful completion with result |
| `fail(error, data?)` | Signal failure with error and optional partial result |
| `record(data)` | Record custom data for session summary |
| `recordToolCall(summary)` | Record tool call for session summary |

### SimpleSession

Session interface for non-streaming executions. Similar to StreamingSession but without stream control methods.

```typescript
interface SimpleSession {
  // AI SDK wrappers
  generateText<TOOLS, OUTPUT>(params: GenerateTextParams<TOOLS, OUTPUT>): Promise<GenerateTextResult>;
  streamText<TOOLS, OUTPUT>(params: StreamTextParams<TOOLS, OUTPUT>): StreamTextResult;

  // File management
  readonly fileManager: FileManager;

  // Lifecycle
  onDone(fn: () => Promise<void> | void): void;

  // Recording
  record(data: Record<string, unknown>): void;
  recordToolCall(summary: ToolCallSummary): void;
}
```

### FileManager

Provider-agnostic file manager interface.

```typescript
interface FileManager {
  upload(files: FilePart[]): Promise<UploadedFile[]>;
  delete(fileId: string): Promise<void>;
  clear(): Promise<void>;
  getUploadedFiles(): UploadedFile[];
}
```

| Method | Description |
|--------|-------------|
| `upload(files)` | Upload files to provider storage, returns URIs |
| `delete(fileId)` | Delete a single file by ID |
| `clear()` | Clear all uploaded files (best-effort cleanup) |
| `getUploadedFiles()` | Get list of all uploaded files |

### UploadedFile

Result of uploading a file.

```typescript
interface UploadedFile {
  id: string;        // Unique identifier from provider
  uri: string;       // URI for referencing in API calls
  mimeType: string;  // MIME type of uploaded file
  name: string;      // Display name or original filename
  isExternal?: boolean; // True for URL references (not uploaded)
}
```

### FilePart

Union type for file input. Use the `source` field to discriminate.

```typescript
type FilePart = FilePartPath | FilePartData | FilePartBase64 | FilePartUrl;
```

**FilePartPath** - File from local path:

```typescript
interface FilePartPath {
  type: 'file';
  source: 'path';
  path: string;         // Absolute or relative path
  mediaType?: string;   // MIME type (inferred if not provided)
  filename?: string;    // Display name
}
```

**FilePartData** - File from binary data:

```typescript
interface FilePartData {
  type: 'file';
  source: 'data';
  data: Buffer | Uint8Array;
  mediaType: string;    // Required
  filename?: string;
}
```

**FilePartBase64** - File from base64 string:

```typescript
interface FilePartBase64 {
  type: 'file';
  source: 'base64';
  data: string;         // Base64-encoded content
  mediaType: string;    // Required
  filename?: string;
}
```

**FilePartUrl** - File from URL (no upload, passed directly to LLM):

```typescript
interface FilePartUrl {
  type: 'file';
  source: 'url';
  url: string;
  mediaType?: string;
  filename?: string;
}
```

### Type Guards

Functions to check FilePart types at runtime.

```typescript
function isFilePart(v: unknown): v is FilePart;
function isFilePartPath(v: FilePart): v is FilePartPath;
function isFilePartData(v: FilePart): v is FilePartData;
function isFilePartBase64(v: FilePart): v is FilePartBase64;
function isFilePartUrl(v: FilePart): v is FilePartUrl;
```

## Functions

### createGoogleProvider

Creates a Google AI (Gemini) provider.

```typescript
function createGoogleProvider(config: GoogleProviderConfig): Provider;
```

**GoogleProviderConfig:**

```typescript
interface GoogleProviderConfig {
  apiKey: string;                    // Required: Google AI API key
  safetySettings?: SafetySetting[];  // Optional: Content filtering settings
}
```

**SafetySetting:**

```typescript
interface SafetySetting {
  category: HarmCategory;
  threshold: HarmBlockThreshold;
}

type HarmCategory =
  | 'HARM_CATEGORY_HATE_SPEECH'
  | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
  | 'HARM_CATEGORY_DANGEROUS_CONTENT'
  | 'HARM_CATEGORY_HARASSMENT'
  | 'HARM_CATEGORY_CIVIC_INTEGRITY';

type HarmBlockThreshold =
  | 'BLOCK_NONE'
  | 'BLOCK_ONLY_HIGH'
  | 'BLOCK_MEDIUM_AND_ABOVE'
  | 'BLOCK_LOW_AND_ABOVE'
  | 'OFF';
```

**Example:**

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
  safetySettings: [
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
  ],
}).withDefaultModel('gemini-2.5-flash');
```

### createOpenAIProvider

Creates an OpenAI (GPT) provider.

```typescript
function createOpenAIProvider(config: OpenAIProviderConfig): Provider;
```

**OpenAIProviderConfig:**

```typescript
interface OpenAIProviderConfig {
  apiKey: string;        // Required: OpenAI API key
  baseURL?: string;      // Optional: Custom endpoint (for Azure, proxies)
  organization?: string; // Optional: Organization ID
}
```

**Example:**

```typescript
import { createOpenAIProvider } from '@agtlantis/core';

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o');

// With Azure OpenAI
const azureProvider = createOpenAIProvider({
  apiKey: process.env.AZURE_OPENAI_KEY!,
  baseURL: 'https://your-resource.openai.azure.com/openai/deployments/gpt-4',
}).withDefaultModel('gpt-4');
```

> **Note:** OpenAI does not support the FileManager upload pattern. The `fileManager` will throw an error on upload. Use inline content parts instead.

## Errors

### RateLimitError

Thrown when the provider's rate limit is exceeded. This error is **retryable**.

```typescript
class RateLimitError extends ProviderError {
  readonly retryAfter?: number;  // Seconds until rate limit resets
  readonly limit?: number;       // Max requests in time window
  readonly remaining?: number;   // Remaining requests

  get isRetryable(): boolean;    // Always returns true
}
```

**Example:**

```typescript
import { RateLimitError } from '@agtlantis/core';

try {
  provider.simpleExecution(/* ... */);
} catch (error) {
  if (error instanceof RateLimitError) {
    const waitTime = error.retryAfter ?? 60;
    console.log(`Rate limited. Waiting ${waitTime}s...`);
    await new Promise(r => setTimeout(r, waitTime * 1000));
    // Retry...
  }
}
```

### TimeoutError

Thrown when a provider operation times out. This error is **retryable**.

```typescript
class TimeoutError extends ProviderError {
  readonly timeout: number;     // Timeout duration in ms
  readonly operation?: string;  // Operation that timed out

  get isRetryable(): boolean;   // Always returns true
}
```

**Example:**

```typescript
import { TimeoutError } from '@agtlantis/core';

try {
  provider.simpleExecution(/* ... */);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log(`Operation '${error.operation}' timed out after ${error.timeout}ms`);
    // Retry with increased timeout or different approach
  }
}
```

### AuthenticationError

Thrown when provider authentication fails. This error is **not retryable**.

```typescript
class AuthenticationError extends ProviderError {
  readonly reason?: string;     // Reason for failure
  readonly provider?: string;   // Provider name

  get isRetryable(): boolean;   // Always returns false
}
```

**Example:**

```typescript
import { AuthenticationError } from '@agtlantis/core';

try {
  provider.simpleExecution(/* ... */);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error(`Auth failed: ${error.reason}`);
    // Do not retry - fix API key configuration
  }
}
```

### ModelNotFoundError

Thrown when the requested model is not found. This error is **not retryable**.

```typescript
class ModelNotFoundError extends ProviderError {
  readonly model: string;               // Model that was not found
  readonly provider?: string;           // Provider name
  readonly availableModels?: string[];  // Available models (if known)

  get isRetryable(): boolean;           // Always returns false
}
```

**Example:**

```typescript
import { ModelNotFoundError } from '@agtlantis/core';

try {
  provider.simpleExecution(/* ... */);
} catch (error) {
  if (error instanceof ModelNotFoundError) {
    console.error(`Model '${error.model}' not found`);
    if (error.availableModels) {
      console.log('Available:', error.availableModels.join(', '));
    }
    // Do not retry - fix model configuration
  }
}
```

## Examples

### Simple Text Generation

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({
    prompt: 'What is the capital of France?',
  });
  return result.text;
});

const answer = await execution.toResult();
console.log(answer); // "Paris"
```

### Streaming with Progress Events

```typescript
import { createGoogleProvider, type EventMetrics } from '@agtlantis/core';

type MyEvent =
  | { type: 'thinking'; metrics: EventMetrics }
  | { type: 'complete'; result: string; metrics: EventMetrics };

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.streamingExecution<MyEvent, string>(
  async function* (session) {
    yield session.emit({ type: 'thinking' });

    const result = await session.generateText({
      prompt: 'Write a short poem about TypeScript.',
    });

    return session.done(result.text);
  }
);

for await (const event of execution) {
  console.log(event.type);
}
```

### Multi-Model Execution

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  // Fast model for simple task
  const ideas = await session.generateText({
    prompt: 'List 3 project ideas.',
  });

  // Pro model for detailed analysis
  const analysis = await session.generateText({
    model: 'gemini-2.5-pro',
    prompt: `Analyze these ideas in depth:\n${ideas.text}`,
  });

  return analysis.text;
});
```

### File Upload (Google Only)

```typescript
import { createGoogleProvider, type FilePart } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  const files: FilePart[] = [
    { type: 'file', source: 'path', path: './report.pdf' },
  ];

  const uploaded = await session.fileManager.upload(files);

  const result = await session.generateText({
    prompt: [
      { type: 'text', text: 'Summarize this document:' },
      {
        type: 'file',
        data: new URL(uploaded[0].uri),
        mimeType: uploaded[0].mimeType,
      },
    ],
  });

  return result.text;
});
```

### With Cleanup Hook

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  const resource = await acquireResource();

  // Cleanup runs when session ends (success or failure)
  session.onDone(async () => {
    await resource.release();
  });

  const result = await session.generateText({
    prompt: 'Process this data...',
  });

  return result.text;
});
```

## See Also

- [Provider Guide](../guides/provider-guide.md) - Comprehensive guide with best practices
- [Getting Started](../getting-started.md) - Quick introduction
- [Patterns Guide](../guides/patterns-guide.md) - Progressive streaming patterns
- [Validation Guide](../guides/validation-guide.md) - Output validation and retries
