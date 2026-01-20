# Provider Guide

> Your single entry point for all AI operations in @agtlantis/core.

## Table of contents

- [Overview](#overview)
- [Quick start](#quick-start)
- [Basic usage](#basic-usage)
  - [Creating providers](#creating-providers)
  - [Fluent configuration](#fluent-configuration)
  - [Simple execution](#simple-execution)
  - [Streaming execution](#streaming-execution)
- [Advanced usage](#advanced-usage)
  - [Per-call model override](#per-call-model-override)
  - [File management](#file-management)
  - [Google safety settings](#google-safety-settings)
  - [Session lifecycle hooks](#session-lifecycle-hooks)
- [Best practices](#best-practices)
  - [API key management](#api-key-management)
  - [Error handling](#error-handling)
  - [Reuse providers](#reuse-providers)
  - [Choose the right execution mode](#choose-the-right-execution-mode)
- [See also](#see-also)

---

## Overview

The Provider is the core abstraction in @agtlantis/core. It handles:

- **Provider-agnostic API**: Switch between Google and OpenAI without changing your code
- **Fluent configuration**: Chain `.withDefaultModel()`, `.withLogger()`, and `.withPricing()` calls
- **Automatic session management**: Sessions handle lifecycle, cleanup, and usage tracking
- **Two execution modes**: Simple (Promise-based) and Streaming (AsyncGenerator-based)

Think of a Provider as a configured connection to an AI service. You create it once, configure it with the fluent API, then use it to run executions.

## Quick Start

Here's the minimal code to get a response from an LLM:

```typescript
import { createGoogleProvider } from '@agtlantis/core';

// 1. Create provider
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

// 2. Execute
const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello, world!' });
  return result.text;
});

// 3. Get result
const text = await execution.toResult();
console.log(text);
```

## Basic Usage

### Creating Providers

You can create providers for Google AI or OpenAI. Each provider requires an API key.

**Google AI Provider:**

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const google = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
});
```

**OpenAI Provider:**

```typescript
import { createOpenAIProvider } from '@agtlantis/core';

const openai = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
});

// With optional configuration
const openaiWithOrg = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  organization: 'org-abc123',
  baseURL: 'https://custom-endpoint.example.com/v1', // For Azure OpenAI or proxies
});
```

### Fluent Configuration

Configure providers using the fluent API. Each method returns a new provider instance, keeping the original unchanged (immutable pattern).

**Setting a Default Model:**

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

// Original is unchanged
const flashProvider = provider.withDefaultModel('gemini-2.5-flash');
const proProvider = provider.withDefaultModel('gemini-2.5-pro');
```

**Adding a Logger:**

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';

const logger = createLogger({
  onLLMCallStart: (event) => {
    console.log(`Starting: ${event.callType} with ${event.modelId}`);
  },
  onLLMCallEnd: (event) => {
    console.log(`Completed: ${event.response.usage?.totalTokens} tokens`);
  },
});

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
})
  .withDefaultModel('gemini-2.5-flash')
  .withLogger(logger);
```

**Custom Pricing:**

Override default pricing for cost calculations:

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
})
  .withDefaultModel('gemini-2.5-flash')
  .withPricing({
    'gemini-2.5-flash': {
      inputPricePerMillion: 0.5,
      outputPricePerMillion: 3.0,
    },
  });
```

### Simple Execution

Use `simpleExecution()` when you just need a result without streaming intermediate events.

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  // session provides generateText(), streamText(), and fileManager
  const result = await session.generateText({
    prompt: 'Explain quantum computing in one sentence.',
  });
  return result.text;
});

const text = await execution.toResult();
console.log(text);
```

The session automatically tracks:
- Token usage across all LLM calls
- File uploads (auto-cleaned when session ends)
- Custom cleanup functions registered with `onDone()`

### Streaming Execution

Use `streamingExecution()` when you need to emit events during processing. This is ideal for real-time UIs or long-running operations.

```typescript
import { createGoogleProvider } from '@agtlantis/core';
import type { EventMetrics } from '@agtlantis/core';

// Define your event types
type MyEvent =
  | { type: 'progress'; message: string; metrics: EventMetrics }
  | { type: 'complete'; data: string; metrics: EventMetrics }
  | { type: 'error'; error: Error; metrics: EventMetrics };

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.streamingExecution<MyEvent, string>(
  async function* (session) {
    // Emit progress event
    yield session.emit({ type: 'progress', message: 'Starting...' });

    const result = await session.generateText({
      prompt: 'Write a haiku about coding.',
    });

    yield session.emit({ type: 'progress', message: 'Generated text!' });

    // Return final event with result
    return session.done(result.text);
  }
);

// Consume events
for await (const event of execution) {
  if (event.type === 'progress') {
    console.log('Progress:', event.message);
  } else if (event.type === 'complete') {
    console.log('Result:', event.data);
  }
}
```

## Advanced Usage

### Per-Call Model Override

You can use different models for different calls within the same session:

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash'); // Fast model as default

const execution = provider.simpleExecution(async (session) => {
  // Use default model (gemini-2.5-flash) for quick tasks
  const outline = await session.generateText({
    prompt: 'Create a brief outline for an article about AI.',
  });

  // Use pro model for complex reasoning
  const analysis = await session.generateText({
    model: 'gemini-2.5-pro', // Override for this call only
    prompt: `Expand this outline with detailed analysis:\n${outline.text}`,
  });

  return analysis.text;
});
```

### File Management

The Google provider supports file uploads via the `fileManager`. Files are automatically cleaned up when the session ends.

```typescript
import { createGoogleProvider, type FilePart } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  // Upload a file from path
  const files: FilePart[] = [
    {
      type: 'file',
      source: 'path',
      path: './document.pdf',
      mediaType: 'application/pdf',
    },
  ];

  const uploaded = await session.fileManager.upload(files);

  // Use the uploaded file in your prompt
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

  // Files are automatically cleaned up when session ends
  return result.text;
});
```

**FilePart Types:**

There are four ways to provide files:

```typescript
import type {
  FilePartPath,
  FilePartData,
  FilePartBase64,
  FilePartUrl,
} from '@agtlantis/core';

// From local path
const fromPath: FilePartPath = {
  type: 'file',
  source: 'path',
  path: './image.png',
  mediaType: 'image/png', // Optional, inferred from extension
};

// From binary data
const fromData: FilePartData = {
  type: 'file',
  source: 'data',
  data: buffer, // Buffer or Uint8Array
  mediaType: 'image/png', // Required
};

// From base64 string
const fromBase64: FilePartBase64 = {
  type: 'file',
  source: 'base64',
  data: 'iVBORw0KGgo...', // Base64 encoded
  mediaType: 'image/png', // Required
};

// From URL (no upload, passed directly to LLM)
const fromUrl: FilePartUrl = {
  type: 'file',
  source: 'url',
  url: 'https://example.com/image.png',
  mediaType: 'image/png', // Optional
};
```

**Type Guards:**

Use type guards to check file part types:

```typescript
import {
  isFilePart,
  isFilePartPath,
  isFilePartData,
  isFilePartBase64,
  isFilePartUrl,
} from '@agtlantis/core';

if (isFilePart(value)) {
  if (isFilePartPath(value)) {
    console.log('File from path:', value.path);
  } else if (isFilePartUrl(value)) {
    console.log('File from URL:', value.url);
  }
}
```

> **Note:** OpenAI doesn't support the upload + URI reference pattern. The `fileManager` on OpenAI sessions will throw an error if you try to upload files. Use inline base64 or URL content parts instead.

### Google Safety Settings

Configure content filtering for Google AI:

```typescript
import { createGoogleProvider, type SafetySetting } from '@agtlantis/core';

const safetySettings: SafetySetting[] = [
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    threshold: 'BLOCK_ONLY_HIGH',
  },
  {
    category: 'HARM_CATEGORY_HARASSMENT',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE',
  },
];

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
  safetySettings,
}).withDefaultModel('gemini-2.5-flash');
```

**Available Categories:**
- `HARM_CATEGORY_HATE_SPEECH`
- `HARM_CATEGORY_SEXUALLY_EXPLICIT`
- `HARM_CATEGORY_DANGEROUS_CONTENT`
- `HARM_CATEGORY_HARASSMENT`
- `HARM_CATEGORY_CIVIC_INTEGRITY`

**Available Thresholds:**
- `BLOCK_NONE` - Always show regardless of probability
- `BLOCK_ONLY_HIGH` - Block when high probability
- `BLOCK_MEDIUM_AND_ABOVE` - Block when medium or higher
- `BLOCK_LOW_AND_ABOVE` - Block when low or higher
- `OFF` - Turn off the safety filter

### Session Lifecycle Hooks

Register cleanup functions with `onDone()`. They run in LIFO order (last registered first):

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  // Open a resource
  const connection = await database.connect();

  // Register cleanup (runs when session ends)
  session.onDone(async () => {
    await connection.close();
    console.log('Connection closed');
  });

  const result = await session.generateText({
    prompt: `Query the database: ${await connection.query('...')}`,
  });

  return result.text;
  // Connection.close() is called automatically here
});
```

## Best Practices

### API Key Management

Never hardcode API keys. Use environment variables:

```typescript
// Good
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
});

// Bad - Never do this
const provider = createGoogleProvider({
  apiKey: 'AIzaSy...',
});
```

For production, consider using a secret management service like AWS Secrets Manager, Google Secret Manager, or HashiCorp Vault.

### Error Handling

Provider operations can throw specific error types. Handle them appropriately:

```typescript
import {
  createGoogleProvider,
  RateLimitError,
  AuthenticationError,
  ModelNotFoundError,
  TimeoutError,
} from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

try {
  const execution = provider.simpleExecution(async (session) => {
    const result = await session.generateText({ prompt: 'Hello!' });
    return result.text;
  });
  const text = await execution.toResult();
} catch (error) {
  if (error instanceof RateLimitError) {
    // Retryable - wait and retry
    console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
    await sleep(error.retryAfter * 1000);
    // retry...
  } else if (error instanceof AuthenticationError) {
    // Not retryable - fix API key
    console.error('Invalid API key:', error.reason);
  } else if (error instanceof ModelNotFoundError) {
    // Not retryable - fix model name
    console.error(`Model not found: ${error.model}`);
  } else if (error instanceof TimeoutError) {
    // Retryable - increase timeout or retry
    console.log(`Timed out after ${error.timeout}ms`);
  } else {
    throw error;
  }
}
```

### Reuse Providers

Create providers once and reuse them. The fluent API creates new instances, so you can safely share base providers:

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';

// Create base provider once at app startup
const baseProvider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
});

// Create specialized variants
const flashProvider = baseProvider.withDefaultModel('gemini-2.5-flash');
const proProvider = baseProvider.withDefaultModel('gemini-2.5-pro');

// Add logging for development
const devProvider = flashProvider.withLogger(createLogger({
  onLLMCallEnd: (e) => console.log(`Tokens: ${e.response.usage?.totalTokens}`),
}));
```

### Choose the Right Execution Mode

- Use `simpleExecution()` for:
  - Quick one-shot requests
  - Background processing
  - When you only need the final result

- Use `streamingExecution()` for:
  - Real-time UIs showing progress
  - Long-running multi-step operations
  - When you need to emit intermediate events

## See Also

- [Getting Started](../getting-started.md) - Quick introduction to @agtlantis/core
- [API Reference: Provider](../api/provider.md) - Complete API documentation
- [Patterns Guide](./patterns-guide.md) - Progressive streaming patterns
- [Validation Guide](./validation-guide.md) - Output validation and retries
