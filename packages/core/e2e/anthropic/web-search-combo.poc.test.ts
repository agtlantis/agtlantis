/// <reference types="node" />
/**
 * F9-T9.4 PoC — Anthropic Claude `web_search_20250305` + extended thinking +
 *               structured output (jsonTool) 조합형 timing/실패 모드 검증
 *
 * Why this exists: F8 (OpenAI migration) lesson — 단독 테스트는 통과해도 실제 앱에서
 *                  `reasoning + webSearch + structured output` 조합이 3분+ TTL eviction
 *                  무한 루프로 폭발. T9.4는 같은 폭발이 Anthropic Claude (Sonnet 4.6)에서
 *                  재발하는지를 정량 측정한다.
 *
 * Hypotheses to test:
 *   - H1 (baseline reuse): T9.2 결과(thinking-only OK)와 T9.3 결과(jsonTool mode OK)는
 *         단독으로는 그대로 동작한다. 본 PoC도 baseline에서 같은 결과를 재현해야 한다.
 *   - H2 (★): webSearch + thinking 조합에서 reasoning chunk와 tool-call/tool-result
 *         chunk가 fullStream에 interleave 한다 (T9.2 Open question).
 *   - H3 (★★): webSearch + thinking + jsonTool 4중 조합에서:
 *         - `tool_choice: 'required'` + `disableParallelToolUse: true` (jsonTool 강제 — 컴파일된 SDK
 *           `@ai-sdk/anthropic@3.0.62 dist/index.js:3198-3204`)이 webSearch tool과 어떻게 공존하는가?
 *         - F8 패턴(3분 hang) 재현되는가? hang? timeout? clean fail? clean success?
 *         - 어떤 wire-level conflict이 발생할 수 있는가? (json tool과 web_search tool 양립 가능?)
 *   - H4 (F8 production schema 재현): topic-issuer.ts의 실제 schema
 *         (`.min().max()` bound 키워드 — topic-issuer.ts 16곳 / F8 전체 19곳, T9.3 정합:
 *          topic-issuer.ts 16 + topic-recommender.ts 3, T9.3 finding §3.3)
 *         + nested + nullable mix를 들고 Sonnet 4.6 + thinking + webSearch + jsonTool 호출 →
 *         산출물을 만들어내는가?
 *
 * Wire-level reference (compiled `@ai-sdk/anthropic@3.0.62 dist/index.js`):
 *   - 2940-2947: `structuredOutputMode='jsonTool'` → jsonResponseTool (name "json", function tool)
 *   - 3198-3204: jsonTool 활성 시 `tools=[...userTools, jsonResponseTool]`,
 *                `tool_choice: { type: 'required' }`, `disableParallelToolUse: true`,
 *                `supportsStructuredOutput: false`
 *   - 2965 : provider tool id `anthropic.web_search_20250305` → server-side name `web_search`
 *   - 1147 : `webSearch_20250305 = (args = {}) => factory3(args)`
 *   - 3189-3191: `betas.add("fine-grained-tool-streaming-2025-05-14")` when streaming + toolStreaming
 *                (informational only — PoC does not assert on the `anthropic-beta` header; this
 *                 line is the trace for "where does that beta come from" if a future Feature
 *                 needs to manage it.)
 *
 * Scope: throwaway PoC (F9 Spike 원칙). 정식 `createAnthropicProvider` 미구현.
 *
 * Run:
 *   REAL_AI_ENABLED=true ANTHROPIC_API_KEY=... \
 *     pnpm vitest run e2e/anthropic/web-search-combo.poc.test.ts
 *
 * Cost guard (per F9 model policy):
 *   - Sonnet 4.6 only — webSearch + thinking은 Sonnet 이상.
 *   - thinking budgetTokens: 1024
 *   - maxOutputTokens: 2048 (production parity)
 *   - webSearch maxUses: 2 (rate cap)
 *   - 시나리오 7개 × 1회 = 7 호출 (A-E jsonTool, F/G outputFormat — Option C 회피안).
 *     wall-clock + 토큰 + tool result chunks 측정.
 *   - 시나리오별 wall-clock cap 180s; F8에서 3분+ hang 났으니 hang 자체가 결과 데이터.
 */
import { createAnthropic, anthropic as anthropicProviderTools } from '@ai-sdk/anthropic';
import { NoOutputGeneratedError, Output, streamText, type ToolSet } from 'ai';
import { describe, expect, it, beforeAll } from 'vitest';
import { z } from 'zod';

// ─── Env guards ─────────────────────────────────────────────────────────────

const REAL_AI_ENABLED =
    process.env.REAL_AI_ENABLED === 'true' || process.env.REAL_AI_ENABLED === '1';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SKIP = !REAL_AI_ENABLED || !ANTHROPIC_API_KEY;
const d = SKIP ? describe.skip : describe;

const MODEL_SONNET = 'claude-sonnet-4-6';

// ─── Wire capture (T9.3 pattern) ─────────────────────────────────────────────

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

// ─── Chunk recording (T9.2 pattern, extended for tool events) ────────────────

interface StreamEventRecord {
    idx: number;
    type: string;
    id?: string;
    toolName?: string;
    textPreview?: string;
    textLength?: number;
    deltaPreview?: string;
    deltaLength?: number;
    providerMetadata?: unknown;
    inputPreview?: unknown;
    outputPreview?: unknown;
    errorPreview?: string;
    payloadKeys?: string[];
}

