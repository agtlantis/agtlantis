import { describe, it, expect } from 'vitest'
import { createEvalSuite, type EvalSuiteConfig } from './suite'
import type { EvalAgent, TestCase, Verdict } from './types'
import type { Judge } from '@/judge/types'
import type { Improver, Suggestion } from '@/improver/types'
import {
  createMockAgent,
  createMockJudge,
  createMockImprover,
} from '@/testing/mock-agent'

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
    promptVersion?: string
  } = {}
): EvalAgent<TestInput, TestOutput> {
  const agent = createMockAgent<TestInput, TestOutput>({
    name: 'TestAgent',
    description: 'A test agent for evaluation',
    response: options.response ?? { answer: 'Test response' },
    tokenUsage: options.tokenUsage ?? { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    delay: options.delay,
  })

  // Allow customizing prompt version
  if (options.promptVersion) {
    return {
      ...agent,
      prompt: {
        ...agent.prompt,
        version: options.promptVersion,
      },
    }
  }

  return agent
}

function createTestJudge(
  options: {
    score?: number
    passed?: boolean
    verdicts?: Verdict[]
  } = {}
): Judge {
  return createMockJudge({
    score: options.score ?? 80,
    passed: options.passed ?? true,
    verdicts: options.verdicts ?? [
      { criterionId: 'accuracy', score: 80, reasoning: 'Good accuracy', passed: true },
    ],
  })
}

function createTestImprover(suggestions: Suggestion[] = []): Improver {
  return createMockImprover({ suggestions })
}

function createDefaultConfig(): EvalSuiteConfig<TestInput, TestOutput> {
  return {
    agent: createTestAgent(),
    judge: createTestJudge(),
    agentDescription: 'A test agent for unit testing',
  }
}

function createTestCases(count: number): TestCase<TestInput>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `test-${i + 1}`,
    input: { query: `Query ${i + 1}` },
  }))
}

// ============================================================================
// createEvalSuite Tests
// ============================================================================

