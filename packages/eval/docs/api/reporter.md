# Reporter

> Report generation, comparison, and cost calculation utilities

## Overview

The Reporter module provides utilities for generating evaluation reports in various formats, comparing reports across runs, and calculating costs. Use these functions to create Markdown reports for documentation, JSON files for CI integration, and track evaluation expenses across different LLM providers.

---

## Report Generation

### `reportToMarkdown(report, options?)`

Converts an evaluation report to Markdown.

```typescript
import { reportToMarkdown } from '@agtlantis/eval'

const markdown = reportToMarkdown(report, {
  expandPassedTests: false,
  includeRawOutput: true,
  outputPreviewLength: 200,
})
```

### `saveReportMarkdown(report, path, options?)`

Saves a report as a Markdown file.

```typescript
import { saveReportMarkdown } from '@agtlantis/eval'

await saveReportMarkdown(report, './reports/eval-report.md')
```

---

## Report Comparison

### `compareReports(before, after)`

Compares two evaluation reports.

```typescript
import { compareReports } from '@agtlantis/eval'

const comparison = compareReports(beforeReport, afterReport)

console.log(`Score delta: ${comparison.scoreDelta}`)
console.log(`Pass rate delta: ${comparison.passRateDelta}`)
console.log(`Improved: ${comparison.improved.join(', ')}`)
console.log(`Regressed: ${comparison.regressed.join(', ')}`)
```

### `ReportComparison` Type

```typescript
interface ReportComparison {
  scoreDelta: number
  passRateDelta: number
  metricsDelta: {
    latencyMs: number
    tokenUsage: number
    cost: number
  }
  improved: string[]   // Test IDs that improved
  regressed: string[]  // Test IDs that regressed
}
```

---

## Pricing & Cost Calculation

### Built-in Pricing Tables

Pre-configured pricing tables for major LLM providers (January 2025 prices).

```typescript
import {
  OPENAI_PRICING,
  GOOGLE_PRICING,
  ANTHROPIC_PRICING,
  DEFAULT_PRICING_CONFIG,
} from '@agtlantis/eval'

// View available models
console.log(Object.keys(OPENAI_PRICING))
// ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3', ...]

console.log(Object.keys(GOOGLE_PRICING))
// ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash', ...]

console.log(Object.keys(ANTHROPIC_PRICING))
// ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', ...]
```

### `addCostsToResults(results, pricingConfig)`

Adds cost breakdown to test results after evaluation.

```typescript
import { addCostsToResults, DEFAULT_PRICING_CONFIG } from '@agtlantis/eval'

// Run evaluation
const report = await suite.run(testCases)

// Add costs to results
const resultsWithCosts = addCostsToResults(report.results, DEFAULT_PRICING_CONFIG)

for (const result of resultsWithCosts) {
  console.log(`${result.testCase.id}: $${result.metrics.costBreakdown?.total?.toFixed(6)}`)
}
```

### `calculateCostFromUsage(usage, model, pricingConfig?)`

Calculates cost from token usage. Re-exported from `@agtlantis/core`.

```typescript
import { calculateCostFromUsage, OPENAI_PRICING } from '@agtlantis/eval'

const cost = calculateCostFromUsage(
  { input: 1000, output: 500, total: 1500 },
  'gpt-4o',
  { openai: OPENAI_PRICING }
)
// gpt-4o: $2.5/M input + $10/M output
// = 1000/1M * 2.5 + 500/1M * 10 = $0.0075
```

### `calculateResultCost(result, pricingConfig)`

Calculates cost for a single test result.

```typescript
import { calculateResultCost, DEFAULT_PRICING_CONFIG } from '@agtlantis/eval'

const cost = calculateResultCost(result, DEFAULT_PRICING_CONFIG)
console.log(`Agent cost: $${cost.agent}`)
console.log(`Judge cost: $${cost.judge}`)
console.log(`Total: $${cost.total}`)
```

### `calculateReportCosts(report, pricingConfig)`

Calculates costs for an entire report.

```typescript
import { calculateReportCosts, DEFAULT_PRICING_CONFIG } from '@agtlantis/eval'

const costs = calculateReportCosts(report, DEFAULT_PRICING_CONFIG)
console.log(`Total evaluation cost: $${costs.total.toFixed(4)}`)
```

---

## Types

### `ModelPricing`

```typescript
interface ModelPricing {
  /** Price per million input tokens (USD) */
  inputPricePerMillion: number
  /** Price per million output tokens (USD) */
  outputPricePerMillion: number
}
```

### `PricingConfig`

