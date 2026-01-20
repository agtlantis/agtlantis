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

  // Functions
  createFilePromptRepository,
  compileTemplate,
  toPromptDefinition,

  // Types
  type PromptContent,
  type PromptDefinition,
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

### PromptContent

Raw prompt content as stored in the repository. This is the serialized form before template compilation.

```typescript
interface PromptContent {
  /** Unique identifier for the prompt */
  id: string;
  /** Semantic version string (e.g., '1.0.0') */
  version: string;
  /** System prompt content */
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
system: You are a helpful assistant.
userTemplate: "Hello, {{name}}!"
```

---

### PromptDefinition<TInput>

Compiled prompt definition with template function. Created from `PromptContent` after Handlebars compilation.

```typescript
interface PromptDefinition<TInput> {
  /** Unique identifier for the prompt */
  id: string;
  /** Semantic version string (e.g., '1.0.0') */
  version: string;
  /** System prompt content */
  system: string;
  /** Original user prompt template (Handlebars syntax) */
  userTemplate: string;
  /** Compiled template function that renders the user prompt */
  buildUserPrompt: (input: TInput) => string;
}
```

**Example:**

```typescript
interface GreetingInput {
  name: string;
}

const prompt: PromptDefinition<GreetingInput> = {
  id: 'greeting',
  version: '1.0.0',
  system: 'You are a helpful assistant.',
  userTemplate: 'Hello, {{name}}!',
  buildUserPrompt: (input) => `Hello, ${input.name}!`,
};

const userPrompt = prompt.buildUserPrompt({ name: 'World' });
// => 'Hello, World!'
```

---

### PromptRepository

Repository interface for prompt storage operations.

```typescript
interface PromptRepository {
  read<TInput>(id: string, version?: string): Promise<PromptDefinition<TInput>>;
  write(content: PromptContent): Promise<void>;
}
```

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `read<TInput>` | `id: string, version?: string` | `Promise<PromptDefinition<TInput>>` | Read prompt, optionally by version |
| `write` | `content: PromptContent` | `Promise<void>` | Write prompt to storage |

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
import { createFilePromptRepository } from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './prompts' });

// Read latest version of 'greeting'
const latest = await repo.read<{ name: string }>('greeting');
console.log(latest.version); // Latest version

// Read specific version
const v1 = await repo.read<{ name: string }>('greeting', '1.0.0');

// Build user prompt with variables
const userPrompt = latest.buildUserPrompt({ name: 'World' });
```

---

### FilePromptRepository

Class implementation of file-based prompt repository. Use this class directly when you need to subclass and customize behavior.

```typescript
class FilePromptRepository implements PromptRepository {
  constructor(options: FilePromptRepositoryOptions);

  read<TInput>(id: string, version?: string): Promise<PromptDefinition<TInput>>;
  write(content: PromptContent): Promise<void>;

  // Protected methods for subclassing
  protected getFileName(id: string, version: string): string;
  protected parseFileName(fileName: string): { id: string; version: string } | null;
  protected parseContent(content: string, promptId: string): PromptContent;
  protected serializeContent(content: PromptContent): string;
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
| `parseContent(content, promptId)` | Parses file content to `PromptContent` |
| `serializeContent(content)` | Serializes `PromptContent` to file content |

**Example (Subclassing for JSON format):**

```typescript
import { FilePromptRepository, type PromptContent } from '@agtlantis/core';

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

  protected parseContent(content: string): PromptContent {
    return JSON.parse(content);
  }

  protected serializeContent(content: PromptContent): string {
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

### toPromptDefinition()

Converts raw `PromptContent` to a compiled `PromptDefinition`.

```typescript
function toPromptDefinition<TInput>(
  content: PromptContent
): PromptDefinition<TInput>
```

**Throws:** `PromptTemplateError` - If template compilation fails.

**Example:**

```typescript
import { toPromptDefinition, type PromptContent } from '@agtlantis/core';

const content: PromptContent = {
  id: 'greeting',
  version: '1.0.0',
  system: 'You are a helpful assistant.',
  userTemplate: 'Hello, {{name}}!',
};

const definition = toPromptDefinition<{ name: string }>(content);
const userPrompt = definition.buildUserPrompt({ name: 'World' });
// => 'Hello, World!'
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
import { createFilePromptRepository, createGoogleProvider } from '@agtlantis/core';

interface GreetingInput {
  name: string;
}

const repo = createFilePromptRepository({ directory: './prompts' });
const prompt = await repo.read<GreetingInput>('greeting');

const userMessage = prompt.buildUserPrompt({ name: 'World' });

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
}).withDefaultModel('gemini-2.5-flash');

const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({
    system: prompt.system,
    prompt: userMessage,
  });
  return result.text;
});

const text = await execution.toResult();
console.log(text);
```

### Multi-Version Prompt Management

```typescript
import { createFilePromptRepository } from '@agtlantis/core';

interface AnalysisInput {
  text: string;
}

const repo = createFilePromptRepository({ directory: './prompts' });

// Automatically select latest version
const latestPrompt = await repo.read<AnalysisInput>('analysis');
console.log(`Using version: ${latestPrompt.version}`);

// Request specific version for A/B testing
const v1Prompt = await repo.read<AnalysisInput>('analysis', '1.0.0');
const v2Prompt = await repo.read<AnalysisInput>('analysis', '2.0.0');

const input: AnalysisInput = { text: 'Sample text' };
const v1Message = v1Prompt.buildUserPrompt(input);
const v2Message = v2Prompt.buildUserPrompt(input);
```

### Creating and Writing Prompts

```typescript
import { createFilePromptRepository, type PromptContent } from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './prompts' });

const newPrompt: PromptContent = {
  id: 'summary',
  version: '1.0.0',
  system: 'You are a concise summarizer.',
  userTemplate: 'Summarize the following text:\n\n{{text}}',
};

await repo.write(newPrompt);
```

### Error Handling Pattern

```typescript
import {
  createFilePromptRepository,
  PromptNotFoundError,
  PromptInvalidFormatError,
  PromptTemplateError,
  PromptIOError,
} from '@agtlantis/core';

const repo = createFilePromptRepository({ directory: './prompts' });

async function loadPromptSafely<T>(id: string, version?: string) {
  try {
    const prompt = await repo.read<T>(id, version);
    return { success: true, prompt } as const;
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

const result = await loadPromptSafely<{ name: string }>('greeting');
if (result.success) {
  console.log(result.prompt.buildUserPrompt({ name: 'World' }));
} else {
  console.error(result.error);
}
```

### Custom File System for Testing

```typescript
import { createFilePromptRepository, type FileSystem } from '@agtlantis/core';

const mockFiles: Record<string, string> = {
  './prompts/test-1.0.0.yaml': `
id: test
version: "1.0.0"
system: Test system prompt
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
const prompt = await repo.read<{ name: string }>('test', '1.0.0');
console.log(prompt.buildUserPrompt({ name: 'Test' }));
// => "Hello Test"
```

---

## See Also

- [Errors API Reference](./errors.md) - Base error classes
- [Provider Guide](../guides/provider-guide.md) - Using prompts with providers
- [Session API Reference](./session.md) - Session methods for LLM calls
- [Getting Started](../getting-started.md) - Quick introduction
