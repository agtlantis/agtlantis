import { describe, it, expect } from 'vitest'
import {
  executeTestCase,
  runWithConcurrency,
  type ExecuteContext,
} from './runner'
import type { EvalAgent, TestCase, Verdict } from './types'
import type { Judge } from '@/judge/types'
import { EvalError, EvalErrorCode } from './errors'
import { createMockAgent, createMockJudge } from '@/testing/mock-agent'

// ============================================================================
// Test Types
// ============================================================================

interface TestInput {
  query: string
}

interface TestOutput {
  answer: string
}

// ============================================================================
// Test Helpers
// ============================================================================

function createTestAgent(
  options: {
    response?: TestOutput
    tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }
    delay?: number
    shouldError?: boolean
    errorMessage?: string
  } = {}
): EvalAgent<TestInput, TestOutput> {
  return createMockAgent<TestInput, TestOutput>({
    name: 'TestAgent',
    description: 'A test agent',
    response: options.response ?? { answer: 'Test response' },
    tokenUsage: options.tokenUsage,
    delay: options.delay,
    shouldError: options.shouldError,
    errorMessage: options.errorMessage,
  })
}

function createTestJudge(
  options: {
    score?: number
    passed?: boolean
    verdicts?: Verdict[]
    metadata?: { tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }; model?: string }
    shouldError?: boolean
    errorMessage?: string
  } = {}
): Judge {
  return createMockJudge({
    score: options.score ?? 80,
    passed: options.passed ?? true,
    verdicts: options.verdicts ?? [
      { criterionId: 'accuracy', score: 80, reasoning: 'Good', passed: true },
    ],
    metadata: options.metadata,
    shouldError: options.shouldError,
    errorMessage: options.errorMessage,
  })
}

function createDefaultContext(): ExecuteContext<TestInput, TestOutput> {
  return {
    agent: createTestAgent(),
    judge: createTestJudge(),
    agentDescription: 'A test agent for unit testing',
  }
}

// ============================================================================
// executeTestCase Tests
// ============================================================================

describe('executeTestCase', () => {
  describe('basic execution flow', () => {
    it('should execute agent and return result with verdict', async () => {
      const testCase: TestCase<TestInput> = {
        id: 'test-1',
        input: { query: 'Hello' },
      }
      const context = createDefaultContext()

      const result = await executeTestCase(testCase, context)

      expect(result.testCase).toBe(testCase)
      expect(result.output).toEqual({ answer: 'Test response' })
      expect(result.passed).toBe(true)
      expect(result.overallScore).toBe(80)
      expect(result.verdicts).toHaveLength(1)
    })

    it('should measure latency', async () => {
      const delay = 50
      const agent = createTestAgent({ delay })
      const context = { ...createDefaultContext(), agent }
      const testCase: TestCase<TestInput> = { input: { query: 'Test' } }

      const result = await executeTestCase(testCase, context)

      // Allow some margin for timing
      expect(result.metrics.latencyMs).toBeGreaterThanOrEqual(delay - 10)
    })

    it('should collect token usage from agent metadata', async () => {
      const tokenUsage = { inputTokens: 100, outputTokens: 200, totalTokens: 300 }
      const agent = createTestAgent({ tokenUsage })
      const context = { ...createDefaultContext(), agent }
      const testCase: TestCase<TestInput> = { input: { query: 'Test' } }

      const result = await executeTestCase(testCase, context)

      expect(result.metrics.tokenUsage).toEqual(tokenUsage)
    })

    it('should handle agent without token usage metadata', async () => {
      const agent: EvalAgent<TestInput, TestOutput> = {
        ...createTestAgent(),
        execute: async () => ({
          result: { answer: 'Response' },
          // No metadata
        }),
      }
      const context = { ...createDefaultContext(), agent }
      const testCase: TestCase<TestInput> = { input: { query: 'Test' } }

      const result = await executeTestCase(testCase, context)

      expect(result.metrics.tokenUsage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })
    })

    it('should pass through judge metadata for cost tracking', async () => {
      const judgeMetadata = {
        tokenUsage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
        model: 'gpt-4o',
      }
      const judge = createTestJudge({ metadata: judgeMetadata })
      const context = { ...createDefaultContext(), judge }
      const testCase: TestCase<TestInput> = { input: { query: 'Test' } }

      const result = await executeTestCase(testCase, context)

      expect(result.judgeMetadata).toEqual(judgeMetadata)
    })

    it('should have undefined judgeMetadata when judge returns none', async () => {
      const judge = createTestJudge({}) // No metadata
      const context = { ...createDefaultContext(), judge }
      const testCase: TestCase<TestInput> = { input: { query: 'Test' } }

      const result = await executeTestCase(testCase, context)

      expect(result.judgeMetadata).toBeUndefined()
    })
  })

  describe('agent errors', () => {
    it('should return zero score when agent fails', async () => {
      const agent = createTestAgent({ shouldError: true })
      const context = { ...createDefaultContext(), agent }
      const testCase: TestCase<TestInput> = { id: 'error-test', input: { query: 'Test' } }

      const result = await executeTestCase(testCase, context)

      expect(result.passed).toBe(false)
      expect(result.overallScore).toBe(0)
      expect(result.verdicts).toEqual([])
      expect(result.error).toBeInstanceOf(EvalError)
      expect((result.error as EvalError).code).toBe(EvalErrorCode.AGENT_EXECUTION_ERROR)
    })

    it('should include test case id in error context', async () => {
      const agent = createTestAgent({ shouldError: true })
      const context = { ...createDefaultContext(), agent }
      const testCase: TestCase<TestInput> = { id: 'my-test-id', input: { query: 'Test' } }

      const result = await executeTestCase(testCase, context)

      expect((result.error as EvalError).context?.testCaseId).toBe('my-test-id')
    })
  })

  describe('judge evaluation', () => {
    it('should pass verdicts from judge', async () => {
      const verdicts: Verdict[] = [
        { criterionId: 'accuracy', score: 90, reasoning: 'Excellent', passed: true },
        { criterionId: 'clarity', score: 85, reasoning: 'Very clear', passed: true },
      ]
      const judge = createTestJudge({ verdicts, score: 87.5, passed: true })
      const context = { ...createDefaultContext(), judge }
      const testCase: TestCase<TestInput> = { input: { query: 'Test' } }

      const result = await executeTestCase(testCase, context)

      expect(result.verdicts).toEqual(verdicts)
      expect(result.overallScore).toBe(87.5)
    })

    it('should propagate judge errors', async () => {
      const judge = createTestJudge({ shouldError: true, errorMessage: 'Parse failed' })
      const context = { ...createDefaultContext(), judge }
      const testCase: TestCase<TestInput> = { input: { query: 'Test' } }

      await expect(executeTestCase(testCase, context)).rejects.toThrow('Parse failed')
    })
  })

  describe('abort signal', () => {
    it('should throw when aborted before execution', async () => {
      const context = createDefaultContext()
      const testCase: TestCase<TestInput> = { id: 'abort-test', input: { query: 'Test' } }
      const controller = new AbortController()
      controller.abort()

      await expect(
        executeTestCase(testCase, context, controller.signal)
      ).rejects.toMatchObject({
        code: EvalErrorCode.AGENT_EXECUTION_ERROR,
        context: { testCaseId: 'abort-test', reason: 'aborted' },
      })
    })
  })
})

