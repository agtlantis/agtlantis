# Prompt API Reference

> Complete type documentation for the prompt module in @agtlantis/core.

## Overview

The prompt module provides structured prompt management with versioning, templating, and repository abstraction. You can organize prompts as versioned files, compile Handlebars templates, and integrate them into your agent workflows.

Key features:
- **File-based Repository** - Store prompts as YAML files with semantic versioning
- **Handlebars Templates** - Compile templates with variable substitution
- **Version Management** - Automatically select latest version or request specific versions
- **Type Safety** - Generic type parameters for template input types

## Import

```typescript
import {
  // Classes
  FilePromptRepository,
  PromptContent,

  // Functions
  createFilePromptRepository,
  compileTemplate,

  // Types
  type PromptContentData,
  type PromptBuilder,
  type PromptRepository,
  type FileSystem,
  type FilePromptRepositoryOptions,

  // Errors
  PromptErrorCode,
  PromptError,
  PromptNotFoundError,
  PromptInvalidFormatError,
  PromptTemplateError,
  PromptIOError,
} from '@agtlantis/core';
```

## Types

### PromptContentData

Raw prompt content data as stored in the repository. This is the serialized form before template compilation.

```typescript
interface PromptContentData {
  /** Unique identifier for the prompt */
  id: string;
  /** Semantic version string (e.g., '1.0.0') */
  version: string;
  /** System prompt template (Handlebars syntax) */
  system: string;
  /** User prompt template (Handlebars syntax) */
  userTemplate: string;
}
```

**YAML File Example:**

```yaml
# prompts/greeting-1.0.0.yaml
id: greeting
version: "1.0.0"
system: You are helping {{studentName}} with their studies.
userTemplate: "Hello, {{name}}! Let's continue our lesson."
```

> **Note:** Both `system` and `userTemplate` support Handlebars syntax for dynamic content.

---

### PromptBuilder<TSystemInput, TUserInput>

Compiled prompt builder with template functions. Created from `PromptContent.toBuilder()` after Handlebars compilation.

```typescript
interface PromptBuilder<TSystemInput = unknown, TUserInput = TSystemInput> {
  /** Unique identifier for the prompt */
  id: string;
  /** Semantic version string (e.g., '1.0.0') */
  version: string;
  /** Compiled template function that renders the system prompt */
  buildSystemPrompt: (input: TSystemInput) => string;
  /** Compiled template function that renders the user prompt */
  buildUserPrompt: (input: TUserInput) => string;
}
```

**Type Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TSystemInput` | `unknown` | Input type for system prompt template |
| `TUserInput` | `TSystemInput` | Input type for user prompt template (defaults to TSystemInput) |

**Example:**

```typescript
interface SessionContext {
  studentName: string;
}

interface TurnContext {
  question: string;
}

const data = await repo.read('tutor');
const builder = PromptContent.from(data).toBuilder<SessionContext, TurnContext>();

const systemPrompt = builder.buildSystemPrompt({ studentName: 'Kim' });
// => 'You are helping Kim with their studies.'

const userPrompt = builder.buildUserPrompt({ question: 'What is photosynthesis?' });
// => 'Student asks: What is photosynthesis?'
```

**Single Type Parameter (Same Input for Both):**

```typescript
interface CommonContext {
  topic: string;
}

// TUserInput defaults to TSystemInput
const builder = PromptContent.from(data).toBuilder<CommonContext>();
```

---

### PromptContent (Class)

Prompt content class with template compilation capabilities. Use `PromptContent.from()` to create from raw data, then call `toBuilder()` to get compiled template functions.

```typescript
class PromptContent implements PromptContentData {
  readonly id: string;
  readonly version: string;
  readonly system: string;
  readonly userTemplate: string;

  static from(data: PromptContentData): PromptContent;
  toBuilder<TSystemInput = unknown, TUserInput = TSystemInput>(): PromptBuilder<TSystemInput, TUserInput>;
  toData(): PromptContentData;
}
```

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `from(data)` | `PromptContent` | Static factory method to create from raw data |
| `toBuilder<S, U>()` | `PromptBuilder<S, U>` | Compiles templates and returns builder |
| `toData()` | `PromptContentData` | Returns raw data representation |

**Example:**

```typescript
import { PromptContent, type PromptContentData } from '@agtlantis/core';

const data: PromptContentData = {
  id: 'greeting',
  version: '1.0.0',
  system: 'You are helping {{studentName}}.',
  userTemplate: 'Hello, {{name}}!',
};

interface SessionCtx { studentName: string }
interface TurnCtx { name: string }