function recordChunk(idx: number, chunk: Record<string, unknown>): StreamEventRecord {
    const rec: StreamEventRecord = {
        idx,
        type: String(chunk.type),
        payloadKeys: Object.keys(chunk).filter((k) => k !== 'type'),
    };
    const text = chunk.text;
    if (typeof text === 'string') {
        rec.textLength = text.length;
        rec.textPreview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    }
    const delta = chunk.delta;
    if (typeof delta === 'string') {
        rec.deltaLength = delta.length;
        rec.deltaPreview = delta.length > 80 ? `${delta.slice(0, 80)}…` : delta;
    }
    if (typeof chunk.id === 'string') rec.id = chunk.id;
    if (typeof chunk.toolName === 'string') rec.toolName = chunk.toolName;
    if (chunk.providerMetadata != null) rec.providerMetadata = chunk.providerMetadata;
    if (chunk.input != null) {
        try {
            const s = JSON.stringify(chunk.input);
            rec.inputPreview = s.length > 200 ? `${s.slice(0, 200)}…` : s;
        } catch {
            rec.inputPreview = '<unstringifiable>';
        }
    }
    if (chunk.output != null) {
        try {
            const s = JSON.stringify(chunk.output);
            rec.outputPreview = s.length > 200 ? `${s.slice(0, 200)}…` : s;
        } catch {
            rec.outputPreview = '<unstringifiable>';
        }
    }
    if (chunk.error != null) {
        try {
            const e = chunk.error as { message?: string };
            const s = typeof e?.message === 'string' ? e.message : JSON.stringify(chunk.error);
            rec.errorPreview = s.length > 500 ? `${s.slice(0, 500)}…` : s;
        } catch {
            rec.errorPreview = '<unstringifiable>';
        }
    }
    return rec;
}

function dump(label: string, payload: unknown): void {
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(payload, null, 2));
}

// ─── Scenario runner ─────────────────────────────────────────────────────────

interface ScenarioConfig {
    label: string;
    withThinking: boolean;
    withWebSearch: boolean;
    withStructuredOutput: boolean;
    /**
     * When `withStructuredOutput=true`, picks which Anthropic structured-output wire
     * path to exercise. Default 'jsonTool' (T9.3 default, Scenarios B/D/E baseline).
     * 'outputFormat' is the Option C path explored in Scenarios F & G — it uses the
     * native `output_config.format.json_schema` wire and avoids the jsonTool's forced
     * `tool_choice='any'`, which is the trigger that conflicts with thinking.
     */
    structuredOutputMode?: 'jsonTool' | 'outputFormat';
    schema?: z.ZodSchema;
    prompt: string;
    system?: string;
    maxOutputTokens?: number;
    webSearchMaxUses?: number;
}

interface ScenarioOutcome {
    label: string;
    okStreamed: boolean;
    wallClockMs: number;
    events: StreamEventRecord[];
    counts: Record<string, number>;
    finishReason: unknown;
    usage: unknown;
    text: string;
    reasoningText: string;
    /** present only when withStructuredOutput=true and Output.object yields .output */
    parsedOutput: unknown;
    parseError?: { name: string; message: string };
    /** present always: shape of first POST to /messages */
    wireBody?: unknown;
    wireBytes?: number;
    /** sequence pattern for H2/H3: did reasoning↔tool/web_search interleave? */
    interleavingPattern: string;
    /**
     * Error captured at the outer `try` boundary — typically thrown by
     * `await stream.finishReason` / `stream.usage` / `stream.output` once the
     * stream has settled with an upstream error (e.g. an Anthropic 400 surfaces
     * here as `NoOutputGeneratedError`). Inner-iteration throws would also land
     * here. Distinct from `parseError`, which only carries `Output.object`
     * parse failures.
     */
    streamSettledError?: { name: string; message: string };
}

