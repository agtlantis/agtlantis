/**
 * Booking Agent - EvalAgent Implementation
 *
 * Multi-turn conversational agent for restaurant reservations.
 * Implements the EvalAgent interface from @agtlantis/eval.
 */

import type { Provider } from '@agtlantis/core';
import type { EvalAgent, AgentResult } from '../../src/index';
import { bookingAgentPrompt } from './prompt';
import type { BookingInput, BookingOutput, BookingState } from './types';

/**
 * Create a Booking Agent
 *
 * @param provider - Provider instance (OpenAI, Google, etc.)
 * @returns EvalAgent implementing the booking conversation flow
 *
 * @example
 * ```typescript
 * const provider = createOpenAIProvider({
 *   apiKey: process.env.OPENAI_API_KEY,
 * }).withDefaultModel('gpt-4o-mini')
 * const bookingAgent = createBookingAgent(provider)
 *
 * // First turn
 * const result1 = await bookingAgent.execute({
 *   message: 'I want to make a reservation for tomorrow at 7pm'
 * })
 *
 * // Follow-up turn
 * const result2 = await bookingAgent.execute({
 *   message: 'For 4 people, name is John'
 * })
 * ```
 */
export function createBookingAgent(provider: Provider): EvalAgent<BookingInput, BookingOutput> {
    return {
        config: {
            name: 'Booking Agent',
            description:
                'A conversational restaurant reservation assistant that collects booking information through multi-turn dialogue',
        },

        prompt: bookingAgentPrompt,

        async execute(input: BookingInput): Promise<AgentResult<BookingOutput>> {
            const startTime = Date.now();

            // Provider를 통해 LLM 호출
            const execution = provider.simpleExecution(async (session) => {
                return await session.generateText({
                    messages: [
                        { role: 'system', content: bookingAgentPrompt.system },
                        { role: 'user', content: bookingAgentPrompt.buildUserPrompt(input) },
                    ],
                });
            });

            const result = await execution.toResult();
            const responseText = result.text;

            // Parse JSON response
            let output: BookingOutput;
            try {
                // Extract JSON block (```json ... ``` or pure JSON)
                const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
                const jsonStr = jsonMatch ? jsonMatch[1] : responseText;
                output = JSON.parse(jsonStr.trim());

                // Ensure booking state has required fields
                if (output.booking) {
                    output.booking = normalizeBookingState(output.booking);
                }
            } catch {
                // JSON parsing failed - create error response
                output = {
                    reply: responseText,
                    booking: null,
                    needsMoreInfo: true,
                    missingFields: ['parse_error'],
                };
            }

            const summary = await execution.getSummary();

            return {
                result: output,
                metadata: {
                    duration: Date.now() - startTime,
                    promptVersion: bookingAgentPrompt.version,
                    tokenUsage: summary.totalLLMUsage,
                },
            };
        },
    };
}

/**
 * Normalize booking state to ensure consistent structure
 */
function normalizeBookingState(booking: Partial<BookingState>): BookingState {
    return {
        date: booking.date ?? undefined,
        time: booking.time ?? undefined,
        partySize: booking.partySize ?? undefined,
        name: booking.name ?? undefined,
        phone: booking.phone ?? undefined,
        notes: booking.notes ?? undefined,
        status: booking.status ?? 'pending',
    };
}

// Re-export types for convenience
export type { BookingInput, BookingOutput, BookingState, ConversationMessage } from './types';
