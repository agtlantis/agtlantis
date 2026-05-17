/// <reference types="node" />
/**
 * F9-T9.3 PoC — Anthropic Claude structured output (Zod) compatibility
 *
 * Goal: Verify how far AI SDK structured output + Zod schemas pass through Claude.
 *
 * Hypotheses to test:
 *   - H1: AI SDK `@ai-sdk/anthropic@3.0.62` supports two structured output wire
 *         paths: `outputFormat` (native `output_config.format.json_schema`, beta
 *         `structured-outputs-2025-11-13`) and `jsonTool` (tool-use trick with
 *         tool name `"json"`). Default `auto` picks `outputFormat` for known
 *         capable models (Haiku 4.5 is supportsStructuredOutput=true).
 *   - H2: Common Zod patterns (nullable, nested, array, enum/literal) flow through
 *         both modes for Haiku 4.5 without surprise rewrites.
 *   - H3: Discriminated union compatibility is the high-risk axis (F8 lesson:
 *         OpenAI required .nullable() on optionals for tool-call structured output).
 *         Claude may or may not accept JSON Schema `oneOf` / discriminator hints.
 *   - H4: Recursive schemas (zod-to-json-schema emits $ref) are second-risk axis;
 *         many providers reject self-referential schemas in their tool input shape.
 *   - H5 (F8 lesson): `.nullable()` vs `.optional()` produces different JSON Schema
 *         (`type: [..., 'null']` vs absence from `required`). Claude may behave
 *         differently between the two forms.
 *
 * NOTE — Throwaway PoC. Goal is data + failure modes, not a polished library.
 *        Real provider integration NOT implemented here.
 *
 * Deprecation note (AI SDK 6.x): `generateObject` is deprecated in favor of
 * `generateText({ output: Output.object({ schema }) })`. This PoC uses the
 * recommended path so the wire body and outcome mirror what the formal
 * integration will see. The structured-output mechanism (outputFormat vs
 * jsonTool) is unchanged between the two APIs at the wire level.
 *
 * Run:
 *   REAL_AI_ENABLED=true pnpm vitest run e2e/anthropic/structured-output.poc.test.ts
 *
 * Cost note: 10 schema cases × 3 modes = 30 calls per pass. Haiku 4.5, max 512
 * output tokens, short prompts. Estimated <$0.05 per full run.
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, NoOutputGeneratedError, Output } from 'ai';
import { describe, expect, it, beforeAll } from 'vitest';
import { z } from 'zod';

const REAL_AI_ENABLED =
    process.env.REAL_AI_ENABLED === 'true' || process.env.REAL_AI_ENABLED === '1';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SKIP = !REAL_AI_ENABLED || !ANTHROPIC_API_KEY;
const d = SKIP ? describe.skip : describe;

const MODEL_HAIKU = 'claude-haiku-4-5-20251001';

type StructuredMode = 'auto' | 'outputFormat' | 'jsonTool';
const MODES: StructuredMode[] = ['auto', 'outputFormat', 'jsonTool'];

// ---- wire capture ----

interface RequestSnapshot {
    url: string;
    headers: Record<string, string>;
    body: unknown;
    bodyByteSize: number;
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function makeFetchSpy(captures: RequestSnapshot[]): typeof fetch {
    return (async (input: FetchInput, init?: FetchInit) => {
        const url =
            typeof input === 'string'
                ? input
                : input instanceof URL
                ? input.toString()
                : input.url;
        const rawHeaders = init?.headers ?? {};
        const headerObj: Record<string, string> = {};
        if (rawHeaders instanceof Headers) {
            rawHeaders.forEach((v, k) => (headerObj[k] = v));
        } else if (Array.isArray(rawHeaders)) {
            for (const [k, v] of rawHeaders) headerObj[k] = String(v);
        } else {
            Object.assign(headerObj, rawHeaders as Record<string, string>);
        }
        let body: unknown = '<non-string body>';
        let bodyByteSize = 0;
        const raw = init?.body;
        if (typeof raw === 'string') {
            bodyByteSize = Buffer.byteLength(raw, 'utf-8');
            try {
                body = JSON.parse(raw);
            } catch {
                body = raw.slice(0, 400);
            }
        } else if (raw instanceof Uint8Array) {
            bodyByteSize = raw.byteLength;
            body = `<binary ${raw.byteLength} bytes>`;
        }
        captures.push({ url, headers: headerObj, body, bodyByteSize });
        return fetch(input, init);
    }) as typeof fetch;
}

function dump(label: string, payload: unknown): void {
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(payload, null, 2));
}

interface CaseOutcome {
    mode: StructuredMode;
    ok: boolean;
    object?: unknown;
    error?: { name: string; message: string; cause?: unknown };
    wireShape?: {
        usedOutputFormat: boolean;
        usedJsonTool: boolean;
        toolNames: string[];
        outputConfigKind?: string;
        betas?: string;
    };
    bodyByteSize?: number;
}

/**
 * Runs `generateText` + `Output.object({ schema })` against a Zod schema under
 * a single structured-output mode. Captures wire body + outcome. Never throws —
 * packages success/failure into a CaseOutcome.
 */
