# Changelog

All notable changes to @agtlantis/core will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Execution Cancellation**: Cancel in-progress LLM operations using `execution.cancel()` or external `AbortSignal`
  - `SimpleExecution<T>` interface with `cancel()` method
  - `ExecutionOptions.signal` for external cancellation control
  - Signal combination: both internal `cancel()` and external signals work together
  - `combineSignals()` utility for merging multiple AbortSignals

- **New Documentation**:
  - `docs/api/execution.md` - Execution API reference
  - `docs/guides/cancellation.md` - Cancellation patterns and best practices

### Changed

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
  const result = await execution.toResult();
  ```

- Session classes (`SimpleSession`, `StreamingSession`) now accept optional `signal` parameter
- Provider implementations pass signal through to AI SDK for native cancellation support

### Why This Breaking Change?

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
const result = await execution.toResult();  // Throws AbortError if cancelled
```

## [0.1.0] - Initial Release

### Added

- Unified Provider Interface (Google, OpenAI)
- Streaming Patterns with event-driven architecture
- Observability helpers (logging, metrics, cost tracking)
- Validation with automatic retries
- Token-based pricing calculation
- Prompt management with Handlebars templating
