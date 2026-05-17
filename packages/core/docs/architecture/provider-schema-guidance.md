# Provider-specific Schema & Tools Guidance

> Consumer reference for choosing Zod schema patterns, Anthropic structured output strategy, and provider tool wrapping.
>
> Sources: F9 Discovery Spike (`refs/decisions/F9-go-no-go.md`) and measured PoC notes
> (`packages/core/e2e/anthropic/T9.3-finding.md`, `T9.4-finding.md`).
>
> Last updated: 2026-05-17

---

## Scope Contract

This document is guidance, not framework behavior.

agtlantis core supports the provider integration paths described below. It does not inspect a consumer's Zod schema, rewrite schema constraints, or choose an Anthropic strategy automatically.

Out of scope for F10/F11/F12:

- `hasBoundKeywords` or any equivalent schema-introspection utility.
- Build-time or runtime fail-fast checks for consumer-owned schema constraints.
- Hzpro or other consumer schema migration work such as changing `.min()`, `.max()`, or `.int()` constraints into `.describe()` instructions.

Consumers use this document to choose a strategy:

- Keep constrained schemas and use a two-phase Anthropic flow.
- Migrate selected schemas to Anthropic `outputFormat`-compatible shapes.
- Disable reasoning only for agents where product quality allows it.

These boundaries come from the sprint-wide decision in `refs/decisions/_sprint.md`: this sprint is framework-only, and consumer schema ownership stays with the consumer.

---

## Contents

