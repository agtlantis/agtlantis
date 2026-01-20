/**
 * Dynamic Conversation E2E Tests (aiUser)
 *
 * Tests multi-turn conversations where an LLM simulates user responses.
 * Pattern: aiUser - realistic, additional LLM cost
 *
 * This pattern is useful for:
 * - Testing natural conversation flow
 * - Simulating realistic user behavior
 * - Exploring agent edge cases
 *
 * Run with: REAL_E2E=true GOOGLE_API_KEY=... pnpm test e2e/scenarios/chatbot/dynamic-conversation
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { executeMultiTurnTestCase, type MultiTurnExecuteContext } from '@/multi-turn/runner'
import { aiUser, type AIUserOptions } from '@/multi-turn/ai-user'
import type { MultiTurnTestCase } from '@/multi-turn/types'
import type { EvalAgent } from '@/core/types'
import type { Provider } from '@agtlantis/core'

import {
  E2E_CONFIG,
  TEST_TIMEOUTS,
  createTestProvider,
  createTestJudge,
  loadChatbotPrompt,
  createChatbotAgent,
} from './setup'

import type { ChatbotInput, ChatbotOutput } from './fixtures/test-cases'

describe.skipIf(!E2E_CONFIG.enabled)('Real E2E: Dynamic Conversation (aiUser)', () => {
  let provider: Provider
  let agent: EvalAgent<ChatbotInput, ChatbotOutput>
  let executeContext: MultiTurnExecuteContext<ChatbotInput, ChatbotOutput>

  beforeAll(async () => {
    provider = createTestProvider()
    const prompt = await loadChatbotPrompt()
    agent = createChatbotAgent(provider, prompt)

    const judge = createTestJudge(provider, [
      {
        id: 'natural-flow',
        name: 'Natural Flow',
        description: 'Conversation flows naturally with appropriate responses',
        weight: 2,
      },
      {
        id: 'goal-progress',
        name: 'Goal Progress',
        description: 'Agent makes progress toward helping the user',
        weight: 1,
      },
    ])

    executeContext = {
      agent,
      judge,
      agentDescription: 'Conversational chatbot for travel planning',
    }
  })

  /**
   * Creates a travel planning test case with aiUser simulation.
   */
  function createTravelPlanningCase(maxTurns: number): MultiTurnTestCase<ChatbotInput, ChatbotOutput> {
    const aiUserConfig: AIUserOptions<ChatbotInput, ChatbotOutput> = {
      provider,
      systemPrompt:
        '당신은 여행 계획을 세우려는 고객입니다. ' +
        '도쿄 여행을 계획 중이고, 3박 4일 일정을 원합니다. ' +
        '자연스럽게 대화하면서 에이전트의 질문에 답하세요. ' +
        '한국어로 짧게 응답하세요 (1-2문장).',
      buildInput: (response: string): ChatbotInput => ({
        message: response,
      }),
    }

    return {
      id: 'ai-user-travel-planning',
      input: { message: '안녕하세요! 여행 계획을 세우고 싶어요.' },
      multiTurn: {
        followUpInputs: [
          {
            input: aiUser(aiUserConfig),
            description: 'AI simulates customer responses',
            turns: Infinity, // Continue until termination condition
          },
        ],
        terminateWhen: [
          { type: 'fieldValue', fieldPath: 'isComplete', expectedValue: true },
          { type: 'maxTurns', count: maxTurns },
        ],
        onConditionMet: 'pass',
        onMaxTurnsReached: 'pass', // Natural for open-ended conversation
      },
    }
  }

  it(
    'should have natural multi-turn conversation with aiUser',
    async () => {
      const testCase = createTravelPlanningCase(4)
      const result = await executeMultiTurnTestCase(testCase, executeContext)

      // Should have multiple turns
      expect(result.totalTurns).toBeGreaterThanOrEqual(2)
      expect(result.termination.terminated).toBe(true)

      // Each turn should have meaningful content
      for (const turn of result.conversationHistory) {
        expect(turn.input.message).toBeDefined()
        expect(turn.input.message.length).toBeGreaterThan(0)

        if (turn.output) {
          expect(turn.output.response).toBeDefined()
          expect(turn.output.response.length).toBeGreaterThan(0)
        }
      }

      // Log for observability
      console.log(
        `[aiUser] Turns: ${result.totalTurns}, ` +
          `Tokens: ${result.metrics.tokenUsage.totalTokens}, ` +
          `Latency: ${result.metrics.latencyMs}ms`,
      )

      // Show conversation summary
      console.log('[aiUser] Conversation:')
      for (const turn of result.conversationHistory) {
        console.log(`  Turn ${turn.turn}:`)
        console.log(`    User: ${turn.input.message.slice(0, 50)}...`)
        console.log(`    Agent: ${turn.output?.response?.slice(0, 50) ?? 'N/A'}...`)
      }
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should stay within cost budget with aiUser',
    async () => {
      // Use shorter conversation to control costs
      const testCase = createTravelPlanningCase(3)
      const result = await executeMultiTurnTestCase(testCase, executeContext)

      // Verify token usage is reasonable
      // With aiUser, we have ~2x the LLM calls (agent + user simulation)
      const totalTokens = result.metrics.tokenUsage.totalTokens

      // Rough estimate: each turn ~200-500 tokens, aiUser adds similar
      // 3 turns * 2 calls * 500 tokens = ~3000 tokens max
      expect(totalTokens).toBeLessThan(10000)

      // Latency check - should complete within timeout
      expect(result.metrics.latencyMs).toBeLessThan(TEST_TIMEOUTS.multiTurn)

      console.log(
        `[aiUser Cost] Total tokens: ${totalTokens}, ` +
          `Estimated cost: $${(totalTokens * 0.00001).toFixed(4)}`,
      )
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should support dynamic persona with aiUser',
    async () => {
      // Test with a different persona (impatient customer)
      const impatientUserConfig: AIUserOptions<ChatbotInput, ChatbotOutput> = {
        provider,
        systemPrompt: (ctx) => {
          // Persona changes based on turn count
          if (ctx.currentTurn <= 2) {
            return '당신은 친절한 고객입니다. 짧게 응답하세요.'
          }
          return '당신은 약간 급한 고객입니다. 빨리 결론을 원합니다. 짧게 응답하세요.'
        },
        buildInput: (response: string): ChatbotInput => ({
          message: response,
        }),
      }

      const testCase: MultiTurnTestCase<ChatbotInput, ChatbotOutput> = {
        id: 'ai-user-dynamic-persona',
        input: { message: '레스토랑 추천해주세요' },
        multiTurn: {
          followUpInputs: [
            {
              input: aiUser(impatientUserConfig),
              turns: Infinity,
            },
          ],
          terminateWhen: [
            { type: 'fieldValue', fieldPath: 'isComplete', expectedValue: true },
            { type: 'maxTurns', count: 4 },
          ],
          onMaxTurnsReached: 'pass',
        },
      }

      const result = await executeMultiTurnTestCase(testCase, executeContext)

      expect(result.totalTurns).toBeGreaterThanOrEqual(2)
      expect(result.termination.terminated).toBe(true)

      console.log(
        `[Dynamic Persona] Completed with ${result.totalTurns} turns`,
      )
    },
    TEST_TIMEOUTS.multiTurn,
  )
})
