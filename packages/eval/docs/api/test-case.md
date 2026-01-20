# Test Case Helpers

> Test case creation helpers and collection management with fluent API

## Overview

Test case helpers provide utilities for creating and managing test cases. These helpers offer a fluent API for test case creation and selection, making it easy to control which tests run during development vs. CI. Use `testCase()` for individual tests, `testCases()` for bulk creation, and `TestCaseCollection` for advanced selection and filtering.

---

## `testCase(input, id?)`

Creates a single test case with an optional ID.

```typescript
function testCase<TInput>(input: TInput, id?: string): TestCase<TInput>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `TInput` | The test case input data |
| `id` | `string` | Optional custom ID (auto-generated if not provided) |

### Returns

`TestCase<TInput>` with the provided input and ID.

### Example

```typescript
import { testCase } from '@agtlantis/eval'

// Auto-generated IDs: test-1, test-2, ...
const case1 = testCase({ name: 'Alice' })
const case2 = testCase({ name: 'Bob' })

// Custom ID
const case3 = testCase({ name: 'Charlie' }, 'custom-id')
```

> **Note:** Auto-generated IDs use a global counter (`test-1`, `test-2`, ...). For deterministic IDs across runs, provide explicit IDs or use `testCases()` with a prefix.

---

## `testCases(inputs, prefix?)`

Creates multiple test cases from an array of inputs with auto-generated IDs.

```typescript
function testCases<TInput>(
  inputs: TInput[],
  prefix?: string  // default: 'case'
): TestCase<TInput>[]
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `inputs` | `TInput[]` | Array of test case input data |
| `prefix` | `string` | ID prefix (default: `'case'`) |

### Returns

`TestCase<TInput>[]` with IDs in format `{prefix}-{index}`.

### Example

```typescript
import { testCases } from '@agtlantis/eval'

// Default prefix: case-0, case-1, case-2
const cases = testCases([
  { query: 'What is 2+2?' },
  { query: 'What is the capital of France?' },
  { query: 'Explain quantum computing' },
])

// Custom prefix: greet-0, greet-1
const greetingCases = testCases(
  [{ name: 'Alice' }, { name: 'Bob' }],
  'greet'
)
```

---

## `TestCaseCollection`

An immutable collection for managing and selecting test cases with a fluent, chainable API.

```typescript
class TestCaseCollection<TInput> {
  // Static factories
  static from<T>(cases: TestCase<T>[]): TestCaseCollection<T>
  static empty<T>(): TestCaseCollection<T>

  // Properties
  get length(): number
  get isEmpty(): boolean

  // Selection methods (return new collection - chainable)
  all(): TestCaseCollection<TInput>
  minimal(count?: number): TestCaseCollection<TInput>
  first(count: number): TestCaseCollection<TInput>
  last(count?: number): TestCaseCollection<TInput>
  random(count: number, options?: RandomOptions): TestCaseCollection<TInput>
  filter(predicate: (tc: TestCase<TInput>) => boolean): TestCaseCollection<TInput>
  byId(id: string): TestCaseCollection<TInput>
  byIds(ids: string[]): TestCaseCollection<TInput>

  // Access methods
  get(id: string): TestCase<TInput> | undefined
  at(index: number): TestCase<TInput> | undefined
  toArray(): TestCase<TInput>[]

  // Iterator support
  [Symbol.iterator](): Iterator<TestCase<TInput>>
}
```

### Static Factories

| Method | Description |
|--------|-------------|
| `from(cases)` | Create collection from array of test cases |
| `empty()` | Create empty collection |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `length` | `number` | Number of test cases |
| `isEmpty` | `boolean` | Whether collection is empty |

### Selection Methods

All selection methods return a **new** `TestCaseCollection`, enabling method chaining.

