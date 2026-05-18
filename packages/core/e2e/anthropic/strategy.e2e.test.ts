/// <reference types="node" />

import { Output, stepCountIs, tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
    createAnthropicProvider,
    createAnthropicWebSearchTool,
} from '../../src/provider/anthropic/index.js';
import { extractAnthropicServerToolUse } from '../../src/provider/anthropic/usage.js';
import { E2E_CONFIG } from '../helpers/env.js';

const d = E2E_CONFIG.anthropic.isAvailable ? describe : describe.skip;

interface RequestSnapshot {
    url: string;
    headers: Record<string, string>;
    body: unknown;
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function makeFetchSpy(captures: RequestSnapshot[]): typeof fetch {
    return (async (input: FetchInput, init?: FetchInit) => {
        const url =
            typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;
        const headers = new Headers(init?.headers);
        const headerObj: Record<string, string> = {};
        headers.forEach((value, key) => {
            headerObj[key] = value;
        });

        let body: unknown = '<non-json body>';
        if (typeof init?.body === 'string') {
            try {
                body = JSON.parse(init.body);
            } catch {
                body = init.body.slice(0, 400);
            }
        }

        captures.push({ url, headers: headerObj, body });
        return fetch(input, init);
    }) as typeof fetch;
}

function messageBodies(captures: RequestSnapshot[]): Array<Record<string, unknown>> {
    return captures
        .filter((capture) => capture.url.endsWith('/messages'))
        .flatMap((capture) => (typeof capture.body === 'object' && capture.body !== null ? [capture.body as Record<string, unknown>] : []));
}

function toolNames(body: Record<string, unknown>): string[] {
    const tools = body.tools;
    if (!Array.isArray(tools)) {
        return [];
    }

    return tools.flatMap((tool) => {
        if (typeof tool === 'object' && tool !== null && 'name' in tool) {
            return [String((tool as { name: unknown }).name)];
        }
        return [];
    });
}

const constrainedSchema = z.object({
    score: z.number().min(1).max(5).describe('confidence score from 1 to 5'),
    tags: z.array(z.string()).min(1).max(3).describe('one to three short tags'),
    summary: z.string(),
});

const boundFreeSchema = z.object({
    answer: z.string().describe('one sentence answer'),
    sourceTitle: z.string().describe('title of one web source used'),
    sourceURL: z.string().describe('URL of one web source used'),
});

d('F11 Anthropic provider strategy support', () => {
    it(
        'supports Option B: thinking + webSearch phase followed by no-thinking jsonTool formatting',
        async () => {
            const captures: RequestSnapshot[] = [];
            const provider = createAnthropicProvider({
                apiKey: E2E_CONFIG.anthropic.apiKey!,
                fetch: makeFetchSpy(captures),
            })
                .withDefaultModel(E2E_CONFIG.anthropic.model)
                .withReasoningBudget(1024);

            const execution = provider.simpleExecution(async (session) => {
                const phase1 = await session.generateText({
                    prompt:
                        'Use web search to find one current page about Anthropic Claude. ' +
                        'Write one short sentence and include one source URL.',
                    maxOutputTokens: 1536,
                    tools: createAnthropicWebSearchTool({ maxUses: 1 }),
                });

                const phase2 = await session.generateText({
                    prompt:
                        'Convert this note into the requested JSON object. ' +
                        'Use score 3 if no confidence is stated.\n\n' +
                        phase1.text,
                    maxOutputTokens: 512,
                    output: Output.object({ schema: constrainedSchema }),
                    providerOptions: {
                        anthropic: {
                            structuredOutputMode: 'jsonTool',
                            thinking: undefined,
                            sendReasoning: false,
                        },
                    },
                });

                return { phase1, phase2 };
            });

            const result = await execution.result();
            expect(result.status).toBe('succeeded');

            if (result.status !== 'succeeded') return;
            const phase1Usage = result.value.phase1.usage;
            const phase1ToolUse = extractAnthropicServerToolUse(phase1Usage);
            expect(phase1ToolUse.webSearchRequests).toBeGreaterThanOrEqual(1);

            const bodies = messageBodies(captures);
            expect(bodies.length).toBeGreaterThanOrEqual(2);

            const phase1Body = bodies[0];
            expect(phase1Body.thinking).toEqual({ type: 'enabled', budget_tokens: 1024 });
            expect(toolNames(phase1Body)).toContain('web_search');
            expect(toolNames(phase1Body)).not.toContain('json');

            const phase2Body = bodies[1];
            expect(phase2Body.thinking).toBeUndefined();
            expect(toolNames(phase2Body)).toContain('json');
            expect(phase2Body.output_config).toBeUndefined();
        },
        180_000
    );

    it(
        'supports Option C: outputFormat single call with thinking and webSearch for bound-free schemas',
        async () => {
            const captures: RequestSnapshot[] = [];
            const provider = createAnthropicProvider({
                apiKey: E2E_CONFIG.anthropic.apiKey!,
                fetch: makeFetchSpy(captures),
            })
                .withDefaultModel(E2E_CONFIG.anthropic.model)
                .withReasoningBudget(1024)
                .withWebSearch({ maxUses: 1 });

            const execution = provider.simpleExecution(async (session) => {
                return await session.generateText({
                    prompt:
                        'Use web search to find one current page about Anthropic Claude. ' +
                        'Return a concise answer with one source title and URL.',
                    maxOutputTokens: 1536,
                    output: Output.object({ schema: boundFreeSchema }),
                });
            });

            const result = await execution.result();
            expect(result.status).toBe('succeeded');

            if (result.status !== 'succeeded') return;
            const toolUse = extractAnthropicServerToolUse(result.value.usage);
            expect(toolUse.webSearchRequests).toBeGreaterThanOrEqual(1);
            expect(result.value.output).toMatchObject({
                answer: expect.any(String),
                sourceTitle: expect.any(String),
                sourceURL: expect.any(String),
            });

            const [body] = messageBodies(captures);
            expect(body).toBeDefined();
            expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 1024 });
            expect(toolNames(body)).toContain('web_search');
            expect(toolNames(body)).not.toContain('json');
            expect(body.output_config).toMatchObject({
                format: { type: 'json_schema' },
            });
        },
        180_000
    );

