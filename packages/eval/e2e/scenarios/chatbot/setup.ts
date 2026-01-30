/**
 * Chatbot E2E Test Setup
 *
 * Domain-specific setup for chatbot pattern E2E tests.
 * Tests multi-turn conversation patterns: context preservation,
 * selection-based flow, dynamic (aiUser), and termination detection.
 *
 * @example
 * import {
 *   REAL_E2E_ENABLED,
 *   createChatbotAgent,
 *   loadChatbotPrompt,
 * } from './setup'
 */

import path from 'node:path';
import { Output } from 'ai';
import { z } from 'zod';
import type { AgentPrompt, EvalAgent, AgentResult } from '@/core/types';
import type { ChatbotInput, ChatbotOutput } from './fixtures/test-cases';
import type { Provider } from '@agtlantis/core';
import { toEvalTokenUsage, createPromptLoader } from '@e2e/shared';

// ============================================================================
// Composable Zod Schemas for Structured Output
// ============================================================================

/**
 * Base schema - all chatbot responses have a response field.
 */
const BaseSchema = z.object({
    response: z.string(),
});

/**
 * Options extension - for selection-based patterns.
 * Use `withOptions()` for required options, `withOptions().partial()` for optional.
 */
const withOptions = () =>
    z.object({
        options: z.array(z.object({ id: z.string(), label: z.string() })),
        selectedDetails: z.any().nullable().optional(),
    });

/**
 * Termination extension - for termination detection patterns.
 * Both fields are REQUIRED to ensure LLM always outputs them.
 */
const withTermination = () =>
    z.object({
        isComplete: z.boolean(),
        taskStatus: z.enum(['in_progress', 'completed', 'cancelled']),
    });

// ============================================================================
// Composed Schemas
// ============================================================================

/** Full schema with all optional fields (backward compatible) */
const ChatbotOutputSchema = BaseSchema.merge(withOptions().partial()).merge(withTermination());

/** Selection-based schema - options is REQUIRED */
const SelectionChatbotOutputSchema = BaseSchema.merge(withOptions());

/** Termination schema - for termination detection tests */
const TerminationChatbotOutputSchema = BaseSchema.merge(withTermination());

// ============================================================================
// Re-export from Shared Infrastructure
// ============================================================================

export {
    // Environment
    E2E_CONFIG,
    skipIfNoRealE2E,
    validateEnvironment,
    // Provider & Factories
    createTestProvider,
    DEFAULT_CRITERIA,
    createTestJudge,
    // Pricing & Timing
    TEST_PRICING_CONFIG,
    TEST_TIMEOUTS,
    // Observability
    createConsoleLogger,
    // Paths
    E2E_PATHS,
} from '@e2e/shared';

export type { VerbosityLevel } from '@e2e/shared';

// ============================================================================
// Local Prompt Loading
// ============================================================================

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'prompts');

/**
 * Loads a prompt from a YAML fixture file.
 * Uses shared createPromptLoader factory.
 */
export const loadPromptFixture = createPromptLoader(FIXTURES_DIR);

/**
 * Loads the chatbot agent prompt.
 */
export async function loadChatbotPrompt(): Promise<AgentPrompt<ChatbotInput>> {
    return loadPromptFixture<ChatbotInput>('chatbot-agent');
}

// ============================================================================
// Chatbot Agent Factory
// ============================================================================

/**
 * Generic agent factory that accepts any Zod schema.
 * Creates a chatbot agent with AI SDK structured output.
 */
function createChatbotAgentWithSchema<TSchema extends z.ZodType>(
    provider: Provider,
    prompt: AgentPrompt<ChatbotInput>,
    schema: TSchema,
    config: { name: string; description: string }
): EvalAgent<ChatbotInput, z.infer<TSchema>> {
    return {
        config,
        prompt,
        execute: async (input: ChatbotInput): Promise<AgentResult<z.infer<TSchema>>> => {
            const startTime = Date.now();

            const execution = provider.simpleExecution(async (session) => {
                const result = await session.generateText({
                    messages: [
                        { role: 'system', content: prompt.system },
                        { role: 'user', content: prompt.buildUserPrompt(input) },
                    ],
                    output: Output.object({ schema }),
                });
                return result.output;
            });

            const executionResult = await execution.result();

            if (executionResult.status !== 'succeeded') {
                throw executionResult.status === 'failed'
                    ? executionResult.error
                    : new Error('Execution was canceled');
            }

            const latencyMs = Date.now() - startTime;

            return {
                result: executionResult.value as z.infer<TSchema>,
                metadata: {
                    tokenUsage: toEvalTokenUsage(executionResult.summary.totalLLMUsage),
                    latencyMs,
                },
            };
        },
    };
}

/**
 * Creates a general-purpose chatbot agent (all fields optional).
 * Use for context-preservation tests or when flexibility is needed.
 */
export function createChatbotAgent(
    provider: Provider,
    prompt: AgentPrompt<ChatbotInput>
): EvalAgent<ChatbotInput, ChatbotOutput> {
    return createChatbotAgentWithSchema(provider, prompt, ChatbotOutputSchema, {
        name: 'ChatbotAgent',
        description: 'Multi-turn conversational agent with structured JSON output',
    });
}

/** Output type for selection-based agent */
export type SelectionChatbotOutput = z.infer<typeof SelectionChatbotOutputSchema>;

/**
 * Creates a selection-based chatbot agent.
 * `options` field is REQUIRED - LLM must always provide selectable options.
 */
export function createSelectionChatbotAgent(
    provider: Provider,
    prompt: AgentPrompt<ChatbotInput>
): EvalAgent<ChatbotInput, SelectionChatbotOutput> {
    return createChatbotAgentWithSchema(provider, prompt, SelectionChatbotOutputSchema, {
        name: 'SelectionChatbotAgent',
        description: 'Selection-based agent with required options output',
    });
}

/** Output type for termination-based agent */
export type TerminationChatbotOutput = z.infer<typeof TerminationChatbotOutputSchema>;

/**
 * Creates a termination-detection chatbot agent.
 * Focuses on `isComplete` and `taskStatus` fields.
 */
export function createTerminationChatbotAgent(
    provider: Provider,
    prompt: AgentPrompt<ChatbotInput>
): EvalAgent<ChatbotInput, TerminationChatbotOutput> {
    return createChatbotAgentWithSchema(provider, prompt, TerminationChatbotOutputSchema, {
        name: 'TerminationChatbotAgent',
        description: 'Termination-detection agent with completion fields',
    });
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a minimal chatbot setup for quick tests.
 * Returns the Provider and pre-loaded prompt.
 */
export async function createMinimalChatbotSetup(): Promise<{
    provider: Provider;
    prompt: AgentPrompt<ChatbotInput>;
    agent: EvalAgent<ChatbotInput, ChatbotOutput>;
}> {
    const { createTestProvider } = await import('@e2e/shared');
    const provider = createTestProvider();
    const prompt = await loadChatbotPrompt();
    const agent = createChatbotAgent(provider, prompt);

    return { provider, prompt, agent };
}