describe('createEvalSuite', () => {
  describe('basic execution', () => {
    it('should create a suite and run test cases', async () => {
      const suite = createEvalSuite(createDefaultConfig())
      const testCases = createTestCases(2)

      const report = await suite.run(testCases)

      expect(report.results).toHaveLength(2)
      expect(report.summary.totalTests).toBe(2)
    })

    it('should return correct report structure', async () => {
      const suite = createEvalSuite(createDefaultConfig())
      const testCases = createTestCases(1)

      const report = await suite.run(testCases)

      expect(report).toHaveProperty('summary')
      expect(report).toHaveProperty('results')
      expect(report).toHaveProperty('suggestions')
      expect(report).toHaveProperty('generatedAt')
      expect(report).toHaveProperty('promptVersion')
    })

    it('should use agent prompt version in report', async () => {
      const suite = createEvalSuite({
        ...createDefaultConfig(),
        agent: createTestAgent({ promptVersion: '2.1.0' }),
      })
      const testCases = createTestCases(1)

      const report = await suite.run(testCases)

      expect(report.promptVersion).toBe('2.1.0')
    })

    it('should set generatedAt to current date', async () => {
      const before = new Date()
      const suite = createEvalSuite(createDefaultConfig())
      const testCases = createTestCases(1)

      const report = await suite.run(testCases)

      const after = new Date()
      expect(report.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(report.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })
  })

  describe('summary calculation', () => {
    it('should calculate passed and failed counts correctly', async () => {
      // First test passes, second fails
      let callCount = 0
      const judge: Judge = {
        evaluate: async () => {
          callCount++
          const passed = callCount === 1
          return {
            verdicts: [
              { criterionId: 'accuracy', score: passed ? 80 : 40, reasoning: 'Test', passed },
            ],
            overallScore: passed ? 80 : 40,
            passed,
          }
        },
      }

      const suite = createEvalSuite({
        ...createDefaultConfig(),
        judge,
      })
      const testCases = createTestCases(2)

      const report = await suite.run(testCases)

      expect(report.summary.passed).toBe(1)
      expect(report.summary.failed).toBe(1)
    })

    it('should calculate average score correctly', async () => {
      let callCount = 0
      const judge: Judge = {
        evaluate: async () => {
          callCount++
          const score = callCount === 1 ? 100 : 60
          return {
            verdicts: [{ criterionId: 'accuracy', score, reasoning: 'Test', passed: true }],
            overallScore: score,
            passed: true,
          }
        },
      }

      const suite = createEvalSuite({
        ...createDefaultConfig(),
        judge,
      })
      const testCases = createTestCases(2)

      const report = await suite.run(testCases)

      // (100 + 60) / 2 = 80
      expect(report.summary.avgScore).toBe(80)
    })

    it('should handle all passing tests', async () => {
      const suite = createEvalSuite({
        ...createDefaultConfig(),
        judge: createTestJudge({ score: 90, passed: true }),
      })
      const testCases = createTestCases(3)

      const report = await suite.run(testCases)

      expect(report.summary.passed).toBe(3)
      expect(report.summary.failed).toBe(0)
    })

    it('should handle all failing tests', async () => {
      const suite = createEvalSuite({
        ...createDefaultConfig(),
        judge: createTestJudge({ score: 30, passed: false }),
      })
      const testCases = createTestCases(3)

      const report = await suite.run(testCases)

      expect(report.summary.passed).toBe(0)
      expect(report.summary.failed).toBe(3)
    })
  })

  describe('metrics aggregation', () => {
    it('should calculate average latency', async () => {
      // Each test takes ~50ms
      const suite = createEvalSuite({
        ...createDefaultConfig(),
        agent: createTestAgent({ delay: 50 }),
      })
      const testCases = createTestCases(2)

      const report = await suite.run(testCases)

      // Average should be around 50ms (allow some variance)
      expect(report.summary.metrics.avgLatencyMs).toBeGreaterThan(40)
      expect(report.summary.metrics.avgLatencyMs).toBeLessThan(100)
    })

    it('should calculate total tokens', async () => {
      const suite = createEvalSuite({
        ...createDefaultConfig(),
        agent: createTestAgent({ tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }),
      })
      const testCases = createTestCases(3)

      const report = await suite.run(testCases)

      // 30 tokens per test * 3 tests = 90 total
      expect(report.summary.metrics.totalTokens).toBe(90)
    })

  })

  describe('empty test cases', () => {
    it('should handle empty test case array', async () => {
      const suite = createEvalSuite(createDefaultConfig())

      const report = await suite.run([])

      expect(report.results).toHaveLength(0)
      expect(report.summary.totalTests).toBe(0)
      expect(report.summary.passed).toBe(0)
      expect(report.summary.failed).toBe(0)
      expect(report.summary.avgScore).toBe(0)
      expect(report.summary.metrics.avgLatencyMs).toBe(0)
      expect(report.summary.metrics.totalTokens).toBe(0)
    })
  })

  describe('improver integration', () => {
    it('should return empty suggestions when no improver is provided', async () => {
      const suite = createEvalSuite(createDefaultConfig())
      const testCases = createTestCases(1)

      const report = await suite.run(testCases)

      expect(report.suggestions).toEqual([])
    })

    it('should include suggestions from improver', async () => {
      const suggestions: Suggestion[] = [
        {
          type: 'system_prompt',
          priority: 'high',
          currentValue: 'Old prompt',
          suggestedValue: 'Improved prompt',
          reasoning: 'Better clarity',
          expectedImprovement: 'Higher accuracy',
        },
      ]

      const suite = createEvalSuite({
        ...createDefaultConfig(),
        improver: createTestImprover(suggestions),
      })
      const testCases = createTestCases(1)

      const report = await suite.run(testCases)

      expect(report.suggestions).toEqual(suggestions)
    })

    it('should pass agent prompt and results to improver', async () => {
      let receivedPrompt: unknown
      let receivedResultsCount: number | undefined

      const improver: Improver = {
        improve: async (agentPrompt, results) => {
          receivedPrompt = agentPrompt
          receivedResultsCount = results.length
          return { suggestions: [] }
        },
      }

      const agent = createTestAgent({ promptVersion: '1.5.0' })
      const suite = createEvalSuite({
        agent,
        judge: createTestJudge(),
        improver,
      })
      const testCases = createTestCases(2)

      await suite.run(testCases)

      expect(receivedPrompt).toBe(agent.prompt)
      expect(receivedResultsCount).toBe(2)
    })
  })

  describe('agentDescription handling', () => {
    it('should use provided agentDescription', async () => {
      let receivedDescription: string | undefined

      const judge: Judge = {
        evaluate: async (context) => {
          receivedDescription = context.agentDescription
          return {
            verdicts: [],
            overallScore: 80,
            passed: true,
          }
        },
      }

      const suite = createEvalSuite({
        ...createDefaultConfig(),
        judge,
        agentDescription: 'Custom description for testing',
      })
      const testCases = createTestCases(1)

      await suite.run(testCases)

      expect(receivedDescription).toBe('Custom description for testing')
    })

    it('should use agent description when agentDescription is not provided', async () => {
      let receivedDescription: string | undefined

      const judge: Judge = {
        evaluate: async (context) => {
          receivedDescription = context.agentDescription
          return {
            verdicts: [],
            overallScore: 80,
            passed: true,
          }
        },
      }

      const suite = createEvalSuite({
        agent: createMockAgent({
          name: 'TestAgent',
          description: 'Agent description from config',
        }),
        judge,
      })
      const testCases = createTestCases(1)

      await suite.run(testCases)

      expect(receivedDescription).toBe('Agent description from config')
    })

    it('should fall back to agent name when no description is available', async () => {
      let receivedDescription: string | undefined

      const judge: Judge = {
        evaluate: async (context) => {
          receivedDescription = context.agentDescription
          return {
            verdicts: [],
            overallScore: 80,
            passed: true,
          }
        },
      }

      const agent = createMockAgent({
        name: 'MyTestAgent',
        description: undefined,
      })
      // Remove description from config
      agent.config.description = undefined

      const suite = createEvalSuite({
        agent,
        judge,
      })
      const testCases = createTestCases(1)

      await suite.run(testCases)

      expect(receivedDescription).toBe('MyTestAgent')
    })
  })

  describe('withAgent', () => {
    it('should create a new suite with different agent', async () => {
      const originalAgent = createTestAgent({ response: { answer: 'Original' } })
      const newAgent = createTestAgent({ response: { answer: 'New' } })

      const originalSuite = createEvalSuite({
        ...createDefaultConfig(),
        agent: originalAgent,
      })

      const newSuite = originalSuite.withAgent(newAgent)
      const testCases = createTestCases(1)

      const report = await newSuite.run(testCases)

      expect(report.results[0].output).toEqual({ answer: 'New' })
    })

    it('should not modify the original suite', async () => {
      const originalAgent = createTestAgent({ response: { answer: 'Original' } })
      const newAgent = createTestAgent({ response: { answer: 'New' } })

      const originalSuite = createEvalSuite({
        ...createDefaultConfig(),
        agent: originalAgent,
      })

      originalSuite.withAgent(newAgent)
      const testCases = createTestCases(1)

      // Original suite should still use original agent
      const report = await originalSuite.run(testCases)
      expect(report.results[0].output).toEqual({ answer: 'Original' })
    })

    it('should use new agent description in new suite', async () => {
      let receivedDescription: string | undefined

      const judge: Judge = {
        evaluate: async (context) => {
          receivedDescription = context.agentDescription
          return {
            verdicts: [],
            overallScore: 80,
            passed: true,
          }
        },
      }

      const originalAgent = createMockAgent({
        name: 'OriginalAgent',
        description: 'Original description',
      })
      const newAgent = createMockAgent({
        name: 'NewAgent',
        description: 'New description',
      })

      const originalSuite = createEvalSuite({
        agent: originalAgent,
        judge,
        agentDescription: 'Override description',
      })

      const newSuite = originalSuite.withAgent(newAgent)
      const testCases = createTestCases(1)

      await newSuite.run(testCases)

      // Should use new agent's description, not the original override
      expect(receivedDescription).toBe('New description')
    })
  })

  describe('run options', () => {
    it('should support concurrency option', async () => {
      const executionOrder: number[] = []
      let callCount = 0

      const agent = createMockAgent<TestInput, TestOutput>({
        executeFn: async () => {
          const myIndex = callCount++
          executionOrder.push(myIndex)
          await new Promise((resolve) => setTimeout(resolve, 10))
          return { result: { answer: 'Response' } }
        },
      })

      const suite = createEvalSuite({
        agent,
        judge: createTestJudge(),
      })
      const testCases = createTestCases(3)

      await suite.run(testCases, { concurrency: 3 })

      // With concurrency 3, all should start quickly
      expect(executionOrder).toHaveLength(3)
    })

    it('should support stopOnFirstFailure option', async () => {
      let evaluationCount = 0

      const judge: Judge = {
        evaluate: async () => {
          evaluationCount++
          return {
            verdicts: [],
            overallScore: 0,
            passed: false, // All fail
          }
        },
      }

      const suite = createEvalSuite({
        ...createDefaultConfig(),
        judge,
      })
      const testCases = createTestCases(5)

      const report = await suite.run(testCases, { stopOnFirstFailure: true })

      // Should stop after first failure
      expect(report.results.length).toBeLessThanOrEqual(5)
      // At least one test was evaluated
      expect(evaluationCount).toBeGreaterThanOrEqual(1)
    })

    it('should support abort signal', async () => {
      const abortController = new AbortController()

      const agent = createMockAgent<TestInput, TestOutput>({
        executeFn: async () => {
          // Abort during first execution
          abortController.abort()
          await new Promise((resolve) => setTimeout(resolve, 100))
          return { result: { answer: 'Response' } }
        },
      })

      const suite = createEvalSuite({
        agent,
        judge: createTestJudge(),
      })
      const testCases = createTestCases(3)

      const report = await suite.run(testCases, { signal: abortController.signal })

      // Should be aborted before completing all tests
      expect(report.results.length).toBeLessThan(3)
    })
  })

  describe('iterations', () => {
    it('should behave normally with iterations = 1 (default)', async () => {
      const suite = createEvalSuite(createDefaultConfig())
      const testCases = createTestCases(2)

      const report = await suite.run(testCases, { iterations: 1 })

      // No iteration stats should be present - result is single-turn
      expect(report.summary.iterations).toBeUndefined()
      expect(report.summary.avgStdDev).toBeUndefined()
      expect(report.summary.avgPassRate).toBeUndefined()
      expect(report.results[0].kind).toBe('single-turn')
      expect('iterationStats' in report.results[0]).toBe(false)
      expect('iterationResults' in report.results[0]).toBe(false)
    })

    it('should include iteration stats when iterations > 1', async () => {
      const suite = createEvalSuite(createDefaultConfig())
      const testCases = createTestCases(2)

      const report = await suite.run(testCases, { iterations: 3 })

      // Summary should have iteration stats
      expect(report.summary.iterations).toBe(3)
      expect(report.summary.avgStdDev).toBeDefined()
      expect(report.summary.avgPassRate).toBeDefined()

      // Each result should have iteration stats (single-turn-iterated)
      for (const result of report.results) {
        expect(result.kind).toBe('single-turn-iterated')
        if (result.kind === 'single-turn-iterated') {
          expect(result.iterationStats.iterations).toBe(3)
          expect(result.iterationStats.scores).toHaveLength(3)
          expect(result.iterationResults).toHaveLength(3)
        }
      }
    })

    it('should calculate correct mean and passRate', async () => {
      let callCount = 0
      const scores = [70, 80, 90] // Mean should be 80

      const judge: Judge = {
        evaluate: async () => {
          const score = scores[callCount % scores.length]
          callCount++
          return {
            verdicts: [{ criterionId: 'test', score, reasoning: 'test', passed: score >= 70 }],
            overallScore: score,
            passed: score >= 70,
          }
        },
      }

      const suite = createEvalSuite({
        ...createDefaultConfig(),
        judge,
      })
      const testCases = createTestCases(1)

      const report = await suite.run(testCases, { iterations: 3 })

      const result = report.results[0]
      expect(result.overallScore).toBe(80) // Mean
      expect(result.kind).toBe('single-turn-iterated')
      if (result.kind === 'single-turn-iterated') {
        expect(result.iterationStats.mean).toBe(80)
        expect(result.iterationStats.passRate).toBe(1) // All pass
      }
      expect(result.passed).toBe(true) // passRate >= 0.5
    })

    it('should determine passed based on majority', async () => {
      let callCount = 0
      // 2 fail, 1 pass → passRate = 0.33 → should fail
      const results = [
        { score: 50, passed: false },
        { score: 60, passed: false },
        { score: 80, passed: true },
      ]

      const judge: Judge = {
        evaluate: async () => {
          const result = results[callCount % results.length]
          callCount++
          return {
            verdicts: [],
            overallScore: result.score,
            passed: result.passed,
          }
        },
      }

      const suite = createEvalSuite({
        ...createDefaultConfig(),
        judge,
      })
      const testCases = createTestCases(1)

      const report = await suite.run(testCases, { iterations: 3 })

      const result = report.results[0]
      expect(result.kind).toBe('single-turn-iterated')
      if (result.kind === 'single-turn-iterated') {
        expect(result.iterationStats.passRate).toBeCloseTo(0.333, 2)
      }
      expect(result.passed).toBe(false) // passRate < 0.5
    })

    it('should run with concurrency when iterations > 1', async () => {
      let executionCount = 0

      const agent = createMockAgent<TestInput, TestOutput>({
        executeFn: async () => {
          executionCount++
          return { result: { answer: 'Response' } }
        },
      })

      const suite = createEvalSuite({
        agent,
        judge: createTestJudge(),
      })
      const testCases = createTestCases(2)

      await suite.run(testCases, { iterations: 3, concurrency: 2 })

      // Should have executed 2 test cases × 3 iterations = 6 times
      expect(executionCount).toBe(6)
    })

    it('should throw error for iterations = 0', async () => {
      const suite = createEvalSuite(createDefaultConfig())
      const testCases = createTestCases(1)

      await expect(suite.run(testCases, { iterations: 0 })).rejects.toThrow(
        'Invalid iterations value: 0. Must be a positive integer.'
      )
    })

    it('should throw error for negative iterations', async () => {
      const suite = createEvalSuite(createDefaultConfig())
      const testCases = createTestCases(1)

      await expect(suite.run(testCases, { iterations: -1 })).rejects.toThrow(
        'Invalid iterations value: -1. Must be a positive integer.'
      )
    })

    it('should throw error for non-integer iterations', async () => {
      const suite = createEvalSuite(createDefaultConfig())
      const testCases = createTestCases(1)

      await expect(suite.run(testCases, { iterations: 1.5 })).rejects.toThrow(
        'Invalid iterations value: 1.5. Must be a positive integer.'
      )
    })
  })
})
