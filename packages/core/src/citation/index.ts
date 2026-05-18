/**
 * Provider-neutral citation types and AI SDK source-chunk normalization.
 *
 * Provider-specific citation shapes (e.g. Anthropic web_search_result with
 * encryptedContent) live alongside their provider implementation and may
 * compose with the helpers exported here.
 */

import { isRecord } from '../utils/is-record.js';

export type CitationProvider = 'anthropic' | 'google' | 'openai' | 'unknown';
export type CitationSourceType = 'url' | 'document' | 'unknown';

export interface NormalizedCitation {
    provider: CitationProvider;
    sourceType: CitationSourceType;
    sourceId?: string;
    url?: string;
    title?: string;
    pageAge?: string;
    encryptedContent?: string;
    providerMetadata?: Record<string, unknown>;
    raw: unknown;
}

export interface NormalizeCitationOptions {
    provider?: CitationProvider;
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readProviderMetadata(value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? value : undefined;
}

function inferProviderFromMetadata(metadata: Record<string, unknown> | undefined): CitationProvider {
    if (!metadata) {
        return 'unknown';
    }

    if ('anthropic' in metadata) {
        return 'anthropic';
    }
    if ('google' in metadata) {
        return 'google';
    }
    if ('openai' in metadata) {
        return 'openai';
    }

    return 'unknown';
}

/**
 * Normalize an AI SDK URL or document source chunk into NormalizedCitation.
 *
 * AI SDK exposes `{ sourceType, url?, title?, providerMetadata? }` chunks
 * during streaming text generation. This helper reshapes them into the
 * framework's provider-neutral citation envelope and infers the originating
 * provider from `providerMetadata` keys.
 */
export function normalizeAISDKSourceCitation(
    input: unknown,
    options: NormalizeCitationOptions = {}
): NormalizedCitation | null {
    if (!isRecord(input)) {
        return null;
    }

    const sourceType = readString(input.sourceType);
    if (sourceType !== 'url' && sourceType !== 'document') {
        return null;
    }

    const providerMetadata = readProviderMetadata(input.providerMetadata);
    const provider = options.provider ?? inferProviderFromMetadata(providerMetadata);

    return {
        provider,
        sourceType,
        sourceId: readString(input.id) ?? readString(input.sourceId),
        url: readString(input.url),
        title: readString(input.title),
        providerMetadata,
        raw: input,
    };
}