const content = PromptContent.from(data);
const builder = content.toBuilder<SessionCtx, TurnCtx>();

const systemPrompt = builder.buildSystemPrompt({ studentName: 'Kim' });
const userPrompt = builder.buildUserPrompt({ name: 'World' });
```

---

### PromptRepository

Repository interface for prompt storage operations. Returns raw `PromptContentData` (not compiled builders).

```typescript
interface PromptRepository {
  read(id: string, version?: string): Promise<PromptContentData>;
  write(content: PromptContentData): Promise<void>;
}
```

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `read` | `id: string, version?: string` | `Promise<PromptContentData>` | Read raw prompt data, optionally by version |
| `write` | `content: PromptContentData` | `Promise<void>` | Write prompt to storage |

> **Note:** To compile templates, use `PromptContent.from(data).toBuilder<S, U>()`.

---

### FileSystem

Minimal file system interface for repository operations.

```typescript
interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
}
```

---

### FilePromptRepositoryOptions

Configuration options for creating a file-based prompt repository.

```typescript
interface FilePromptRepositoryOptions {
  /** Directory path where prompt files are stored */
  directory: string;
  /** Optional custom file system implementation (defaults to Node.js fs) */
  fs?: FileSystem;
  /** Enable in-memory caching for read operations (defaults to true) */
  cache?: boolean;
}
```

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `directory` | `string` | Yes | - | Directory path for prompt files |
| `fs` | `FileSystem` | No | Node.js `fs/promises` | Custom file system implementation |
| `cache` | `boolean` | No | `true` | Enable in-memory caching |

---

## Functions

### createFilePromptRepository()

Creates a file-based prompt repository. Prompts are stored as YAML files with naming convention: `{id}-{version}.yaml`.

```typescript
function createFilePromptRepository(
  options: FilePromptRepositoryOptions
): PromptRepository
```

**File Naming Convention:**

- Format: `{id}-{version}.yaml`
- Example: `greeting-1.0.0.yaml`, `greeting-2.0.0.yaml`

**Example:**

```typescript
import { createFilePromptRepository, PromptContent } from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './prompts' });

// Read latest version of 'greeting' (returns raw data)
const data = await repo.read('greeting');
console.log(data.version); // Latest version

// Compile to builder with type parameters
interface SessionCtx { studentName: string }
interface TurnCtx { name: string }

const builder = PromptContent.from(data).toBuilder<SessionCtx, TurnCtx>();

// Build prompts with variables
const systemPrompt = builder.buildSystemPrompt({ studentName: 'Kim' });
const userPrompt = builder.buildUserPrompt({ name: 'World' });

// For static system prompts (no variables), use data.system directly
const staticSystem = data.system;
```

---

### FilePromptRepository

Class implementation of file-based prompt repository. Use this class directly when you need to subclass and customize behavior.

```typescript
class FilePromptRepository implements PromptRepository {
  constructor(options: FilePromptRepositoryOptions);

  read(id: string, version?: string): Promise<PromptContentData>;
  write(content: PromptContentData): Promise<void>;

  // Protected methods for subclassing
  protected getFileName(id: string, version: string): string;
  protected parseFileName(fileName: string): { id: string; version: string } | null;
  protected parseContent(content: string, promptId: string): PromptContentData;
  protected serializeContent(content: PromptContentData): string;
}
```

**Protected Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `directory` | `string` | Directory path for prompt files |
| `fileSystem` | `FileSystem` | File system implementation |
| `cacheEnabled` | `boolean` | Whether caching is enabled |

**Protected Methods:**

| Method | Description |
|--------|-------------|
| `getFileName(id, version)` | Generates file name (default: `{id}-{version}.yaml`) |
| `parseFileName(fileName)` | Parses file name to extract id and version |
| `parseContent(content, promptId)` | Parses file content to `PromptContentData` |
| `serializeContent(content)` | Serializes `PromptContentData` to file content |

**Example (Subclassing for JSON format):**

```typescript
import { FilePromptRepository, type PromptContentData } from '@agtlantis/core';

class JsonPromptRepository extends FilePromptRepository {
  protected getFileName(id: string, version: string): string {
    return `${id}-${version}.json`;
  }

  protected parseFileName(fileName: string): { id: string; version: string } | null {
    if (!fileName.endsWith('.json')) return null;
    const baseName = fileName.slice(0, -5);
    const lastDash = baseName.lastIndexOf('-');
    if (lastDash === -1) return null;
    return { id: baseName.slice(0, lastDash), version: baseName.slice(lastDash + 1) };
  }

  protected parseContent(content: string): PromptContentData {
    return JSON.parse(content);
  }

