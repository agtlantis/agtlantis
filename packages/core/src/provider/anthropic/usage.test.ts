import { describe, expect, it } from 'vitest';

import { createTestUsage } from '../../session/test-utils.js';
import { extractAnthropicServerToolUse } from './usage.js';

describe('extractAnthropicServerToolUse', () => {
    it('maps Anthropic raw server tool usage into camelCase counters', () => {
        const usage = createTestUsage({
            raw: {
                server_tool_use: {
                    web_search_requests: 2,
                    web_fetch_requests: 1,
                },
            },
        });

        expect(extractAnthropicServerToolUse(usage)).toEqual({
            webSearchRequests: 2,
            webFetchRequests: 1,
        });
    });

    it('defaults missing raw counters to zero', () => {
        expect(extractAnthropicServerToolUse(createTestUsage())).toEqual({
            webSearchRequests: 0,
            webFetchRequests: 0,
        });
    });
});