| Method | Description |
|--------|-------------|
| `all()` | Returns all test cases |
| `minimal(count?)` | Returns first N cases (default: 1). Alias for `first()` |
| `first(count)` | Returns first N cases |
| `last(count?)` | Returns last N cases (default: 1) |
| `random(count, options?)` | Returns N random cases (optionally seeded) |
| `filter(predicate)` | Filter by predicate function |
| `byId(id)` | Find single case by ID |
| `byIds(ids)` | Find multiple cases by IDs (preserves order) |

### Access Methods

| Method | Description |
|--------|-------------|
| `get(id)` | Get case by ID (returns `undefined` if not found) |
| `at(index)` | Get case by index (supports negative indices) |
| `toArray()` | Convert to mutable array |

### Example

```typescript
import { TestCaseCollection, createEvalSuite } from '@agtlantis/eval'

const cases = TestCaseCollection.from([
  { id: 'basic', input: { query: 'Hello' }, tags: ['fast'] },
  { id: 'complex', input: { query: 'Explain quantum computing' } },
  { id: 'edge', input: { query: '' }, tags: ['edge-case'] },
])

// Development: quick feedback with minimal cases
const report = await suite.run(cases.minimal().toArray())

// CI: full coverage
const report = await suite.run(cases.all().toArray())

// Debug specific case
const report = await suite.run(cases.byId('edge').toArray())

// Chaining: filter then sample
const filtered = cases
  .filter(tc => tc.tags?.includes('fast'))
  .random(3, { seed: 42 })
  .toArray()

// Multiple IDs (order preserved)
const selected = cases.byIds(['edge', 'basic']).toArray()
```

---

## `RandomOptions`

Options for seeded random selection.

```typescript
interface RandomOptions {
  /** Seed for reproducible random selection */
  seed?: number
}
```

### Example

```typescript
import { TestCaseCollection } from '@agtlantis/eval'

const cases = TestCaseCollection.from(myTestCases)

// Different each run
const random1 = cases.random(5)

// Reproducible: same result every time with same seed
const reproducible1 = cases.random(5, { seed: 42 })
const reproducible2 = cases.random(5, { seed: 42 })
// reproducible1 and reproducible2 contain the same cases
```

> **Tip:** Use seeded random selection in CI environments to ensure reproducible test runs while still getting variety across different seeds.

---

## FilePart

A flexible, type-safe abstraction for embedding files directly in test inputs. Files are automatically scanned and resolved to AI SDK compatible format at runtime.

### FilePart Types

FileParts use a discriminated union pattern with `type: 'file'` and `source` as the discriminator.

```typescript
// Path-based: loaded from filesystem
interface FilePartPath {
  type: 'file'
  source: 'path'
  path: string
  mediaType?: string
  filename?: string
}

// In-memory data (e.g., from Multer)
interface FilePartData {
  type: 'file'
  source: 'data'
  data: Buffer | Uint8Array
  mediaType: string
  filename?: string
}

// Base64-encoded (raw string, no data: prefix)
interface FilePartBase64 {
  type: 'file'
  source: 'base64'
  data: string
  mediaType: string
  filename?: string
}

// URL-based: AI SDK fetches lazily
interface FilePartUrl {
  type: 'file'
  source: 'url'
  url: string
  mediaType?: string
  filename?: string
}

// Union type
type FilePart = FilePartPath | FilePartData | FilePartBase64 | FilePartUrl
```

### Usage in Test Cases

```typescript
import type { TestCase, FilePart } from '@agtlantis/eval'

// Single file
const testCase: TestCase<FilePart> = {
  id: 'analyze-pdf',
  input: { type: 'file', source: 'path', path: './fixtures/record.pdf' }
}

// Mixed content with multiple files
const testCase: TestCase<{ prompt: string; files: FilePart[] }> = {
  id: 'multi-file-analysis',
  input: {
    prompt: 'Analyze these documents',
    files: [
      { type: 'file', source: 'path', path: './doc.pdf' },
      { type: 'file', source: 'url', url: 'https://example.com/image.png' },
    ]
  }
}
```

