# Prompt Guide

> Build structured, type-safe prompts with Handlebars templating and seamless Provider integration.

## Overview

The prompt module helps you manage LLM prompts as structured, versioned templates. Instead of hardcoding prompts in your code, you can:

- **Separate prompts from code** - Store prompts as YAML files
- **Use Handlebars templating** - Dynamic content with conditionals, loops, and helpers
- **Type-safe rendering** - Generic types ensure correct input at compile time
- **Integrate with Providers** - Use prompts directly in session calls

## Quick Start

```typescript
import { createFilePromptRepository, createGoogleProvider, PromptContent } from '@agtlantis/core';

// 1. Create repository and load prompt data
const repo = createFilePromptRepository({ directory: './prompts' });
const data = await repo.read('explain');

// 2. Compile to builder with type parameters
interface SessionContext { context: string }
interface TurnContext { topic: string }

const builder = PromptContent.from(data).toBuilder<SessionContext, TurnContext>();

// 3. Build prompts from templates
const systemPrompt = builder.buildSystemPrompt({ context: 'educational' });
const userMessage = builder.buildUserPrompt({ topic: 'quantum computing' });

// 4. Use with provider
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({
    system: systemPrompt,
    prompt: userMessage,
  });
  return result.text;
});

const result = await execution.result();
// result.status: 'succeeded' | 'failed' | 'canceled'
```

## Handlebars Templates

