import { describe, expect, it } from 'vitest';

import { normalizeAISDKSourceCitation } from './index.js';

describe('normalizeAISDKSourceCitation', () => {
    it('normalizes AI SDK URL source chunks from Google grounding', () => {
        const citation = normalizeAISDKSourceCitation({
            sourceType: 'url',
            id: 'source-1',
            url: 'https://example.com/google',
            title: 'Grounded Source',
            providerMetadata: { google: { groundingChunk: 1 } },
        });

        expect(citation).toMatchObject({
            provider: 'google',
            sourceType: 'url',
            sourceId: 'source-1',
            url: 'https://example.com/google',
            title: 'Grounded Source',
        });
    });

    it('normalizes AI SDK source-url chunks with explicit provider override', () => {
        const citation = normalizeAISDKSourceCitation(
            {
                sourceType: 'url',
                sourceId: 'openai-source',
                url: 'https://example.com/openai',
                title: 'OpenAI Source',
            },
            { provider: 'openai' }
        );

        expect(citation).toMatchObject({
            provider: 'openai',
            sourceType: 'url',
            sourceId: 'openai-source',
        });
    });

    it('returns null for non-record input', () => {
        expect(normalizeAISDKSourceCitation(null)).toBeNull();
        expect(normalizeAISDKSourceCitation('string')).toBeNull();
        expect(normalizeAISDKSourceCitation([])).toBeNull();
    });

    it('returns null when sourceType is not url or document', () => {
        expect(
            normalizeAISDKSourceCitation({ sourceType: 'image', url: 'https://example.com' })
        ).toBeNull();
    });
});