### `resolveFilePart(part, options?)`

Resolves a single FilePart to AI SDK compatible format.

```typescript
import { resolveFilePart } from '@agtlantis/eval'

const resolved = await resolveFilePart(
  { type: 'file', source: 'path', path: './doc.pdf' },
  { basePath: __dirname, maxSize: 50 * 1024 * 1024 }
)
// { type: 'file', source: 'data', data: Buffer, mediaType: 'application/pdf', filename: 'doc.pdf' }
```

**Conversion Rules:**
- `path` -> FilePartData (reads file into Buffer, infers mediaType from extension)
- `data` -> unchanged (returned as-is)
- `base64` -> unchanged (returned as-is)
- `url` -> unchanged (returned as-is)

### `resolveFilePartsInInput(input, options?)`

Recursively scans an input object and resolves all FileParts found within it.

```typescript
import { resolveFilePartsInInput } from '@agtlantis/eval'

const input = {
  prompt: 'Analyze this',
  file: { type: 'file', source: 'path', path: './doc.pdf' }
}

const resolved = await resolveFilePartsInInput(input)
// resolved.file = { type: 'file', source: 'data', data: Buffer, mediaType: 'application/pdf', ... }
```

### `scanForFileParts(input)`

Recursively scans an input for FileParts without resolving them. Returns found parts with their JSON paths.

```typescript
import { scanForFileParts } from '@agtlantis/eval'

const input = {
  prompt: 'Analyze',
  files: [
    { type: 'file', source: 'path', path: './a.pdf' },
    { type: 'file', source: 'path', path: './b.pdf' },
  ]
}

const found = scanForFileParts(input)
// [
//   { part: {...}, path: ['files', 0] },
//   { part: {...}, path: ['files', 1] },
// ]
```

### `inferMimeType(path)`

Infers MIME type from file extension.

```typescript
import { inferMimeType } from '@agtlantis/eval'

inferMimeType('doc.pdf')   // 'application/pdf'
inferMimeType('image.png') // 'image/png'
inferMimeType('data.json') // 'application/json'
```

### Display Utilities

#### `getFilePartDisplayInfo(part)`

Extracts display-friendly information from a FilePart for reporting.

```typescript
import { getFilePartDisplayInfo } from '@agtlantis/eval'

const info = getFilePartDisplayInfo({ type: 'file', source: 'path', path: './doc.pdf' })
// { source: 'path', description: './doc.pdf', mediaType: 'application/pdf', filename: 'doc.pdf' }
```

#### `getFilePartsDisplayInfo(input)`

Extracts display info for all FileParts found in an input.

```typescript
import { getFilePartsDisplayInfo } from '@agtlantis/eval'

const infos = getFilePartsDisplayInfo(input)
// Array of FilePartDisplayInfo objects
```

### Type Guards

```typescript
import {
  isFilePart,
  isFilePartPath,
  isFilePartData,
  isFilePartBase64,
  isFilePartUrl,
} from '@agtlantis/eval'

if (isFilePart(value)) {
  // value is FilePart
  if (isFilePartPath(value)) {
    console.log(value.path)
  } else if (isFilePartUrl(value)) {
    console.log(value.url)
  }
}
```

### Types Reference

```typescript
// Scanner result
interface FoundFilePart {
  part: FilePart
  path: (string | number)[]
}

// Display info for reports
interface FilePartDisplayInfo {
  source: 'path' | 'data' | 'base64' | 'url'
  description: string
  mediaType: string
  filename?: string
}

// Resolution options
interface ResolveOptions {
  basePath?: string   // Base path for relative paths (default: cwd)
  maxSize?: number    // Max file size in bytes (default: 50MB)
}
```

---

## See Also

- [Eval Suite](./eval-suite.md) - Run test cases through evaluation suites
- [Multi-Turn](./multi-turn.md) - Multi-turn test case configuration
- [Execution](./execution.md) - Low-level test case execution
