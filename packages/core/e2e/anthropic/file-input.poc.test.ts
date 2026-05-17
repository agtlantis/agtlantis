/// <reference types="node" />
/**
 * F9-T9.1 PoC — Anthropic Claude file input
 *
 * Goal: BaseFileManager 추상이 Anthropic Claude 입력 방식을 흡수 가능한지 검증.
 *
 * Hypotheses to test:
 *   - H1: AI SDK FilePart/ImagePart (base64 inline)로 Claude 호출이 정상 동작한다.
 *   - H2: Files API beta(file_id)는 AI SDK가 직접 지원하지 않는다 (입력 file_id 미지원).
 *   - H3: 따라서 Files API beta를 쓰려면 createAnthropic({ fetch }) 미들웨어로 raw body를
 *         후처리하거나, 별도 fetch로 우회해야 한다.
 *
 * NOTE — Throwaway PoC. 정식 구현 X. 실패 모드까지 dump하는 게 목적.
 *
 * Run:
 *   REAL_AI_ENABLED=true pnpm vitest run e2e/anthropic/file-input.poc.test.ts
 *
 * Models (per F9 정책 — Opus 금지):
 *   - Haiku 4.5 (`claude-haiku-4-5-20251001`) — default
 *   - Sonnet 4.6 (`claude-sonnet-4-6`) — 정량 측정용 (이 PoC에선 사용 안 함)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { describe, expect, it, beforeAll } from 'vitest';

const REAL_AI_ENABLED = process.env.REAL_AI_ENABLED === 'true' || process.env.REAL_AI_ENABLED === '1';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SKIP = !REAL_AI_ENABLED || !ANTHROPIC_API_KEY;
const d = SKIP ? describe.skip : describe;

const MODEL_HAIKU = 'claude-haiku-4-5-20251001';
const FILES_BETA = 'files-api-2025-04-14';
const FIXTURE_DIR = path.resolve(import.meta.dirname, 'fixtures');
const FIXTURES = {
    image1: path.join(FIXTURE_DIR, 'test-image1.png'),
    image2: path.join(FIXTURE_DIR, 'test-image2.png'),
    pdf3: path.join(FIXTURE_DIR, 'test-pdf3.pdf'),
} as const;

interface RequestSnapshot {
    url: string;
    headers: Record<string, string>;
    bodyPreview: unknown;
    bodyByteSize: number;
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function makeFetchSpy(captures: RequestSnapshot[]): typeof fetch {
    return (async (input: FetchInput, init?: FetchInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const rawHeaders = init?.headers ?? {};
        const headerObj: Record<string, string> = {};
        if (rawHeaders instanceof Headers) {
            rawHeaders.forEach((v, k) => (headerObj[k] = v));
        } else if (Array.isArray(rawHeaders)) {
            for (const [k, v] of rawHeaders) headerObj[k] = String(v);
        } else {
            Object.assign(headerObj, rawHeaders as Record<string, string>);
        }

        let bodyPreview: unknown = '<non-string body>';
        let bodyByteSize = 0;
        const body = init?.body;
        if (typeof body === 'string') {
            bodyByteSize = Buffer.byteLength(body, 'utf-8');
            try {
                const parsed = JSON.parse(body) as Record<string, unknown>;
                bodyPreview = redactContent(parsed);
            } catch {
                bodyPreview = body.slice(0, 200);
            }
        } else if (body instanceof Uint8Array) {
            bodyByteSize = body.byteLength;
            bodyPreview = `<binary ${body.byteLength} bytes>`;
        }

        captures.push({ url, headers: headerObj, bodyPreview, bodyByteSize });
        return fetch(input, init);
    }) as typeof fetch;
}

function redactContent(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(redactContent);
    if (obj && typeof obj === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            if (k === 'data' && typeof v === 'string' && v.length > 80) {
                out[k] = `<base64 ${v.length} chars>`;
            } else {
                out[k] = redactContent(v);
            }
        }
        return out;
    }
    return obj;
}

function dump(label: string, payload: unknown): void {
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(payload, null, 2));
}

d('F9-T9.1 PoC — Anthropic file input mechanisms', () => {
    beforeAll(() => {
        for (const [k, p] of Object.entries(FIXTURES)) {
            try {
                const stat = readFileSync(p);
                console.log(`[fixture] ${k}: ${stat.byteLength} bytes`);
            } catch {
                throw new Error(`Missing fixture: ${k} at ${p}`);
            }
        }
    });

    /**
     * Case 6 (out-of-order on purpose) — inline base64 baseline.
     * H1 verification: AI SDK ImagePart (base64) works against Claude.
     */
    it('Case 6: inline base64 small image (138KB) → Haiku', async () => {
        const captures: RequestSnapshot[] = [];
        const anthropic = createAnthropic({
            apiKey: ANTHROPIC_API_KEY!,
            fetch: makeFetchSpy(captures),
        });
        const image = readFileSync(FIXTURES.image2);

        const result = await generateText({
            model: anthropic(MODEL_HAIKU),
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'What color is this image? One word.' },
                        { type: 'file', data: image, mediaType: 'image/png' },
                    ],
                },
            ],
        });

        dump('case6 captured request', captures[0]);
        dump('case6 response', { text: result.text, usage: result.usage });
        expect(result.text.length).toBeGreaterThan(0);
    }, 90_000);

    /**
     * Case 1 — Files API beta upload (raw REST) + reference via providerOptions.
     * Verifies: (a) Files API upload works. (b) Whether AI SDK can carry file_id reference.
     *
     * Strategy: upload via raw fetch, then attempt to send the file via AI SDK using a "file"
     * content part. We don't expect AI SDK to accept file_id directly — this case captures
     * the failure mode and confirms hypothesis H2.
     */
    it('Case 1: Files API upload + AI SDK reference attempt (image)', async () => {
        const fileId = await uploadToFilesAPI(FIXTURES.image1, 'image/png');
        console.log(`[case1] uploaded file_id = ${fileId}`);

        const captures: RequestSnapshot[] = [];
        const anthropic = createAnthropic({
            apiKey: ANTHROPIC_API_KEY!,
            headers: { 'anthropic-beta': FILES_BETA },
            fetch: makeFetchSpy(captures),
        });

        let aiSdkError: string | null = null;
        let aiSdkText: string | null = null;
        try {
            const result = await generateText({
                model: anthropic(MODEL_HAIKU),
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Describe this image. One sentence.' },
                            // Attempt to pass file_id as data. AI SDK FilePart.data accepts string/Buffer.
                            // String is interpreted as base64 by AI SDK → expected to fail.
                            { type: 'file', data: fileId, mediaType: 'image/png' },
                        ],
                    },
                ],
            });
            aiSdkText = result.text;
        } catch (e) {
            aiSdkError = e instanceof Error ? e.message : String(e);
        }
        dump('case1 AI SDK attempt — captured request', captures[0]);
        dump('case1 AI SDK attempt — outcome', { aiSdkText, aiSdkError });

        // H2 박기: AI SDK가 file_id 입력을 1급 지원하지 않음을 assertion으로 확정.
        // 미래에 AI SDK가 file_id를 1급 지원하게 되면 이 두 assertion이 깨지며 middleware
        // 우회 레이어 폐기 신호가 된다 (T9.1-decision.md §3.7 Open issue 참조).
        expect(aiSdkText).toBeNull();
        expect(aiSdkError).toMatch(/invalid base64/i);

        // Raw REST fallback — proves Files API mechanism works end-to-end.
        const rawResp = await messagesRaw({
            model: MODEL_HAIKU,
            beta: [FILES_BETA],
            content: [
                { type: 'text', text: 'Describe this image. One sentence.' },
                { type: 'image', source: { type: 'file', file_id: fileId } },
            ],
        });
        dump('case1 raw REST response', rawResp);
        expect(rawResp.content?.[0]?.text || rawResp.content?.[0]).toBeTruthy();

        await deleteFromFilesAPI(fileId);
    }, 120_000);

    /**
     * Case 2 — Multiple file_ids in one message (4-5 iPhone photos use case).
     * Use 2 fixtures to verify the mechanism (not the upper bound).
     */
    it('Case 2: multiple file_ids in single message (raw REST)', async () => {
        const [id1, id2] = await Promise.all([
            uploadToFilesAPI(FIXTURES.image1, 'image/png'),
            uploadToFilesAPI(FIXTURES.image2, 'image/png'),
        ]);
        console.log(`[case2] uploaded ids = ${id1}, ${id2}`);

        const resp = await messagesRaw({
            model: MODEL_HAIKU,
            beta: [FILES_BETA],
            content: [
                { type: 'text', text: 'Briefly: how do these two images differ?' },
                { type: 'image', source: { type: 'file', file_id: id1 } },
                { type: 'image', source: { type: 'file', file_id: id2 } },
            ],
        });
        dump('case2 response', resp);
        expect(resp.content?.[0]).toBeTruthy();

        await Promise.all([deleteFromFilesAPI(id1), deleteFromFilesAPI(id2)]);
    }, 120_000);

    /**
     * Case 3 — PDF Files API upload + reference (생기부 main scenario).
     */
    it('Case 3: PDF Files API upload + reference (raw REST)', async () => {
        const fileId = await uploadToFilesAPI(FIXTURES.pdf3, 'application/pdf');
        console.log(`[case3] uploaded pdf file_id = ${fileId}`);

        const resp = await messagesRaw({
            model: MODEL_HAIKU,
            beta: [FILES_BETA],
            content: [
                { type: 'text', text: 'What is this PDF about? One sentence.' },
                { type: 'document', source: { type: 'file', file_id: fileId } },
            ],
        });
        dump('case3 response', resp);
        expect(resp.content?.[0]).toBeTruthy();

        await deleteFromFilesAPI(fileId);
    }, 120_000);

    /**
     * Case 4 — PDF + image mixed in one message.
     */
    it('Case 4: PDF + image mixed in one message (raw REST)', async () => {
        const [pdfId, imgId] = await Promise.all([
            uploadToFilesAPI(FIXTURES.pdf3, 'application/pdf'),
            uploadToFilesAPI(FIXTURES.image2, 'image/png'),
        ]);
        console.log(`[case4] uploaded ids = pdf:${pdfId}, img:${imgId}`);

        const resp = await messagesRaw({
            model: MODEL_HAIKU,
            beta: [FILES_BETA],
            content: [
                { type: 'text', text: 'Briefly describe both: PDF and image.' },
                { type: 'document', source: { type: 'file', file_id: pdfId } },
                { type: 'image', source: { type: 'file', file_id: imgId } },
            ],
        });
        dump('case4 response', resp);
        expect(resp.content?.[0]).toBeTruthy();

        await Promise.all([deleteFromFilesAPI(pdfId), deleteFromFilesAPI(imgId)]);
    }, 120_000);

    /**
     * Case 5 — file_id reuse across 2 calls + prompt caching.
     * Verifies cache_read on 2nd call (cache_creation_input_tokens vs cache_read_input_tokens).
     */
    it('Case 5: file_id reuse + prompt caching (raw REST, 2 calls)', async () => {
        const fileId = await uploadToFilesAPI(FIXTURES.pdf3, 'application/pdf');
        console.log(`[case5] uploaded file_id = ${fileId}`);

        const firstCall = await messagesRaw({
            model: MODEL_HAIKU,
            beta: [FILES_BETA],
            content: [
                {
                    type: 'document',
                    source: { type: 'file', file_id: fileId },
                    cache_control: { type: 'ephemeral' },
                },
                { type: 'text', text: 'List 1 fact from the PDF in one sentence.' },
            ],
        });
        dump('case5 first call usage', firstCall.usage);

        const secondCall = await messagesRaw({
            model: MODEL_HAIKU,
            beta: [FILES_BETA],
            content: [
                {
                    type: 'document',
                    source: { type: 'file', file_id: fileId },
                    cache_control: { type: 'ephemeral' },
                },
                { type: 'text', text: 'List a different fact from the PDF in one sentence.' },
            ],
        });
        dump('case5 second call usage', secondCall.usage);
        dump('case5 cache analysis', {
            first_creation: secondCall.usage?.cache_creation_input_tokens ?? null,
            second_read: secondCall.usage?.cache_read_input_tokens ?? null,
            cache_hit: (secondCall.usage?.cache_read_input_tokens ?? 0) > 0,
        });

        await deleteFromFilesAPI(fileId);
    }, 180_000);
});