async function runScenario(cfg: ScenarioConfig): Promise<ScenarioOutcome> {
    const captures: RequestSnapshot[] = [];
    const anthropic = createAnthropic({
        apiKey: ANTHROPIC_API_KEY!,
        fetch: makeFetchSpy(captures),
    });
    const model = anthropic(MODEL_SONNET);

    const events: StreamEventRecord[] = [];
    const counts: Record<string, number> = {};
    let collectedText = '';
    let collectedReasoning = '';
    let finishReason: unknown = undefined;
    let usage: unknown = undefined;
    let parsedOutput: unknown = undefined;
    let parseError: { name: string; message: string } | undefined = undefined;
    let streamSettledError: { name: string; message: string } | undefined = undefined;

    // AI SDK 6.x type quirk: `ToolSet = Record<string, Tool<...> & Pick<Tool, 'execute' | ...>>`
    // (`ai/dist/index.d.ts:408`) treats `execute` as required, but provider tools like
    // `webSearch_20250305()` are server-side and have no `execute`. Runtime works fine
    // (PoC 6/6 PASS). Cast keeps the spike throwaway clean without forking ToolSet typing.
    // Formal Anthropic provider Feature will need a stable wrapper (see T9.4-finding §11).
    const tools = cfg.withWebSearch
        ? ({
              web_search: anthropicProviderTools.tools.webSearch_20250305({
                  maxUses: cfg.webSearchMaxUses ?? 2,
              }),
          } as unknown as ToolSet)
        : undefined;

    const providerOptions = {
        anthropic: {
            ...(cfg.withThinking
                ? { thinking: { type: 'enabled', budgetTokens: 1024 }, sendReasoning: true }
                : {}),
            ...(cfg.withStructuredOutput
                ? { structuredOutputMode: cfg.structuredOutputMode ?? 'jsonTool' }
                : {}),
        },
    } as const;

    const baseArgs = {
        model,
        maxOutputTokens: cfg.maxOutputTokens ?? 2048,
        ...(cfg.system != null ? { system: cfg.system } : {}),
        prompt: cfg.prompt,
        ...(tools ? { tools } : {}),
        ...(Object.keys(providerOptions.anthropic).length > 0 ? { providerOptions } : {}),
    } as const;

    const t0 = Date.now();
    let okStreamed = false;

    // sequence pattern: track ordered milestones for H2/H3 interleaving analysis
    const sequence: string[] = [];

    try {
        if (cfg.withStructuredOutput) {
            // jsonTool path: use generateText + Output.object (matches topic-issuer pattern at
            // packages/contexts/topic-recommendation/src/infra/agents/topic-issuer.ts:401).
            // We still stream via streamText to capture interleaving — Output.object also works
            // with streamText through the same wire shape (the v6 deprecation note in T9.3 finding).
            const stream = streamText({
                ...baseArgs,
                output: Output.object({ schema: cfg.schema! }),
            });
            let idx = 0;
            for await (const chunk of stream.fullStream) {
                const rec = recordChunk(idx++, chunk as Record<string, unknown>);
                events.push(rec);
                counts[rec.type] = (counts[rec.type] ?? 0) + 1;

                const c = chunk as { type: string; delta?: string; text?: string; toolName?: string };
                const incremental =
                    typeof c.text === 'string'
                        ? c.text
                        : typeof c.delta === 'string'
                        ? c.delta
                        : '';
                if (c.type === 'text-delta') {
                    collectedText += incremental;
                } else if (c.type === 'reasoning-delta') {
                    collectedReasoning += incremental;
                }
                // milestone tracking for interleaving pattern (compress consecutive same types)
                const milestone =
                    c.type === 'reasoning-start'
                        ? 'R['
                        : c.type === 'reasoning-end'
                        ? 'R]'
                        : c.type === 'text-start'
                        ? 'T['
                        : c.type === 'text-end'
                        ? 'T]'
                        : c.type === 'tool-input-start' ||
                          c.type === 'tool-input-delta' ||
                          c.type === 'tool-input-end' ||
                          c.type === 'tool-call'
                        ? `tc(${c.toolName ?? '?'})`
                        : c.type === 'tool-result'
                        ? `tr(${c.toolName ?? '?'})`
                        : null;
                if (milestone != null) sequence.push(milestone);
            }
            finishReason = await stream.finishReason;
            usage = await stream.usage;
            try {
                // AI SDK 6.x: `stream.output` is the stable property (`ai/dist/index.d.ts:2793`).
                // `experimental_output` is also present on the result interface (`:2788`,
                // marked `@deprecated`) but accessing it with `Output<unknown, unknown, never>`
                // generic raises TS2339 (TS internal — generic inference path differs from
                // the same-signature `output` property). See T9.4-finding §11.4 for details.
                parsedOutput = await stream.output;
            } catch (e) {
                if (NoOutputGeneratedError.isInstance(e)) {
                    parseError = { name: 'NoOutputGeneratedError', message: e.message };
                } else if (e instanceof Error) {
                    parseError = { name: e.constructor.name, message: e.message };
                } else {
                    parseError = { name: 'unknown', message: String(e) };
                }
            }
            okStreamed = true;
        } else {
            // no structured output → plain streamText
            const stream = streamText(baseArgs);
            let idx = 0;
            for await (const chunk of stream.fullStream) {
                const rec = recordChunk(idx++, chunk as Record<string, unknown>);
                events.push(rec);
                counts[rec.type] = (counts[rec.type] ?? 0) + 1;

                const c = chunk as { type: string; delta?: string; text?: string; toolName?: string };
                const incremental =
                    typeof c.text === 'string'
                        ? c.text
                        : typeof c.delta === 'string'
                        ? c.delta
                        : '';
                if (c.type === 'text-delta') {
                    collectedText += incremental;
                } else if (c.type === 'reasoning-delta') {
                    collectedReasoning += incremental;
                }
                const milestone =
                    c.type === 'reasoning-start'
                        ? 'R['
                        : c.type === 'reasoning-end'
                        ? 'R]'
                        : c.type === 'text-start'
                        ? 'T['
                        : c.type === 'text-end'
                        ? 'T]'
                        : c.type === 'tool-input-start' ||
                          c.type === 'tool-input-delta' ||
                          c.type === 'tool-input-end' ||
                          c.type === 'tool-call'
                        ? `tc(${c.toolName ?? '?'})`
                        : c.type === 'tool-result'
                        ? `tr(${c.toolName ?? '?'})`
                        : null;
                if (milestone != null) sequence.push(milestone);
            }
            finishReason = await stream.finishReason;
            usage = await stream.usage;
            okStreamed = true;
        }
    } catch (e) {
        if (e instanceof Error) {
            streamSettledError = { name: e.constructor.name, message: e.message };
        } else {
            streamSettledError = { name: 'unknown', message: String(e) };
        }
    }

    const wallClockMs = Date.now() - t0;
    const first = captures[0];
    const wireBody = first?.body;
    const wireBytes = first?.bodyByteSize;

    // collapse consecutive duplicates to make the pattern readable
    const compressed: string[] = [];
    for (const m of sequence) {
        if (compressed[compressed.length - 1] !== m) compressed.push(m);
    }
    const interleavingPattern = compressed.join(' → ');

    return {
        label: cfg.label,
        okStreamed,
        wallClockMs,
        events,
        counts,
        finishReason,
        usage,
        text: collectedText,
        reasoningText: collectedReasoning,
        parsedOutput,
        parseError,
        wireBody,
        wireBytes,
        interleavingPattern,
        streamSettledError,
    };
}

