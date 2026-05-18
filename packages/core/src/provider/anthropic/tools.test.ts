import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    createAnthropicWebSearchTool,
    createAnthropicProviderTool,
} from './tools.js';

import type { ToolSet } from 'ai';

type ProviderToolShape = {
    type: string;
    id: string;
    args: Record<string, unknown>;
};

describe('createAnthropicWebSearchTool', () => {
    it('returns a ToolSet keyed by `web_search` by default', () => {
        const tools = createAnthropicWebSearchTool();
        expect(Object.keys(tools)).toEqual(['web_search']);
        expect(tools.web_search).toBeDefined();
        expectTypeOf(tools).toEqualTypeOf<ToolSet>();
    });

    it('honours toolName override', () => {
        const tools = createAnthropicWebSearchTool({ maxUses: 1 }, { toolName: 'search' });
        expect(Object.keys(tools)).toEqual(['search']);
    });

    it('propagates options to the underlying provider tool factory', () => {
        const tools = createAnthropicWebSearchTool({
            maxUses: 3,
            allowedDomains: ['example.com'],
            blockedDomains: ['blocked.example'],
            userLocation: { type: 'approximate', country: 'KR' },
        });
        const tool = tools.web_search as unknown as ProviderToolShape;

        expect(tool.type).toBe('provider');
        expect(tool.id).toBe('anthropic.web_search_20250305');
        expect(tool.args).toEqual({
            maxUses: 3,
            allowedDomains: ['example.com'],
            blockedDomains: ['blocked.example'],
            userLocation: { type: 'approximate', country: 'KR' },
        });
    });
});

describe('createAnthropicProviderTool', () => {
    it('builds web search tool for kind="webSearch"', () => {
        const tools = createAnthropicProviderTool('webSearch', { maxUses: 2 });
        expect(Object.keys(tools)).toEqual(['web_search']);
    });

    it('throws on unsupported kind (exhaustive guard)', () => {
        expect(() =>
            createAnthropicProviderTool('badKind' as unknown as 'webSearch'),
        ).toThrow(/Unsupported Anthropic provider tool/);
    });
});
