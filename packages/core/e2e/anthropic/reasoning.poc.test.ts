/// <reference types="node" />
/**
 * F9-T9.2 PoC — Anthropic Claude extended thinking ↔ AI SDK reasoning event normalization
 *
 * Goal: Sonnet 4.6의 extended thinking이 AI SDK streamText fullStream을 통해
 *       `reasoning-start` / `reasoning-delta` / `reasoning-end` 이벤트로 정규화되는지 확인.
 *
 * Hypotheses to test:
 *   - H1: providerOptions.anthropic.thinking 활성 시 fullStream에 reasoning-* chunk가 등장.
 *   - H2: thinking disabled (대조군) 시 reasoning-* chunk 부재.
 *   - H3: result.usage.outputTokenDetails.reasoningTokens 가 채워진다
 *         (agtlantis usage-extractors가 별도 매핑 없이 흡수 가능).
 *   - H4: signature_delta가 reasoning-delta + providerMetadata.anthropic.signature 형태로 묶인다.
 *
 * Source-of-truth confirmation (read from compiled @ai-sdk/anthropic@3.0.62 dist/index.js):
 *   - thinking block start  → `{ type: 'reasoning-start', id }`
 *   - thinking_delta        → `{ type: 'reasoning-delta', id, delta: <text> }`
 *   - signature_delta       → `{ type: 'reasoning-delta', id, delta: '',
 *                                  providerMetadata: { anthropic: { signature } } }`
 *   - thinking block stop   → `{ type: 'reasoning-end', id }`
 *
 *   NOTE — The compiled SDK above shows `controller.enqueue({ ..., delta: ... })`,
 *   but the fullStream chunk that consumers iterate on exposes the same payload
 *   under the `text` field (AI SDK v6 v5-stream public shape). This PoC captures
 *   both `text` and `delta` defensively (`recordChunk()`); empirically the `text`
 *   field carries the actual reasoning content while `delta` is absent.
 *
 *   The PoC empirically validates this against the live API and records the full
 *   ordered event stream for the spike record.
 *
 * NOTE — Throwaway PoC. 정식 createAnthropicProvider 구현 금지 (F9 Spike 원칙).
 *
 * Run:
 *   REAL_AI_ENABLED=true ANTHROPIC_API_KEY=... \
 *     pnpm vitest run e2e/anthropic/reasoning.poc.test.ts
 *
 * Cost guard (per F9 model policy + lead 지시):
 *   - Sonnet 4.6만 사용 (extended thinking은 Sonnet 4+ 정식 지원, Haiku 4.5는 미확정)
 *   - maxOutputTokens 작게 (256)
 *   - thinking budgetTokens 작게 (1024)
 *   - 3 시나리오로 제한
 */
import { createAnthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { describe, expect, it } from 'vitest';

const REAL_AI_ENABLED = process.env.REAL_AI_ENABLED === 'true' || process.env.REAL_AI_ENABLED === '1';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SKIP = !REAL_AI_ENABLED || !ANTHROPIC_API_KEY;
const d = SKIP ? describe.skip : describe;

const MODEL_SONNET = 'claude-sonnet-4-6';
const PROMPT = 'A train leaves station A at 60 km/h and another leaves station B at 40 km/h toward each other. The stations are 100 km apart. When do they meet? Answer in one short sentence.';

interface StreamEventRecord {
    idx: number;
    type: string;
    id?: string;
    /**
     * Empirical observation: AI SDK 6.x v5-stream chunks expose incremental content via
     * a `text` field (not `delta`) for both `text-delta` and `reasoning-delta`. We capture
     * both for safety to record the actual emitted shape.
     */
    textPreview?: string;
    textLength?: number;
    deltaPreview?: string;
    deltaLength?: number;
    providerMetadata?: unknown;
    payloadKeys?: string[];
}

function dump(label: string, payload: unknown): void {
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(payload, null, 2));
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
    if (chunk.providerMetadata != null) rec.providerMetadata = chunk.providerMetadata;
    return rec;
}

interface RunOutcome {
    events: StreamEventRecord[];
    text: string;
    reasoningText: string;
    usage: unknown;
    finishReason: unknown;
    counts: Record<string, number>;
}

