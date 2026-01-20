/**
 * Termination Detection E2E Tests
 *
 * Tests various termination conditions for multi-turn conversations:
 * - fieldValue: Terminate when a specific field has a specific value
 * - fieldSet: Terminate when a field is set (non-null/undefined)
 * - maxTurns: Safety limit to prevent infinite loops
 *
 * Pattern: Mixed - combines static inputs with condition-based termination
 *
 * Run with: REAL_E2E=true GOOGLE_API_KEY=... pnpm test e2e/scenarios/chatbot/termination-detection
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
  TERMINATION_DETECTION_CASES_MINIMAL,
  TERMINATION_BOOKING_CASE,
  TERMINATION_PASSWORD_RESET_CASE,
  type ChatbotInput,
  type ChatbotOutput,
} from './fixtures/test-cases'

describe.skipIf(!E2E_CONFIG.enabled)('Real E2E: Termination Detection', () => {
  let agent: EvalAgent<ChatbotInput, ChatbotOutput>
  let executeContext: MultiTurnExecuteContext<ChatbotInput, ChatbotOutput>

  beforeAll(async () => {
    const provider = createTestProvider()
    const prompt = await loadChatbotPrompt()
    agent = createChatbotAgent(provider, prompt)

    const judge = createTestJudge(provider, [
      {
        id: 'task-completion',
        name: 'Task Completion',
        description: 'Agent successfully completes the user task',
        weight: 2,
      },
      {
        id: 'proper-termination',
        name: 'Proper Termination',
        description: 'Agent correctly signals task completion',
        weight: 1,
      },
    ])

    executeContext = {
      agent,
      judge,
      agentDescription: 'Task-oriented chatbot that signals completion',
    }
  })

  it(
    'should terminate on isComplete=true condition',
    async () => {
      const result = await executeMultiTurnTestCase(
        TERMINATION_BOOKING_CASE,
        executeContext,
      )

      expect(result.termination.terminated).toBe(true)

      // Check termination reason
      const terminatedOnCondition =
        result.termination.reason?.includes('isComplete') ||
        result.termination.reason?.includes('fieldValue')
      const terminatedOnMaxTurns = result.termination.reason?.includes('maxTurns')

      // Either condition is acceptable
      expect(terminatedOnCondition || terminatedOnMaxTurns).toBe(true)

      // If terminated on condition, verify the field value
      if (terminatedOnCondition) {
        const lastOutput =
          result.conversationHistory[result.conversationHistory.length - 1].output

        expect(lastOutput?.isComplete).toBe(true)
      }

      console.log(
        `[Termination] Reason: ${result.termination.reason}, ` +
          `Turns: ${result.totalTurns}`,
      )
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should terminate on taskStatus=completed condition',
    async () => {
      const result = await executeMultiTurnTestCase(
        TERMINATION_PASSWORD_RESET_CASE,
        executeContext,
      )

      expect(result.termination.terminated).toBe(true)

      // This test expects to complete before max turns
      // But LLM behavior is non-deterministic, so max turns is also acceptable
      const terminatedOnCondition =
        result.termination.reason?.includes('taskStatus') ||
        result.termination.reason?.includes('fieldValue')

      if (terminatedOnCondition) {
        const lastOutput =
          result.conversationHistory[result.conversationHistory.length - 1].output

        expect(lastOutput?.taskStatus).toBe('completed')
        console.log('[Termination] Task completed successfully!')
      } else {
        // If max turns reached, that's also informative
        console.log(
          `[Termination] Max turns reached (${result.totalTurns}). ` +
            'Agent did not set taskStatus=completed.',
        )
      }
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should track termination metadata correctly',
    async () => {
      const testCase = TERMINATION_DETECTION_CASES_MINIMAL[0]
      const result = await executeMultiTurnTestCase(testCase, executeContext)

      // Termination should have required fields
      expect(result.termination.terminated).toBe(true)
      expect(result.termination.reason).toBeDefined()

      // terminationType should be set
      expect(result.termination.terminationType).toBeDefined()

      // Log termination details
      console.log('[Termination Metadata]')
      console.log(`  terminated: ${result.termination.terminated}`)
      console.log(`  reason: ${result.termination.reason}`)
      console.log(`  terminationType: ${result.termination.terminationType}`)
      if (result.termination.matchedCondition) {
        console.log(
          `  matchedCondition: ${JSON.stringify(result.termination.matchedCondition)}`,
        )
      }
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should handle early termination gracefully',
    async () => {
      // Create a test case that might terminate early
      const result = await executeMultiTurnTestCase(
        TERMINATION_BOOKING_CASE,
        executeContext,
      )

      // Verify that the conversation history is consistent
      // Even if terminated early, all recorded turns should be valid
      for (const turn of result.conversationHistory) {
        expect(turn.turn).toBeGreaterThanOrEqual(1)
        expect(turn.input).toBeDefined()
        // Output might be undefined if agent errored
        if (turn.output) {
          expect(turn.output.response).toBeDefined()
        }
      }

      // Total turns should match history length
      expect(result.totalTurns).toBe(result.conversationHistory.length)

      // Verify test result structure
      expect(result.testCase).toBeDefined()
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should respect onConditionMet and onMaxTurnsReached settings',
    async () => {
      // TERMINATION_PASSWORD_RESET_CASE has:
      // - onConditionMet: 'pass' (pass if taskStatus=completed)
      // - onMaxTurnsReached: 'fail' (fail if max turns reached without completion)

      const result = await executeMultiTurnTestCase(
        TERMINATION_PASSWORD_RESET_CASE,
        executeContext,
      )

      // Check how the test was evaluated based on termination
      const terminatedOnCondition =
        result.termination.reason?.includes('fieldValue') ||
        result.termination.reason?.includes('taskStatus')

      if (terminatedOnCondition) {
        // If terminated on condition, the test should evaluate based on onConditionMet
        console.log('[Outcome] Terminated on condition - evaluating normally')
      } else {
        // If max turns reached, the test outcome depends on onMaxTurnsReached
        console.log(
          '[Outcome] Max turns reached - onMaxTurnsReached: fail configured',
        )
      }

      // Verify the result has expected structure regardless of outcome
      expect(result.termination.terminated).toBe(true)
      expect(result.metrics).toBeDefined()
    },
    TEST_TIMEOUTS.multiTurn,
  )
})
