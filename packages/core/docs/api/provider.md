# Provider API Reference

> Complete API documentation for the Provider module.

## Overview

The Provider module is the core abstraction for interacting with AI models. It provides a unified, provider-agnostic interface for Google AI and OpenAI, with fluent configuration and automatic session management.

> **Provider Support:** Currently, the Google AI provider is fully supported with all features. The OpenAI provider supports core features (text generation, streaming, tool use) but some advanced features like file management are not yet implemented.

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
  type FileSource,
  type FileSourcePath,
  type FileSourceData,
  type FileSourceBase64,
  type FileSourceUrl,

  // Type guards
  isFileSource,
  isFileSourcePath,
  isFileSourceData,
  isFileSourceBase64,
  isFileSourceUrl,

  // Config types
  type GoogleProviderConfig,
  type OpenAIProviderConfig,
  type SafetySetting,
  type HarmCategory,
  type HarmBlockThreshold,

  // Provider-specific types
  type GoogleProvider,  // Google provider with grounding features

  // Provider-specific options (for withDefaultOptions)
  type GoogleGenerativeAIProviderOptions,
  type OpenAIChatLanguageModelOptions,

  // Generation options (for withDefaultGenerationOptions)
  type GenerationOptions,

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
  withDefaultOptions(options: Record<string, unknown>): Provider;
  withDefaultGenerationOptions(options: GenerationOptions): Provider;

  streamingExecution<TEvent extends { type: string }>(
    generator: (session: StreamingSession<TEvent>) => AsyncGenerator<
      SessionEvent<TEvent>,
      SessionEvent<TEvent> | Promise<SessionEvent<TEvent>>
    >,
    options?: ExecutionOptions
  ): StreamingExecution<TEvent>;

  simpleExecution<TResult>(
    fn: (session: SimpleSession) => Promise<TResult>,
    options?: ExecutionOptions
  ): SimpleExecution<TResult>;
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `withDefaultModel(modelId)` | `Provider` | Returns new provider with default model set |
| `withLogger(logger)` | `Provider` | Returns new provider with logger for observability |
| `withPricing(pricing)` | `Provider` | Returns new provider with custom pricing config |
| `withDefaultOptions(options)` | `Provider` | Returns new provider with default provider-specific options |
| `withDefaultGenerationOptions(options)` | `Provider` | Returns new provider with default standard generation options (`maxOutputTokens`, `temperature`, etc.) |
| `streamingExecution(generator)` | `StreamingExecution` | Creates streaming execution with event emission |
| `simpleExecution(fn)` | `SimpleExecution` | Creates simple Promise-based execution |

### StreamingSession

Session interface for streaming executions. Passed to the generator function.

```typescript
interface StreamingSession<TEvent extends { type: string }> {
  // AI SDK wrappers
  generateText<TOOLS, OUTPUT>(params: GenerateTextParams<TOOLS, OUTPUT>): Promise<GenerateTextResult>;
  streamText<TOOLS, OUTPUT>(params: StreamTextParams<TOOLS, OUTPUT>): StreamTextResult;

  // File management
  readonly fileManager: FileManager;

  // Lifecycle
  onDone(fn: () => Promise<void> | void): void;

  // Stream control
  emit(event: EmittableEventInput<TEvent>): SessionEvent<TEvent>;
  done(data: ExtractResult<TEvent>): Promise<SessionEvent<TEvent>>;
  fail(error: Error, data?: ExtractResult<TEvent>): Promise<SessionEvent<TEvent>>;

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
| `emit(event)` | Emit intermediate event (adds metrics automatically). Throws for reserved types (`'complete'`, `'error'`) |
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

### GenerationOptions

Standard AI SDK generation parameters that can be set as defaults at the Provider level.

```typescript
type GenerationOptions = Pick<
    CallSettings,
    | 'maxOutputTokens'
    | 'temperature'
    | 'topP'
    | 'topK'
    | 'presencePenalty'
    | 'frequencyPenalty'
    | 'stopSequences'
    | 'seed'