  protected serializeContent(content: PromptContentData): string {
    return JSON.stringify(content, null, 2);
  }
}
```

---

### compileTemplate()

Compiles a Handlebars template string into a render function.

```typescript
function compileTemplate<TInput>(
  template: string,
  promptId: string
): (input: TInput) => string
```

**Throws:** `PromptTemplateError` - If template compilation fails.

**Template Features:**

- Variable substitution: `{{variable}}`
- Conditionals: `{{#if condition}}...{{/if}}`
- Loops: `{{#each items}}...{{/each}}`
- Built-in helper: `{{add a b}}` for arithmetic

**Example:**

```typescript
import { compileTemplate } from '@agtlantis/core';

const render = compileTemplate<{ name: string; items: string[] }>(
  'Hello, {{name}}! You have {{items.length}} items.',
  'greeting'
);

const result = render({ name: 'Alice', items: ['a', 'b', 'c'] });
// => 'Hello, Alice! You have 3 items.'
```

---

## Errors

The prompt module defines its own error types that extend `AgtlantisError`.

### PromptErrorCode

```typescript
enum PromptErrorCode {
  PROMPT_ERROR = 'PROMPT_ERROR',
  NOT_FOUND = 'PROMPT_NOT_FOUND',
  INVALID_FORMAT = 'PROMPT_INVALID_FORMAT',
  TEMPLATE_ERROR = 'PROMPT_TEMPLATE_ERROR',
  IO_ERROR = 'PROMPT_IO_ERROR',
}
```

> **Note:** The enum member names (e.g., `NOT_FOUND`) differ from their string values (e.g., `'PROMPT_NOT_FOUND'`). When checking `error.code`, compare against the enum value:
> ```typescript
> if (error.code === PromptErrorCode.NOT_FOUND) { ... }
> ```

---

### PromptNotFoundError

Error thrown when a prompt is not found in the repository.

```typescript
class PromptNotFoundError extends PromptError {
  readonly promptId: string;
  readonly version?: string;
}
```

**Example:**

```typescript
import { createFilePromptRepository, PromptNotFoundError } from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './prompts' });

try {
  await repo.read('nonexistent-prompt');
} catch (error) {
  if (error instanceof PromptNotFoundError) {
    console.log(`Prompt '${error.promptId}' not found`);
  }
}
```

---

### PromptInvalidFormatError

Error thrown when a prompt file has invalid format.

```typescript
class PromptInvalidFormatError extends PromptError {
  readonly promptId: string;
  readonly details: string;
}
```

**Example:**

```typescript
import { createFilePromptRepository, PromptInvalidFormatError } from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './prompts' });

try {
  await repo.read('broken', '1.0.0');
} catch (error) {
  if (error instanceof PromptInvalidFormatError) {
    console.log(`Invalid format: ${error.details}`);
  }
}
```

---

### PromptTemplateError

Error thrown when template compilation fails.

```typescript
class PromptTemplateError extends PromptError {
  readonly promptId: string;
  readonly details: string;
}
```

**Example (runtime error - missing variable):**

```typescript
import { createFilePromptRepository, PromptTemplateError } from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './prompts' });
const prompt = await repo.read<{ name: string }>('greeting');

try {
  prompt.buildUserPrompt({} as { name: string });
} catch (error) {
  if (error instanceof PromptTemplateError) {
    console.log(`Template error: ${error.details}`);
  }
}
```

---

### PromptIOError

Error thrown when file I/O operations fail.

```typescript
class PromptIOError extends PromptError {
  readonly operation: 'read' | 'write' | 'list';
  readonly path: string;
}
```

**Example:**

```typescript
import { createFilePromptRepository, PromptIOError } from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './nonexistent' });

try {
  await repo.read('greeting');
} catch (error) {
  if (error instanceof PromptIOError) {
    console.log(`I/O error during ${error.operation}: ${error.path}`);
  }
}
```

---

## Examples

### Basic Prompt Loading and Usage

```typescript
import { createFilePromptRepository, createGoogleProvider, PromptContent } from '@agtlantis/core';

interface SessionContext {
  assistantName: string;
}

interface TurnContext {
  name: string;
}

const repo = createFilePromptRepository({ directory: './prompts' });
const data = await repo.read('greeting');
const builder = PromptContent.from(data).toBuilder<SessionContext, TurnContext>();

const systemPrompt = builder.buildSystemPrompt({ assistantName: 'Helper' });
const userMessage = builder.buildUserPrompt({ name: 'World' });

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({
    system: systemPrompt,
    prompt: userMessage,
  });
  return result.text;
});

const text = await execution.toResult();
console.log(text);
```

### Static System Prompt (No Template Variables)

When your system prompt has no template variables, you can use `data.system` directly:

```typescript
import { createFilePromptRepository, createGoogleProvider, PromptContent } from '@agtlantis/core';

interface TurnContext {
  name: string;
}

const repo = createFilePromptRepository({ directory: './prompts' });
const data = await repo.read('greeting');

// Use data.system directly for static system prompts
const builder = PromptContent.from(data).toBuilder<unknown, TurnContext>();
const userMessage = builder.buildUserPrompt({ name: 'World' });

const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({
    system: data.system,  // Static system prompt
    prompt: userMessage,
  });
  return result.text;
});
```

### Multi-Version Prompt Management

```typescript
import { createFilePromptRepository, PromptContent } from '@agtlantis/core';

interface AnalysisInput {
  text: string;
}

const repo = createFilePromptRepository({ directory: './prompts' });

// Automatically select latest version
const latestData = await repo.read('analysis');
console.log(`Using version: ${latestData.version}`);

// Request specific version for A/B testing
const v1Data = await repo.read('analysis', '1.0.0');
const v2Data = await repo.read('analysis', '2.0.0');

const v1Builder = PromptContent.from(v1Data).toBuilder<unknown, AnalysisInput>();
const v2Builder = PromptContent.from(v2Data).toBuilder<unknown, AnalysisInput>();

const input: AnalysisInput = { text: 'Sample text' };
const v1Message = v1Builder.buildUserPrompt(input);
const v2Message = v2Builder.buildUserPrompt(input);
```

### Creating and Writing Prompts

```typescript
import { createFilePromptRepository, type PromptContentData } from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './prompts' });

const newPrompt: PromptContentData = {
  id: 'summary',
  version: '1.0.0',
  system: 'You are a concise summarizer for {{subject}}.',
  userTemplate: 'Summarize the following text:\n\n{{text}}',
};

await repo.write(newPrompt);
```

### Error Handling Pattern

```typescript
import {
  createFilePromptRepository,
  PromptContent,
  PromptNotFoundError,
  PromptInvalidFormatError,
  PromptTemplateError,
  PromptIOError,
  type PromptContentData,
} from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './prompts' });

async function loadPromptSafely(id: string, version?: string) {
  try {
    const data = await repo.read(id, version);
    return { success: true, data } as const;
  } catch (error) {
    if (error instanceof PromptNotFoundError) {
      return { success: false, error: `Prompt '${error.promptId}' not found` } as const;
    }
    if (error instanceof PromptInvalidFormatError) {
      return { success: false, error: `Invalid format: ${error.details}` } as const;
    }
    if (error instanceof PromptTemplateError) {
      return { success: false, error: `Template error: ${error.details}` } as const;
    }
    if (error instanceof PromptIOError) {
      return { success: false, error: `I/O error: ${error.path}` } as const;
    }
    throw error;
  }
}

const result = await loadPromptSafely('greeting');
if (result.success) {
  const builder = PromptContent.from(result.data).toBuilder<unknown, { name: string }>();
  console.log(builder.buildUserPrompt({ name: 'World' }));
} else {
  console.error(result.error);
}
```

### Custom File System for Testing

```typescript
import { createFilePromptRepository, PromptContent, type FileSystem } from '@agtlantis/core';

const mockFiles: Record<string, string> = {
  './prompts/test-1.0.0.yaml': `
id: test
version: "1.0.0"
system: "You are helping {{studentName}}."
userTemplate: "Hello {{name}}"
`,
};

const mockFs: FileSystem = {
  readFile: async (path) => {
    if (mockFiles[path]) return mockFiles[path];
    throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
  },
  writeFile: async (path, content) => {
    mockFiles[path] = content;
  },
  readdir: async () => Object.keys(mockFiles).map((p) => p.split('/').pop()!),
};

const repo = createFilePromptRepository({ directory: './prompts', fs: mockFs });
const data = await repo.read('test', '1.0.0');

interface SessionCtx { studentName: string }
interface TurnCtx { name: string }

const builder = PromptContent.from(data).toBuilder<SessionCtx, TurnCtx>();
console.log(builder.buildSystemPrompt({ studentName: 'Kim' }));
// => "You are helping Kim."
console.log(builder.buildUserPrompt({ name: 'Test' }));
// => "Hello Test"
```

---

## See Also

- [Errors API Reference](./errors.md) - Base error classes
- [Provider Guide](../guides/provider-guide.md) - Using prompts with providers
- [Session API Reference](./session.md) - Session methods for LLM calls
- [Getting Started](../getting-started.md) - Quick introduction
