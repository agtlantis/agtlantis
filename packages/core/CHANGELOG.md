# Changelog

All notable changes to @agtlantis/core will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0]

### Added

- **Anthropic Provider** (`createAnthropicProvider`): first-class Anthropic Claude provider
  - Default `structuredOutputMode: 'outputFormat'` — composes with `thinking`, integrates with `web_search`, streams partial JSON. Override per call to `'jsonTool'` when schemas contain bound keywords (`.min/.max/.int`, etc.)
  - Schema guard: rejects discriminated-union-like `oneOf` schemas with `UnsupportedAnthropicSchemaError` before the wire call — fail-fast for shapes Anthropic's structured output cannot reliably produce
  - Fluent methods specific to Anthropic:
    - `withWebSearch(options?)` — register Anthropic server-side `web_search` as a provider-level default tool
    - `withReasoningEffort('low' | 'medium' | 'high' | 'max')` — Anthropic effort enum (wired to `output_config.effort`)
    - `withReasoningBudget(budgetTokens)` — explicit thinking token budget (wired to `thinking: { type: 'enabled', budgetTokens }`)
    - `withAdaptiveReasoning()` — adaptive thinking (`thinking: { type: 'adaptive' }`, Sonnet 4.6 / Opus 4.6 and newer)
    - `withSendReasoning(send)` — explicit toggle for `sendReasoning` after a reasoning method auto-injects it
    - `withFileCache(cache?)` — Anthropic file cache support (parity with Google/OpenAI)
  - `AnthropicReasoningEffort` type exported
- **Anthropic file management**
  - `AnthropicFileManager` integrating Anthropic's Files API beta
  - File strategy modes: `'auto' | 'inline-only' | 'files-api-only'`
  - `rewriteFileIdMiddleware` — rewrites internal file-id markers to wire `file_id` and auto-adds the Files API beta header on the messages endpoint
  - Helpers: `createAnthropicFileIdMarker`, `parseAnthropicFileIdMarker`, `ANTHROPIC_FILES_API_BETA`, `ANTHROPIC_API_VERSION`, `DEFAULT_ANTHROPIC_INLINE_MAX_BYTES`
- **Anthropic server tool wrappers**
  - `createAnthropicWebSearchTool(options?)` — typed `ToolSet` entry for the web search tool, absorbing the AI SDK 6.x `ToolSet` typing quirk for provider-supplied tools
  - `createAnthropicProviderTool(kind, options?)` — generic Anthropic server-tool factory (currently `'webSearch'`)
  - `extractAnthropicServerToolUse(usage)` — extracts `web_search_requests` / `web_fetch_requests` counters from raw Anthropic usage
- **Provider-neutral citation module** (`@agtlantis/core` root export)
  - `NormalizedCitation`, `CitationProvider`, `CitationSourceType`, `NormalizeCitationOptions` types
  - `normalizeAISDKSourceCitation` for generic AI SDK URL / document source chunks
  - `normalizeAnthropicWebSearchCitation` for Anthropic `web_search_result` blocks (preserves `encryptedContent` in `providerMetadata`)
  - `normalizeCitation` / `normalizeCitations` Anthropic-aware combining entrypoints
- **Reasoning token derivation**: `extractReasoningTokens(usage)` now derives reasoning tokens from `outputTokens − textTokens` when explicit fields are missing, supporting older AI SDK shapes and provider raw layouts
- **Provider-type detection helper**: `detectProviderType(modelId)` classifies model IDs into `openai | google | anthropic`

### Changed

- **Internal predicate utility**: shared `isRecord` predicate now lives in `src/utils/is-record.ts` and is reused by the Anthropic schema validator, file-id middleware, usage extractors, and citation normalizers (was previously duplicated as `isPlainObject` / `isRecord` across four modules)
- **Session-time tool merging**: `defaultTools` on the session config is now wired to the Anthropic provider state, so `withWebSearch` and any future provider-level tool helpers compose with per-call `tools` automatically
- **Anthropic provider factory consolidation**: removed internal `AnthropicSimpleSession` / `AnthropicStreamingSession` subclasses in favor of an internal `applyAnthropicGuard` helper, restoring structural consistency with the OpenAI and Google factories that instantiate base sessions directly

### Documentation

- New `docs/architecture/provider-aware-agents.md` — Anthropic strategy guide covering the default `outputFormat` path, `jsonTool` fallback patterns (single-call and two-phase), the `oneOf` schema guard, and cross-provider naming alignment for fluent reasoning methods
- New `docs/architecture/provider-schema-guidance.md` — wire compatibility table per provider plus consumer migration guidance for bound-keyword schemas
- Updated `docs/guides/provider-guide.md` — Anthropic section now documents the new fluent methods, axis interactions (`effort` vs `thinking`, mutual exclusivity of `Budget` vs `Adaptive`, `sendReasoning` override), and the cross-provider naming rationale
- Updated `docs/api/provider.md` — full `createAnthropicProvider` API reference with config, defaults, methods, axis interactions, and the advanced re-export surface

---

## [0.6.0]

### Added

- **OpenAI File Management**: Full `FileManager` implementation for OpenAI provider
  - `OpenAIFileManager` using OpenAI Files API for all non-URL file sources
  - URL sources passed inline (no upload) — same pattern as Google provider
  - `BaseFileManager` abstract class extracted — shared upload/cache/rollback logic between providers

### Changed

- **File Cache**: `OpenAIProvider.withFileCache()` is now fully functional (was no-op)
  - Injects cache into `OpenAIFileManager` — same behavior as `GoogleProvider`

---

## [0.5.0]

### Added

- **Default Generation Options**: `withDefaultGenerationOptions()` method for providers
  - Set standard AI SDK generation parameters (`maxOutputTokens`, `temperature`, `topP`, `topK`, etc.) as defaults at the Provider level
  - Per-call parameters override defaults via simple spread merge
  - New `GenerationOptions` type exported from `@agtlantis/core`

- **Execution Mapping Utilities**: Transform execution results and events at service boundaries
  - `mapExecution()` — transform all events in a `StreamingExecution` or result of `SimpleExecution`
  - `mapExecutionResult()` — transform only `CompletionEvent` data (result-only convenience)
  - `ReplaceResult<TEvent, U>` — type helper for replacing `CompletionEvent` data type in event union

- **File Cache Fluent API**: `withFileCache(cache?)` method for providers
  - `GoogleProvider.withFileCache()` - injects cache into `GoogleFileManager`
  - `OpenAIProvider.withFileCache()` - no-op for API consistency
  - If no cache argument provided, creates default `InMemoryFileCache`

### Changed

- **Prompt API Rename**: Clarified naming for prompt-related types and methods
  - `PromptBuilder` → `PromptRenderer`
  - `PromptContent` → `PromptTemplate`
  - `PromptContentData` → `PromptTemplateData`
  - `.toBuilder()` → `.compile()`

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