The prompt module uses [Handlebars](https://handlebarsjs.com/) for templating. Templates are compiled with `strict: true` (missing variables throw errors) and `noEscape: true` (no HTML escaping).

### Variable Substitution

Basic variable substitution with `{{variable}}` syntax:

```yaml
# prompts/greeting-1.0.0.yaml
id: greeting
version: "1.0.0"
system: You are a helpful assistant.
userTemplate: "Hello, {{name}}! You are interested in {{topic}}."
```

```typescript
import { PromptContent } from '@agtlantis/core';

interface GreetingInput {
  name: string;
  topic: string;
}

const data = await repo.read('greeting');
const builder = PromptContent.from(data).toBuilder<unknown, GreetingInput>();
const message = builder.buildUserPrompt({ name: 'Alice', topic: 'AI' });
// => "Hello, Alice! You are interested in AI."
```

### Nested Properties

Access nested object properties with dot notation:

```yaml
userTemplate: |
  User: {{user.name}} ({{user.email}})
  Request: {{request.type}}
```

```typescript
interface Input {
  user: { name: string; email: string };
  request: { type: string };
}
```

### Conditionals

Use `{{#if}}` for conditional content:

```yaml
userTemplate: |
  Analyze the following text:
  {{text}}

  {{#if includeExamples}}
  Please include examples in your response.
  {{/if}}

  {{#if format}}
  Format: {{format}}
  {{else}}
  Use your preferred format.
  {{/if}}
```

```typescript
interface AnalysisInput {
  text: string;
  includeExamples?: boolean;
  format?: string;
}

const data = await repo.read('analysis');
const builder = PromptContent.from(data).toBuilder<unknown, AnalysisInput>();

// With examples
builder.buildUserPrompt({ text: 'Hello world', includeExamples: true });

// With custom format
builder.buildUserPrompt({ text: 'Hello world', format: 'bullet points' });

// Defaults (no examples, default format message)
builder.buildUserPrompt({ text: 'Hello world' });
```

**Falsy values:** `{{#if}}` treats `false`, `undefined`, `null`, `0`, `""`, and `[]` as falsy.

### Loops

Use `{{#each}}` to iterate over arrays:

```yaml
userTemplate: |
  Review the following items:
  {{#each items}}
  - {{this}}
  {{/each}}
```

```typescript
interface ReviewInput {
  items: string[];
}

const data = await repo.read('review');
const builder = PromptContent.from(data).toBuilder<unknown, ReviewInput>();
builder.buildUserPrompt({ items: ['item1', 'item2', 'item3'] });
// => "Review the following items:\n- item1\n- item2\n- item3\n"
```

**With objects:**

```yaml
userTemplate: |
  Participants:
  {{#each participants}}
  - {{this.name}} ({{this.role}})
  {{/each}}
```

```typescript
interface MeetingInput {
  participants: Array<{ name: string; role: string }>;
}

const data = await repo.read('meeting');
const builder = PromptContent.from(data).toBuilder<unknown, MeetingInput>();
builder.buildUserPrompt({
  participants: [
    { name: 'Alice', role: 'host' },
    { name: 'Bob', role: 'guest' },
  ],
});
```

**Loop context variables:**

- `{{@index}}` - Current index (0-based)
- `{{@first}}` - True if first iteration
- `{{@last}}` - True if last iteration

```yaml
userTemplate: |
  {{#each steps}}
  Step {{add @index 1}}: {{this}}{{#unless @last}}, then{{/unless}}
  {{/each}}
```

### Built-in Helper: `add`

The `add` helper performs arithmetic addition:

```yaml
userTemplate: |
  Question {{add currentIndex 1}} of {{totalQuestions}}:
  {{question}}
```

```typescript
interface QuizInput {
  currentIndex: number;
  totalQuestions: number;
  question: string;
}

prompt.buildUserPrompt({ currentIndex: 0, totalQuestions: 5, question: 'What is 2+2?' });
// => "Question 1 of 5:\nWhat is 2+2?"
```

### Combining Patterns

Complex templates can combine multiple patterns:

```yaml
# prompts/code-review-1.0.0.yaml
id: code-review
version: "1.0.0"
system: You are a senior software engineer conducting code reviews.
userTemplate: |
  Please review the following {{language}} code:

  ```{{language}}
  {{code}}
  ```

  {{#if focusAreas}}
  Focus on these areas:
  {{#each focusAreas}}
  - {{this}}
  {{/each}}
  {{/if}}

  {{#if context}}
  Additional context: {{context}}
  {{/if}}
```

```typescript
interface CodeReviewInput {
  language: string;
  code: string;
  focusAreas?: string[];
  context?: string;
}

const data = await repo.read('code-review');
const builder = PromptContent.from(data).toBuilder<unknown, CodeReviewInput>();

// Full review
builder.buildUserPrompt({
  language: 'typescript',
  code: 'function add(a, b) { return a + b; }',
  focusAreas: ['type safety', 'error handling'],
  context: 'This is part of a calculator module',
});

// Minimal review
builder.buildUserPrompt({
  language: 'python',
  code: 'def hello(): print("hi")',
});
```

## Provider Integration Patterns

### Basic Integration

The simplest pattern: load prompt data, compile to builder, call session.

```typescript
import { createFilePromptRepository, createGoogleProvider, PromptContent } from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './prompts' });
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

async function explain(topic: string): Promise<string> {
  const data = await repo.read('explain');
  const builder = PromptContent.from(data).toBuilder<unknown, { topic: string }>();

  const execution = provider.simpleExecution(async (session) => {
    const result = await session.generateText({
      system: data.system,  // Static system prompt
      prompt: builder.buildUserPrompt({ topic }),
    });
    return result.text;
  });

  const result = await execution.result();
  if (result.status !== 'succeeded') throw result.status === 'failed' ? result.error : new Error('canceled');
  return result.value;
}
```

### Structured Output with Prompts

Combine prompts with Zod schemas for validated, typed responses:

```typescript
import { createFilePromptRepository, createGoogleProvider, PromptContent } from '@agtlantis/core';
import { z } from 'zod';

const sentimentSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  confidence: z.number().min(0).max(1),
  keywords: z.array(z.string()),
});

type SentimentResult = z.infer<typeof sentimentSchema>;

interface SentimentInput {
  text: string;
  language?: string;
}

async function analyzeSentiment(input: SentimentInput): Promise<SentimentResult> {
  const repo = createFilePromptRepository({ directory: './prompts' });
  const data = await repo.read('sentiment-analysis');
  const builder = PromptContent.from(data).toBuilder<unknown, SentimentInput>();

  const provider = createGoogleProvider({
    apiKey: process.env.GOOGLE_AI_API_KEY!,
  }).withDefaultModel('gemini-2.5-flash');

  const execution = provider.simpleExecution(async (session) => {
    const result = await session.generateText({
      system: data.system,
      prompt: builder.buildUserPrompt(input),
      output: 'object',
      schema: sentimentSchema,
    });
    return result.object;
  });

  const result = await execution.result();
  if (result.status !== 'succeeded') throw result.status === 'failed' ? result.error : new Error('canceled');
  return result.value;
}
```

### Multi-turn Conversations

Use prompts for the initial system message and first user turn:

```typescript
import { createFilePromptRepository, createGoogleProvider, PromptContent } from '@agtlantis/core';

interface SessionContext {
  assistantRole: string;
}

interface TurnContext {
  context: string;
  initialQuestion: string;
}

async function startConversation(sessionCtx: SessionContext, turnCtx: TurnContext) {
  const repo = createFilePromptRepository({ directory: './prompts' });
  const data = await repo.read('chat-assistant');
  const builder = PromptContent.from(data).toBuilder<SessionContext, TurnContext>();

  const systemPrompt = builder.buildSystemPrompt(sessionCtx);

  const provider = createGoogleProvider({
    apiKey: process.env.GOOGLE_AI_API_KEY!,
  }).withDefaultModel('gemini-2.5-flash');

  const execution = provider.simpleExecution(async (session) => {
    // Initial turn with prompt
    const firstResponse = await session.generateText({
      system: systemPrompt,
      messages: [{ role: 'user', content: builder.buildUserPrompt(turnCtx) }],
    });

    // Follow-up turns
    const secondResponse = await session.generateText({
      system: systemPrompt,
      messages: [
        { role: 'user', content: builder.buildUserPrompt(turnCtx) },
        { role: 'model', content: firstResponse.text },
        { role: 'user', content: 'Can you elaborate on that?' },
      ],
    });

    return {
      first: firstResponse.text,
      second: secondResponse.text,
    };
  });

  const result = await execution.result();
  if (result.status !== 'succeeded') throw result.status === 'failed' ? result.error : new Error('canceled');
  return result.value;
}
```

### Streaming with Prompts

Prompts work seamlessly with streaming executions:

```typescript
import { createFilePromptRepository, createGoogleProvider, PromptContent } from '@agtlantis/core';

async function* streamExplanation(topic: string) {
  const repo = createFilePromptRepository({ directory: './prompts' });
  const data = await repo.read('explain');
  const builder = PromptContent.from(data).toBuilder<unknown, { topic: string }>();

  const provider = createGoogleProvider({
    apiKey: process.env.GOOGLE_AI_API_KEY!,
  }).withDefaultModel('gemini-2.5-flash');

  const execution = provider.streamingExecution(async function* (session) {
    yield* session.streamText({
      system: data.system,
      prompt: builder.buildUserPrompt({ topic }),
    });
  });

  for await (const event of execution.stream()) {
    if (event.type === 'text-delta') {
      yield event.delta;
    }
  }
}

// Usage
for await (const chunk of streamExplanation('neural networks')) {
  process.stdout.write(chunk);
}
```

### Validation with Prompts

Combine prompts with the validation module for retry logic:

```typescript
import {
  createFilePromptRepository,
  createGoogleProvider,
  withValidation,
  PromptContent,
} from '@agtlantis/core';
import { z } from 'zod';

const analysisSchema = z.object({
  summary: z.string().min(50),
  confidence: z.number().min(0).max(1),
});

type Analysis = z.infer<typeof analysisSchema>;

interface AnalysisInput {
  document: string;
  retryHint?: string;
}

async function analyzeDocument(document: string): Promise<Analysis> {
  const repo = createFilePromptRepository({ directory: './prompts' });
  const data = await repo.read('document-analysis');
  const builder = PromptContent.from(data).toBuilder<unknown, AnalysisInput>();

  const provider = createGoogleProvider({
    apiKey: process.env.GOOGLE_AI_API_KEY!,
  }).withDefaultModel('gemini-2.5-flash');

  const execution = provider.simpleExecution(async (session) => {
    return withValidation<Analysis>(
      async (history) => {
        const input: AnalysisInput = {
          document,
          retryHint: history.isRetry ? history.last?.reason : undefined,
        };

        const result = await session.generateText({
          system: data.system,
          prompt: builder.buildUserPrompt(input),
          output: 'object',
          schema: analysisSchema,
        });

        return result.object;
      },
      {
        validate: (result) => ({
          valid: result.confidence >= 0.7,
          reason: `Confidence ${result.confidence} below threshold 0.7`,
        }),
        maxAttempts: 3,
      }
    );
  });

  const result = await execution.result();
  if (result.status !== 'succeeded') throw result.status === 'failed' ? result.error : new Error('canceled');
  return result.value;
}
```

The prompt YAML can include retry context:

```yaml
# prompts/document-analysis-1.0.0.yaml
id: document-analysis
version: "1.0.0"
system: You are a document analysis expert. Provide high-confidence analyses.
userTemplate: |
  Analyze the following document:

  {{document}}

  {{#if retryHint}}
  Note: Previous attempt was insufficient. {{retryHint}}
  Please provide a more thorough analysis.
  {{/if}}
```

## Testing Prompts

### Unit Testing Templates

Test template rendering in isolation without LLM calls:

```typescript
import { describe, it, expect } from 'vitest';
import { PromptContent, type PromptContentData } from '@agtlantis/core';

describe('greeting prompt', () => {
  const data: PromptContentData = {
    id: 'greeting',
    version: '1.0.0',
    system: 'You are helping {{studentName}}.',
    userTemplate: 'Hello, {{name}}! You have {{items.length}} items.',
  };

  interface SessionContext {
    studentName: string;
  }

  interface GreetingInput {
    name: string;
    items: string[];
  }

  it('renders system prompt with variables', () => {
    const builder = PromptContent.from(data).toBuilder<SessionContext, GreetingInput>();
    const result = builder.buildSystemPrompt({ studentName: 'Kim' });
    expect(result).toBe('You are helping Kim.');
  });

  it('renders user prompt with all variables', () => {
    const builder = PromptContent.from(data).toBuilder<SessionContext, GreetingInput>();
    const result = builder.buildUserPrompt({ name: 'Alice', items: ['a', 'b'] });
    expect(result).toBe('Hello, Alice! You have 2 items.');
  });

  it('handles empty arrays', () => {
    const builder = PromptContent.from(data).toBuilder<SessionContext, GreetingInput>();
    const result = builder.buildUserPrompt({ name: 'Bob', items: [] });
    expect(result).toBe('Hello, Bob! You have 0 items.');
  });
});
```

### Testing Conditionals and Loops

```typescript
import { describe, it, expect } from 'vitest';
import { PromptContent, type PromptContentData } from '@agtlantis/core';

describe('code-review prompt', () => {
  const data: PromptContentData = {
    id: 'code-review',
    version: '1.0.0',
    system: 'You are a code reviewer.',
    userTemplate: `Review this {{language}} code:
\`\`\`
{{code}}
\`\`\`
{{#if focusAreas}}
Focus areas:
{{#each focusAreas}}
- {{this}}
{{/each}}
{{/if}}`,
  };

  interface CodeReviewInput {
    language: string;
    code: string;
    focusAreas?: string[];
  }

  it('renders without optional fields', () => {
    const builder = PromptContent.from(data).toBuilder<unknown, CodeReviewInput>();
    const result = builder.buildUserPrompt({
      language: 'typescript',
      code: 'const x = 1;',
    });

    expect(result).toContain('typescript');
    expect(result).toContain('const x = 1;');
    expect(result).not.toContain('Focus areas');
  });

  it('renders with focus areas', () => {
    const builder = PromptContent.from(data).toBuilder<unknown, CodeReviewInput>();
    const result = builder.buildUserPrompt({
      language: 'python',
      code: 'x = 1',
      focusAreas: ['performance', 'readability'],
    });

    expect(result).toContain('Focus areas:');
    expect(result).toContain('- performance');
    expect(result).toContain('- readability');
  });
});
```

### Testing with Mock Repository

Test repository interactions without file system:

```typescript
import { describe, it, expect } from 'vitest';
import { createFilePromptRepository, PromptContent, type FileSystem } from '@agtlantis/core';