```typescript
interface PricingConfig {
  /** Provider-specific pricing tables */
  providers?: {
    [provider: string]: {
      [model: string]: ModelPricing
    }
  }
  /** Fallback pricing for unknown models */
  fallback?: ModelPricing
}
```

### `CostBreakdown`

```typescript
interface CostBreakdown {
  /** Cost from Agent LLM calls */
  agent?: number
  /** Cost from Judge LLM calls */
  judge?: number
  /** Cost from Improver LLM calls */
  improver?: number
  /** Total cost (agent + judge + improver) */
  total?: number
}
```

### `EvalPricingConfig`

```typescript
interface EvalPricingConfig {
  /** Provider-specific pricing tables */
  [provider: string]: {
    [model: string]: ModelPricing
  }
}
```

---

## Accessing Costs in Results

Use `addCostsToResults()` to add cost information to results after evaluation.

```typescript
import { createEvalSuite, addCostsToResults, DEFAULT_PRICING_CONFIG } from '@agtlantis/eval'

const suite = createEvalSuite({
  agent,
  judge,
})

const report = await suite.run(testCases)

// Add costs to results
const resultsWithCosts = addCostsToResults(report.results, DEFAULT_PRICING_CONFIG)

// Per-test cost breakdown
for (const result of resultsWithCosts) {
  const cost = result.metrics.costBreakdown
  console.log(`${result.testCase.id}: $${cost?.total?.toFixed(6)}`)
}

// Total evaluation cost
const totalCost = resultsWithCosts.reduce(
  (sum, r) => sum + (r.metrics.costBreakdown?.total ?? 0),
  0
)
console.log(`Total evaluation cost: $${totalCost.toFixed(4)}`)
```

---

## Prompt Repository

### `createFilePromptRepository(config)`

Creates a file-based prompt repository.

```typescript
import { createFilePromptRepository } from '@agtlantis/eval'

const repository = createFilePromptRepository({
  directory: './prompts',
  fileSystem: fs,  // Optional custom fs implementation
})

// Read
const prompt = await repository.read('my-agent', '1.0.0')

// Write
await repository.write({
  id: 'my-agent',
  version: '1.1.0',
  system: 'System prompt...',
  userTemplate: '{{input}}',
})
```

### `compileTemplate(template)`

Compiles a Mustache-style template.

```typescript
import { compileTemplate } from '@agtlantis/eval'

const render = compileTemplate<{ name: string; query: string }>(
  'Hello {{name}}, you asked: {{query}}'
)

const result = render({ name: 'User', query: 'What is AI?' })
// 'Hello User, you asked: What is AI?'
```

### `PromptContent` Type

```typescript
interface PromptContent {
  id: string
  version: string
  system: string
  userTemplate: string
  metadata?: Record<string, unknown>
}
```

---

## File Discovery

### `discoverEvalFiles(config, options?)`

Discovers YAML eval files matching glob patterns.

```typescript
function discoverEvalFiles(
  config: Pick<EvalConfig, 'include'>,
  options?: DiscoverOptions
): Promise<string[]>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.include` | `string[]` | Glob patterns from config file |
| `options.include` | `string[]` | Override patterns (takes precedence over config) |
| `options.cwd` | `string` | Base directory (default: `process.cwd()`) |
| `options.ignore` | `string[]` | Ignore patterns (default: `['**/node_modules/**']`) |

#### Returns

`Promise<string[]>` - Array of absolute file paths, sorted alphabetically.

#### Throws

- `ConfigError` with code `CONFIG_NO_INCLUDE_PATTERN` if no patterns provided

#### Example

```typescript
import { discoverEvalFiles } from '@agtlantis/eval'

// Discover eval files with include patterns
const files = await discoverEvalFiles(
  { include: ['evals/**/*.eval.yaml'] }
)

console.log(files)
// [
//   '/project/evals/booking.eval.yaml',
//   '/project/evals/qa.eval.yaml',
// ]

// With custom options
const files = await discoverEvalFiles(
  { include: ['evals/**/*.eval.yaml'] },
  {
    cwd: '/project/root',
    ignore: ['**/node_modules/**', '**/fixtures/**'],
  }
)
```

### `DiscoverOptions` Type

```typescript
interface DiscoverOptions {
  /** Override config include patterns */
  include?: string[]
  /** Base directory for glob patterns (defaults to process.cwd()) */
  cwd?: string
  /** Ignore patterns (default: ['**/node_modules/**']) */
  ignore?: string[]
}
```

---

## See Also

- [Eval Suite](./eval-suite.md) - Generate reports from evaluation runs
- [Improver](./improver.md) - Track improvement cycle costs
- [Adapters](./adapters.md) - Convenient report runner utilities
