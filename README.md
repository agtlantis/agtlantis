# Agtlantis

> **Build and test AI Agents with ease**

⚠️ **Early Stage** — This is a work-in-progress. We're extracting common patterns from our internal AI projects into reusable modules. APIs may change. Use at your own risk.

## Overview

[Vercel AI SDK](https://sdk.vercel.ai/) is excellent. It provides clean, unified access to LLMs with a well-designed API — generateText, streamText, structured outputs, tool calling. It's the right foundation for AI applications.

**Agtlantis builds on top of it.**

When building real-world AI Agents, additional concerns emerge: observability, cost tracking, prompt versioning, output validation. Agtlantis doesn't solve these for you — it makes them easier to address by raising the abstraction level. Think in Providers, Sessions, and Patterns instead of raw API calls.

**Testing AI is different.** Traditional unit tests are deterministic — same input, same output, pass or fail. AI Agents are non-deterministic. The same prompt can produce different outputs, and "correctness" is often a spectrum, not a binary. @agtlantis/eval embraces this reality with LLM-as-Judge evaluation, statistical iterations, and multi-turn conversation testing.

## Packages

| Package | Purpose |
|---------|---------|
| [@agtlantis/core](./packages/core) | Higher-level abstractions for Vercel AI SDK |
| [@agtlantis/eval](./packages/eval) | Unit testing for AI Agents |

## Architecture

```
Your Application
      ↓
┌─────────────────────────────────────────────────┐
│  @agtlantis/eval                                │
│  (Unit Testing for AI Agents)                   │
└─────────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────────┐
│  @agtlantis/core                                │
│  (Providers, Sessions, Patterns)                │
└─────────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────────┐
│  Vercel AI SDK                                  │
│  (generateText, streamText, tools)              │
└─────────────────────────────────────────────────┘
      ↓
    LLM APIs (Google, OpenAI, Anthropic)
```

## @agtlantis/core

Higher-level abstractions that make Vercel AI SDK easier to work with:

- **Unified Provider Interface** — Same API for Google, OpenAI
- **Session Management** — Organize LLM calls with context
- **Streaming Patterns** — Progressive, event-driven streaming
- **Validation with Retry** — Zod-based validation with automatic retries
- **Observability Helpers** — Logging, metrics, cost tracking
- **Prompt Management** — File-based repository with Handlebars templating

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

[Read more →](./packages/core/README.md)

## @agtlantis/eval

Unit testing for AI Agents, designed for non-deterministic outputs:

- **LLM-as-Judge** — Define criteria, let AI evaluate AI
- **Statistical Iterations** — Run tests multiple times, analyze distribution
- **Multi-turn Testing** — Test complex conversation flows with termination conditions
- **AI Simulated Users** — Generate realistic user inputs with personas
- **Cost Tracking** — Know exactly what each test run costs
- **Markdown Reports** — Human-readable evaluation results

```typescript
import { createOpenAIProvider } from '@agtlantis/core';
import {
  createJudge,
  createEvalSuite,
  accuracy,
  relevance,
  reportToMarkdown,
} from '@agtlantis/eval';

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
}).withDefaultModel('gpt-4o-mini');

const judge = createJudge({
  provider,
  criteria: [accuracy({ weight: 2 }), relevance()],
  passThreshold: 70,
});

const suite = createEvalSuite({
  agent: myAgent,
  judge,
  agentDescription: 'My AI Agent',
});

const report = await suite.run(testCases, { iterations: 5 });
console.log(reportToMarkdown(report));
```

[Read more →](./packages/eval/README.md)

## Installation

Not published to npm yet. Clone and build locally:

```bash
git clone <repo-url>
cd agtlantis
pnpm install
pnpm build
```

Then link or reference the built packages in your project.

## Development

```bash
pnpm build      # Build all packages
pnpm test       # Run tests
pnpm typecheck  # Type check
```

## Requirements

- Node.js 18+
- TypeScript 5.0+ (recommended)

## License

MIT
