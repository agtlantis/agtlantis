# @agtlantis/core

> Higher-level abstractions for Vercel AI SDK

## Overview

[Vercel AI SDK](https://sdk.vercel.ai/) provides excellent primitives for LLM applications. @agtlantis/core raises the abstraction level and makes common concerns easier to address.

## Features

- **Unified Provider Interface** — Same API for Google, OpenAI
- **Streaming Patterns** — Progressive, validation-aware streaming with event-driven architecture
- **Observability Helpers** — Structured logging, metrics, and cost tracking
- **Validation with Retry** — Zod-based output validation with automatic retries
- **Cost Calculation** — Token-based pricing with customizable provider rates
- **Prompt Management** — File-based prompt repository with Handlebars templating

## Installation

Not published to npm yet. Use from the monorepo:

```bash
git clone <repo-url>
cd agtlantis
pnpm install
pnpm build
```

## Quick Start

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

const execution = provider.simpleExecution(async (session) => {
  return session.generateText({ prompt: 'Say hello briefly' });
});

const result = await execution.toResult();
console.log(result.text);
```

### Using OpenAI

Switch providers while keeping the same execution pattern:

```typescript
import { createOpenAIProvider } from '@agtlantis/core';

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
});

const execution = provider.simpleExecution(async (session) => {
  return session.generateText({ prompt: 'Say hello briefly' });
});

const result = await execution.toResult();
console.log(result.text);
```

### Streaming with Progressive Pattern

For structured streaming with progress events:

```typescript
import { z } from 'zod';
import { createGoogleProvider, defineProgressivePattern } from '@agtlantis/core';

const progressSchema = z.object({ step: z.string() });
const resultSchema = z.object({ answer: z.string() });

const pattern = defineProgressivePattern({ progressSchema, resultSchema });

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

const execution = provider.streamingExecution(async function* (session) {
  yield* pattern.runInSession(session, {
    system: 'Report your thinking steps, then provide the final answer.',
    messages: [{ role: 'user', content: 'What is 2 + 2?' }],
  });
});

for await (const event of execution) {
  if (event.type === 'progress') {
    console.log('Step:', event.data.step);
  } else if (event.type === 'complete') {
    console.log('Answer:', event.data.answer);
  }
}
```

## Architecture

```
Your Application
      ↓
@agtlantis/core (Providers, Sessions, Patterns)
      ↓
Vercel AI SDK (generateText, streamText, tools)
      ↓
LLM APIs (Google, OpenAI, Anthropic)
```

## Modules

| Module | Description | Key Exports |
|--------|-------------|-------------|
| **Provider** | Unified LLM interface with session management | `createGoogleProvider`, `createOpenAIProvider` |
| **File Management** | File upload with caching support | `FileManager`, `FileCache`, `InMemoryFileCache` |
| **Patterns** | Reusable execution patterns for streaming | `defineProgressivePattern` |
| **Observability** | Structured logging and metrics collection | `createLogger`, `EventMetrics` |
| **Validation** | Output validation with automatic retries | `withValidation`, `ValidationHistory` |
| **Pricing** | Token cost calculation and tracking | `configurePricing`, `calculateCost` |
| **Prompt** | Prompt templating and repository management | `createFilePromptRepository` |

### Provider Module

Unified interface for different LLM providers:

```typescript
import { createGoogleProvider, createOpenAIProvider } from '@agtlantis/core';

const google = createGoogleProvider({ apiKey: process.env.GOOGLE_AI_API_KEY });
const openai = createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });

// Override default model
const flashProvider = google.withDefaultModel('gemini-2.0-flash-exp');
```

### File Management Module

Upload files with automatic caching to avoid redundant uploads:

```typescript
import { createGoogleProvider, InMemoryFileCache } from '@agtlantis/core';

// Create provider with file caching (30 min TTL)
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
})
  .withDefaultModel('gemini-2.5-flash')
  .withFileCache(new InMemoryFileCache({ defaultTTL: 30 * 60 * 1000 }));

const execution = provider.simpleExecution(async (session) => {
  // Files are cached by content hash - identical files won't be re-uploaded
  const uploaded = await session.fileManager.upload([
    { source: 'path', path: './document.pdf' },
  ]);

  return session.generateText({
    prompt: [
      { type: 'text', text: 'Summarize this document:' },
      uploaded[0].part,
    ],
  });
});
```

### Validation Module

Validate and retry LLM outputs with custom logic:

```typescript
import { createGoogleProvider, withValidation } from '@agtlantis/core';

const provider = createGoogleProvider({ apiKey: process.env.GOOGLE_AI_API_KEY });

const execution = provider.simpleExecution(async (session) => {
  return withValidation(
    async (history) => {
      const prompt = history.isRetry
        ? `Generate a number between 1-10. Previous attempt failed: ${history.failureReasons.join(', ')}`
        : 'Generate a number between 1 and 10';

      const result = await session.generateText({ prompt });
      return result.text;
    },
    {
      validate: (text) => {
        const num = parseInt(text, 10);
        if (isNaN(num) || num < 1 || num > 10) {
          return { valid: false, reason: `"${text}" is not a number between 1-10` };
        }
        return { valid: true };
      },
      maxAttempts: 3,
    },
  );
});

const result = await execution.toResult();
console.log(result); // A number between 1-10
```

### Pricing Module

Track costs across LLM calls:

```typescript
import { configurePricing, calculateCost } from '@agtlantis/core';

configurePricing({
  providers: {
    google: {
      'gemini-2.5-flash': { inputPricePerMillion: 0.5, outputPricePerMillion: 3.0 },
    },
  },
});

const cost = calculateCost({
  inputTokens: 1000,
  outputTokens: 500,
  model: 'gemini-2.5-flash',
  provider: 'google',
});

console.log(cost); // { inputCost: 0.0005, outputCost: 0.0015, totalCost: 0.002 }
```

### Prompt Module

Manage prompts with file-based storage and Handlebars templating:

```typescript
import { createFilePromptRepository } from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './prompts' });

interface GreetingInput {
  name: string;
}

const prompt = await repo.read<GreetingInput>('greeting');
const userPrompt = prompt.renderUserPrompt({ name: 'World' });

console.log(prompt.system);
console.log(userPrompt);
```

## Documentation

For detailed guides and API reference, see the [docs](./docs/) folder:

- [Getting Started](./docs/getting-started.md)
- [Provider Guide](./docs/guides/provider-guide.md)
- [Prompt Guide](./docs/guides/prompt-guide.md) - Prompt management with templating
- [Validation Guide](./docs/guides/validation-guide.md)
- [Patterns Guide](./docs/guides/patterns-guide.md)
- [Cancellation Guide](./docs/guides/cancellation.md) - Cancel in-progress LLM operations
- [API Reference](./docs/api/)

See [CHANGELOG.md](./CHANGELOG.md) for version history and breaking changes.

## Requirements

- Node.js 18+
- TypeScript 5.0+ (recommended)

## License

MIT
