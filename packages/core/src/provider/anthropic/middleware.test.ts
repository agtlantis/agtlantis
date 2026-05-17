import { describe, expect, it, vi } from 'vitest';

import {
    ANTHROPIC_FILE_ID_MARKER_PREFIX,
    createAnthropicFileIdMarker,
    parseAnthropicFileIdMarker,
    rewriteFileIdMiddleware,
} from './middleware.js';

function createMockFetch() {
    return vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
}

describe('Anthropic file_id middleware', () => {
    describe('marker helpers', () => {
        it('creates and parses file_id markers', () => {
            const marker = createAnthropicFileIdMarker('file_abc123');

            expect(marker).toBe(`${ANTHROPIC_FILE_ID_MARKER_PREFIX}file_abc123`);
            expect(parseAnthropicFileIdMarker(marker)).toBe('file_abc123');
            expect(parseAnthropicFileIdMarker('not-a-marker')).toBeNull();
            expect(parseAnthropicFileIdMarker(123)).toBeNull();
        });
    });

    describe('rewriteFileIdMiddleware', () => {
        it('rewrites image marker source blocks to raw file_id sources', async () => {
            const fetchImpl = createMockFetch();
            const wrappedFetch = rewriteFileIdMiddleware({ fetch: fetchImpl as unknown as typeof fetch });
            const body = {
                messages: [{
                    role: 'user',
                    content: [{
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: 'image/png',
                            data: createAnthropicFileIdMarker('file_img'),
                        },
                    }],
                }],
            };

            await wrappedFetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });

            const [, init] = fetchImpl.mock.calls[0];
            const rewrittenBody = JSON.parse(init.body as string);

            expect(rewrittenBody.messages[0].content[0].source).toEqual({
                type: 'file',
                file_id: 'file_img',
            });
            expect(new Headers(init.headers).get('anthropic-beta')).toBe('files-api-2025-04-14');
        });

        it('rewrites document marker source blocks and preserves sibling fields', async () => {
            const fetchImpl = createMockFetch();
            const wrappedFetch = rewriteFileIdMiddleware({ fetch: fetchImpl as unknown as typeof fetch });

            await wrappedFetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'anthropic-beta': 'pdfs-2024-09-25' },
                body: JSON.stringify({
                    messages: [{
                        role: 'user',
                        content: [{
                            type: 'document',
                            title: 'Report',
                            source: {
                                type: 'base64',
                                media_type: 'application/pdf',
                                data: createAnthropicFileIdMarker('file_pdf'),
                            },
                            cache_control: { type: 'ephemeral' },
                        }],
                    }],
                }),
            });

            const [, init] = fetchImpl.mock.calls[0];
            const rewrittenBody = JSON.parse(init.body as string);
            const block = rewrittenBody.messages[0].content[0];

            expect(block).toMatchObject({
                type: 'document',
                title: 'Report',
                cache_control: { type: 'ephemeral' },
                source: {
                    type: 'file',
                    file_id: 'file_pdf',
                },
            });
            expect(new Headers(init.headers).get('anthropic-beta')).toBe('pdfs-2024-09-25,files-api-2025-04-14');
        });

        it('does not rewrite non-message requests', async () => {
            const fetchImpl = createMockFetch();
            const wrappedFetch = rewriteFileIdMiddleware({ fetch: fetchImpl as unknown as typeof fetch });
            const body = JSON.stringify({
                source: {
                    type: 'base64',
                    data: createAnthropicFileIdMarker('file_abc'),
                },
            });

            await wrappedFetch('https://api.anthropic.com/v1/files', {
                method: 'POST',
                body,
            });

            expect(fetchImpl.mock.calls[0][1].body).toBe(body);
        });

        it('passes through invalid JSON bodies', async () => {
            const fetchImpl = createMockFetch();
            const wrappedFetch = rewriteFileIdMiddleware({ fetch: fetchImpl as unknown as typeof fetch });

            await wrappedFetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                body: '{nope',
            });

            expect(fetchImpl.mock.calls[0][1].body).toBe('{nope');
        });
    });
});
