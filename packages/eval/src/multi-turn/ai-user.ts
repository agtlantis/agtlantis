import type { Provider } from '@agtlantis/core';
import type { ConversationContext } from './types';

export interface AIUserOptions<TInput, TOutput> {
    /** Provider for generating user responses */
    provider: Provider;

    /** System prompt (string or function for dynamic personas). Uses default if not provided. */
    systemPrompt?: string | ((context: ConversationContext<TInput, TOutput>) => string);

    /** Custom history formatter. Default: JSON-based "User: {input}\nAssistant: {output}" format. */
    formatHistory?: (context: ConversationContext<TInput, TOutput>) => string;

    /** Convert LLM text response to TInput. Has access to full context for structured input building. */
    buildInput: (llmResponse: string, context: ConversationContext<TInput, TOutput>) => TInput;
}

const DEFAULT_SYSTEM_PROMPT = `You are simulating a realistic user in a conversation with an AI assistant.

## Your Role
Generate natural, context-appropriate user messages based on the conversation history.

## Guidelines

1. **Stay in Character**: Respond as a real user would - with natural language, occasional typos, or casual phrasing when appropriate.

2. **Be Goal-Oriented**: Users have objectives. Pursue them logically based on the conversation context:
   - If the assistant asks a question, provide a reasonable answer
   - If clarification is needed, ask for it naturally
   - If a task is progressing, guide it toward completion

3. **React Appropriately**: Respond to what the assistant says:
   - Acknowledge when the assistant is helpful
   - Express confusion if the response is unclear
   - Correct misunderstandings if they occur

4. **Keep It Realistic**: Real users:
   - Don't always provide perfect information upfront
   - May change their mind or add requirements
   - Sometimes need time to think or decide

## Output Format
Respond with ONLY the user's message. No additional formatting, explanation, or meta-commentary.`;

/**
 * Creates an async function that generates user inputs using an LLM for multi-turn testing.
 *
 * @example
 * ```typescript
 * aiUser({
 *   provider: openai,
 *   systemPrompt: 'You are a friendly customer.',
 *   buildInput: (response, ctx) => ({ message: response }),
 * })
 * ```
 */
export function aiUser<TInput, TOutput>(
    options: AIUserOptions<TInput, TOutput>
): (context: ConversationContext<TInput, TOutput>) => Promise<TInput> {
    const { provider, systemPrompt, formatHistory, buildInput } = options;

    const defaultFormatHistory = (ctx: ConversationContext<TInput, TOutput>): string =>
        ctx.history
            .map(
                (h, i) =>
                    `[Turn ${i + 1}]\nUser: ${JSON.stringify(h.input)}\nAssistant: ${JSON.stringify(h.output)}`
            )
            .join('\n\n');

    return async (context: ConversationContext<TInput, TOutput>): Promise<TInput> => {
        const historyText = (formatHistory ?? defaultFormatHistory)(context);

        const resolvedSystemPrompt =
            typeof systemPrompt === 'function'
                ? systemPrompt(context)
                : (systemPrompt ?? DEFAULT_SYSTEM_PROMPT);

        const userPrompt = historyText
            ? `## Conversation History\n${historyText}\n\n## Your Task\nGenerate the next user message based on the conversation above:`
            : `## Your Task\nThis is the start of a new conversation. Generate an appropriate opening message from the user:`;

        const execution = provider.simpleExecution(async (session) => {
            const result = await session.generateText({
                messages: [
                    { role: 'system', content: resolvedSystemPrompt },
                    { role: 'user', content: userPrompt },
                ],
            });
            return result.text;
        });

        const executionResult = await execution.result();

        if (executionResult.status !== 'succeeded') {
            throw executionResult.status === 'failed'
                ? executionResult.error
                : new Error('Execution was canceled');
        }

        const responseText = executionResult.value;
        return buildInput(responseText, context);
    };
}