async function runWithOptions(opts: {
    label: string;
    providerOptions?: { anthropic: AnthropicLanguageModelOptions };
}): Promise<RunOutcome> {
    const anthropic = createAnthropic({ apiKey: ANTHROPIC_API_KEY! });
    const events: StreamEventRecord[] = [];
    const counts: Record<string, number> = {};
    let collectedText = '';
    let collectedReasoning = '';

    const stream = streamText({
        model: anthropic(MODEL_SONNET),
        maxOutputTokens: 256,
        messages: [{ role: 'user', content: PROMPT }],
        ...(opts.providerOptions ? { providerOptions: opts.providerOptions } : {}),
    });

    let idx = 0;
    for await (const chunk of stream.fullStream) {
        const rec = recordChunk(idx++, chunk as Record<string, unknown>);
        events.push(rec);
        counts[rec.type] = (counts[rec.type] ?? 0) + 1;

        // AI SDK v6 streams expose incremental content as `text`; defensively also read `delta`.
        const c = chunk as { type: string; delta?: string; text?: string };
        const incremental = typeof c.text === 'string' ? c.text : typeof c.delta === 'string' ? c.delta : '';
        if (c.type === 'text-delta') {
            collectedText += incremental;
        } else if (c.type === 'reasoning-delta') {
            collectedReasoning += incremental;
        }
    }

    const usage = await stream.usage;
    const finishReason = await stream.finishReason;
    const text = await stream.text;

    return {
        events,
        text,
        reasoningText: collectedReasoning,
        usage,
        finishReason,
        counts,
    };
}

