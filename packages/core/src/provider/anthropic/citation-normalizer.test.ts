import { describe, expect, it } from 'vitest';

import {
    normalizeAnthropicWebSearchCitation,
    normalizeCitation,
    normalizeCitations,
} from './citation-normalizer.js';

describe('Anthropic citation normalizer', () => {
    it('normalizes Anthropic web search results and preserves encrypted content', () => {
        const citation = normalizeAnthropicWebSearchCitation({
            type: 'web_search_result',
            url: 'https://example.com/report',
            title: 'Example Report',
            pageAge: '2026-05-01',
            encryptedContent: 'encrypted-blob',
        });

        expect(citation).toEqual({
            provider: 'anthropic',
            sourceType: 'url',
            url: 'https://example.com/report',
            title: 'Example Report',
            pageAge: '2026-05-01',
            encryptedContent: 'encrypted-blob',
            providerMetadata: { anthropic: { encryptedContent: 'encrypted-blob' } },
            raw: expect.any(Object),
        });
    });

    it('combines Anthropic webSearch and AI SDK source chunks in mixed arrays', () => {
        const citations = normalizeCitations([
            { nope: true },
            {
                type: 'web_search_result',
                url: 'https://example.com/a',
                title: null,
                pageAge: null,
                encryptedContent: 'a',
            },
            {
                sourceType: 'document',
                sourceId: 'doc-1',
                title: 'Reference Document',
            },
        ]);

        expect(citations).toHaveLength(2);
        expect(citations[0]).toMatchObject({ provider: 'anthropic', sourceType: 'url' });
        expect(citations[1]).toMatchObject({ provider: 'unknown', sourceType: 'document' });
    });

    it('uses the Anthropic-aware normalizeCitation entrypoint', () => {
        expect(
            normalizeCitation({
                type: 'web_search_result',
                url: 'https://example.com',
            })
        ).toMatchObject({ provider: 'anthropic' });
    });
});
