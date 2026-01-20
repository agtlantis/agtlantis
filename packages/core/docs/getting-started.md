# Getting Started

> Get up and running with @agtlantis/core in under 5 minutes.

## Overview

@agtlantis/core provides a unified interface for building AI agents on top of the Vercel AI SDK. You can switch between providers (Google, OpenAI) without changing your application code, while getting built-in observability, validation, and cost tracking.

## Prerequisites

- Node.js 18 or higher
- An API key from Google AI or OpenAI

## Installation

```bash
# Using pnpm (recommended)
pnpm add @agtlantis/core

# Using npm
npm install @agtlantis/core

# Using yarn
yarn add @agtlantis/core
```

## Your First Agent

Let's create a simple agent that generates text. You'll need an API key from either Google AI or OpenAI.

### Step 1: Set Up Your Environment

Create a `.env` file with your API key:

```bash
# For Google AI
GOOGLE_AI_API_KEY=your-google-api-key

# Or for OpenAI
OPENAI_API_KEY=your-openai-api-key
```

### Step 2: Create a Provider

A provider is your connection to an LLM. Here's how to create one:

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});
```

Or if you prefer OpenAI:

```typescript
import { createOpenAIProvider } from '@agtlantis/core';

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Step 3: Execute Your First Call

Now you can generate text using the provider:

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Explain what an AI agent is in one sentence.' });
  return result.text;
});

const text = await execution.toResult();
console.log(text);
// Output: "An AI agent is an autonomous software system that perceives its environment and takes actions to achieve specific goals."
```

## Switching Models

You can override the default model for any provider:

```typescript
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.0-flash-exp');
```

This returns a new provider instance with the specified model, leaving the original unchanged.

## Adding Observability

Track what's happening in your agent with a logger:

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';

const logger = createLogger({
  onLLMCallStart: (event) => {
    console.log(`Starting ${event.callType} call to ${event.modelId}`);
  },
  onLLMCallEnd: (event) => {
    const usage = event.response.usage;
    console.log(`Completed. Tokens: ${usage?.inputTokens} in, ${usage?.outputTokens} out`);
  },
});

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withLogger(logger);

// Now all LLM calls are logged automatically
const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello!' });
  return result.text;
});
```

## Complete Example

Here's a full working example you can copy and run:

```typescript
import { createGoogleProvider, createLogger } from '@agtlantis/core';

async function main() {
  // Create a logger
  const logger = createLogger({
    onLLMCallStart: (event) => console.log(`[START] ${event.callType}`),
    onLLMCallEnd: (event) => console.log(`[END] tokens: ${event.response.usage?.totalTokens}`),
  });

  // Create provider with logging
  const provider = createGoogleProvider({
    apiKey: process.env.GOOGLE_AI_API_KEY,
  })
    .withDefaultModel('gemini-2.0-flash-exp')
    .withLogger(logger);

  // Execute
  const execution = provider.simpleExecution(async (session) => {
    const result = await session.generateText({
      prompt: 'What are the three laws of robotics? Be brief.',
    });
    return result.text;
  });

  const text = await execution.toResult();
  console.log('\nResponse:', text);
}

main().catch(console.error);
```

## Next Steps

Now that you have the basics, explore these guides:

- [Provider Guide](./guides/provider-guide.md) - Deep dive into providers and sessions
- [Validation Guide](./guides/validation-guide.md) - Validate and retry LLM outputs
- [Patterns Guide](./guides/patterns-guide.md) - Use progressive streaming patterns
- [API Reference](./api/) - Complete API documentation

## Troubleshooting

### "API key is invalid" error

Make sure your environment variable is set correctly. You can verify with:

```bash
echo $GOOGLE_AI_API_KEY
# or
echo $OPENAI_API_KEY
```

### "Module not found" error

Ensure you've installed the package:

```bash
pnpm add @agtlantis/core
```

> **Tip:** If you're using TypeScript, make sure your `tsconfig.json` has `"moduleResolution": "bundler"` or `"node16"` for proper ESM support.