// ---- Files API beta raw REST helpers ----

interface FilesAPIUploadResponse {
    id: string;
    type: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
}

async function uploadToFilesAPI(filePath: string, mediaType: string): Promise<string> {
    const data = readFileSync(filePath);
    const filename = path.basename(filePath);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], { type: mediaType }), filename);

    const resp = await fetch('https://api.anthropic.com/v1/files', {
        method: 'POST',
        headers: {
            'x-api-key': ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': FILES_BETA,
        },
        body: form,
    });
    if (!resp.ok) {
        throw new Error(`Files API upload failed: ${resp.status} ${await resp.text()}`);
    }
    const body = (await resp.json()) as FilesAPIUploadResponse;
    return body.id;
}

async function deleteFromFilesAPI(fileId: string): Promise<void> {
    const resp = await fetch(`https://api.anthropic.com/v1/files/${fileId}`, {
        method: 'DELETE',
        headers: {
            'x-api-key': ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': FILES_BETA,
        },
    });
    if (!resp.ok && resp.status !== 404) {
        console.warn(`[cleanup] delete file ${fileId} failed: ${resp.status}`);
    }
}

interface MessagesRawParams {
    model: string;
    beta: string[];
    content: unknown[];
    system?: string;
}

interface AnthropicUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}

interface AnthropicMessagesResponse {
    content?: Array<{ type: string; text?: string }>;
    usage?: AnthropicUsage;
    stop_reason?: string;
    error?: unknown;
}

async function messagesRaw(params: MessagesRawParams): Promise<AnthropicMessagesResponse> {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': params.beta.join(','),
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: params.model,
            max_tokens: 256,
            ...(params.system ? { system: params.system } : {}),
            messages: [{ role: 'user', content: params.content }],
        }),
    });
    const body = (await resp.json()) as AnthropicMessagesResponse;
    if (!resp.ok) {
        throw new Error(`Messages API failed: ${resp.status} ${JSON.stringify(body)}`);
    }
    return body;
}
