import type { LanguageModelUsage } from 'ai';

import { isRecord } from '../../utils/is-record.js';

export interface AnthropicServerToolUse {
    webSearchRequests: number;
    webFetchRequests: number;
}

function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readRawUsageNumber(usage: LanguageModelUsage, keys: string[]): number | undefined {
    const raw = usage.raw;
    if (!isRecord(raw)) {
        return undefined;
    }

    let current: unknown = raw;
    for (const key of keys) {
        if (!isRecord(current)) {
            return undefined;
        }
        current = current[key];
    }

    return readNumber(current);
}

/**
 * Extract Anthropic's server-tool invocation counters from a raw usage payload.
 * Anthropic exposes counts for `web_search_requests` and `web_fetch_requests`
 * under `usage.server_tool_use`; this helper surfaces them as camelCase
 * numbers and defaults missing fields to zero.
 */
export function extractAnthropicServerToolUse(usage: LanguageModelUsage): AnthropicServerToolUse {
    return {
        webSearchRequests: readRawUsageNumber(usage, ['server_tool_use', 'web_search_requests']) ?? 0,
        webFetchRequests: readRawUsageNumber(usage, ['server_tool_use', 'web_fetch_requests']) ?? 0,
    };
}