async function runCase(params: {
    label: string;
    mode: StructuredMode;
    schema: z.ZodSchema;
    prompt: string;
}): Promise<CaseOutcome> {
    const captures: RequestSnapshot[] = [];
    const anthropic = createAnthropic({
        apiKey: ANTHROPIC_API_KEY!,
        fetch: makeFetchSpy(captures),
    });
    const model = anthropic(MODEL_HAIKU);

    const outcome: CaseOutcome = { mode: params.mode, ok: false };
    // `auto` is the SDK default — pass it through verbatim so the wire shape
    // reflects whatever the SDK would have chosen if the consumer set nothing.
    const providerOptions = {
        anthropic: { structuredOutputMode: params.mode },
    } as const;
    try {
        const result = await generateText({
            model,
            output: Output.object({ schema: params.schema }),
            prompt: params.prompt,
            maxOutputTokens: 512,
            providerOptions,
        });
        outcome.ok = true;
        outcome.object = result.output;
    } catch (e) {
        // PoC observation (24 calls): this branch is never hit in practice —
        // schema mismatches surface as `NoObjectGeneratedError` even through
        // `Output.object`. The branch is kept defensively in case AI SDK
        // unifies the error type later. See T9.3-finding.md §API caveat.
        if (NoOutputGeneratedError.isInstance(e)) {
            outcome.error = {
                name: 'NoOutputGeneratedError',
                message: e.message,
                cause: {
                    causeMessage: e.cause instanceof Error ? e.cause.message : String(e.cause),
                },
            };
        } else if (e instanceof Error) {
            // Real path: `NoObjectGeneratedError` (legacy) + `APICallError` land here.
            outcome.error = { name: e.constructor.name, message: e.message };
        } else {
            outcome.error = { name: 'unknown', message: String(e) };
        }
    }

    const first = captures[0];
    if (first) {
        outcome.bodyByteSize = first.bodyByteSize;
        const body = first.body as
            | {
                  tools?: Array<{ name?: string }>;
                  output_config?: { format?: { type?: string } };
              }
            | undefined;
        const toolNames =
            Array.isArray(body?.tools) && body.tools
                ? body.tools.map((t) => t?.name ?? '<unnamed>')
                : [];
        outcome.wireShape = {
            usedOutputFormat: body?.output_config?.format != null,
            usedJsonTool: toolNames.includes('json'),
            toolNames,
            outputConfigKind: body?.output_config?.format?.type,
            betas: first.headers['anthropic-beta'],
        };
    }

    dump(`${params.label} [${params.mode}] wire`, first?.body);
    dump(`${params.label} [${params.mode}] outcome`, {
        ok: outcome.ok,
        object: outcome.object,
        error: outcome.error,
        wireShape: outcome.wireShape,
        bodyByteSize: outcome.bodyByteSize,
    });
    return outcome;
}

// ---- schema cases ----

// Case 1 — flat object (baseline)
const flatSchema = z.object({
    name: z.string().describe('person full name'),
    age: z.number().int().describe('age in years'),
    active: z.boolean(),
    nickname: z.string().optional(),
});
const flatPrompt =
    'Output a person record: name "Alice Kim", age 31, active true. Omit nickname.';

