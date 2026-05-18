# Provider-aware Agent Strategy

> Consumer reference for choosing Anthropic structured-output flows without changing agtlantis core contracts.

## Goal

agtlantis exposes Anthropic as a first-class provider through `createAnthropicProvider`. The framework supports both Anthropic strategy paths, but the consumer agent chooses which path fits its schema and product requirements.

The provider layer does not inspect or rewrite consumer Zod schemas. That keeps framework behavior predictable and leaves product-specific schema trade-offs with the owning application.

## Default

agtlantis injects `structuredOutputMode: 'outputFormat'` by default for Anthropic. This is the first-class structured output path: it composes naturally with `thinking`, integrates with server-side tools like `web_search`, and streams partial JSON content. A consumer that wants the legacy `jsonTool` wire only needs to override it per call.

## Decision Flow

```text
Is the selected provider Anthropic?
├── No
│   └── Use the existing OpenAI / Google agent flow.
└── Yes
    ├── Is the schema bound-free (no .min/.max/.int/.minItems/.pattern, no discriminatedUnion)?
    │   ├── Yes
    │   │   └── Use the default outputFormat path — one call covers thinking + web search + structured output.
    │   └── No
    │       ├── Does the schema only have bound keywords (.min/.max/.int/array bounds)?
    │       │   └── Use the jsonTool fallback — either one-call without thinking, or the two-phase pattern when thinking is required.
    │       └── Does the schema include discriminatedUnion?
    │           └── Schema must be flattened. agtlantis throws UnsupportedAnthropicSchemaError before the wire call.
    │               Regular z.union is wire-compatible and is not blocked.
    └── Is reasoning unnecessary?
        └── A simple jsonTool override with thinking disabled is enough for extraction / classification.
```

## Default path: outputFormat (single call)

Use this when the schema has no bound keywords. This is the framework default; no per-call override needed.

```typescript
const provider = createAnthropicProvider({ apiKey })
  .withDefaultModel('claude-sonnet-4-6')
  .withReasoningBudget(1024)
  .withWebSearch({ maxUses: 1 });

const execution = provider.simpleExecution(async (session) => {
  return await session.generateText({
    prompt,
    output: Output.object({ schema: boundFreeSchema }),
  });
});

const result = await execution.result();
```

Trade-offs:

- One call. Lower latency and cost.
- Composes with `thinking` and server-side tools.
- Requires bound-free schema. Migration cost lives with the consumer when schemas were originally written with `.min/.max/.int`.

## jsonTool fallback: bound schemas

Use this when the schema must keep `.min()`, `.max()`, `.int()`, `.minItems()`, `.pattern()`, or other constraints that Anthropic's `outputFormat` wire rejects.

If reasoning is not required, override per call:

```typescript
const result = await session.generateText({
  prompt,
  output: Output.object({ schema: constrainedSchema }),
  providerOptions: {
    anthropic: { structuredOutputMode: 'jsonTool' },
  },
});
```

If reasoning + web search are required alongside the constrained schema, split into two phases — Anthropic forbids `thinking` together with `jsonTool` in the same call:

```typescript
const researchProvider = createAnthropicProvider({ apiKey })
  .withDefaultModel('claude-sonnet-4-6')
  .withReasoningBudget(1024)
  .withWebSearch({ maxUses: 1 });

const formattingProvider = createAnthropicProvider({ apiKey })
  .withDefaultModel('claude-sonnet-4-6');

const phase1Execution = researchProvider.simpleExecution(async (session) => {
  return await session.generateText({
    prompt: researchPrompt,
  });
});

const phase1Result = await phase1Execution.result();
if (phase1Result.status !== 'succeeded') {
  throw new Error('research phase failed');
}

const phase2Execution = formattingProvider.simpleExecution(async (session) => {
  return await session.generateText({
    prompt: `Convert this note into the target schema:\n\n${phase1Result.value.text}`,
    output: Output.object({ schema: constrainedSchema }),
    providerOptions: {
      anthropic: { structuredOutputMode: 'jsonTool' },
    },
  });
});

const phase2Result = await phase2Execution.result();
```

Trade-offs:

- Preserves the existing constrained schema as-is.
- Single-call form: one call, but cannot combine with `thinking`.
- Two-phase form: two calls, recovers reasoning at the cost of an extra request.

## Why outputFormat is the default

| | jsonTool | outputFormat (default) |
|---|---|---|
| Composes with `thinking` | ❌ wire forbids | ✅ |
| Coexists with `web_search` | partial (model may skip json tool) | ✅ first-class |
| Streaming partial JSON | tool_use chunk boundary | content_delta — natural partial parse |
| Schema subset accepted | wide (legacy) | narrow (no `.min/.max/.int`, no `pattern`) |

outputFormat is the forward-looking path. jsonTool is the legacy wire that absorbs schemas with bound keywords. When `outputFormat` rejects a schema, Anthropic returns HTTP 400 with the specific keyword and JSON pointer — fail-fast is preserved.

## Cross-provider naming alignment

agtlantis uses `withReasoningEffort` for named reasoning strength because the majority wire term is `effort`: OpenAI and Anthropic both expose effort-style controls. Anthropic's accepted values are provider-specific (`'low' | 'medium' | 'high' | 'max'`), and future provider factories should keep their own first-class enum values rather than flattening them into a framework-wide lowest common denominator.

`withReasoningBudget` and `withAdaptiveReasoning` follow the Anthropic/Google naming majority for explicit token budgets and adaptive thinking controls. Future Google and OpenAI factories should reuse these method names where the provider has equivalent semantics, while preserving each provider's native enum/value set at the type boundary.

## Factory Pattern

Keep provider selection outside model resolution. The agent factory decides whether to override the default after it knows the provider and the schema.

```typescript
type AgentStrategy = 'standard' | 'anthropic-output-format' | 'anthropic-jsontool-fallback';

function chooseStrategy(providerName: string, schemaKind: 'bound-free' | 'constrained'): AgentStrategy {
  if (providerName !== 'anthropic') {
    return 'standard';
  }

  return schemaKind === 'bound-free'
    ? 'anthropic-output-format'
    : 'anthropic-jsontool-fallback';
}
```

## Guardrails

- Do not pass `thinking` with `jsonTool` in the same structured-output call. Anthropic forbids this combination at the wire.
- Do not use `discriminatedUnion` with Anthropic structured output. agtlantis rejects the converted `oneOf` schema before the wire call.
- Do not add framework-level schema introspection for bound keywords. Schema ownership stays with the consumer; wire reject is the first feedback channel.
- Use `normalizeCitations()` for web-search source chunks when a consumer needs a provider-neutral citation shape.
- Use `extractAnthropicServerToolUse()` when recording server-side web-search request counts from Anthropic raw usage.

## Related Files

- `packages/core/docs/architecture/provider-schema-guidance.md`
- `packages/core/e2e/anthropic/strategy.e2e.test.ts`
- `packages/core/src/provider/anthropic/factory.ts`
- `packages/core/src/provider/anthropic/schema-validator.ts`
- `packages/core/src/provider/anthropic/citation-normalizer.ts` — Anthropic web_search_result normalization + Anthropic-aware combining entrypoint
- `packages/core/src/citation/index.ts` — provider-neutral citation types + AI SDK source-chunk normalization
- `packages/core/src/provider/anthropic/usage.ts` — Anthropic server-tool usage extraction (`extractAnthropicServerToolUse`)
