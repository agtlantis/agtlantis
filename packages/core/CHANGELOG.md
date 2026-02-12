# Changelog

All notable changes to @agtlantis/core will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Prompt API Rename**: Clarified naming for prompt-related types and methods
  - `PromptBuilder` → `PromptRenderer`
  - `PromptContent` → `PromptTemplate`
  - `PromptContentData` → `PromptTemplateData`
  - `.toBuilder()` → `.compile()`

### Added

- **Execution Mapping Utilities**: Transform execution results and events at service boundaries
  - `mapExecution()` — transform all events in a `StreamingExecution` or result of `SimpleExecution`
  - `mapExecutionResult()` — transform only `CompletionEvent` data (result-only convenience)
  - `ReplaceResult<TEvent, U>` — type helper for replacing `CompletionEvent` data type in event union

- **File Cache Fluent API**: `withFileCache(cache?)` method for providers
  - `GoogleProvider.withFileCache()` - injects cache into `GoogleFileManager`
  - `OpenAIProvider.withFileCache()` - no-op for API consistency
  - If no cache argument provided, creates default `InMemoryFileCache`

### Changed

- **BREAKING**: Simplified `TEvent` generic constraint for streaming executions
  - **Before**: `TEvent extends { type: string; metrics: EventMetrics }`
  - **After**: `TEvent extends { type: string }`
  - Framework now automatically wraps events with `SessionEvent<TEvent>` internally
  - Users no longer need to wrap event types with `SessionEvent<>`

  ```typescript
  // Before (deprecated)
  type MyEvent = SessionEvent<
    | { type: 'progress'; message: string }
    | { type: 'complete'; data: string }
  >;

  // After (recommended)
  type MyEvent =
    | { type: 'progress'; message: string }
    | { type: 'complete'; data: string };
  ```

### Deprecated

- `SessionEventInput<T>` type helper: No longer needed, `emit()` accepts event type directly

### Notes

- `SessionEvent<T>` is **no longer required** for defining event types - the framework adds metrics automatically. However, it's still useful for testing/mocking scenarios where you need to create events with explicit metrics.

---

## [0.2.0] - 2025-01-30

### Added

- **File Caching**: Cache uploaded files to avoid redundant uploads
  - `FileCache` interface with TTL support
  - `InMemoryFileCache` default implementation
  - `computeFileSourceHash()` for content-based cache keys
  - `FileSource.hash` field for explicit cache keys

- **Type Improvements**:
  - `FilePart` → `FileSource` rename (avoid AI SDK collision)
  - `UploadedFile { id, part }` structure for better DX
  - Removed redundant `type: 'file'` discriminator

- **Execution Cancellation**: Cancel in-progress LLM operations using `execution.cancel()` or external `AbortSignal`
  - `SimpleExecution<T>` interface with `cancel()` method
  - `ExecutionOptions.signal` for external cancellation control
  - Signal combination: both internal `cancel()` and external signals work together
  - `combineSignals()` utility for merging multiple AbortSignals

- `ExecutionResult<T>` type: discriminated union for execution outcomes
- `StreamingResult<TEvent, T>` type: includes events array
- `execution.stream()` method: access event stream

- **New Documentation**:
  - `docs/api/execution.md` - Execution API reference
  - `docs/guides/cancellation.md` - Cancellation patterns and best practices

### Changed

- **BREAKING**: Introduced Execution Result Pattern
  - Unified `toResult()` + `getSummary()` into single `result()` method
  - `result()` returns discriminated union: `{ status: 'succeeded' | 'failed' | 'canceled'; summary; ... }`
  - `summary` is now accessible even on failure/cancellation
  - **Migration**:
    - `await execution.toResult()` → `(await execution.result()).value`
    - `await execution.getSummary()` → `(await execution.result()).summary`

- **BREAKING**: `StreamingExecution` no longer implements `AsyncIterable` directly
  - **Before**: `for await (const e of execution) { }`
  - **After**: `for await (const e of execution.stream()) { }`
  - Internal consumer pattern prevents event loss
  - All events accessible via `result().events`

- **BREAKING**: `provider.simpleExecution()` return type changed
  - **Before**: Returns `Promise<Execution<T>>` (required `await`)
  - **After**: Returns `SimpleExecution<T>` directly (sync, no `await`)
  - **Migration**: Remove the first `await` when calling `simpleExecution()`

  ```typescript
  // Before (v1.x)
  const execution = await provider.simpleExecution(fn);
  const result = await execution.toResult();

  // After (v2.x)
  const execution = provider.simpleExecution(fn);  // No await
  const result = await execution.result();
  console.log(result.value);
  ```

- Session classes (`SimpleSession`, `StreamingSession`) now accept optional `signal` parameter
- Provider implementations pass signal through to AI SDK for native cancellation support

### Why These Breaking Changes?

**Execution Result Pattern:**

The previous API had two problems:
1. Separate `toResult()` and `getSummary()` calls were awkward
2. On failure, `getSummary()` was unavailable, losing valuable usage data

The new `result()` method returns a discriminated union where `summary` is always accessible:

```typescript
const result = await execution.result();
// result.summary is ALWAYS available, even on failure/cancellation
console.log('Tokens used:', result.summary.totalLLMUsage.totalTokens);
```

**Explicit stream() Method:**

The previous `AsyncIterable` implementation made it too easy to accidentally iterate multiple times or miss events. The explicit `stream()` method makes the streaming intent clear and enables the internal consumer pattern that captures all events.

**Sync simpleExecution:**

The previous API made early cancellation impossible:

```typescript
// Old API - couldn't cancel because await blocked until completion
const execution = await provider.simpleExecution(fn);
execution.cancel(); // Too late - already done
```

The new API enables true cancellation:

```typescript
// New API - can cancel while execution is in progress
const execution = provider.simpleExecution(fn);
setTimeout(() => execution.cancel(), 5000); // Actually cancels
const result = await execution.result();
// result.status === 'canceled' if cancelled
```

## [0.1.0] - Initial Release

### Added

- Unified Provider Interface (Google, OpenAI)
- Streaming Patterns with event-driven architecture
- Observability helpers (logging, metrics, cost tracking)
- Validation with automatic retries
- Token-based pricing calculation
- Prompt management with Handlebars templating
