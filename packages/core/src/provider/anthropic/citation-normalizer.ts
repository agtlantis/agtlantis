import { isRecord } from '../../utils/is-record.js';
import {
    normalizeAISDKSourceCitation,
    type NormalizeCitationOptions,
    type NormalizedCitation,
} from '../../citation/index.js';

interface AnthropicWebSearchResult {
    type: 'web_search_result';
    url: string;
    title?: string | null;
    pageAge?: string | null;
    encryptedContent?: string;
}

/**
 * Normalize Anthropic's `web_search_result` content block into the
 * framework's NormalizedCitation envelope, preserving `encryptedContent`
 * inside providerMetadata so downstream consumers can echo it back when
 * sending a follow-up request that references the citation.
 */
export function normalizeAnthropicWebSearchCitation(input: unknown): NormalizedCitation | null {
    if (!isRecord(input) || input.type !== 'web_search_result' || typeof input.url !== 'string') {
        return null;
    }

    const result = input as unknown as AnthropicWebSearchResult;
    return {
        provider: 'anthropic',
        sourceType: 'url',
        url: result.url,
        title: result.title ?? undefined,
        pageAge: result.pageAge ?? undefined,
        encryptedContent: result.encryptedContent,
        providerMetadata: result.encryptedContent
            ? { anthropic: { encryptedContent: result.encryptedContent } }
            : undefined,
        raw: input,
    };
}

/**
 * Try Anthropic's web search result shape first, then fall back to the
 * generic AI SDK source chunk shape. Use this when iterating over a mixed
 * stream that may contain either kind of citation chunk.
 */
export function normalizeCitation(
    input: unknown,
    options: NormalizeCitationOptions = {}
): NormalizedCitation | null {
    return normalizeAnthropicWebSearchCitation(input) ?? normalizeAISDKSourceCitation(input, options);
}

export function normalizeCitations(
    inputs: readonly unknown[],
    options: NormalizeCitationOptions = {}
): NormalizedCitation[] {
    return inputs.flatMap((input) => {
        const citation = normalizeCitation(input, options);
        return citation ? [citation] : [];
    });
}