// Case 2a — `.nullable()` / `.nullish()` (F8 OpenAI lesson: required for strict mode)
const nullableSchema = z.object({
    title: z.string(),
    subtitle: z.string().nullable().describe('null if no subtitle'),
    note: z.string().nullish().describe('null or omitted if no note'),
});
const nullablePrompt =
    'Output a book entry: title "Sapiens", no subtitle, no note. Use null for missing fields.';

// Case 2b — `.optional()` (F8 lesson cross-check: nullable vs optional behave
// differently in OpenAI strict mode. Does Claude care?)
const optionalSchema = z.object({
    title: z.string(),
    subtitle: z.string().optional().describe('omit if no subtitle'),
    note: z.string().optional().describe('omit if no note'),
});
const optionalPrompt =
    'Output a book entry: title "Sapiens", no subtitle, no note. Omit absent fields entirely.';

// Case 3 — nested object (2 levels)
const nestedSchema = z.object({
    user: z.object({
        id: z.string(),
        profile: z.object({
            email: z.string(),
            city: z.string().nullable(),
        }),
    }),
});
const nestedPrompt =
    'Output a user record: id "u-001", profile.email "[email protected]", profile.city null.';

// Case 4 — array of objects
const arraySchema = z.object({
    tags: z.array(
        z.object({
            name: z.string(),
            weight: z.number(),
        }),
    ),
});
const arrayPrompt =
    'Output a tag list with 3 items: (alpha, 0.9), (beta, 0.5), (gamma, 0.1).';

// Case 4b — array with .min().max() bounds (F8 production gap)
// `packages/contexts/topic-recommendation/src/infra/agents/topic-issuer.ts`에서
// `z.array(...).min(N).max(M)` 16곳 (lines 100, 103, 104, 115, 122-124, 129, 140,
// 145, 148-151, 179, 180) + 같은 디렉터리 `topic-recommender.ts:38,46` 2곳 사용 중.
// `zod-to-json-schema`는 이걸 `minItems` / `maxItems` JSON Schema 키워드로 attach.
// outputFormat의 `integer + min/max` 거부 패턴이 array bound에도 적용되는지 검증.
const arrayBoundedSchema = z.object({
    keywords: z.array(z.string()).min(1).max(4).describe('keywords (1-4 items)'),
});
const arrayBoundedPrompt =
    'Output a keywords list with exactly 3 strings: "alpha", "beta", "gamma".';

// Case 5 — discriminated union (F8 high-risk axis)
const duSchema = z.object({
    event: z.discriminatedUnion('kind', [
        z.object({
            kind: z.literal('login'),
            userId: z.string(),
        }),
        z.object({
            kind: z.literal('purchase'),
            orderId: z.string(),
            amount: z.number(),
        }),
        z.object({
            kind: z.literal('error'),
            code: z.number().int(),
            message: z.string(),
        }),
    ]),
});
const duPrompt =
    'Output an event of kind "purchase" with orderId "ord-42" and amount 19900.';

// Case 6 — enum / literal (combined with bounded integer — outputFormat 거부 원인 혼재)
const enumSchema = z.object({
    status: z.enum(['draft', 'review', 'published']),
    priority: z.union([z.literal('low'), z.literal('med'), z.literal('high')]),
    score: z.number().int().min(0).max(100),
});
const enumPrompt =
    'Output a task: status "review", priority "high", score 87.';

// Case 6b — bounded number WITHOUT .int() (F8 production gap)
// `packages/contexts/topic-recommendation/src/infra/agents/topic-recommender.ts:40`
// matchScore = `z.number().min(0).max(100)` (non-int).
// `zod-to-json-schema`는 `integer`가 아닌 `number` 타입 + `minimum`/`maximum` attach.
// Anthropic의 outputFormat 거부 규칙이 `integer` 타입에 한정인지 검증 (C6의 변형 분리).
const numberBoundedSchema = z.object({
    score: z.number().min(0).max(100).describe('numeric score (0-100, fractions allowed)'),
});
const numberBoundedPrompt = 'Output a record: score 87.5.';

// Case 7 — recursive schema (Tree)
interface Tree {
    name: string;
    children: Tree[];
}
const recursiveSchema: z.ZodType<Tree> = z.lazy(() =>
    z.object({
        name: z.string(),
        children: z.array(recursiveSchema),
    }),
);
const recursivePrompt =
    'Output a tree: root "A" with two children. Child 1 "B" has one child "D" (no grandchildren). Child 2 "C" has no children.';

