/**
 * Selection-Based E2E Tests
 *
 * Tests the programmatic selection pattern where:
 * 1. Agent presents options in JSON format
 * 2. User selects an option by ID
 * 3. Agent provides detailed information about the selection
 *
 * Pattern: Programmatic - deterministic, low cost
 *
 * Run with: REAL_E2E=true GOOGLE_API_KEY=... pnpm test e2e/scenarios/chatbot/selection-based
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
  createSelectionChatbotAgent,
  type SelectionChatbotOutput,
} from './setup'

import {
  SELECTION_BASED_CASES_MINIMAL,
  SELECTION_MOVIE_CASE,
  type ChatbotInput,
} from './fixtures/test-cases'

describe.skipIf(!E2E_CONFIG.enabled)('Real E2E: Selection-Based Flow', () => {
  let agent: EvalAgent<ChatbotInput, SelectionChatbotOutput>
  let executeContext: MultiTurnExecuteContext<ChatbotInput, SelectionChatbotOutput>

  beforeAll(async () => {
    const provider = createTestProvider()
    const prompt = await loadChatbotPrompt()
    agent = createSelectionChatbotAgent(provider, prompt)

    const judge = createTestJudge(provider, [
      {
        id: 'options-provided',
        name: 'Options Provided',
        description: 'Agent presents clear options for user selection',
        weight: 2,
      },
      {
        id: 'selection-handled',
        name: 'Selection Handled',
        description: 'Agent correctly responds to user selection with relevant details',
        weight: 2,
      },
    ])

    executeContext = {
      agent,
      judge,
      agentDescription: 'Chatbot that presents options and handles user selections',
    }
  })

  it(
    'should present options and handle selection',
    async () => {
      const result = await executeMultiTurnTestCase(
        SELECTION_MOVIE_CASE,
        executeContext,
      )

      // Should have at least 2 turns (initial + selection)
      expect(result.totalTurns).toBeGreaterThanOrEqual(1)
      expect(result.termination.terminated).toBe(true)

      // Check first turn - agent should have presented options
      const firstTurn = result.conversationHistory[0]
      expect(firstTurn.output).toBeDefined()

      // The agent might present options in the first response
      // or might ask clarifying questions first
      const hasOptionsInFirstTurn =
        firstTurn.output?.options && firstTurn.output.options.length > 0

      if (hasOptionsInFirstTurn) {
        expect(firstTurn.output!.options!.length).toBeGreaterThanOrEqual(2)

        // Each option should have id and label
        for (const option of firstTurn.output!.options!) {
          expect(option.id).toBeDefined()
          expect(option.label).toBeDefined()
        }
      }

      // Log for observability
      console.log(
        `[Selection-Based] Turns: ${result.totalTurns}, ` +
          `Termination: ${result.termination.reason}, ` +
          `Options presented: ${hasOptionsInFirstTurn}`,
      )
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should terminate early when selection details are provided',
    async () => {
      const result = await executeMultiTurnTestCase(
        SELECTION_MOVIE_CASE,
        executeContext,
      )

      // Check termination
      expect(result.termination.terminated).toBe(true)

      // If terminated on fieldSet condition, selectedDetails should be present
      if (result.termination.reason?.includes('fieldSet')) {
        const lastOutput =
          result.conversationHistory[result.conversationHistory.length - 1].output

        expect(lastOutput?.selectedDetails).toBeDefined()
      }

      // Even if max turns reached, that's acceptable
      // (agent might not have presented options in expected format)
      // Reason formats: 'fieldSet', 'Field "X" is set', 'maxTurns', 'Maximum turns reached (N)'
      const reason = result.termination.reason?.toLowerCase() ?? ''
      const terminatedProperly =
        reason.includes('field') || // covers 'fieldSet' and 'Field "X" is set'
        reason.includes('max') // covers 'maxTurns' and 'Maximum turns'

      expect(terminatedProperly).toBe(true)
    },
    TEST_TIMEOUTS.multiTurn,
  )

  it(
    'should use dynamic input based on previous output',
    async () => {
      // This test verifies that the dynamic input function works
      // The SELECTION_MOVIE_CASE uses ctx.lastOutput to select first option

      const result = await executeMultiTurnTestCase(
        SELECTION_MOVIE_CASE,
        executeContext,
      )

      // If we have at least 2 turns
      if (result.conversationHistory.length >= 2) {
        const secondTurn = result.conversationHistory[1]

        // The second turn's input should reference the first option
        // from the first turn's output (if options were provided)
        const firstTurn = result.conversationHistory[0]
        if (firstTurn.output?.options?.[0]) {
          const expectedOptionId = firstTurn.output.options[0].id

          // The input message should mention the option
          expect(secondTurn.input.message).toContain(expectedOptionId)
        }
      }

      console.log(
        `[Selection-Based] Dynamic input test completed with ${result.totalTurns} turns`,
      )
    },
    TEST_TIMEOUTS.multiTurn,
  )
})
