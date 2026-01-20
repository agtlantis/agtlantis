import { describe, it, expect } from 'vitest';
import {
    describeEachProvider,
    createTestProvider,
    createInvalidTestProvider,
    E2E_CONFIG,
} from '@e2e/helpers';
import { createLogger } from '@/observability/logger';
import type {
    LLMCallEndEvent,
    ExecutionStartEvent,
    ExecutionDoneEvent,
    ExecutionErrorEvent,
} from '@/observability';

describeEachProvider('Observable Agent', (providerType) => {
    describe('LLM Event Sequence', () => {
        it(
            'should emit LLM events in correct order: llm-start → llm-end',
            async ({ task }) => {
                const eventOrder: string[] = [];
                const logger = createLogger({
                    onLLMCallStart: () => eventOrder.push('llm-start'),
                    onLLMCallEnd: () => eventOrder.push('llm-end'),
                });

                const provider = createTestProvider(providerType, {
                    logging: false,
                    task,
                }).withLogger(logger);

                const execution = provider.simpleExecution(async (session) => {
                    return session.generateText({ prompt: 'Say hi' });
                });

                await execution.toResult();

                expect(eventOrder).toEqual(['llm-start', 'llm-end']);
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Multiple LLM Calls', () => {
        it(
            'should emit event pairs for each LLM call',
            async ({ task }) => {
                const eventOrder: string[] = [];
                const logger = createLogger({
                    onLLMCallStart: () => eventOrder.push('llm-start'),
                    onLLMCallEnd: () => eventOrder.push('llm-end'),
                });

                const provider = createTestProvider(providerType, {
                    logging: false,
                    task,
                }).withLogger(logger);

                const execution = provider.simpleExecution(async (session) => {
                    const first = await session.generateText({ prompt: 'Say 1' });
                    const second = await session.generateText({ prompt: 'Say 2' });
                    return { first: first.text, second: second.text };
                });

                await execution.toResult();

                expect(eventOrder).toEqual(['llm-start', 'llm-end', 'llm-start', 'llm-end']);
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Execution Events (Streaming)', () => {
        it(
            'should call onExecutionStart and onExecutionDone with correct data',
            async ({ task }) => {
                let startEvent: ExecutionStartEvent | null = null;
                let doneEvent: ExecutionDoneEvent | null = null;

                const logger = createLogger({
                    onExecutionStart: (event) => {
                        startEvent = event;
                    },
                    onExecutionDone: (event) => {
                        doneEvent = event;
                    },
                });

                const provider = createTestProvider(providerType, {
                    logging: false,
                    task,
                }).withLogger(logger);

                const execution = provider.streamingExecution<
                    { type: string; data?: unknown },
                    string
                >(async function* (session) {
                    const result = await session.generateText({ prompt: 'Count to 3' });
                    return session.done(result.text);
                });

                for await (const _event of execution) {
                    // Consume stream to trigger execution lifecycle
                }

                expect(startEvent).not.toBeNull();
                expect(startEvent!.type).toBe('execution_start');
                expect(startEvent!.timestamp).toBeGreaterThan(0);

                expect(doneEvent).not.toBeNull();
                expect(doneEvent!.type).toBe('execution_done');
                expect(doneEvent!.duration).toBeGreaterThan(0);
                expect(doneEvent!.data).toBeDefined();
                expect(doneEvent!.summary).toBeDefined();
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Error Events (Streaming)', () => {
        it(
            'should call onExecutionError when execution fails',
            async () => {
                let errorEvent: ExecutionErrorEvent | null = null;

                const logger = createLogger({
                    onExecutionError: (event) => {
                        errorEvent = event;
                    },
                });

                const invalidProvider = createInvalidTestProvider(providerType).withLogger(logger);

                const execution = invalidProvider.streamingExecution<
                    { type: string; error?: Error },
                    string
                >(async function* (session) {
                    const result = await session.generateText({ prompt: 'Hello' });
                    return session.done(result.text);
                });

                const events: Array<{ type: string; error?: Error }> = [];
                for await (const event of execution) {
                    events.push(event);
                }

                expect(events.length).toBeGreaterThan(0);

                const lastEvent = events[events.length - 1];
                expect(lastEvent.type).toBe('error');
                expect(lastEvent.error).toBeInstanceOf(Error);

                expect(errorEvent).not.toBeNull();
                expect(errorEvent!.type).toBe('execution_error');
                expect(errorEvent!.error).toBeInstanceOf(Error);
                expect(errorEvent!.duration).toBeGreaterThanOrEqual(0);
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Event Metadata', () => {
        it(
            'should include usage and duration in LLMCallEndEvent',
            async ({ task }) => {
                let llmEndEvent: LLMCallEndEvent | null = null;

                const logger = createLogger({
                    onLLMCallEnd: (event) => {
                        llmEndEvent = event;
                    },
                });

                const provider = createTestProvider(providerType, {
                    logging: false,
                    task,
                }).withLogger(logger);

                const execution = provider.simpleExecution(async (session) => {
                    return session.generateText({ prompt: 'Say hello' });
                });

                await execution.toResult();

                expect(llmEndEvent).not.toBeNull();
                expect(llmEndEvent!.type).toBe('llm_call_end');
                expect(llmEndEvent!.response.duration).toBeGreaterThan(0);
                expect(llmEndEvent!.response.usage).toBeDefined();
                expect(llmEndEvent!.response.usage!.inputTokens).toBeGreaterThan(0);
                expect(llmEndEvent!.response.usage!.outputTokens).toBeGreaterThan(0);
                expect(llmEndEvent!.modelId).toBeTruthy();
                expect(llmEndEvent!.callType).toBe('generateText');
            },
            E2E_CONFIG.timeout
        );
    });
});