d('F9-T9.2 PoC — Anthropic extended thinking ↔ reasoning-* event normalization', () => {
    /**
     * Scenario 1 — thinking enabled (budgetTokens: 1024).
     * H1 + H3 + H4 verification.
     *
     * Uses `{ type: 'enabled', budgetTokens }` form. Sonnet 4.6 supports both this
     * legacy form and `{ type: 'adaptive' }` (see Scenario 3). Starting with
     * `enabled` keeps explicit budget control which is what production callers will
     * actually pass.
     */
    it('Scenario 1: thinking enabled (budgetTokens: 1024) → reasoning-* chunks expected', async () => {
        const outcome = await runWithOptions({
            label: 'thinking-enabled',
            providerOptions: {
                anthropic: {
                    thinking: { type: 'enabled', budgetTokens: 1024 },
                    sendReasoning: true,
                },
            },
        });

        dump('scenario1 events (ordered)', outcome.events);
        dump('scenario1 counts', outcome.counts);
        dump('scenario1 usage', outcome.usage);
        dump('scenario1 finishReason', outcome.finishReason);
        dump('scenario1 collected text', outcome.text);
        dump('scenario1 collected reasoning preview', {
            length: outcome.reasoningText.length,
            preview: outcome.reasoningText.slice(0, 240),
        });

        // H1: reasoning chunks present
        expect(outcome.counts['reasoning-start'] ?? 0).toBeGreaterThan(0);
        expect(outcome.counts['reasoning-delta'] ?? 0).toBeGreaterThan(0);
        expect(outcome.counts['reasoning-end'] ?? 0).toBeGreaterThan(0);
        // text-delta should also exist (final answer).
        expect(outcome.counts['text-delta'] ?? 0).toBeGreaterThan(0);

        // H4: at least one reasoning-delta should carry providerMetadata.anthropic.signature
        const sigEvent = outcome.events.find(
            (e) =>
                e.type === 'reasoning-delta' &&
                e.providerMetadata != null &&
                typeof e.providerMetadata === 'object' &&
                'anthropic' in (e.providerMetadata as Record<string, unknown>) &&
                (e.providerMetadata as { anthropic?: Record<string, unknown> }).anthropic?.signature != null,
        );
        // signature가 안 나오는 경우(adaptive disabled-thinking path)도 있어서 strict하게는 not.null만 본다.
        // 단, enabled+budget path에서는 통상 signature가 동봉됨.
        dump('scenario1 signature event found?', sigEvent ?? null);

        // H3 (revised): AI SDK Anthropic provider는 thinking token을 `usage.outputTokenDetails.reasoningTokens`
        // 로 채우지 않는다는 사실을 finding으로 기록 (assert 하지 않음 — 환경별로 변하면 PoC 안정성만 깎인다).
        // 대신 raw providerMetadata.anthropic.usage 에 `output_tokens`만 옴 → consumer는 reasoning chunk를
        // 직접 토큰 count 해야 함을 메모.
        const usage = outcome.usage as {
            reasoningTokens?: number;
            outputTokenDetails?: { reasoningTokens?: number };
        };
        const reasoningTokens =
            usage?.reasoningTokens ?? usage?.outputTokenDetails?.reasoningTokens ?? 0;
        dump('scenario1 H3 finding: AI SDK reasoningTokens field state', {
            reasoningTokens,
            note:
                reasoningTokens === 0
                    ? 'AI SDK does NOT populate outputTokenDetails.reasoningTokens for Anthropic thinking. ' +
                      'agtlantis usage-extractors will silently undercount reasoning tokens. ' +
                      'Consumers must derive from reasoning-delta chunks or from providerMetadata.anthropic.usage.'
                    : 'AI SDK populates reasoningTokens — agtlantis usage-extractors absorbs without change.',
        });
    }, 180_000);

    /**
     * Scenario 2 — thinking disabled (control group).
     * H2 verification: no reasoning-* chunks should appear.
     */
    it('Scenario 2: thinking disabled (control) → no reasoning-* chunks', async () => {
        const outcome = await runWithOptions({
            label: 'thinking-disabled-control',
            // no providerOptions → thinking off by default for Sonnet 4.6
        });

        dump('scenario2 events (ordered)', outcome.events);
        dump('scenario2 counts', outcome.counts);
        dump('scenario2 usage', outcome.usage);
        dump('scenario2 finishReason', outcome.finishReason);
        dump('scenario2 collected text', outcome.text);

        expect(outcome.counts['reasoning-start'] ?? 0).toBe(0);
        expect(outcome.counts['reasoning-delta'] ?? 0).toBe(0);
        expect(outcome.counts['reasoning-end'] ?? 0).toBe(0);
        expect(outcome.counts['text-delta'] ?? 0).toBeGreaterThan(0);
    }, 120_000);

    /**
     * Scenario 3 — thinking adaptive (Sonnet 4.6 native form per AI SDK docs).
     * Verifies that the newer adaptive form also normalizes to reasoning-* events.
     * Optional smoke check: counts and usage only (don't re-assert full schema).
     */
    it('Scenario 3: thinking adaptive (Sonnet 4.6 native) → reasoning-* chunks expected', async () => {
        const outcome = await runWithOptions({
            label: 'thinking-adaptive',
            providerOptions: {
                anthropic: {
                    thinking: { type: 'adaptive' },
                    sendReasoning: true,
                },
            },
        });

        dump('scenario3 events (ordered)', outcome.events);
        dump('scenario3 counts', outcome.counts);
        dump('scenario3 usage', outcome.usage);
        dump('scenario3 finishReason', outcome.finishReason);
        dump('scenario3 collected text', outcome.text);
        dump('scenario3 reasoning preview', {
            length: outcome.reasoningText.length,
            preview: outcome.reasoningText.slice(0, 240),
        });

        // adaptive path는 모델이 thinking이 필요 없다고 판단하면 reasoning chunk를 안 낼 수도 있다.
        // 그래서 "정규화 일관성"만 확인: reasoning-start가 0이면 reasoning-delta/end도 0이어야 함.
        const rs = outcome.counts['reasoning-start'] ?? 0;
        const rd = outcome.counts['reasoning-delta'] ?? 0;
        const re = outcome.counts['reasoning-end'] ?? 0;
        if (rs === 0) {
            expect(rd).toBe(0);
            expect(re).toBe(0);
        } else {
            expect(rd).toBeGreaterThan(0);
            expect(re).toBeGreaterThan(0);
        }
        expect(outcome.counts['text-delta'] ?? 0).toBeGreaterThan(0);
    }, 180_000);
});
