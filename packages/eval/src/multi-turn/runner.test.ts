import { describe, expect, it, vi } from 'vitest'
import { createMockAgent, createMockJudge } from '@/testing/mock-agent'
import { EvalError, EvalErrorCode } from '@/core/errors'
import type { MultiTurnTestCase } from './types'
import { executeMultiTurnTestCase } from './runner'

describe('executeMultiTurnTestCase', () => {
  describe('basic execution', () => {
    it('should execute a single-turn test when condition is immediately met', async () => {
      // Agent that returns recommendation on first turn
      const agent = createMockAgent<{ query: string }, { recommendation: string }>({
        response: { recommendation: 'Computer Science' },
      })

      const judge = createMockJudge({ score: 85, passed: true })

      const testCase: MultiTurnTestCase<{ query: string }, { recommendation: string }> = {
        id: 'single-turn-test',
        input: { query: 'Find a major' },
        multiTurn: {
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'recommendation' }],
          maxTurns: 5,
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.totalTurns).toBe(1)
      expect(result.termination.terminated).toBe(true)
      expect(result.termination.matchedCondition?.type).toBe('fieldSet')
      expect(result.passed).toBe(true)
      expect(result.overallScore).toBe(85)
      expect(result.conversationHistory).toHaveLength(1)
    })

    it('should execute multiple turns until condition is met', async () => {
      let turnCount = 0

      const agent = createMockAgent<{ step: number }, { status?: string; done?: boolean }>({
        executeFn: async (input) => {
          turnCount++
          // Return done=true on 3rd turn
          if (turnCount >= 3) {
            return { result: { status: 'complete', done: true } }
          }
          return { result: { status: 'pending' } }
        },
      })

      const judge = createMockJudge({ score: 90, passed: true })

      const testCase: MultiTurnTestCase<{ step: number }, { status?: string; done?: boolean }> = {
        id: 'multi-turn-test',
        input: { step: 1 },
        multiTurn: {
          followUpInputs: [
            { input: { step: 2 }, description: 'Second step' },
            { input: { step: 3 }, description: 'Third step' },
            { input: { step: 4 }, description: 'Fourth step (should not reach)' },
          ],
          terminateWhen: [{ type: 'fieldValue', fieldPath: 'done', expectedValue: true }],
          maxTurns: 10,
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.totalTurns).toBe(3)
      expect(result.termination.terminated).toBe(true)
      expect(result.passed).toBe(true)
      expect(result.conversationHistory).toHaveLength(3)
      expect(result.conversationHistory[0].input).toEqual({ step: 1 })
      expect(result.conversationHistory[1].input).toEqual({ step: 2 })
      expect(result.conversationHistory[2].input).toEqual({ step: 3 })
    })

    it('should stop at maxTurns when no condition is met', async () => {
      const agent = createMockAgent<string, { pending: boolean }>({
        response: { pending: true },
      })

      const judge = createMockJudge({ score: 60, passed: false })

      const testCase: MultiTurnTestCase<string, { pending: boolean }> = {
        id: 'max-turns-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [
            { input: 'continue1' },
            { input: 'continue2' },
            { input: 'continue3' },
          ],
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'done' }], // Never set
          maxTurns: 3,
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.totalTurns).toBe(3)
      expect(result.termination.terminated).toBe(true)
      expect(result.termination.matchedCondition?.type).toBe('maxTurns')
      // onMaxTurnsReached default is 'fail'
      expect(result.passed).toBe(false)
    })
  })

  describe('termination outcomes', () => {
    it('should pass when condition met and onConditionMet is pass (default)', async () => {
      const agent = createMockAgent<string, { complete: boolean }>({
        response: { complete: true },
      })
      const judge = createMockJudge({ score: 80, passed: true })

      const testCase: MultiTurnTestCase<string, { complete: boolean }> = {
        id: 'condition-pass-test',
        input: 'start',
        multiTurn: {
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'complete' }],
          onConditionMet: 'pass', // explicit
          maxTurns: 5,
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.passed).toBe(true)
    })

    it('should fail when condition met but onConditionMet is fail', async () => {
      const agent = createMockAgent<string, { error: boolean }>({
        response: { error: true },
      })
      const judge = createMockJudge({ score: 80, passed: true })

      const testCase: MultiTurnTestCase<string, { error: boolean }> = {
        id: 'condition-fail-test',
        input: 'start',
        multiTurn: {
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'error' }],
          onConditionMet: 'fail', // Error field means failure
          maxTurns: 5,
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.passed).toBe(false)
    })

    it('should fail when maxTurns reached and onMaxTurnsReached is fail (default)', async () => {
      const agent = createMockAgent<string, Record<string, unknown>>({
        response: {},
      })
      const judge = createMockJudge({ score: 100, passed: true })

      const testCase: MultiTurnTestCase<string, Record<string, unknown>> = {
        id: 'max-turns-fail-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [{ input: 'continue' }],
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'never' }],
          maxTurns: 2,
          onMaxTurnsReached: 'fail', // explicit
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.passed).toBe(false)
    })

    it('should pass when maxTurns reached but onMaxTurnsReached is pass', async () => {
      const agent = createMockAgent<string, Record<string, unknown>>({
        response: {},
      })
      const judge = createMockJudge({ score: 80, passed: true })

      const testCase: MultiTurnTestCase<string, Record<string, unknown>> = {
        id: 'max-turns-pass-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [{ input: 'continue' }],
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'never' }],
          maxTurns: 2,
          onMaxTurnsReached: 'pass', // Sometimes it's OK to not find answer
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.passed).toBe(true)
    })

    it('should fail when termination passes but judge fails', async () => {
      const agent = createMockAgent<string, { result: string }>({
        response: { result: 'done' },
      })
      const judge = createMockJudge({ score: 50, passed: false }) // Judge fails

      const testCase: MultiTurnTestCase<string, { result: string }> = {
        id: 'judge-fail-test',
        input: 'start',
        multiTurn: {
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'result' }],
          onConditionMet: 'pass',
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      // Termination condition met (onConditionMet=pass) but judge failed
      expect(result.passed).toBe(false)
      expect(result.overallScore).toBe(50)
    })
  })

  describe('dynamic follow-up inputs', () => {
    it('should resolve dynamic input functions with conversation context', async () => {
      const agent = createMockAgent<{ message: string }, { reply: string }>({
        executeFn: async (input) => {
          if (input.message === 'clarify: Hello') {
            return { result: { reply: 'Goodbye' } }
          }
          return { result: { reply: 'Hello' } }
        },
      })

      const judge = createMockJudge({ score: 90, passed: true })

      const testCase: MultiTurnTestCase<{ message: string }, { reply: string }> = {
        id: 'dynamic-input-test',
        input: { message: 'Start' },
        multiTurn: {
          followUpInputs: [
            {
              // Dynamic: uses lastOutput.reply
              input: (ctx) => ({
                message: `clarify: ${ctx.lastOutput?.reply}`,
              }),
              description: 'Clarification based on previous reply',
            },
          ],
          terminateWhen: [{ type: 'fieldValue', fieldPath: 'reply', expectedValue: 'Goodbye' }],
          maxTurns: 5,
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.totalTurns).toBe(2)
      expect(result.conversationHistory[1].input).toEqual({ message: 'clarify: Hello' })
      expect(result.passed).toBe(true)
    })

    it('should provide full history in context', async () => {
      const contextSpy = vi.fn()

      const agent = createMockAgent<number, number>({
        executeFn: async (input) => {
          return { result: input * 2 }
        },
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<number, number> = {
        id: 'history-test',
        input: 1,
        multiTurn: {
          followUpInputs: [
            { input: 2 },
            {
              input: (ctx) => {
                contextSpy(ctx)
                return ctx.history.reduce((sum, h) => sum + (h.output ?? 0), 0)
              },
            },
          ],
          terminateWhen: [{ type: 'maxTurns', count: 3 }],
        },
      }

      await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      // Check the context passed to the dynamic function
      expect(contextSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          currentTurn: 3,
          history: expect.arrayContaining([
            expect.objectContaining({ input: 1, output: 2 }),
            expect.objectContaining({ input: 2, output: 4 }),
          ]),
          lastOutput: 4,
        })
      )
    })

    it('should support async dynamic input functions (for aiUser)', async () => {
      const agent = createMockAgent<number, number>({
        executeFn: async (input) => {
          return { result: input * 2 }
        },
      })

      const judge = createMockJudge({ passed: true })

      // Simulate an async input function like aiUser would produce
      const asyncInput = async (ctx: { lastOutput?: number }) => {
        // Simulate async operation (like LLM call)
        await new Promise((resolve) => setTimeout(resolve, 10))
        return (ctx.lastOutput ?? 0) + 100
      }

      const testCase: MultiTurnTestCase<number, number> = {
        id: 'async-input-test',
        description: 'Test async input function support',
        input: 1,
        multiTurn: {
          followUpInputs: [
            { input: asyncInput, description: 'Async input from simulated LLM' },
          ],
          terminateWhen: [{ type: 'maxTurns', count: 2 }],
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.totalTurns).toBe(2)
      // First turn: input=1, output=2
      // Second turn: asyncInput receives lastOutput=2, returns 2+100=102
      expect(result.conversationHistory[0].input).toBe(1)
      expect(result.conversationHistory[0].output).toBe(2)
      expect(result.conversationHistory[1].input).toBe(102) // lastOutput(2) + 100
      expect(result.conversationHistory[1].output).toBe(204) // 102 * 2
    })
  })

  describe('metrics aggregation', () => {
    it('should aggregate token usage across all turns', async () => {
      const agent = createMockAgent<string, { step: number }>({
        executeFn: async () => ({
          result: { step: 1 },
          metadata: { tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } },
        }),
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, { step: number }> = {
        id: 'metrics-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [{ input: 'continue' }, { input: 'end' }],
          terminateWhen: [{ type: 'maxTurns', count: 3 }],
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.totalTurns).toBe(3)
      expect(result.metrics.tokenUsage).toEqual({
        inputTokens: 30, // 10 * 3
        outputTokens: 60, // 20 * 3
        totalTokens: 90, // 30 * 3
      })
    })

    it('should accumulate latency across all turns', async () => {
      const agent = createMockAgent<string, unknown>({
        delay: 10, // 10ms per turn
        response: {},
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, unknown> = {
        id: 'latency-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [{ input: 'continue' }],
          terminateWhen: [{ type: 'maxTurns', count: 2 }],
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      // Should be at least 20ms (10ms * 2 turns)
      expect(result.metrics.latencyMs).toBeGreaterThanOrEqual(20)
    })
  })

  describe('conversation history', () => {
    it('should record all turns with correct turn numbers', async () => {
      let turnNumber = 0

      const agent = createMockAgent<string, { turn: number }>({
        executeFn: async (input) => {
          turnNumber++
          return { result: { turn: turnNumber } }
        },
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, { turn: number }> = {
        id: 'history-recording-test',
        input: 'first',
        multiTurn: {
          followUpInputs: [{ input: 'second' }, { input: 'third' }],
          terminateWhen: [{ type: 'maxTurns', count: 3 }],
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.conversationHistory).toEqual([
        expect.objectContaining({ turn: 1, input: 'first', output: { turn: 1 } }),
        expect.objectContaining({ turn: 2, input: 'second', output: { turn: 2 } }),
        expect.objectContaining({ turn: 3, input: 'third', output: { turn: 3 } }),
      ])
    })
  })

  describe('edge cases', () => {
    it('should handle empty terminateWhen array', async () => {
      const agent = createMockAgent<string, unknown>({
        response: {},
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, unknown> = {
        id: 'empty-conditions-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [{ input: 'continue' }],
          terminateWhen: [],
          maxTurns: 2,
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      // Should run until maxTurns
      expect(result.totalTurns).toBe(2)
    })

    it('should terminate when followUpInputs are exhausted', async () => {
      const agent = createMockAgent<string, Record<string, unknown>>({
        response: {},
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, Record<string, unknown>> = {
        id: 'exhausted-inputs-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [{ input: 'only-one' }],
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'never' }],
          maxTurns: 10,
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      // Should terminate after 2 turns (input + 1 followUp)
      expect(result.totalTurns).toBe(2)
      expect(result.termination.reason).toContain('follow-up inputs')
    })

    it('should use effective maxTurns from condition when lower than safety limit', async () => {
      const agent = createMockAgent<string, unknown>({
        response: {},
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, unknown> = {
        id: 'effective-max-turns-test',
        input: 'start',
        multiTurn: {
          followUpInputs: Array(10).fill({ input: 'continue' }),
          terminateWhen: [
            { type: 'fieldSet', fieldPath: 'never' },
            { type: 'maxTurns', count: 3 }, // Explicit maxTurns in conditions
          ],
          maxTurns: 10, // Safety limit
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      // Should use 3 (from condition) not 10 (safety limit)
      expect(result.totalTurns).toBe(3)
    })

    it('should fail when followUpInputs are exhausted (dynamic mode not implemented)', async () => {
      const agent = createMockAgent<string, Record<string, unknown>>({
        response: {},
      })

      // Even if judge passes, exhausted inputs should fail
      const judge = createMockJudge({ score: 100, passed: true })

      const testCase: MultiTurnTestCase<string, Record<string, unknown>> = {
        id: 'exhausted-inputs-fail-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [{ input: 'only-one' }],
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'never' }],
          maxTurns: 10,
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      // Should terminate after 2 turns (input + 1 followUp)
      expect(result.totalTurns).toBe(2)
      expect(result.termination.reason).toContain('follow-up inputs')
      // IMPORTANT: Exhausted inputs should always fail (dynamic mode not yet implemented)
      expect(result.passed).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should fail when agent.execute throws an error', async () => {
      const agent = createMockAgent<string, unknown>({
        executeFn: async () => {
          throw new Error('Agent execution failed')
        },
      })

      const judge = createMockJudge({ score: 100, passed: true })

      const testCase: MultiTurnTestCase<string, unknown> = {
        id: 'agent-error-test',
        input: 'start',
        multiTurn: {
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'result' }],
          maxTurns: 5,
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.totalTurns).toBe(1)
      expect(result.termination.terminated).toBe(true)
      expect(result.termination.reason).toContain('Agent execution failed')
      // Agent errors should always fail, regardless of judge result
      expect(result.passed).toBe(false)
    })

    it('should record agent error in conversation history with undefined output', async () => {
      const agent = createMockAgent<string, { value: string }>({
        executeFn: async (input) => {
          if (input === 'fail') {
            throw new Error('Deliberate failure')
          }
          return { result: { value: 'success' } }
        },
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, { value: string }> = {
        id: 'agent-error-history-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [{ input: 'fail' }],
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'done' }],
          maxTurns: 5,
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      // First turn succeeds, second turn fails
      expect(result.totalTurns).toBe(2)
      expect(result.conversationHistory[0].output).toEqual({ value: 'success' })
      expect(result.conversationHistory[1].output).toBeUndefined()
      expect(result.passed).toBe(false)
    })
  })

  describe('abort signal', () => {
    it('should throw EvalError when signal is aborted before execution', async () => {
      const agent = createMockAgent<string, unknown>({
        response: {},
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, unknown> = {
        id: 'abort-test',
        input: 'start',
        multiTurn: {
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'result' }],
          maxTurns: 5,
        },
      }

      // Create an already aborted signal
      const controller = new AbortController()
      controller.abort()

      await expect(
        executeMultiTurnTestCase(testCase, {
          agent,
          judge,
          agentDescription: 'Test agent',
        }, { signal: controller.signal })
      ).rejects.toThrow(EvalError)
    })

    it('should throw EvalError with correct code when aborted', async () => {
      const agent = createMockAgent<string, unknown>({
        response: {},
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, unknown> = {
        id: 'abort-code-test',
        input: 'start',
        multiTurn: {
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'result' }],
          maxTurns: 5,
        },
      }

      const controller = new AbortController()
      controller.abort()

      // Use rejects.toMatchObject for declarative error assertion (avoid try-catch)
      await expect(
        executeMultiTurnTestCase(testCase, {
          agent,
          judge,
          agentDescription: 'Test agent',
        }, { signal: controller.signal })
      ).rejects.toMatchObject({
        code: EvalErrorCode.AGENT_EXECUTION_ERROR,
        message: expect.stringContaining('aborted'),
      })
    })
  })

  describe('turns option', () => {
    it('should repeat input for specified number of turns', async () => {
      let callCount = 0
      const inputValues: number[] = []

      const agent = createMockAgent<{ value: number }, { turn: number }>({
        executeFn: async (input) => {
          inputValues.push(input.value)
          return { result: { turn: inputValues.length } }
        },
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<{ value: number }, { turn: number }> = {
        id: 'turns-repeat-test',
        input: { value: 1 }, // Turn 1
        multiTurn: {
          followUpInputs: [
            {
              input: (ctx) => {
                callCount++
                return { value: ctx.currentTurn * 10 }
              },
              turns: 3, // Repeat for turns 2, 3, 4
            },
          ],
          terminateWhen: [{ type: 'maxTurns', count: 5 }],
          maxTurns: 10,
          onConditionMet: 'pass',
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(callCount).toBe(3) // Called for turns 2, 3, 4
      expect(result.totalTurns).toBe(4) // turn 1 + 3 followUps
      expect(inputValues).toEqual([1, 20, 30, 40]) // turn 1: 1, turn 2: 2*10=20, turn 3: 3*10=30, turn 4: 4*10=40
    })

    it('should handle Infinity turns until termination condition', async () => {
      let callCount = 0

      const agent = createMockAgent<number, { done?: boolean }>({
        executeFn: async (input) => {
          // Return done=true on 4th input (turn 4)
          if (input === 4) {
            return { result: { done: true } }
          }
          return { result: { done: false } }
        },
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<number, { done?: boolean }> = {
        id: 'turns-infinity-test',
        input: 1, // Turn 1
        multiTurn: {
          followUpInputs: [
            {
              input: (ctx) => {
                callCount++
                return ctx.currentTurn // Returns current turn number
              },
              turns: Infinity, // Continue until termination
            },
          ],
          terminateWhen: [{ type: 'fieldValue', fieldPath: 'done', expectedValue: true }],
          maxTurns: 10,
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.totalTurns).toBe(4) // Terminates when done=true
      expect(callCount).toBe(3) // Called for turns 2, 3, 4
      expect(result.termination.matchedCondition?.type).toBe('fieldValue')
      expect(result.passed).toBe(true)
    })

    it('should handle Infinity turns respecting maxTurns safety limit', async () => {
      const agent = createMockAgent<number, { pending: boolean }>({
        response: { pending: true },
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<number, { pending: boolean }> = {
        id: 'turns-infinity-max-test',
        input: 0,
        multiTurn: {
          followUpInputs: [
            {
              input: (ctx) => ctx.currentTurn,
              turns: Infinity, // Would run forever...
            },
          ],
          terminateWhen: [{ type: 'fieldSet', fieldPath: 'never' }], // Never met
          maxTurns: 5, // ...but limited by safety
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.totalTurns).toBe(5) // Limited by maxTurns
      expect(result.termination.matchedCondition?.type).toBe('maxTurns')
    })

    it('should mix static inputs with turns option', async () => {
      const inputValues: string[] = []

      const agent = createMockAgent<string, unknown>({
        executeFn: async (input) => {
          inputValues.push(input)
          return { result: {} }
        },
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, unknown> = {
        id: 'turns-mixed-test',
        input: 'start', // Turn 1
        multiTurn: {
          followUpInputs: [
            { input: 'static-a' }, // Turn 2 (default turns: 1)
            { input: (ctx) => `dynamic-${ctx.currentTurn}`, turns: 2 }, // Turns 3, 4
            { input: 'static-b' }, // Turn 5
          ],
          terminateWhen: [{ type: 'maxTurns', count: 6 }],
          maxTurns: 10,
          onConditionMet: 'pass',
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.totalTurns).toBe(5)
      expect(inputValues).toEqual([
        'start',      // Turn 1: initial
        'static-a',   // Turn 2: first followUp (1x)
        'dynamic-3',  // Turn 3: second followUp, first repeat
        'dynamic-4',  // Turn 4: second followUp, second repeat
        'static-b',   // Turn 5: third followUp
      ])
    })

    it('should mix finite turns with Infinity (Infinity covers remaining)', async () => {
      let infinityCallCount = 0

      const agent = createMockAgent<string, { step: number }>({
        executeFn: async () => ({ result: { step: 1 } }),
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, { step: number }> = {
        id: 'turns-mixed-infinity-test',
        input: 'start', // Turn 1
        multiTurn: {
          followUpInputs: [
            { input: 'fixed-1' }, // Turn 2
            { input: 'fixed-2', turns: 2 }, // Turns 3, 4
            {
              input: () => {
                infinityCallCount++
                return 'infinite'
              },
              turns: Infinity, // Turns 5, 6, ...
            },
          ],
          terminateWhen: [{ type: 'maxTurns', count: 7 }],
          maxTurns: 10,
          onConditionMet: 'pass',
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      // Turns: 1(start), 2(fixed-1), 3(fixed-2), 4(fixed-2), 5(inf), 6(inf), 7(maxTurns)
      expect(result.totalTurns).toBe(7)
      expect(infinityCallCount).toBe(3) // Turns 5, 6, 7
    })

    it('should throw error for invalid turns value (zero)', async () => {
      const agent = createMockAgent<string, unknown>({ response: {} })
      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, unknown> = {
        id: 'turns-invalid-zero-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [
            { input: 'value', turns: 0 }, // Invalid: must be >= 1
          ],
          terminateWhen: [{ type: 'maxTurns', count: 5 }],
        },
      }

      await expect(
        executeMultiTurnTestCase(testCase, { agent, judge, agentDescription: 'Test agent' })
      ).rejects.toMatchObject({
        code: EvalErrorCode.INVALID_CONFIG,
        message: expect.stringContaining('turns must be a positive number'),
      })
    })

    it('should throw error for invalid turns value (negative)', async () => {
      const agent = createMockAgent<string, unknown>({ response: {} })
      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, unknown> = {
        id: 'turns-invalid-negative-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [
            { input: 'value', turns: -1 }, // Invalid: negative
          ],
          terminateWhen: [{ type: 'maxTurns', count: 5 }],
        },
      }

      await expect(
        executeMultiTurnTestCase(testCase, { agent, judge, agentDescription: 'Test agent' })
      ).rejects.toMatchObject({
        code: EvalErrorCode.INVALID_CONFIG,
      })
    })

    it('should handle static input repeated with turns', async () => {
      const inputValues: string[] = []

      const agent = createMockAgent<string, unknown>({
        executeFn: async (input) => {
          inputValues.push(input)
          return { result: {} }
        },
      })

      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, unknown> = {
        id: 'turns-static-repeat-test',
        input: 'first',
        multiTurn: {
          followUpInputs: [
            { input: 'repeated', turns: 3 }, // Same static value 3 times
          ],
          terminateWhen: [{ type: 'maxTurns', count: 5 }],
          maxTurns: 10,
          onConditionMet: 'pass',
        },
      }

      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.totalTurns).toBe(4) // 1 initial + 3 repeats
      expect(inputValues).toEqual(['first', 'repeated', 'repeated', 'repeated'])
    })

    it('should throw error when Infinity is not the last item', async () => {
      const agent = createMockAgent<string, unknown>({ response: {} })
      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, unknown> = {
        id: 'turns-infinity-not-last-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [
            { input: 'infinite', turns: Infinity }, // Invalid: not the last item
            { input: 'unreachable' }, // This would never be reached
          ],
          terminateWhen: [{ type: 'maxTurns', count: 5 }],
        },
      }

      await expect(
        executeMultiTurnTestCase(testCase, { agent, judge, agentDescription: 'Test agent' })
      ).rejects.toMatchObject({
        code: EvalErrorCode.INVALID_CONFIG,
        message: expect.stringContaining('must be the last'),
      })
    })

    it('should allow Infinity as the last item', async () => {
      const agent = createMockAgent<string, unknown>({ response: {} })
      const judge = createMockJudge({ passed: true })

      const testCase: MultiTurnTestCase<string, unknown> = {
        id: 'turns-infinity-last-valid-test',
        input: 'start',
        multiTurn: {
          followUpInputs: [
            { input: 'first' },
            { input: 'infinite', turns: Infinity }, // Valid: last item
          ],
          terminateWhen: [{ type: 'maxTurns', count: 3 }],
          onConditionMet: 'pass',
        },
      }

      // Should not throw
      const result = await executeMultiTurnTestCase(testCase, {
        agent,
        judge,
        agentDescription: 'Test agent',
      })

      expect(result.totalTurns).toBe(3)
    })
  })
})