describe('prompt repository', () => {
  const mockFiles: Record<string, string> = {
    'greeting-1.0.0.yaml': `
id: greeting
version: "1.0.0"
system: "You are helping {{studentName}}."
userTemplate: "Hello {{name}}"
`,
  };

  const mockFs: FileSystem = {
    readFile: async (path) => {
      const filename = path.split('/').pop()!;
      if (mockFiles[filename]) return mockFiles[filename];
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    writeFile: async (path, content) => {
      const filename = path.split('/').pop()!;
      mockFiles[filename] = content;
    },
    readdir: async () => Object.keys(mockFiles),
  };

  interface SessionCtx { studentName: string }
  interface TurnCtx { name: string }

  it('loads and compiles prompt', async () => {
    const repo = createFilePromptRepository({
      directory: './prompts',
      fs: mockFs,
    });

    const data = await repo.read('greeting', '1.0.0');
    const builder = PromptContent.from(data).toBuilder<SessionCtx, TurnCtx>();

    expect(data.id).toBe('greeting');
    expect(builder.buildSystemPrompt({ studentName: 'Kim' })).toBe('You are helping Kim.');
    expect(builder.buildUserPrompt({ name: 'World' })).toBe('Hello World');
  });

  it('throws on missing prompt', async () => {
    const repo = createFilePromptRepository({
      directory: './prompts',
      fs: mockFs,
    });

    await expect(repo.read('nonexistent')).rejects.toThrow();
  });
});
```

### Testing Error Cases

```typescript
import { describe, it, expect } from 'vitest';
import { PromptContent, PromptTemplateError, type PromptContentData } from '@agtlantis/core';

describe('template errors', () => {
  it('throws on missing required variable', () => {
    const data: PromptContentData = {
      id: 'test',
      version: '1.0.0',
      system: 'System',
      userTemplate: 'Hello {{name}}',
    };

    const builder = PromptContent.from(data).toBuilder<unknown, { name: string }>();

    expect(() => builder.buildUserPrompt({} as { name: string })).toThrow(
      PromptTemplateError
    );
  });

  it('throws on invalid template syntax', () => {
    const data: PromptContentData = {
      id: 'test',
      version: '1.0.0',
      system: 'System',
      userTemplate: 'Hello {{#if}}', // Invalid - missing condition
    };

    expect(() => PromptContent.from(data).toBuilder()).toThrow(PromptTemplateError);
  });
});
```

---

## See Also

- [Prompt API Reference](../api/prompt.md) - Complete type documentation
- [Provider Guide](./provider-guide.md) - Provider configuration and usage
- [Validation Guide](./validation-guide.md) - Retry and validation patterns
- [Testing Guide](./testing-guide.md) - General testing strategies