>;
```

| Field | Type | Description |
|-------|------|-------------|
| `maxOutputTokens` | `number` | Maximum number of tokens to generate |
| `temperature` | `number` | Sampling temperature (0-2) |
| `topP` | `number` | Nucleus sampling threshold |
| `topK` | `number` | Top-K sampling |
| `presencePenalty` | `number` | Presence penalty (-2 to 2) |
| `frequencyPenalty` | `number` | Frequency penalty (-2 to 2) |
| `stopSequences` | `string[]` | Stop sequences |
| `seed` | `number` | Random seed for deterministic output |

All fields are optional. Only set the ones you need — unset fields have no effect.

### FileManager

Provider-agnostic file manager interface.

```typescript
interface FileManager {
  upload(files: FileSource[]): Promise<UploadedFile[]>;
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

### FileCache

Cache interface for uploaded files. Prevents redundant uploads of identical content.

```typescript
interface FileCache {
  get(hash: string): UploadedFile | null;
  set(hash: string, file: UploadedFile): void;
  delete(hash: string): void;
  clear(): void;
}
```

| Method | Description |
|--------|-------------|
| `get(hash)` | Retrieve cached file by hash, returns null if not found |
| `set(hash, file)` | Store uploaded file in cache |
| `delete(hash)` | Remove single entry from cache |
| `clear()` | Clear all cached entries |

### InMemoryFileCache

Default implementation with optional TTL (time-to-live) support.

```typescript
import { InMemoryFileCache } from '@agtlantis/core';

// Without TTL (entries never expire)
const cache = new InMemoryFileCache();

// With TTL (entries expire after 30 minutes)
const cacheWithTTL = new InMemoryFileCache({ ttlMs: 30 * 60 * 1000 });
```

**Usage with Provider:**

```typescript
import { createGoogleProvider, InMemoryFileCache } from '@agtlantis/core';

// Use default InMemoryFileCache
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withFileCache();

// Or provide a custom cache with TTL
const providerWithTTL = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withFileCache(new InMemoryFileCache({ defaultTTL: 30 * 60 * 1000 }));
```

> **Note:** `withFileCache()` is also available on OpenAI provider for API consistency, but it's a no-op since file uploads are not yet implemented for the OpenAI provider.

When a file is uploaded, the FileManager computes a hash from its content (or uses the explicit `hash` field if provided) and checks the cache. If found, the cached `UploadedFile` is returned immediately without re-uploading.

### UploadedFile

Result of uploading a file. Contains an AI SDK-compatible part ready for use in prompts.

```typescript
interface UploadedFile {
  id: string | null;           // Provider file ID (null for external URLs)
  part: FilePart | ImagePart;  // AI SDK-compatible part for prompts
}
```

The `part` field is directly usable in AI SDK prompts:

```typescript
const uploaded = await session.fileManager.upload(files);

const result = await session.generateText({
  prompt: [
    { type: 'text', text: 'Analyze this:' },
    uploaded[0].part,  // Use directly in prompt
  ],
});
```

### FileSource

Union type for file input. Use the `source` field to discriminate.

```typescript
type FileSource = FileSourcePath | FileSourceData | FileSourceBase64 | FileSourceUrl;
```

**FileSourcePath** - File from local path:

```typescript
interface FileSourcePath {
  source: 'path';
  path: string;         // Absolute or relative path
  mediaType?: string;   // MIME type (inferred if not provided)
  filename?: string;    // Display name
  hash?: string;        // Optional cache key (if provided, used instead of computing hash from content)
}
```

**FileSourceData** - File from binary data:

```typescript
interface FileSourceData {
  source: 'data';
  data: Buffer | Uint8Array;
  mediaType: string;    // Required
  filename?: string;
  hash?: string;        // Optional cache key (if provided, used instead of computing hash from content)
}
```

**FileSourceBase64** - File from base64 string:

```typescript
interface FileSourceBase64 {
  source: 'base64';
  data: string;         // Base64-encoded content
  mediaType: string;    // Required
  filename?: string;
  hash?: string;        // Optional cache key (if provided, used instead of computing hash from content)
}
```

**FileSourceUrl** - File from URL (no upload, passed directly to LLM):

```typescript
interface FileSourceUrl {
  source: 'url';
  url: string;
  mediaType?: string;
  filename?: string;
  hash?: string;        // Optional cache key (if provided, used instead of computing hash from content)
}
```

### Type Guards

Functions to check FileSource types at runtime.

```typescript
function isFileSource(v: unknown): v is FileSource;
function isFileSourcePath(v: FileSource): v is FileSourcePath;
function isFileSourceData(v: FileSource): v is FileSourceData;
function isFileSourceBase64(v: FileSource): v is FileSourceBase64;
function isFileSourceUrl(v: FileSource): v is FileSourceUrl;
```

## Functions

### createGoogleProvider

Creates a Google AI (Gemini) provider.

```typescript
function createGoogleProvider(config: GoogleProviderConfig): GoogleProvider;
```

> **Note:** Returns `GoogleProvider` which extends `Provider` with additional grounding methods.

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

// With default provider options (e.g., Gemini thinking mode)
const thinkingProvider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.0-flash-thinking-exp')
  .withDefaultOptions({
    thinkingConfig: { includeThoughts: true, thinkingLevel: 'low' }
  });

// With default generation options (standard AI SDK parameters)
const generationProvider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash')
  .withDefaultGenerationOptions({ maxOutputTokens: 65536, temperature: 0.7 });

// With Google Search grounding
const searchProvider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash')
  .withSearchEnabled();

// With URL Context grounding
const urlContextProvider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash')
  .withUrlContextEnabled();

// With both grounding features
const groundedProvider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash')
  .withSearchEnabled()
  .withUrlContextEnabled();
```

**GoogleProvider Methods:**

The `GoogleProvider` class extends `Provider` with additional methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `withSearchEnabled()` | `GoogleProvider` | Enable Google Search grounding for real-time web information |
| `withUrlContextEnabled()` | `GoogleProvider` | Enable URL Context grounding to retrieve content from URLs in prompts |
| `withFileCache(cache?)` | `GoogleProvider` | Set file cache for reusing uploaded files. If no cache provided, creates InMemoryFileCache |

> **Note:** Grounding features require Gemini 2.0 or newer models.

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

> **Note:** The OpenAI provider does not yet implement the FileManager upload pattern. The `fileManager` will throw an error on upload. Use inline content parts instead.

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

const result = await execution.result();
if (result.status === 'succeeded') {
  console.log(result.value); // "Paris"
}
```

### Streaming with Progress Events

```typescript
import { createGoogleProvider, type CompletionEvent } from '@agtlantis/core';

// Define event types — CompletionEvent defines the result type
type MyEvent =
  | { type: 'thinking' }
  | CompletionEvent<string>;

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.streamingExecution<MyEvent>(
  async function* (session) {
    yield session.emit({ type: 'thinking' });

    const result = await session.generateText({
      prompt: 'Write a short poem about TypeScript.',
    });

    return session.done(result.text);
  }
);

for await (const event of execution.stream()) {
  console.log(event.type);  // metrics available via event.metrics
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
import { createGoogleProvider, type FileSource } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  const files: FileSource[] = [
    { source: 'path', path: './report.pdf' },
  ];

  const uploaded = await session.fileManager.upload(files);

  const result = await session.generateText({
    prompt: [
      { type: 'text', text: 'Summarize this document:' },
      uploaded[0].part,  // AI SDK-compatible part
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