// ---- the suite ----

const ALL_CASES = [
    { id: 'C1-flat', schema: flatSchema, prompt: flatPrompt },
    { id: 'C2a-nullable', schema: nullableSchema, prompt: nullablePrompt },
    { id: 'C2b-optional', schema: optionalSchema, prompt: optionalPrompt },
    { id: 'C3-nested', schema: nestedSchema, prompt: nestedPrompt },
    { id: 'C4-array', schema: arraySchema, prompt: arrayPrompt },
    { id: 'C4b-arrayBounded', schema: arrayBoundedSchema, prompt: arrayBoundedPrompt },
    { id: 'C5-discriminatedUnion', schema: duSchema, prompt: duPrompt },
    { id: 'C6-enumLiteral', schema: enumSchema, prompt: enumPrompt },
    { id: 'C6b-numberBounded', schema: numberBoundedSchema, prompt: numberBoundedPrompt },
    { id: 'C7-recursive', schema: recursiveSchema, prompt: recursivePrompt },
] as const;

d('F9-T9.3 PoC — Anthropic Claude structured output (Zod) compatibility', () => {
    const matrix: Array<{
        case: string;
        mode: StructuredMode;
        ok: boolean;
        usedOutputFormat: boolean;
        usedJsonTool: boolean;
        outputConfigKind?: string;
        errorName?: string;
        errorMessage?: string;
    }> = [];

    beforeAll(() => {
        console.log(`[setup] model=${MODEL_HAIKU}`);
        console.log(`[setup] modes=${MODES.join(', ')}`);
        console.log(`[setup] cases=${ALL_CASES.length}`);
    });

    for (const cse of ALL_CASES) {
        for (const mode of MODES) {
            it(
                `${cse.id} [${mode}]`,
                async () => {
                    const outcome = await runCase({
                        label: cse.id,
                        mode,
                        schema: cse.schema,
                        prompt: cse.prompt,
                    });
                    matrix.push({
                        case: cse.id,
                        mode,
                        ok: outcome.ok,
                        usedOutputFormat: outcome.wireShape?.usedOutputFormat ?? false,
                        usedJsonTool: outcome.wireShape?.usedJsonTool ?? false,
                        outputConfigKind: outcome.wireShape?.outputConfigKind,
                        errorName: outcome.error?.name,
                        errorMessage: outcome.error?.message?.slice(0, 220),
                    });
                    // Soft assertion: data point matters more than pass/fail.
                    // We still assert that wire shape reflects the requested mode,
                    // to confirm the mode flag is being honored by AI SDK.
                    if (outcome.ok) {
                        expect(outcome.object).toBeDefined();
                        // Schema parse must already have happened inside `Output.object`.
                        const reparsed = cse.schema.safeParse(outcome.object);
                        expect(reparsed.success).toBe(true);
                    } else {
                        // Failure path: ensure we captured something useful.
                        expect(outcome.error).toBeDefined();
                    }
                    if (mode === 'outputFormat') {
                        // For supported model + outputFormat mode, AI SDK should set output_config.format.
                        // If this breaks, the mode flag is silently ignored — important signal.
                        expect(outcome.wireShape?.usedOutputFormat).toBe(true);
                    } else if (mode === 'jsonTool') {
                        // jsonTool mode forces tool-use trick with tool name "json".
                        expect(outcome.wireShape?.usedJsonTool).toBe(true);
                    } else {
                        // `auto` for supportsStructuredOutput=true models (Haiku 4.5)
                        // resolves to outputFormat per ai-sdk capability table — if this
                        // ever flips, the matrix will surface it as a delta against the
                        // explicit `outputFormat` row.
                        expect(outcome.wireShape?.usedOutputFormat).toBe(true);
                    }
                },
                90_000,
            );
        }
    }

    it('compatibility matrix summary', () => {
        dump('compatibility matrix', matrix);
        // Always passes; this exists to make the matrix easy to find in test output.
        expect(matrix.length).toBe(ALL_CASES.length * MODES.length);
    });
});
