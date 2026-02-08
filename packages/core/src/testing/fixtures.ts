import type { CompletionEvent } from '@/execution/types';
import type { LanguageModelUsage } from '@/observability';
import { SessionSummary, type LLMCallRecord, type ToolCallSummary, type AdditionalCost } from '@/session/types';

export const TEST_API_KEY = 'test-api-key';

export function createMockUsage(overrides?: Partial<LanguageModelUsage>): LanguageModelUsage {
    const inputTokens = overrides?.inputTokens ?? 10;
    const outputTokens = overrides?.outputTokens ?? 5;

    return {
        inputTokens,
        outputTokens,
        totalTokens: overrides?.totalTokens ?? inputTokens + outputTokens,
        inputTokenDetails: {
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
            noCacheTokens: undefined,
            ...overrides?.inputTokenDetails,
        },
        outputTokenDetails: {
            textTokens: undefined,
            reasoningTokens: undefined,
            ...overrides?.outputTokenDetails,
        },
    };
}

export interface TestBaseEvent {
    type: string;
    message?: string;
    data?: string;
}

export type TestEvent = TestBaseEvent | CompletionEvent<string>;

export interface TestResult {
    value: string;
}

export function createTestEvent(
    type: string,
    overrides?: Partial<Omit<TestBaseEvent, 'type'>>
): TestBaseEvent {
    return {
        type,
        ...overrides,
    };
}

export interface MockSessionSummaryOptions {
    /** @deprecated Use startTime instead. totalDuration is computed from startTime. */
    totalDuration?: number;
    startTime?: number;
    totalLLMUsage?: LanguageModelUsage;
    /** @deprecated Provide llmCalls array instead. llmCallCount creates dummy records. */
    llmCallCount?: number;
    llmCalls?: LLMCallRecord[];
    toolCalls?: ToolCallSummary[];
    customRecords?: Record<string, unknown>[];
    /** @deprecated Use llmCost instead */
    totalCost?: number;
    llmCost?: number;
    additionalCosts?: AdditionalCost[];
    metadata?: Record<string, unknown>;
    costByModel?: Record<string, number>;
}

function createDummyLLMCall(): LLMCallRecord {
    return {
        startTime: Date.now() - 100,
        endTime: Date.now(),
        duration: 100,
        usage: createMockUsage(),
        type: 'generateText',
        model: 'test-model',
        provider: 'openai',
    };
}

export function createMockSessionSummary(overrides?: MockSessionSummaryOptions): SessionSummary {
    // Compute startTime from totalDuration for backward compatibility
    let startTime = overrides?.startTime;
    if (startTime === undefined && overrides?.totalDuration !== undefined) {
        startTime = Date.now() - overrides.totalDuration;
    }

    // Support both llmCost and deprecated totalCost
    const llmCost = overrides?.llmCost ?? overrides?.totalCost ?? 0;

    // Support deprecated llmCallCount by creating dummy records
    let llmCalls = overrides?.llmCalls;
    if (!llmCalls && overrides?.llmCallCount !== undefined) {
        llmCalls = Array.from({ length: overrides.llmCallCount }, () => createDummyLLMCall());
    }

    return SessionSummary.forTest({
        startTime,
        totalLLMUsage: overrides?.totalLLMUsage ?? createMockUsage(),
        llmCalls: llmCalls ?? [],
        toolCalls: overrides?.toolCalls ?? [],
        customRecords: overrides?.customRecords ?? [],
        llmCost,
        additionalCosts: overrides?.additionalCosts ?? [],
        metadata: overrides?.metadata ?? {},
        costByModel: overrides?.costByModel ?? {},
    });
}