function summarize(outcome: ScenarioOutcome) {
    // Surface error chunks separately — they often carry the wire-level cause when
    // streaming fails (e.g. API 400 with "tool x not allowed for thinking with tool_choice=any").
    const errorChunks = outcome.events
        .filter((e) => e.type === 'error')
        .map((e) => ({
            idx: e.idx,
            payloadKeys: e.payloadKeys,
            errorPreview: e.errorPreview,
        }));
    return {
        label: outcome.label,
        wallClockMs: outcome.wallClockMs,
        okStreamed: outcome.okStreamed,
        finishReason: outcome.finishReason,
        counts: outcome.counts,
        textLength: outcome.text.length,
        reasoningLength: outcome.reasoningText.length,
        parsedOutputPresent: outcome.parsedOutput != null,
        parseError: outcome.parseError,
        streamSettledError: outcome.streamSettledError,
        errorChunks,
        interleavingPattern: outcome.interleavingPattern,
        usage: outcome.usage,
        wireBytes: outcome.wireBytes,
    };
}

// ─── F8 production schema (verbatim from topic-issuer.ts, 2026-05-12) ────────
// Source: packages/contexts/topic-recommendation/src/infra/agents/topic-issuer.ts:94-181
// .min/.max bound 키워드 (topic-issuer.ts 16곳 / F8 전체 19곳 — T9.3 정합:
// topic-issuer.ts 16 + topic-recommender.ts 3, T9.3 finding §3.3)
// + nested + nullable mix — T9.3에서 jsonTool로 PASS 확인됨.
// T9.4는 이 schema 위에서 + thinking + webSearch 4중 조합으로 fail 모드 확인.

const DifficultySchema = z.enum(['easy', 'medium', 'hard']).describe('난이도');

const BaseTopicSchema = z.object({
    id: z.string().min(1).describe('주제 고유 ID'),
    title: z.string().max(120).describe('주제 제목'),
    description: z.string().max(650).describe('주제 설명 (220-650자 권장)'),
    relatedSubjects: z.array(z.string()).min(1).max(4).describe('관련 과목 (2-4개 권장)'),
    recommendationReason: z.string().max(650).describe('추천 이유 (180자 이상 권장)'),
    estimatedDifficulty: DifficultySchema,
    setekKeywords: z.array(z.string()).min(1).max(8).describe('세특 키워드 (4-8개 권장)'),
    referenceDirections: z.array(z.string()).min(1).max(5).describe('참고 방향 (3-5개 권장)'),
});

const CoreTheorySchema = z.object({
    name: z.string().describe('이론명'),
    explanation: z.string().max(500).describe('이론 설명 (120자 이상 권장)'),
    reportConnection: z.string().max(300).describe('보고서 적용 연결점 (80자 이상 권장)'),
});

const TopicDetailSchema = z.object({
    background: z.string().max(1200).describe('주제 배경 (320-1200자 권장)'),
    coreTheories: z.array(CoreTheorySchema).min(1).max(6).describe('핵심 이론 (3-6개 권장)'),
    significance: z.string().max(700).describe('연구 의의 (180자 이상 권장)'),
    currentTrends: z.string().max(700).describe('최근 동향 (180자 이상 권장)'),
    approachAngle: z.string().max(1200).describe('접근 각도 (240자 이상 권장)'),
});

const MethodPlanSchema = z.object({
    dataCollection: z.array(z.string()).min(1).max(6).describe('자료 수집 계획 (3-6개 권장)'),
    analysisMethod: z.array(z.string()).min(1).max(6).describe('분석 방법 계획 (3-6개 권장)'),
    expectedLimitations: z.array(z.string()).min(1).max(5).describe('예상 한계 (2-5개 권장)'),
});

const ChapterOutlineSchema = z.object({
    title: z.string().describe('목차 제목'),
    keyPoints: z.array(z.string()).min(1).max(4).describe('작성 핵심 포인트 (2-4개 권장)'),
});

const EvidenceMapSchema = z.object({
    claim: z.string().describe('핵심 주장'),
    evidence: z.string().describe('근거 요약'),
    sourceHint: z.string().describe('근거 확보 힌트'),
});

const WritingScheduleSchema = z.object({
    phase: z.string().describe('작성 단계'),
    goals: z.array(z.string()).min(1).max(5).describe('단계 목표 (2개 이상 권장)'),
});

const ReportBlueprintSchema = z.object({
    researchQuestion: z.string().max(300).describe('핵심 연구 질문'),
    subQuestions: z.array(z.string()).min(1).max(6).describe('세부 연구 질문 (3-6개 권장)'),
    hypothesisOrClaim: z.string().max(400).describe('검증 가능한 가설 또는 주장'),
    methodPlan: MethodPlanSchema,
    chapterOutline: z.array(ChapterOutlineSchema).min(1).max(6).describe('보고서 목차 구조 (4-6개 권장)'),
    evidenceMap: z.array(EvidenceMapSchema).min(1).max(7).describe('주장-근거 매핑 (3-7개 권장)'),
    writingSchedule: z.array(WritingScheduleSchema).min(1).max(6).describe('작성 일정 (3-6개 권장)'),
    immediateActions: z.array(z.string()).min(1).max(6).describe('즉시 실행 액션 (3-6개 권장)'),
});

