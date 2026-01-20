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
import { createFilePromptRepository, createGoogleProvider } from '@agtlantis/core';

// 1. Create repository and load prompt
const repo = createFilePromptRepository({ directory: './prompts' });
const prompt = await repo.read<{ topic: string }>('explain');

// 2. Build user message from template
const userMessage = prompt.buildUserPrompt({ topic: 'quantum computing' });

// 3. Use with provider
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({
    system: prompt.system,
    prompt: userMessage,
  });
  return result.text;
});

const text = await execution.toResult();
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
interface GreetingInput {
  name: string;
  topic: string;
}

const prompt = await repo.read<GreetingInput>('greeting');
const message = prompt.buildUserPrompt({ name: 'Alice', topic: 'AI' });
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

// With examples
prompt.buildUserPrompt({ text: 'Hello world', includeExamples: true });

// With custom format
prompt.buildUserPrompt({ text: 'Hello world', format: 'bullet points' });

// Defaults (no examples, default format message)
prompt.buildUserPrompt({ text: 'Hello world' });
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

prompt.buildUserPrompt({ items: ['item1', 'item2', 'item3'] });
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

prompt.buildUserPrompt({
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

const prompt = await repo.read<CodeReviewInput>('code-review');

// Full review
prompt.buildUserPrompt({
  language: 'typescript',
  code: 'function add(a, b) { return a + b; }',
  focusAreas: ['type safety', 'error handling'],
  context: 'This is part of a calculator module',
});

// Minimal review
prompt.buildUserPrompt({
  language: 'python',
  code: 'def hello(): print("hi")',
});
```

## Provider Integration Patterns

### Basic Integration

The simplest pattern: load prompt, build message, call session.

```typescript
import { createFilePromptRepository, createGoogleProvider } from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './prompts' });
const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
}).withDefaultModel('gemini-2.5-flash');

async function explain(topic: string): Promise<string> {
  const prompt = await repo.read<{ topic: string }>('explain');

  const execution = provider.simpleExecution(async (session) => {
    const result = await session.generateText({
      system: prompt.system,
      prompt: prompt.buildUserPrompt({ topic }),
    });
    return result.text;
  });

  return execution.toResult();
}
```

### Structured Output with Prompts

Combine prompts with Zod schemas for validated, typed responses:

```typescript
import { createFilePromptRepository, createGoogleProvider } from '@agtlantis/core';
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
  const prompt = await repo.read<SentimentInput>('sentiment-analysis');

  const provider = createGoogleProvider({
    apiKey: process.env.GOOGLE_AI_API_KEY!,
  }).withDefaultModel('gemini-2.5-flash');

  const execution = provider.simpleExecution(async (session) => {
    const result = await session.generateText({
      system: prompt.system,
      prompt: prompt.buildUserPrompt(input),
      output: 'object',
      schema: sentimentSchema,
    });
    return result.object;
  });

  return execution.toResult();
}
```

### Multi-turn Conversations

Use prompts for the initial system message and first user turn:

```typescript
import { createFilePromptRepository, createGoogleProvider } from '@agtlantis/core';

interface ChatInput {
  context: string;
  initialQuestion: string;
}

async function startConversation(input: ChatInput) {
  const repo = createFilePromptRepository({ directory: './prompts' });
  const prompt = await repo.read<ChatInput>('chat-assistant');

  const provider = createGoogleProvider({
    apiKey: process.env.GOOGLE_AI_API_KEY!,
  }).withDefaultModel('gemini-2.5-flash');

  const execution = provider.simpleExecution(async (session) => {
    // Initial turn with prompt
    const firstResponse = await session.generateText({
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.buildUserPrompt(input) }],
    });

    // Follow-up turns
    const secondResponse = await session.generateText({
      system: prompt.system,
      messages: [
        { role: 'user', content: prompt.buildUserPrompt(input) },
        { role: 'model', content: firstResponse.text },
        { role: 'user', content: 'Can you elaborate on that?' },
      ],
    });

    return {
      first: firstResponse.text,
      second: secondResponse.text,
    };
  });

  return execution.toResult();
}
```

### Streaming with Prompts

Prompts work seamlessly with streaming executions:

```typescript
import { createFilePromptRepository, createGoogleProvider } from '@agtlantis/core';