// ============================================================================
// runWithConcurrency Tests
// ============================================================================

describe('runWithConcurrency', () => {
  describe('basic execution', () => {
    it('should run all test cases and return results', async () => {
      const testCases: TestCase<TestInput>[] = [
        { id: 'test-1', input: { query: 'Q1' } },
        { id: 'test-2', input: { query: 'Q2' } },
        { id: 'test-3', input: { query: 'Q3' } },
      ]
      const context = createDefaultContext()

      const results = await runWithConcurrency(testCases, context)

      expect(results).toHaveLength(3)
      expect(results[0].testCase.id).toBe('test-1')
      expect(results[1].testCase.id).toBe('test-2')
      expect(results[2].testCase.id).toBe('test-3')
    })

    it('should handle empty test cases', async () => {
      const context = createDefaultContext()

      const results = await runWithConcurrency([], context)

      expect(results).toEqual([])
    })

    it('should preserve result order with parallel execution', async () => {
      // Create agents with different delays to test ordering
      const delays = [100, 10, 50] // First takes longest
      const executionOrder: number[] = []

      const testCases = delays.map((_, i) => ({
        id: `test-${i}`,
        input: { query: `Q${i}` },
      }))

      const agent: EvalAgent<TestInput, TestOutput> = {
        ...createMockAgent(),
        execute: async (input) => {
          const index = parseInt(input.query.replace('Q', ''))
          await new Promise(resolve => setTimeout(resolve, delays[index]))
          executionOrder.push(index)
          return { result: { answer: `A${index}` } }
        },
      }

      const context = { ...createDefaultContext(), agent }
      const results = await runWithConcurrency(testCases, context, { concurrency: 3 })

      // Results should be in original order, not execution order
      expect(results[0].testCase.id).toBe('test-0')
      expect(results[1].testCase.id).toBe('test-1')
      expect(results[2].testCase.id).toBe('test-2')
      expect(results[0].output).toEqual({ answer: 'A0' })
      expect(results[1].output).toEqual({ answer: 'A1' })
      expect(results[2].output).toEqual({ answer: 'A2' })
    })
  })

  describe('concurrency control', () => {
    it('should respect concurrency limit', async () => {
      let concurrent = 0
      let maxConcurrent = 0

      const agent: EvalAgent<TestInput, TestOutput> = {
        ...createMockAgent(),
        execute: async () => {
          concurrent++
          maxConcurrent = Math.max(maxConcurrent, concurrent)
          await new Promise(resolve => setTimeout(resolve, 20))
          concurrent--
          return { result: { answer: 'OK' } }
        },
      }

      const testCases = Array.from({ length: 10 }, (_, i) => ({
        id: `test-${i}`,
        input: { query: `Q${i}` },
      }))

      const context = { ...createDefaultContext(), agent }
      await runWithConcurrency(testCases, context, { concurrency: 3 })

      expect(maxConcurrent).toBeLessThanOrEqual(3)
    })

    it('should default to sequential execution (concurrency=1)', async () => {
      let concurrent = 0
      let maxConcurrent = 0

      const agent: EvalAgent<TestInput, TestOutput> = {
        ...createMockAgent(),
        execute: async () => {
          concurrent++
          maxConcurrent = Math.max(maxConcurrent, concurrent)
          await new Promise(resolve => setTimeout(resolve, 10))
          concurrent--
          return { result: { answer: 'OK' } }
        },
      }

      const testCases = Array.from({ length: 5 }, (_, i) => ({
        id: `test-${i}`,
        input: { query: `Q${i}` },
      }))

      const context = { ...createDefaultContext(), agent }
      await runWithConcurrency(testCases, context) // No options = concurrency 1

      expect(maxConcurrent).toBe(1)
    })

    it('should throw error for invalid concurrency value', async () => {
      const context = createDefaultContext()
      const testCases: TestCase<TestInput>[] = [{ input: { query: 'Test' } }]

      await expect(
        runWithConcurrency(testCases, context, { concurrency: 0 })
      ).rejects.toMatchObject({
        code: EvalErrorCode.INVALID_CONFIG,
        context: { concurrency: 0 },
      })
    })
  })

  describe('stopOnFirstFailure', () => {
    it('should stop after first failure when enabled', async () => {
      const executedTests: string[] = []

      const judge: Judge = {
        evaluate: async () => {
          // Make second test fail
          const pass = executedTests.length !== 1
          return {
            verdicts: [{ criterionId: 'test', score: pass ? 80 : 40, reasoning: '', passed: pass }],
            overallScore: pass ? 80 : 40,
            passed: pass,
          }
        },
      }

      const agent: EvalAgent<TestInput, TestOutput> = {
        ...createMockAgent(),
        execute: async (input) => {
          executedTests.push(input.query)
          await new Promise(resolve => setTimeout(resolve, 10))
          return { result: { answer: 'OK' } }
        },
      }

      const testCases = Array.from({ length: 5 }, (_, i) => ({
        id: `test-${i}`,
        input: { query: `Q${i}` },
      }))

      const context = { agent, judge, agentDescription: 'Test' }
      const results = await runWithConcurrency(testCases, context, {
        concurrency: 1,
        stopOnFirstFailure: true,
      })

      // Should have stopped after second test failed
      expect(results.length).toBeLessThan(5)
      expect(results.some(r => !r.passed)).toBe(true)
    })

    it('should continue after failure when disabled (default)', async () => {
      const judge = createTestJudge({ score: 40, passed: false })
      const context = { ...createDefaultContext(), judge }

      const testCases = Array.from({ length: 3 }, (_, i) => ({
        id: `test-${i}`,
        input: { query: `Q${i}` },
      }))

      const results = await runWithConcurrency(testCases, context, {
        stopOnFirstFailure: false,
      })

      // All tests should run even though they fail
      expect(results).toHaveLength(3)
      expect(results.every(r => !r.passed)).toBe(true)
    })
  })

  describe('abort signal', () => {
    it('should stop execution when signal is aborted', async () => {
      const executedTests: string[] = []
      const controller = new AbortController()

      const agent: EvalAgent<TestInput, TestOutput> = {
        ...createMockAgent(),
        execute: async (input) => {
          executedTests.push(input.query)
          if (executedTests.length === 2) {
            controller.abort()
          }
          await new Promise(resolve => setTimeout(resolve, 20))
          return { result: { answer: 'OK' } }
        },
      }

      const testCases = Array.from({ length: 5 }, (_, i) => ({
        id: `test-${i}`,
        input: { query: `Q${i}` },
      }))

      const context = { ...createDefaultContext(), agent }
      const results = await runWithConcurrency(testCases, context, {
        concurrency: 1,
        signal: controller.signal,
      })

      // Should have stopped early
      expect(results.length).toBeLessThan(5)
    })

    it('should not start execution if already aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      const context = createDefaultContext()
      const testCases: TestCase<TestInput>[] = [{ input: { query: 'Test' } }]

      const results = await runWithConcurrency(testCases, context, {
        signal: controller.signal,
      })

      expect(results).toHaveLength(0)
    })
  })

  describe('error handling', () => {
    it('should include failed test results', async () => {
      const agent = createTestAgent({ shouldError: true })
      const context = { ...createDefaultContext(), agent }
      const testCases: TestCase<TestInput>[] = [
        { id: 'test-1', input: { query: 'Q1' } },
      ]

      const results = await runWithConcurrency(testCases, context)

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].error).toBeDefined()
    })
  })
})

// Note: Cost calculation tests moved to src/pricing/report-costs.test.ts (Phase 11)
// Runner no longer calculates costs inline - use addCostsToResults() for post-processing