    it(
        'streams thinking + webSearch + outputFormat in a single streamText call',
        async () => {
            const captures: RequestSnapshot[] = [];
            const provider = createAnthropicProvider({
                apiKey: E2E_CONFIG.anthropic.apiKey!,
                fetch: makeFetchSpy(captures),
            })
                .withDefaultModel(E2E_CONFIG.anthropic.model)
                .withReasoningBudget(1024)
                .withWebSearch({ maxUses: 1 });

            const execution = provider.simpleExecution(async (session) => {
                const stream = session.streamText({
                    prompt:
                        'Use web search to find one current page about Anthropic Claude. ' +
                        'Return a concise answer with one source title and URL.',
                    maxOutputTokens: 1536,
                    output: Output.object({ schema: boundFreeSchema }),
                });

                let reasoningStartCount = 0;
                let reasoningDeltaCount = 0;
                let textDeltaCount = 0;
                let aggregatedText = '';

                for await (const chunk of stream.fullStream) {
                    if (chunk.type === 'reasoning-start') {
                        reasoningStartCount += 1;
                    } else if (chunk.type === 'reasoning-delta') {
                        reasoningDeltaCount += 1;
                    } else if (chunk.type === 'text-delta') {
                        textDeltaCount += 1;
                        aggregatedText += chunk.text;
                    }
                }

                const output = await stream.output;
                const usage = await stream.usage;

                return {
                    reasoningStartCount,
                    reasoningDeltaCount,
                    textDeltaCount,
                    aggregatedText,
                    output,
                    usage,
                };
            });

            const result = await execution.result();
            expect(result.status).toBe('succeeded');

            if (result.status !== 'succeeded') return;
            expect(result.value.reasoningStartCount).toBeGreaterThanOrEqual(1);
            expect(result.value.reasoningDeltaCount).toBeGreaterThanOrEqual(1);
            expect(result.value.textDeltaCount).toBeGreaterThanOrEqual(1);
            expect(result.value.aggregatedText.length).toBeGreaterThan(0);
            expect(result.value.output).toMatchObject({
                answer: expect.any(String),
                sourceTitle: expect.any(String),
                sourceURL: expect.any(String),
            });

            const toolUse = extractAnthropicServerToolUse(result.value.usage);
            expect(toolUse.webSearchRequests).toBeGreaterThanOrEqual(1);

            const [body] = messageBodies(captures);
            expect(body).toBeDefined();
            expect(body.stream).toBe(true);
            expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 1024 });
            expect(toolNames(body)).toContain('web_search');
            expect(body.output_config).toMatchObject({
                format: { type: 'json_schema' },
            });
        },
        180_000
    );

    it(
        'combines server-side webSearch with a consumer-defined custom tool in one call',
        async () => {
            const captures: RequestSnapshot[] = [];
            const provider = createAnthropicProvider({
                apiKey: E2E_CONFIG.anthropic.apiKey!,
                fetch: makeFetchSpy(captures),
            })
                .withDefaultModel(E2E_CONFIG.anthropic.model)
                .withReasoningBudget(1024)
                .withWebSearch({ maxUses: 1 });

            const customToolCalls: Array<{ called: true }> = [];
            const serverTimestampISO = new Date().toISOString();

            const getCurrentTimeTool = tool({
                description:
                    'Returns the exact current server timestamp in ISO 8601 format. ' +
                    'The model cannot know the current time from its training data — ' +
                    'this tool is the only authoritative source.',
                inputSchema: z.object({}),
                execute: async () => {
                    customToolCalls.push({ called: true });
                    return { iso: serverTimestampISO };
                },
            });

            const combinedSchema = z.object({
                newsHeadline: z.string().describe('one recent news headline about Anthropic Claude'),
                newsURL: z.string().describe('URL of that source'),
                currentISO: z
                    .string()
                    .describe(
                        'exact current server timestamp in ISO 8601 format. ' +
                            'You CANNOT know this from your training data — it MUST come from get_current_time.'
                    ),
            });

            const execution = provider.simpleExecution(async (session) => {
                return await session.generateText({
                    prompt:
                        'Both pieces of information below are required. ' +
                        '1) Use web_search to find one recent news headline about Anthropic Claude with a URL. ' +
                        '2) Use get_current_time to obtain the exact current server timestamp. ' +
                        'You cannot know the current time from your training — you MUST call get_current_time. ' +
                        'Then reply with the requested JSON.',
                    maxOutputTokens: 2048,
                    tools: { get_current_time: getCurrentTimeTool },
                    stopWhen: stepCountIs(5),
                    output: Output.object({ schema: combinedSchema }),
                });
            });

            const result = await execution.result();
            expect(result.status).toBe('succeeded');

            if (result.status !== 'succeeded') return;

            // Framework wiring — these always hold.
            const bodies = messageBodies(captures);
            expect(bodies.length).toBeGreaterThanOrEqual(1);
            const firstBody = bodies[0];
            const declaredTools = toolNames(firstBody);
            expect(declaredTools).toContain('web_search');
            expect(declaredTools).toContain('get_current_time');
            expect(firstBody.output_config).toMatchObject({
                format: { type: 'json_schema' },
            });

            expect(result.value.output).toMatchObject({
                newsHeadline: expect.any(String),
                newsURL: expect.any(String),
                currentISO: expect.any(String),
            });

            // get_current_time returns information the model cannot fabricate from training,
            // so the schema field forces invocation. The model also receives an explicit user
            // instruction "you MUST call get_current_time".
            expect(customToolCalls.length).toBeGreaterThanOrEqual(1);
            expect(result.value.output?.currentISO).toBe(serverTimestampISO);

            const serverToolUse = extractAnthropicServerToolUse(result.value.usage);
            expect(serverToolUse.webSearchRequests).toBeGreaterThanOrEqual(1);
        },
        240_000
    );
});
