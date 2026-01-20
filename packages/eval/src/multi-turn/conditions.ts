import type { Provider } from '@agtlantis/core';
import { truncate } from '@/utils/json';
import { checkCondition } from './termination';
import type { ConversationContext, CustomCondition, TerminationCondition } from './types';

import {
    createAndCheck,
    createOrCheck,
    createNotCheck,
    formatCompositeDescription,
} from '../utils/condition-composites';

export interface NaturalLanguageConditionOptions {
    /** Provider to use for evaluation */
    provider: Provider;
    /** Prompt describing the termination criteria (e.g., "Has the user's question been fully answered?") */
    prompt: string;
    /** Optional system prompt override */
    systemPrompt?: string;
}

/** LLM-based termination condition. Asks the LLM to evaluate the termination criteria. */
export function naturalLanguage<TInput = unknown, TOutput = unknown>(
    options: NaturalLanguageConditionOptions
): CustomCondition<TInput, TOutput> {
    const { provider, prompt, systemPrompt } = options;

    const defaultSystemPrompt = `You are an assistant that evaluates whether a conversation should terminate.
Analyze the conversation history and determine if the specified condition is met.
Respond with ONLY "yes" or "no" - nothing else.`;

    return {
        type: 'custom',
        check: async (context: ConversationContext<TInput, TOutput>) => {
            const historyText = context.history
                .map(
                    (h) =>
                        `Turn ${h.turn}:\nInput: ${JSON.stringify(h.input)}\nOutput: ${JSON.stringify(h.output)}`
                )
                .join('\n\n');

            const userPrompt = `## Termination Condition
${prompt}

## Conversation History
${historyText || '(No history yet)'}

## Current Turn
Turn: ${context.currentTurn}
Last Output: ${JSON.stringify(context.lastOutput)}

Should the conversation terminate based on the condition above? Answer "yes" or "no" only.`;

            const execution = provider.simpleExecution(async (session) => {
                const result = await session.generateText({
                    messages: [
                        { role: 'system', content: systemPrompt ?? defaultSystemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                });
                return result.text;
            });

            const responseText = await execution.toResult();
            const answer = responseText.toLowerCase().trim();
            return answer === 'yes' || answer.startsWith('yes');
        },
        description: `NL: ${truncate(prompt, 50)}`,
    };
}

/** Terminates when ALL sub-conditions are met (AND logic). */
export function and<TInput = unknown, TOutput = unknown>(
    ...conditions: TerminationCondition<TInput, TOutput>[]
): CustomCondition<TInput, TOutput> {
    if (conditions.length === 0) {
        return {
            type: 'custom',
            check: () => false,
            description: formatCompositeDescription('and', []),
        };
    }

    return {
        type: 'custom',
        check: createAndCheck(conditions, checkCondition),
        description: formatCompositeDescription('and', conditions),
    };
}

/** Terminates when ANY sub-condition is met (OR logic). Useful for nested composites. */
export function or<TInput = unknown, TOutput = unknown>(
    ...conditions: TerminationCondition<TInput, TOutput>[]
): CustomCondition<TInput, TOutput> {
    if (conditions.length === 0) {
        return {
            type: 'custom',
            check: () => false,
            description: formatCompositeDescription('or', []),
        };
    }

    return {
        type: 'custom',
        check: createOrCheck(conditions, checkCondition),
        description: formatCompositeDescription('or', conditions),
    };
}

/** Inverts another condition (NOT logic). */
export function not<TInput = unknown, TOutput = unknown>(
    condition: TerminationCondition<TInput, TOutput>
): CustomCondition<TInput, TOutput> {
    return {
        type: 'custom',
        check: createNotCheck(condition, checkCondition),
        description: `not(${condition.type})`,
    };
}

/** Terminates after a specified number of turns. Convenience wrapper for use in composites. */
export function afterTurns<TInput = unknown, TOutput = unknown>(
    count: number
): CustomCondition<TInput, TOutput> {
    return {
        type: 'custom',
        check: (context) => context.currentTurn >= count,
        description: `afterTurns(${count})`,
    };
}

/** Terminates when a field matches a specific value. Convenience wrapper for composites. */
export function fieldEquals<TInput = unknown, TOutput = unknown>(
    fieldPath: string,
    expectedValue: unknown
): CustomCondition<TInput, TOutput> {
    return {
        type: 'custom',
        check: async (context) => {
            const result = await checkCondition(
                { type: 'fieldValue', fieldPath, expectedValue },
                context
            );
            return result.terminated;
        },
        description: `fieldEquals(${fieldPath}, ${JSON.stringify(expectedValue)})`,
    };
}

/** Terminates when a field is set (not null/undefined). Convenience wrapper for composites. */
export function fieldIsSet<TInput = unknown, TOutput = unknown>(
    fieldPath: string
): CustomCondition<TInput, TOutput> {
    return {
        type: 'custom',
        check: async (context) => {
            const result = await checkCondition({ type: 'fieldSet', fieldPath }, context);
            return result.terminated;
        },
        description: `fieldIsSet(${fieldPath})`,
    };
}