1. [Provider Schema Compatibility](#provider-schema-compatibility)
2. [Anthropic Structured Output Modes](#anthropic-structured-output-modes)
3. [Consumer Strategy Guide](#consumer-strategy-guide)
4. [Provider Search Tools](#provider-search-tools)
5. [Tools Wrapping Pattern](#tools-wrapping-pattern)
6. [Operational Checklist](#operational-checklist)
7. [References](#references)

---

## Provider Schema Compatibility

The table below summarizes measured compatibility for common Zod patterns. Anthropic `outputFormat` failures happen at wire level with HTTP 400 responses, so retry logic cannot recover from them.

| Zod pattern | Google Gemini | OpenAI Responses API | Anthropic `outputFormat` | Anthropic `jsonTool` |
|---|---|---|---|---|
| `z.string()` | OK | OK | OK | OK |
| `z.number()` | OK | OK | OK | OK |
| `z.number().int()` | OK | OK | FAIL: `integer` bounds emitted by converter | OK |
| `z.number().min(N).max(M)` | OK | OK | FAIL: `minimum` / `maximum` unsupported | OK |
| `z.number().int().min(N).max(M)` | OK | OK | FAIL: `integer` + `minimum` / `maximum` unsupported | OK |
| `z.array(z.X())` | OK | OK | OK | OK |
| `z.array(z.X()).min(N).max(M)` | OK | OK | FAIL: `minItems` / `maxItems` unsupported | OK |
| `z.nullable()` | OK | OK | OK | OK |
| `z.optional()` | OK | Use `.nullable()` for strict compatibility | OK | OK |
| `z.discriminatedUnion([...])` | OK | Partially OK | FAIL: `oneOf` unsupported | Wire OK, model output unreliable |
| `z.union([...])` | OK | Partially OK | FAIL: `oneOf` unsupported | Depends on model output |
| `z.lazy()` recursive schema | OK | OK | OK | OK |
| Two-level nested object | OK | OK | OK | OK |

### Anthropic `outputFormat` Wire Rejections

Anthropic native structured output rejects these JSON Schema keywords when sent through `output_config.format.json_schema`.

| JSON Schema keyword | Typical Zod source | Anthropic error shape |
|---|---|---|
| `integer` + `minimum` / `maximum` | `z.number().int()`, `z.number().int().min().max()` | `For 'integer' type, properties maximum, minimum are not supported` |
| `number` + `minimum` / `maximum` | `z.number().min().max()` | `For 'number' type, properties maximum, minimum are not supported` |
| `array` + `minItems` / `maxItems` | `z.array(...).min().max()` | `For 'array' type, property 'maxItems' is not supported` |
| `oneOf` | `z.union(...)`, `z.discriminatedUnion(...)` | `Schema type 'oneOf' is not supported` |

Important edge case: `zod-to-json-schema` can attach `minimum: -9007199254740991` and `maximum: 9007199254740991` for `z.number().int()`. A schema can therefore fail Anthropic `outputFormat` even when the consumer never wrote `.min()` or `.max()` explicitly.

### Anthropic `jsonTool` Residual Risk

`jsonTool` avoids the numeric and array bound rejections above, but it is not a universal escape hatch.

Measured weak spot:

- `z.discriminatedUnion(...)` can pass wire validation, but the model may return the selected variant as a stringified JSON value inside the object.
- That output fails Zod parsing and becomes `NoObjectGeneratedError`.
- Retrying does not address the root cause because the failure is model-output shape, not transient transport behavior.

Recommended consumer pattern for variants:

- Prefer a flat object.
- Make variant-specific fields optional or nullable.
- Add post-parse validation/refinement in consumer-owned code.

---

## Anthropic Structured Output Modes

agtlantis supports both Anthropic strategy families. It does not choose between them by inspecting schemas.

| Mode | Strength | Main failure mode | Best use |
|---|---|---|---|
| `outputFormat` | Single call with reasoning + web search + parsed output | Wire 400 for bound keywords and `oneOf` | Bound-free schemas |
| `jsonTool` | Accepts numeric and array bounds | Incompatible with thinking when tool choice is forced; discriminated unions remain unreliable | Second phase formatting, no-thinking agents |

Anthropic rejects `jsonTool` plus thinking when AI SDK forces tool use. Measured error:

```text
Thinking may not be enabled when tool_choice forces tool use.
```

That failure is immediate and non-retryable. It is much easier to diagnose than a long-running hang, but it still requires a deliberate strategy choice.

---

## Consumer Strategy Guide

### Manual Schema Inventory

Before switching an Anthropic agent to `outputFormat`, inspect the consumer schema for unsupported bound keywords.

Use a simple source scan in the consumer repository:

```bash
rg -n "\\.min\\(|\\.max\\(|\\.int\\(\\)|discriminatedUnion|z\\.union" src
```

This scan is intentionally a consumer-side workflow. F10 does not add a reusable introspection helper, schema validator, or automatic migration.

### Decision Flow

```text
Is the provider Anthropic?
├── No
│   └── Keep the existing OpenAI / Google structured-output path.
└── Yes
    ├── Does the schema contain numeric bounds, array bounds, integer constraints, or union oneOf?
    │   ├── Yes
    │   │   └── Use Option B unless the consumer intentionally migrates the schema.
    │   └── No
    │       └── Use Option C for a single-call flow.
    └── Is reasoning unnecessary for this agent?
        └── Consider Option A only after product-quality review.
```

### Option B: Two-phase Pipeline

Use this as the fallback for constrained schemas.

```text
Phase 1: thinking + webSearch, no structured output
         -> raw markdown or freeform analysis

Phase 2: no thinking + jsonTool structured output
         -> parse Phase 1 output into the existing schema
```

Choose Option B when:

- The consumer must preserve `.min()`, `.max()`, `.int()`, array bounds, or similar Zod constraints.
- Migration cost is higher than the extra call.
- The agent already has a verification/normalization phase that can become Phase 2.

Trade-offs:

- More calls and usually more cost.
- Phase 1 to Phase 2 can lose detail unless the Phase 2 prompt is explicit.
- Easier rollback because the original schema stays intact.

Operational guardrail: Phase 1 should use an explicit timeout and retry quota. Do not rely on indefinite web-search waits.

### Option C: `outputFormat` Single Call

Use this for schemas confirmed to be bound-free, or for consumer-owned schemas intentionally migrated for Anthropic.

```text
One call: thinking + webSearch + structuredOutputMode = "outputFormat"
          -> parsed output
```

Choose Option C when:

- The schema has no unsupported bound keywords.
- The consumer accepts moving constraints from machine-enforced Zod bounds into natural-language descriptions and post-parse checks.
- Single-call cost and control-flow simplicity matter more than preserving the old schema shape.

Trade-offs:

- Schema migration is consumer work and outside this sprint.
- Constraints expressed only in `.describe()` depend on model compliance.
- Stream handlers must tolerate multiple reasoning blocks in one response.
- `discriminatedUnion` remains unsupported because it emits `oneOf`.

### Option A: Thinking Off

Use this only for agents where reasoning quality is not part of the product requirement.

```text
One call: no thinking + jsonTool
          -> structured output
```

This is not the default recommendation. It can be valid for simple classifiers or extraction agents, but it is a product decision, not a framework workaround.

### Strategy Summary

| Criterion | Option B: two-phase | Option C: `outputFormat` | Option A: thinking off |
|---|---|---|---|
| Schema changes | None required | Consumer migration may be required | None required |
| Calls | 2 | 1 | 1 |
| Reasoning | Preserved in Phase 1 | Preserved | Disabled |
| Web search | Phase 1 | Same call | Available only if compatible with no-thinking flow |
| Bound keywords | Preserved | Must be absent or migrated | Preserved |
| `discriminatedUnion` | Still risky in Phase 2 | Unsupported | Still risky |
| Rollback | Easy | Medium | Easy |
| Recommended for | Existing constrained schemas | Bound-free schemas | Simple no-reasoning agents |

---

## Provider Search Tools

Provider search tools differ in call shape and compatibility with structured output.

| Provider | Tool | Call shape | Reasoning compatibility | Structured output compatibility |
|---|---|---|---|---|
| Google | `googleSearch` | Provider grounding | OK | OK |
| OpenAI | `webSearch` | Multi-round loop | Risk: prior silent hang pattern | Risk: prior silent hang pattern |
| Anthropic | `web_search_20250305` | Server-side search with result chunks | OK with `outputFormat` | OK with `outputFormat`; rejected with `jsonTool` + thinking |

Consumer recommendations:

- Bind search tools in provider-aware agent factories, not in a model resolver that should only resolve models.
- Add timeouts and retry budgets around search-enabled calls.
- Treat reasoning chunks as a stream of multiple possible blocks, especially for Anthropic web search flows.

---

## Tools Wrapping Pattern

F10 provides `createProviderSearchTool()` to isolate an AI SDK 6.x `ToolSet` typing issue.

### Why the Wrapper Exists

AI SDK 6.x `ToolSet` typing currently requires properties such as `execute` through its index signature. Provider-hosted tools, including Anthropic server-side search, are valid at runtime but do not expose local `execute` handlers. TypeScript can therefore reject code that works on the wire.

Typical symptom:

```text
Argument of type '{ web_search: Tool<...> }' is not assignable to parameter of type 'CallSettings & ...'
Property 'web_search' is incompatible with index signature.
Property '[schemaSymbol]' is missing in type 'Schema<{ query: string; }>' but required in type 'Schema<never>'.
```

The wrapper keeps the compatibility cast inside agtlantis core so consumers do not spread `as unknown as ToolSet` across agent code.

### Usage

```typescript
import { Output, streamText } from "ai";

import { createProviderSearchTool } from "@agtlantis/core";

const tools = createProviderSearchTool("webSearch", { maxUses: 2 });

await streamText({
  model,
  output: Output.object({ schema: boundFreeSchema }),
  providerOptions: {
    anthropic: { structuredOutputMode: "outputFormat" },
  },
  tools,
  prompt,
});
```

### Deprecation Criteria

Keep the wrapper until all of the following are true:

- Upstream AI SDK typing accepts provider-hosted tools without requiring local `execute` handlers.
- agtlantis raises its relevant dependency lower bound to a fixed version.
- Consumers can remove the wrapper without introducing type casts.

At that point, mark the wrapper deprecated first and remove it in a later compatible release window.

---

## Operational Checklist

Use this before enabling Anthropic for a consumer agent:

1. Identify whether the agent needs reasoning.
2. Inventory the consumer-owned schema with the manual scan command above.
3. Replace `discriminatedUnion` with a flat schema plus post-parse refinement if Anthropic support is required.
4. Choose Option B for constrained schemas, or Option C for confirmed bound-free schemas.
5. Bind search tools through provider-aware agent construction.
6. Use `createProviderSearchTool()` for provider-hosted search tools until the upstream typing issue is resolved.
7. Add timeout and retry budgets around search-enabled calls.
8. Verify stream handlers accept multiple reasoning blocks in a single Anthropic response.

---

## References

- `refs/decisions/_sprint.md`: framework scope and consumer schema ownership.
- `refs/decisions/F9-go-no-go.md` §4: strategy options.
- `refs/decisions/F9-go-no-go.md` §5: provider/schema compatibility.
- `refs/decisions/F9-go-no-go.md` §7: R8 ToolSet and R9 schema-bound risks.
- `packages/core/e2e/anthropic/T9.3-finding.md` §1-§2: schema matrix measurements.
- `packages/core/e2e/anthropic/T9.4-finding.md` §3-§6: search, reasoning, and strategy measurements.
- `packages/core/e2e/anthropic/T9.4-finding.md` §11: AI SDK ToolSet typing issue.