async function* streamExplanation(topic: string) {
  const repo = createFilePromptRepository({ directory: './prompts' });
  const prompt = await repo.read<{ topic: string }>('explain');

  const provider = createGoogleProvider({
    apiKey: process.env.GOOGLE_AI_API_KEY!,
  }).withDefaultModel('gemini-2.5-flash');

  const execution = provider.streamingExecution(async function* (session) {
    yield* session.streamText({
      system: prompt.system,
      prompt: prompt.buildUserPrompt({ topic }),
    });
  });

  for await (const event of execution.toStream()) {
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
  const prompt = await repo.read<AnalysisInput>('document-analysis');

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
          system: prompt.system,
          prompt: prompt.buildUserPrompt(input),
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

  return execution.toResult();
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
import { toPromptDefinition, type PromptContent } from '@agtlantis/core';

describe('greeting prompt', () => {
  const content: PromptContent = {
    id: 'greeting',
    version: '1.0.0',
    system: 'You are a helpful assistant.',
    userTemplate: 'Hello, {{name}}! You have {{items.length}} items.',
  };

  interface GreetingInput {
    name: string;
    items: string[];
  }

  it('renders with all variables', () => {
    const prompt = toPromptDefinition<GreetingInput>(content);
    const result = prompt.buildUserPrompt({ name: 'Alice', items: ['a', 'b'] });
    expect(result).toBe('Hello, Alice! You have 2 items.');
  });

  it('handles empty arrays', () => {
    const prompt = toPromptDefinition<GreetingInput>(content);
    const result = prompt.buildUserPrompt({ name: 'Bob', items: [] });
    expect(result).toBe('Hello, Bob! You have 0 items.');
  });
});
```

### Testing Conditionals and Loops

```typescript
import { describe, it, expect } from 'vitest';
import { toPromptDefinition, type PromptContent } from '@agtlantis/core';

describe('code-review prompt', () => {
  const content: PromptContent = {
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
    const prompt = toPromptDefinition<CodeReviewInput>(content);
    const result = prompt.buildUserPrompt({
      language: 'typescript',
      code: 'const x = 1;',
    });

    expect(result).toContain('typescript');
    expect(result).toContain('const x = 1;');
    expect(result).not.toContain('Focus areas');
  });

  it('renders with focus areas', () => {
    const prompt = toPromptDefinition<CodeReviewInput>(content);
    const result = prompt.buildUserPrompt({
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
import { createFilePromptRepository, type FileSystem } from '@agtlantis/core';

describe('prompt repository', () => {
  const mockFiles: Record<string, string> = {
    'greeting-1.0.0.yaml': `
id: greeting
version: "1.0.0"
system: Test system
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

  it('loads and compiles prompt', async () => {
    const repo = createFilePromptRepository({
      directory: './prompts',
      fs: mockFs,
    });

    const prompt = await repo.read<{ name: string }>('greeting', '1.0.0');

    expect(prompt.id).toBe('greeting');
    expect(prompt.system).toBe('Test system');
    expect(prompt.buildUserPrompt({ name: 'World' })).toBe('Hello World');
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
import { toPromptDefinition, PromptTemplateError, type PromptContent } from '@agtlantis/core';

describe('template errors', () => {
  it('throws on missing required variable', () => {
    const content: PromptContent = {
      id: 'test',
      version: '1.0.0',
      system: 'System',
      userTemplate: 'Hello {{name}}',
    };

    const prompt = toPromptDefinition<{ name: string }>(content);

    expect(() => prompt.buildUserPrompt({} as { name: string })).toThrow(
      PromptTemplateError
    );
  });

  it('throws on invalid template syntax', () => {
    const content: PromptContent = {
      id: 'test',
      version: '1.0.0',
      system: 'System',
      userTemplate: 'Hello {{#if}}', // Invalid - missing condition
    };

    expect(() => toPromptDefinition(content)).toThrow(PromptTemplateError);
  });
});
```

---

## See Also

- [Prompt API Reference](../api/prompt.md) - Complete type documentation
- [Provider Guide](./provider-guide.md) - Provider configuration and usage
- [Validation Guide](./validation-guide.md) - Retry and validation patterns
- [Testing Guide](./testing-guide.md) - General testing strategies
