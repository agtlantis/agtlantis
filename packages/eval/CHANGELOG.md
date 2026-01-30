# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

*No unreleased changes.*

---

## [0.3.0] - 2026-01-09

### Breaking Changes

#### Result Types Refactoring

- **Discriminated Union** — `TestResultWithIteration`이 4개의 명확한 타입으로 분리됨
  - `SingleTurnResult` — 단일 실행 결과
  - `SingleTurnIteratedResult` — 반복 실행 결과 (iteration 통계 포함)
  - `MultiTurnResult` — 멀티턴 대화 결과
  - `MultiTurnIteratedResult` — 멀티턴 반복 실행 결과
- **`kind` discriminator** — 모든 결과 타입에 `kind` 필드 추가
- **타입가드 변경** — 기존 `hasIterationData()`, `hasMultiTurnData()`, `hasMultiTurnIterationData()` 제거
- **새 타입가드** — `isSingleTurnResult()`, `isMultiTurnResult()`, `isIteratedResult()` 추가

### Migration Guide

```typescript
// Before (v0.2.x)
if (hasIterationData(result)) {
  console.log(result.iterationStats)
}
if (hasMultiTurnIterationData(result)) {
  console.log(result.multiTurnIterationStats)
}

// After (v0.3.0)
if (isIteratedResult(result)) {
  console.log(result.iterationStats)
}
if (result.kind === 'multi-turn-iterated') {
  console.log(result.multiTurnIterationStats)
}

// 또는 switch 문 사용 (권장)
switch (result.kind) {
  case 'single-turn':
    // 단일 실행
    break
  case 'single-turn-iterated':
    // 반복 실행 (iterationStats 보장)
    break
  case 'multi-turn':
    // 멀티턴 대화 (conversationHistory 보장)
    break
  case 'multi-turn-iterated':
    // 멀티턴 반복 (모든 데이터 보장)
    break
}
```

### Technical Details

- **822 tests** passing with Vitest 4.x
- Type-safe discriminated union with exhaustive checking support

---

## [0.2.0] - 2026-01-08

### Added

#### Cost Calculation (Phase 10)
- **Built-in pricing tables** — Pre-configured pricing for OpenAI, Gemini, and Anthropic models (January 2025 prices)
- **Per-component cost tracking** — Separate cost breakdown for Agent, Judge, and Improver
- **Auto-detection** — Automatic provider detection from model names (gpt-*, gemini-*, claude-*)
- **Custom pricing** — Override pricing tables with custom configuration
- **`calculateCost()`** — Calculate costs from token usage
- **`detectProvider()`** — Detect LLM provider from model name
- **`getModelPricing()`** — Get pricing for specific models
- **`buildCostBreakdown()`** — Build cost breakdown with automatic total calculation

#### Metadata Pattern
- **`ComponentMetadata`** — Base metadata type with `tokenUsage` and `model`
- **`JudgeMetadata`** — Metadata returned from Judge evaluation
- **`ImproverMetadata`** — Metadata returned from Improver analysis

### Changed

- **`Improver.improve()`** — Now returns `ImproveResult` instead of `Suggestion[]` (**BREAKING CHANGE**)
  ```typescript
  // Before
  const suggestions = await improver.improve(prompt, results)

  // After
  const { suggestions, metadata } = await improver.improve(prompt, results)
  ```

- **`JudgeResult`** — Now includes optional `metadata` field with token usage
- **`MetricsResult`** — Added `costBreakdown?: CostBreakdown` field
- **`EvalSuiteConfig`** — Added `pricing?: PricingConfig` option
- **`EvalConfig` (CLI)** — Added `pricing?: PricingConfig` option

### Fixed

- **Export `ImproveResult`** — New return type from `improve()` is now properly exported
- **Export metadata types** — `ComponentMetadata`, `JudgeMetadata`, `ImproverMetadata` now exported from main entry

### Technical Details

- **798 tests** passing with Vitest 4.x
- **ESM 99KB + CJS 106KB + DTS 102KB** build output
- New pricing module: `src/pricing/`

---

## [0.1.0] - 2026-01-07

### Added

#### Core Features
- **EvalSuite** — Main evaluation runner with concurrent test execution
- **Judge** — LLM-as-Judge evaluation with customizable criteria
- **Improver** — AI-powered prompt improvement suggestions
- **Reporter** — Markdown report generation and comparison

#### LLM Support
- **OpenAI** — Full support via Vercel AI SDK
- **Gemini** — Google Gemini support via Vercel AI SDK
- **Structured Output** — `generateObject()` for type-safe LLM responses
- **JSON Mode** — Automatic JSON mode for Judge/Improver

#### Evaluation Criteria
- **Built-in criteria** — `accuracy()`, `consistency()`, `relevance()`
- **Schema validation** — `validateSchema()` with Zod schemas
- **Custom criteria** — Define your own evaluation criteria
- **Weighted scoring** — Assign different weights to criteria

#### Multi-Turn Testing
- **MultiTurnTestCase** — Test complex conversation flows
- **Termination conditions** — `fieldEquals()`, `fieldIsSet()`, `afterTurns()`
- **Composite conditions** — `and()`, `or()`, `not()` combinators
- **Natural language conditions** — LLM-based termination evaluation
- **AI simulated users** — `aiUser()` for automated user simulation
- **Dynamic personas** — Change user behavior during conversation

#### Test Iterations
- **Statistical analysis** — Mean, std dev, min/max, pass rate
- **Multi-turn statistics** — Avg turns, termination distribution
- **Representative selection** — Auto-select result closest to mean

#### File Context
- **File loading** — `loadFile()`, `loadFiles()` with glob patterns
- **File content** — Include files in test cases for evaluation
- **Size limits** — Configurable file size limits

#### Prompt Repository
- **File-based** — YAML file storage with versioning
- **SQLite-based** — Database storage for production
- **Template compilation** — Mustache-style templates

#### CLI
- **`agent-eval run`** — Run evaluations from command line
- **TypeScript config** — `defineConfig()` with full type safety
- **Environment files** — Automatic `.env` loading
- **Verbose mode** — Detailed progress output

#### Testing Utilities
- **MockLLMClient** — Mock LLM for unit testing
- **RecordingMockLLMClient** — Record and verify LLM calls
- **MockAgent** — Mock agent for testing
- **MockJudge** — Mock judge for testing
- **MockImprover** — Mock improver for testing

#### Error Handling
- **EvalError** — Structured errors with codes
- **Error codes** — Categorized error types for handling
- **Error context** — Additional debugging information

### Technical Details

- **649 tests** passing with Vitest 4.x
- **ESM + CJS** dual package output
- **TypeScript** with strict mode
- **Vercel AI SDK** 6.x for LLM integration
- **Zod** peer dependency for schema validation

---

## Future Plans

- Web Interface for evaluation dashboards
- Additional LLM providers (Anthropic client integration)
- Evaluation history and trends
- Plugin system for custom evaluators
