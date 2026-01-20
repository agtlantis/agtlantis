/**
 * Context Preservation E2E Tests
 *
 * Tests that the chatbot agent remembers information across conversation turns.
 * Pattern: Static follow-ups that reference previous context.
 *
 * Run with: REAL_E2E=true GOOGLE_API_KEY=... pnpm test e2e/scenarios/chatbot/context-preservation
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { executeMultiTurnTestCase, type MultiTurnExecuteContext } from '@/multi-turn/runner'
import type { EvalAgent } from '@/core/types'

import {
  E2E_CONFIG,
  TEST_TIMEOUTS,
  createTestProvider,
  createTestJudge,
  loadChatbotPrompt,
  createChatbotAgent,
} from './setup'

import {
  CONTEXT_PRESERVATION_CASES_MINIMAL,
  CONTEXT_NAME_MEMORY_CASE,
  type ChatbotInput,
  type ChatbotOutput,
} from './fixtures/test-cases'

describe.skipIf(!E2E_CONFIG.enabled)('Real E2E: Context Preservation', () => {
  let agent: EvalAgent<ChatbotInput, ChatbotOutput>
  let executeContext: MultiTurnExecuteContext<ChatbotInput, ChatbotOutput>

  beforeAll(async () => {
    const provider = createTestProvider()
    const prompt = await loadChatbotPrompt()
    agent = createChatbotAgent(provider, prompt)

    const judge = createTestJudge(provider, [
      {
        id: 'context-retention',
        name: 'Context Retention',
        description: 'Agent correctly recalls information from earlier in the conversation',
        weight: 2,
      },
      {
        id: 'response-accuracy',
        name: 'Response Accuracy',
        description: 'Agent provides accurate information when asked about previous context',
        weight: 1,
      },
    ])

    executeContext = {
      agent,
      judge,
      agentDescription: 'Multi-turn chatbot that maintains conversation context',
    }
  })

  it(
    'should remember user name across turns',
    async () => {
      const result = await executeMultiTurnTestCase(
        CONTEXT_NAME_MEMORY_CASE,
        executeContext,
      )

      // Verify conversation completed
      expect(result.totalTurns).toBe(3)
      expect(result.termination.terminated).toBe(true)
      // Reason could be 'maxTurns' or 'Maximum turns reached (N)'
      expect(result.termination.reason?.toLowerCase()).toContain('max')

      // Verify conversation history was recorded
      expect(result.conversationHistory).toHaveLength(3)

      // Each turn should have both input and output
      for (const turn of result.conversationHistory) {
        expect(turn.input).toBeDefined()
        expect(turn.output).toBeDefined()
      }

      // The agent should have mentioned the user's name in the conversation
      const allResponses = result.conversationHistory
        .map((t) => t.output?.response ?? '')
        .join(' ')

      // Check that name was mentioned at least once
      const nameWasMentioned =
        allResponses.includes('김철수') ||
        allResponses.includes('철수') ||
        allResponses.toLowerCase().includes('kim')

      expect(nameWasMentioned).toBe(true)
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should complete multi-turn context test with valid structure',
    async () => {
      const testCase = CONTEXT_PRESERVATION_CASES_MINIMAL[0]
      const result = await executeMultiTurnTestCase(testCase, executeContext)

      // Verify structural properties
      expect(result.testCase).toBe(testCase)
      expect(result.totalTurns).toBeGreaterThanOrEqual(1)

      // Verify each turn has the expected structure
      result.conversationHistory.forEach((turn, index) => {
        expect(turn.turn).toBe(index + 1)
        expect(turn.input).toBeDefined()
        expect(turn.input.message).toBeDefined()
        // Output should be parsed ChatbotOutput
        if (turn.output) {
          expect(turn.output.response).toBeDefined()
        }
      })

      // Verify termination info
      expect(result.termination.terminated).toBe(true)

      // Verify metrics
      expect(result.metrics.tokenUsage.totalTokens).toBeGreaterThan(0)
      expect(result.metrics.latencyMs).toBeGreaterThan(0)
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should track token usage across all turns',
    async () => {
      const result = await executeMultiTurnTestCase(
        CONTEXT_NAME_MEMORY_CASE,
        executeContext,
      )

      // Token usage should accumulate across turns
      expect(result.metrics.tokenUsage.inputTokens).toBeGreaterThan(0)
      expect(result.metrics.tokenUsage.outputTokens).toBeGreaterThan(0)
      expect(result.metrics.tokenUsage.totalTokens).toBe(
        result.metrics.tokenUsage.inputTokens +
          result.metrics.tokenUsage.outputTokens,
      )

      // Log for observability
      console.log(
        `[Context Preservation] Total tokens: ${result.metrics.tokenUsage.totalTokens}, ` +
          `Turns: ${result.totalTurns}, Latency: ${result.metrics.latencyMs}ms`,
      )
    },
    TEST_TIMEOUTS.multiTurn,
  )
})