const BookSchema = z.object({
    title: z.string().describe('도서명'),
    author: z.string().describe('저자'),
    publisher: z.string().nullable().describe('출판사'),
    publicationYear: z.string().nullable().describe('출판년도'),
    recommendationReason: z.string().describe('추천 이유'),
    difficulty: DifficultySchema,
    relevantParts: z.string().nullable().describe('관련 부분'),
    searchUrl: z.string().nullable().describe('검색 URL (알라딘/교보문고 검색 링크)'),
});

const PaperSchema = z.object({
    title: z.string().describe('논문명'),
    author: z.string().describe('저자'),
    journal: z.string().nullable().describe('학술지명'),
    publicationYear: z.string().nullable().describe('출판년도'),
    recommendationReason: z.string().describe('추천 이유'),
    difficulty: DifficultySchema,
    searchUrl: z.string().nullable().describe('검색 URL (Google Scholar/RISS 검색 링크)'),
});

const IssuanceResultSchema = z.object({
    baseTopic: BaseTopicSchema,
    detail: TopicDetailSchema,
    reportBlueprint: ReportBlueprintSchema,
    books: z.array(BookSchema).min(0).max(5).describe('참고 도서 (0-5권, 확실한 것만)'),
    papers: z.array(PaperSchema).min(0).max(5).describe('참고 논문 (0-5편, 확실한 것만)'),
});

// Small structured-output schema used in Scenarios B & D (cheaper than the full
// IssuanceResultSchema, so each scenario isolates one variable cleanly).
const ComboSchemaSmall = z.object({
    topic: z.string().describe('짧은 주제 제목'),
    keyPoints: z.array(z.string()).min(1).max(4).describe('핵심 포인트 1-4개'),
    citationCount: z.number().int().min(0).max(10).describe('근거로 인용한 출처 개수'),
});

// outputFormat-safe schema for Scenarios F & G (Option C — outputFormat + thinking).
// T9.3 finding (§3.1, §3.3) established that Anthropic outputFormat wire rejects:
//   - integer/number bound: .min/.max on numeric/integer
//   - array bound: .min/.max on arrays (minItems/maxItems)
//   - discriminatedUnion / oneOf
// To isolate the "thinking ↔ outputFormat compatibility" axis from those schema-side
// rejections, this schema uses ONLY: nullable, optional, nested objects, unbounded
// arrays, free strings/numbers. Modelled after T9.3 C2a/C3/C4 — all PASS on outputFormat.
const ComboSchemaOutputFormatSafe = z.object({
    topic: z.string().describe('짧은 주제 제목'),
    summary: z.string().describe('요약 (자유 길이)'),
    subtitle: z.string().nullable().describe('부제 (없으면 null)'),
    keyPoints: z.array(z.string()).describe('핵심 포인트 (bound 없음)'),
    citationCount: z.number().describe('근거로 인용한 출처 개수 (bound 없음)'),
    metadata: z
        .object({
            sourceCount: z.number().nullable().describe('인용 출처 개수 (없으면 null)'),
            confidence: z.string().nullable().describe('신뢰도 평어 (없으면 null)'),
        })
        .describe('보조 메타데이터'),
});

// ─── F8 prompt 재현 (production parity, 압축판) ───────────────────────────────
// 실제 prompt template은 `packages/backend/main/prompts/topic-issuance.yaml` 등에 있고
// agtlantis가 PromptTemplate로 렌더링한다. PoC 목적상 production 호출 유형(긴 system +
// 한국어 user prompt + 구조화된 입력 + structured output schema)을 재현해 wire/timing
// 데이터를 받아내는 게 핵심. 토픽 재현 자체가 목적은 아님.

const F8_SYSTEM_PROMPT = `당신은 대한민국 고등학생의 세부능력특기사항(세특) 탐구 주제를 발급하는 AI 컨설턴트입니다.
학생의 학교생활기록부와 인터뷰 기록을 종합해 구체적이고 실행 가능한 탐구 주제를 만들어주십시오.
필요하다면 web_search 도구로 최신 동향, 출판물, 학술 자료를 1-2회 확인할 수 있습니다.
출처가 불확실하면 books/papers 필드는 빈 배열로 두십시오.`;

const F8_USER_PROMPT = `다음 정보를 바탕으로 탐구 주제 1건을 발급해 주십시오.

[과목] 생명과학
[교과 단원] 유전자 발현과 조절, DNA 복제
[탐구 범위] 교육과정 내
[발표 형식] 보고서
[키워드] CRISPR, 후성유전, mRNA 백신

[관심 추천 주제]
제목: CRISPR-Cas9 기술을 활용한 후성유전 마커 편집 가능성
부제: 표적 단백질 결합과 메틸화 패턴 변화 관찰
연구 질문: CRISPR-Cas9 기반 후성유전 편집 도구가 in vitro에서 메틸화 패턴을 안정적으로 변화시킬 수 있는가?
설명: CRISPR-Cas9의 표적 결합 능력을 활용해 DNA 자체가 아닌 메틸화 마커를 편집하는 dCas9 기반 epi-editor 시스템의 작동 원리와 한계를 정리.
태그: 분자생물학, 유전공학, 후성유전학
난이도: medium
진로 연결: 의학 연구원 / 분자생물학자
이 주제가 너에게 맞는 이유: 1학년 때 'mRNA 백신의 작동 원리'에 대해 자율 탐구한 이력과 연결.

[학생 프로필 요약]
- 생명과학I, 생명과학II, 화학II 평어 우수
- 자율탐구 보고서: mRNA 백신 작동 원리, 단백질 접힘 시뮬레이션
- 진로희망: 분자생물학자 / 의학 연구원
- 독서기록: <이기적 유전자>, <The Code Breaker>

[인터뷰 요약]
- 학생은 mRNA 백신 코로나 시기에 관심을 가지게 됨
- CRISPR을 학교 동아리 발표 주제로 다룬 경험
- 향후 epi-editor / base-editor 같은 차세대 도구에 대한 호기심`;

// ─── Test suite ──────────────────────────────────────────────────────────────

d('F9-T9.4 PoC — webSearch + thinking + structured output combo (Sonnet 4.6)', () => {
    const summaries: ReturnType<typeof summarize>[] = [];

    beforeAll(() => {
        console.log(`[setup] model=${MODEL_SONNET}`);
        console.log(`[setup] F8 lesson: OpenAI에서 reasoning+webSearch+structured 3분+ hang 발생.`);
        console.log(`[setup] T9.4 question: Claude에서도 재발하는가? 어떤 conflict가 발생하는가?`);
        console.log(`[setup] Scenarios A-E: jsonTool mode (T9.3 default). F/G: outputFormat (Option C).`);
    });

    // ─── Scenario A: thinking only (baseline reuse from T9.2) ────────────────
    it(
        'Scenario A: thinking only (baseline, no webSearch, no structured output)',
        async () => {
            const outcome = await runScenario({
                label: 'A-thinking-only',
                withThinking: true,
                withWebSearch: false,
                withStructuredOutput: false,
                prompt:
                    'In one short paragraph, explain how mRNA vaccines work. No external sources needed.',
                maxOutputTokens: 1024,
            });
            const s = summarize(outcome);
            summaries.push(s);
            dump('Scenario A summary', s);
            dump('Scenario A wireBody.tools', (outcome.wireBody as { tools?: unknown })?.tools);
            dump(
                'Scenario A wireBody.tool_choice',
                (outcome.wireBody as { tool_choice?: unknown })?.tool_choice,
            );
            // baseline expectations
            expect(outcome.okStreamed).toBe(true);
            expect(outcome.streamSettledError).toBeUndefined();
            expect(outcome.counts['reasoning-start'] ?? 0).toBeGreaterThan(0);
            expect(outcome.counts['text-delta'] ?? 0).toBeGreaterThan(0);
            expect(outcome.counts['tool-call'] ?? 0).toBe(0);
        },
        180_000,
    );

    // ─── Scenario B: thinking + structured output (jsonTool) ──────────────────
    it(
        'Scenario B: thinking + structured output (jsonTool, no webSearch)',
        async () => {
            const outcome = await runScenario({
                label: 'B-thinking-jsonTool',
                withThinking: true,
                withWebSearch: false,
                withStructuredOutput: true,
                schema: ComboSchemaSmall,
                prompt:
                    'Briefly explain mRNA vaccines and list 2-3 key points. No external sources. citationCount=0.',
                maxOutputTokens: 1024,
            });
            const s = summarize(outcome);
            summaries.push(s);
            dump('Scenario B summary', s);
            dump('Scenario B wireBody.tools', (outcome.wireBody as { tools?: unknown })?.tools);
            dump(
                'Scenario B wireBody.tool_choice',
                (outcome.wireBody as { tool_choice?: unknown })?.tool_choice,
            );
            dump('Scenario B errorChunks', s.errorChunks);
            // wire-level: jsonTool 활성 시 SDK는 internal `toolChoice: 'required'`을 wire의
            // `tool_choice.type='any'`로 변환한다 (compiled SDK index.js:1576-1585). 그리고
            // tools 배열에 name="json" 함수 tool이 추가된다 (index.js:2942-2947, 3199).
            // 즉 wire에서 봐야 하는 값은 `'any'` + `disable_parallel_tool_use: true`.
            const toolNames = ((outcome.wireBody as { tools?: Array<{ name?: string }> })?.tools ?? [])
                .map((t) => t?.name)
                .filter(Boolean);
            expect(toolNames).toContain('json');
            expect((outcome.wireBody as { tool_choice?: { type?: string } })?.tool_choice?.type).toBe(
                'any',
            );
            // okStreamed/reasoning-start는 강제하지 않는다 — Scenario B의 실패 여부 자체가 결과 데이터.
            // F8 lesson: 조합형 위험은 "성공할 줄 알았는데 실패"가 핵심이라, 실패를 expect로 막지 않는다.
        },
        180_000,
    );

    // ─── Scenario C: thinking + webSearch (★ F8 폭발 영역) ──────────────────
    it(
        'Scenario C: thinking + webSearch (★ F8 explosion zone, no structured output)',
        async () => {
            const outcome = await runScenario({
                label: 'C-thinking-webSearch',
                withThinking: true,
                withWebSearch: true,
                withStructuredOutput: false,
                prompt:
                    'What are the most recent (2025-2026) developments in mRNA vaccine technology? ' +
                    'Use the web search tool to verify with at most 2 searches, then summarize in 3-5 sentences.',
                webSearchMaxUses: 2,
                maxOutputTokens: 1024,
            });
            const s = summarize(outcome);
            summaries.push(s);
            dump('Scenario C summary', s);
            dump('Scenario C wireBody.tools', (outcome.wireBody as { tools?: unknown })?.tools);
            dump(
                'Scenario C wireBody.tool_choice',
                (outcome.wireBody as { tool_choice?: unknown })?.tool_choice,
            );
            dump('Scenario C interleaving sequence', outcome.interleavingPattern);
            // Streaming should not blow up. webSearch may or may not actually run (model decides),
            // so we don't enforce tool-call counts. We DO want to see reasoning chunks present.
            expect(outcome.okStreamed).toBe(true);
            expect(outcome.streamSettledError).toBeUndefined();
            expect(outcome.counts['reasoning-start'] ?? 0).toBeGreaterThan(0);
            // wall clock cap: 180s. F8 OpenAI hung 3 min+ — recording the timing is the headline.
            expect(outcome.wallClockMs).toBeLessThan(170_000);
        },
        180_000,
    );

    // ─── Scenario D: thinking + webSearch + structured output (4중) ★★ ────────
    it(
        'Scenario D: thinking + webSearch + structured output (★★ F9 핵심 4중 조합)',
        async () => {
            const outcome = await runScenario({
                label: 'D-thinking-webSearch-jsonTool',
                withThinking: true,
                withWebSearch: true,
                withStructuredOutput: true,
                schema: ComboSchemaSmall,
                prompt:
                    'Find recent (2025-2026) developments in mRNA vaccines. ' +
                    'Use web_search at most 2 times. Then output a small structured record ' +
                    'with `topic`, `keyPoints` (2-3 items), and `citationCount` (number of sources you used).',
                webSearchMaxUses: 2,
                maxOutputTokens: 2048,
            });
            const s = summarize(outcome);
            summaries.push(s);
            dump('Scenario D summary', s);
            dump('Scenario D wireBody.tools', (outcome.wireBody as { tools?: unknown })?.tools);
            dump(
                'Scenario D wireBody.tool_choice',
                (outcome.wireBody as { tool_choice?: unknown })?.tool_choice,
            );
            dump('Scenario D interleaving sequence', outcome.interleavingPattern);
            dump('Scenario D parsedOutput', outcome.parsedOutput);
            dump('Scenario D errorChunks', s.errorChunks);
            // Streaming should not hang. F8 lesson: OpenAI hung here. Record outcome, don't pre-decide.
            expect(outcome.wallClockMs).toBeLessThan(170_000);

            // 핵심 검증: wire에 web_search와 json tool이 둘 다 박혔는가?
            const toolNames = ((outcome.wireBody as { tools?: Array<{ name?: string }> })?.tools ?? [])
                .map((t) => t?.name)
                .filter(Boolean);
            expect(toolNames).toContain('json');
            expect(toolNames).toContain('web_search');
            // SDK가 wire-level tool_choice를 `'any'`로 박는 것을 확인
            // (jsonTool 강제 'required' → prepareTools 변환, SDK index.js:1576-1585).
            expect((outcome.wireBody as { tool_choice?: { type?: string } })?.tool_choice?.type).toBe(
                'any',
            );
            // streaming-level 성공 자체는 회복 가능 케이스 — fail이어도 데이터로 기록.
            // okStreamed === false도 그대로 두고 finishReason / streamSettledError로 확인하면 됨.
        },
        180_000,
    );

    // ─── Scenario E: F8 production schema + production-style prompt 재현 ──────
    it(
        'Scenario E: F8 production schema (IssuanceResultSchema) + 4중 조합 — production parity',
        async () => {
            const outcome = await runScenario({
                label: 'E-production-parity',
                withThinking: true,
                withWebSearch: true,
                withStructuredOutput: true,
                schema: IssuanceResultSchema,
                system: F8_SYSTEM_PROMPT,
                prompt: F8_USER_PROMPT,
                webSearchMaxUses: 2,
                maxOutputTokens: 8192,
            });
            const s = summarize(outcome);
            summaries.push(s);
            dump('Scenario E summary', s);
            dump('Scenario E interleaving sequence', outcome.interleavingPattern);
            dump('Scenario E parsedOutput preview (error path, expected null)', {
                present: outcome.parsedOutput != null,
                baseTopicTitle: (outcome.parsedOutput as { baseTopic?: { title?: string } })?.baseTopic
                    ?.title,
                bookCount: (outcome.parsedOutput as { books?: unknown[] })?.books?.length,
                paperCount: (outcome.parsedOutput as { papers?: unknown[] })?.papers?.length,
            });
            // F8 production parity: 폭발(OpenAI 3분) 재현 여부가 헤드라인.
            // 결과는 GO/NO-GO 결정의 핵심 데이터다 — 여기서 명시 expect는 wall-clock만.
            expect(outcome.wallClockMs).toBeLessThan(170_000);

            const toolNames = ((outcome.wireBody as { tools?: Array<{ name?: string }> })?.tools ?? [])
                .map((t) => t?.name)
                .filter(Boolean);
            expect(toolNames).toContain('json');
            expect(toolNames).toContain('web_search');
        },
        180_000,
    );

    // ─── Scenario G: thinking + outputFormat (Option C, no webSearch) ★ ─────
    // Isolates the "thinking ↔ outputFormat compatibility" axis from the webSearch
    // variable. If G PASSes, outputFormat does not force `tool_choice='any'` (unlike
    // jsonTool — compiled SDK index.js:2941 useStructuredOutput=true branch skips the
    // jsonResponseTool injection), so thinking + outputFormat can coexist.
    // If G FAILs, Option C is dead and Option B (2-phase) stays the only avoidance.
    it(
        'Scenario G: thinking + structured output (outputFormat, no webSearch) — Option C single axis',
        async () => {
            const outcome = await runScenario({
                label: 'G-thinking-outputFormat',
                withThinking: true,
                withWebSearch: false,
                withStructuredOutput: true,
                structuredOutputMode: 'outputFormat',
                schema: ComboSchemaOutputFormatSafe,
                prompt:
                    'Briefly summarize what mRNA vaccines are. No external sources. ' +
                    'Output a structured record with `topic`, `summary` (1-2 sentences), `subtitle` (null), ' +
                    '`keyPoints` (2-3 items), `citationCount` 0, and `metadata` (sourceCount null, confidence "low").',
                maxOutputTokens: 1024,
            });
            const s = summarize(outcome);
            summaries.push(s);
            dump('Scenario G summary', s);
            dump(
                'Scenario G wireBody.output_config',
                (outcome.wireBody as { output_config?: unknown })?.output_config,
            );
            dump('Scenario G wireBody.tools', (outcome.wireBody as { tools?: unknown })?.tools);
            dump(
                'Scenario G wireBody.tool_choice',
                (outcome.wireBody as { tool_choice?: unknown })?.tool_choice,
            );
            dump('Scenario G errorChunks', s.errorChunks);
            dump('Scenario G parsedOutput', outcome.parsedOutput);
            // Soft expectations only — Option C viability is the data point.
            expect(outcome.wallClockMs).toBeLessThan(170_000);
            // Wire-level: outputFormat path should use `output_config.format` (native) and
            // NOT inject a `json` function tool — that's the key differentiator vs jsonTool.
            const wb = outcome.wireBody as
                | { output_config?: { format?: { type?: string } }; tools?: Array<{ name?: string }>; tool_choice?: { type?: string } }
                | undefined;
            const toolNames = (wb?.tools ?? []).map((t) => t?.name).filter(Boolean);
            // Either tools is missing entirely (no webSearch, no json tool) or it has no 'json' entry.
            expect(toolNames).not.toContain('json');
            // output_config should carry json_schema kind (outputFormat native wire shape).
            expect(wb?.output_config?.format?.type).toBe('json_schema');
        },
        180_000,
    );

    // ─── Scenario F: thinking + webSearch + outputFormat (★★ Option C 4중 회피안)
    // The headline of Option C — full 4중 combo but using outputFormat instead of jsonTool.
    // If this PASSes, the formal Anthropic provider can keep a single-call pipeline (no
    // 2-phase) by selecting outputFormat for thinking-enabled paths with bound-free schemas.
    it(
        'Scenario F: thinking + webSearch + outputFormat (★★ Option C 4중 회피안)',
        async () => {
            const outcome = await runScenario({
                label: 'F-thinking-webSearch-outputFormat',
                withThinking: true,
                withWebSearch: true,
                withStructuredOutput: true,
                structuredOutputMode: 'outputFormat',
                schema: ComboSchemaOutputFormatSafe,
                prompt:
                    'Find recent (2025-2026) developments in mRNA vaccines. Use web_search at most 2 times. ' +
                    'Then output a structured record with `topic`, `summary` (1-2 sentences), `subtitle` (or null), ' +
                    '`keyPoints` (2-3 items), `citationCount` (number you used), and `metadata` ' +
                    '(sourceCount, confidence — null if unsure).',
                webSearchMaxUses: 2,
                maxOutputTokens: 2048,
            });
            const s = summarize(outcome);
            summaries.push(s);
            dump('Scenario F summary', s);
            dump(
                'Scenario F wireBody.output_config',
                (outcome.wireBody as { output_config?: unknown })?.output_config,
            );
            dump('Scenario F wireBody.tools', (outcome.wireBody as { tools?: unknown })?.tools);
            dump(
                'Scenario F wireBody.tool_choice',
                (outcome.wireBody as { tool_choice?: unknown })?.tool_choice,
            );
            dump('Scenario F interleaving sequence', outcome.interleavingPattern);
            dump('Scenario F errorChunks', s.errorChunks);
            dump('Scenario F parsedOutput', outcome.parsedOutput);
            expect(outcome.wallClockMs).toBeLessThan(170_000);

            const wb = outcome.wireBody as
                | { output_config?: { format?: { type?: string } }; tools?: Array<{ name?: string }>; tool_choice?: { type?: string } }
                | undefined;
            const toolNames = (wb?.tools ?? []).map((t) => t?.name).filter(Boolean);
            // F's distinguishing wire signature: web_search is present, json tool is NOT
            // (outputFormat path does not inject jsonResponseTool — compiled SDK index.js:2942).
            expect(toolNames).toContain('web_search');
            expect(toolNames).not.toContain('json');
            expect(wb?.output_config?.format?.type).toBe('json_schema');
        },
        180_000,
    );

    // ─── Matrix summary ──────────────────────────────────────────────────────
    it('matrix summary (timing × success × interleaving)', () => {
        dump('T9.4 matrix', summaries);
        // exists purely so the matrix shows up at the end of test output.
        // 7 scenarios: A,B,C,D,E (jsonTool baseline) + F,G (outputFormat — Option C).
        expect(summaries.length).toBeGreaterThanOrEqual(7);
    });
});
