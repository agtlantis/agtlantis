/**
 * Tests for Improvement Cycle Runner
 *
 * Tests cover:
 * - runImprovementCycle AsyncGenerator behavior
 * - runImprovementCycleAuto automatic mode
 * - HITL decision handling (continue, stop, rollback)
 * - Termination condition integration
 * - History persistence integration
 * - Cost calculation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentPrompt, EvalAgent, TestCase, SingleTurnResult, MetricsResult, Verdict } from '@/core/types'
import type { EvalReport, ReportSummary } from '@/reporter/types'
import type { Judge } from '@/judge/types'
import type { Improver, Suggestion, ImproveResult, AggregatedMetrics } from '@/improver/types'

import { runImprovementCycle, runImprovementCycleAuto } from './runner'
import { MOCK_LATENCY, MOCK_TOKEN_USAGE } from '@/testing/constants'
import type {
  ImprovementCycleConfig,
  RoundDecision,
  RoundYield,
  ImprovementCycleResult,
} from './types'
import { maxRounds, targetScore } from './conditions'

// =============================================================================
// Test Fixtures
// =============================================================================

interface TestInput {
  query: string
}

interface TestOutput {
  response: string
}

function createTestPrompt(
  overrides?: Partial<AgentPrompt<TestInput>>
): AgentPrompt<TestInput> {
  return {
    id: 'test-prompt',
    version: '1.0.0',
    system: 'You are a helpful assistant.',
    userTemplate: 'Query: {{query}}',
    buildUserPrompt: (input: TestInput) => `Query: ${input.query}`,
    ...overrides,
  }
}

function createTestSuggestion(overrides?: Partial<Suggestion>): Suggestion {
  return {
    type: 'system_prompt',
    currentValue: 'You are a helpful assistant.',
    suggestedValue: 'You are an expert assistant.',
    priority: 'medium',
    reasoning: 'More specific language improves responses',
    expectedImprovement: 'Better responses',
    approved: false,
    ...overrides,
  }
}

function createTestCase(input: TestInput): TestCase<TestInput> {
  return {
    id: `test-${input.query}`,
    input,
  }
}

function createMockAgent(prompt: AgentPrompt<TestInput>): EvalAgent<TestInput, TestOutput> {
  return {
    config: {
      name: 'test-agent',
      description: 'A test agent',
    },
    prompt,
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: { response: 'Test response' },
      metrics: {
        latencyMs: MOCK_LATENCY.normal,
        tokenUsage: MOCK_TOKEN_USAGE.medium,
      },
    }),
  }
}

function createMockJudge(_scoreOverride?: number): Judge {
  return {
    evaluate: vi.fn().mockResolvedValue({
      score: 75,
      rationale: 'Good performance',
      metrics: {
        latencyMs: MOCK_LATENCY.fast,
        tokenUsage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
      },
    }),
  }
}

function createMockImprover(suggestionsOverride?: Suggestion[]): Improver {
  return {
    improve: vi.fn().mockResolvedValue({
      suggestions: suggestionsOverride ?? [createTestSuggestion()],
      metadata: {
        tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
        model: 'claude-3-haiku-20240307',
      },
    } satisfies ImproveResult),
  }
}

// =============================================================================
// Mock createEvalSuite
// =============================================================================

// Use vi.hoisted to create isolated mock state within a closure
const { mockSuiteFactory, resetSuiteCallCount } = vi.hoisted(() => {
  let suiteCallCount = 0

  const resetSuiteCallCount = () => {
    suiteCallCount = 0
  }

  const mockSuiteFactory = vi.fn(({ agent, improver }: { agent: any; improver: any }) => {
    return {
      run: vi.fn(async (testCases: any[], _options?: unknown) => {
        suiteCallCount++

        const metrics = {
          latencyMs: MOCK_LATENCY.normal,
          tokenUsage: MOCK_TOKEN_USAGE.medium,
        }

        // Generate test results as SingleTurnResult
        const score = 70 + suiteCallCount * 5
        const verdicts = [
          {
            criterionId: 'quality',
            score,
            reasoning: 'Good performance',
            passed: score >= 70,
          },
        ]
        const results = testCases.map((tc) => ({
          kind: 'single-turn' as const,
          testCase: tc,
          output: { response: 'Test response' },
          metrics,
          verdicts,
          overallScore: score,
          passed: true,
        }))

        // Calculate summary
        const avgScore = results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
        const aggregatedMetrics = {
          avgLatencyMs: MOCK_LATENCY.normal,
          totalTokens: MOCK_TOKEN_USAGE.medium.totalTokens,
        }
        const summary = {
          avgScore,
          passed: results.filter((r) => r.overallScore >= 70).length,
          failed: results.filter((r) => r.overallScore < 70).length,
          totalTests: results.length,
          metrics: aggregatedMetrics,
        }

        // Get suggestions from improver
        const improveResult = improver
          ? await improver.improve(agent.prompt, results)
          : { suggestions: [] }

        const report = {
          summary,
          results,
          suggestions: improveResult.suggestions,
          generatedAt: new Date(),
          promptVersion: agent.prompt.version,
        }

        return report
      }),
      withAgent: vi.fn(),
    }
  })

  return {
    mockSuiteFactory,
    resetSuiteCallCount,
  }
})

vi.mock('@/core/suite', () => ({
  createEvalSuite: mockSuiteFactory,
}))

// Reset call count before each test
beforeEach(() => {
  resetSuiteCallCount()
  vi.clearAllMocks()
})

// =============================================================================
// Tests: runImprovementCycle
// =============================================================================

describe('runImprovementCycle', () => {
  describe('basic operation', () => {
    it('should yield RoundYield with result, suggestions, and termination check', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(1)],
      }

      const cycle = runImprovementCycle(config)
      const firstYield = await cycle.next()

      expect(firstYield.done).toBe(false)
      const value = firstYield.value as RoundYield
      expect(value).toHaveProperty('roundResult')
      expect(value).toHaveProperty('pendingSuggestions')
      expect(value).toHaveProperty('terminationCheck')
      expect(value).toHaveProperty('context')
    })

    it('should increment round number on each iteration', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(2)],
      }

      const cycle = runImprovementCycle(config)

      // Round 1
      const first = await cycle.next()
      expect((first.value as RoundYield).roundResult.round).toBe(1)

      // Round 2
      const second = await cycle.next({ action: 'continue', approvedSuggestions: [] })
      expect((second.value as RoundYield).roundResult.round).toBe(2)
    })

    it('should return final result when stopped', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(5)],
      }

      const cycle = runImprovementCycle(config)
      await cycle.next()
      const result = await cycle.next({ action: 'stop' })

      expect(result.done).toBe(true)
      const value = result.value as ImprovementCycleResult<TestInput, TestOutput>
      expect(value).toHaveProperty('rounds')
      expect(value).toHaveProperty('finalPrompt')
      expect(value).toHaveProperty('terminationReason')
      expect(value).toHaveProperty('totalCost')
      expect(value.terminationReason).toBe('User requested stop')
    })
  })

  describe('termination conditions', () => {
    it('should check termination conditions before yield', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(1)],
      }

      const cycle = runImprovementCycle(config)
      const firstYield = await cycle.next()

      // First round should show termination check as true (maxRounds = 1)
      const value = firstYield.value as RoundYield
      expect(value.terminationCheck.terminated).toBe(true)
      expect(value.terminationCheck.reason).toContain('Maximum rounds')
    })

    it('should allow override of termination condition with continue action', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(1)],
      }

      const cycle = runImprovementCycle(config)
      await cycle.next()

      // User decides to continue despite termination
      const secondRound = await cycle.next({ action: 'continue', approvedSuggestions: [] })

      // Should still yield a second round
      expect(secondRound.done).toBe(false)
      expect((secondRound.value as RoundYield).roundResult.round).toBe(2)
    })

    it('should include matched condition info when terminated', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(1)],
      }

      const cycle = runImprovementCycle(config)
      const firstYield = await cycle.next()

      const value = firstYield.value as RoundYield
      expect(value.terminationCheck.terminated).toBe(true)
      if (value.terminationCheck.terminated) {
        expect(value.terminationCheck.matchedCondition).toEqual({
          type: 'maxRounds',
          count: 1,
        })
      }
    })
  })

  describe('suggestion handling', () => {
    it('should mark pending suggestions as not approved', async () => {
      const suggestion = createTestSuggestion({ approved: true })
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover([suggestion]),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(1)],
      }

      const cycle = runImprovementCycle(config)
      const firstYield = await cycle.next()

      // Pending suggestions should be marked as not approved
      const value = firstYield.value as RoundYield
      expect(value.pendingSuggestions[0].approved).toBe(false)
    })

    it('should apply approved suggestions to prompt', async () => {
      const suggestion = createTestSuggestion({
        type: 'system_prompt',
        currentValue: 'You are a helpful assistant.',
        suggestedValue: 'You are an expert assistant.',
      })

      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover([suggestion]),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(2)],
      }

      const cycle = runImprovementCycle(config)
      await cycle.next()

      // Approve the suggestion
      await cycle.next({
        action: 'continue',
        approvedSuggestions: [{ ...suggestion, approved: true }],
      })

      // Stop and get final result
      const result = await cycle.next({ action: 'stop' })

      expect(result.done).toBe(true)
      const value = result.value as ImprovementCycleResult<TestInput, TestOutput>
      // Version should have been bumped
      expect(value.finalPrompt.version).not.toBe('1.0.0')
    })

    it('should track suggestions generated and approved in round result', async () => {
      const suggestions = [
        createTestSuggestion({ suggestedValue: 'Suggestion 1' }),
        createTestSuggestion({ suggestedValue: 'Suggestion 2' }),
      ]

      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(suggestions),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(2)],
      }

      const cycle = runImprovementCycle(config)
      const firstYield = await cycle.next()

      const yieldValue = firstYield.value as RoundYield
      expect(yieldValue.roundResult.suggestionsGenerated).toHaveLength(2)
      expect(yieldValue.roundResult.suggestionsApproved).toHaveLength(0)

      // Approve one suggestion
      const approvedSuggestion = { ...suggestions[0], approved: true }
      await cycle.next({ action: 'continue', approvedSuggestions: [approvedSuggestion] })

      // Stop to get result
      const result = await cycle.next({ action: 'stop' })
      const resultValue = result.value as ImprovementCycleResult<TestInput, TestOutput>

      // First round should have 1 approved suggestion in history
      expect(resultValue.rounds[0].suggestionsApproved).toHaveLength(1)
    })
  })

  describe('rollback', () => {
    it('should rollback to previous round prompt', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(10)],
      }

      const cycle = runImprovementCycle(config)

      // Round 1
      await cycle.next()
      await cycle.next({ action: 'continue', approvedSuggestions: [] })

      // Round 2
      await cycle.next({ action: 'continue', approvedSuggestions: [] })

      // Round 3
      await cycle.next({ action: 'continue', approvedSuggestions: [] })

      // Rollback to round 1 (the round counter continues incrementing after rollback)
      const afterRollback = await cycle.next({ action: 'rollback', rollbackToRound: 1 })

      // Round counter continues (becomes round 5), but uses round 1's prompt state
      expect(afterRollback.done).toBe(false)
      expect((afterRollback.value as RoundYield).roundResult.round).toBe(5)
    })

    it('should throw error for invalid rollback round', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(5)],
      }

      const cycle = runImprovementCycle(config)
      await cycle.next()

      // Try to rollback to non-existent round
      await expect(cycle.next({ action: 'rollback', rollbackToRound: 5 })).rejects.toThrow(
        'Cannot rollback to round 5: round not found'
      )
    })

    it('should clear previousScores when rolling back to round 1', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(10)],
      }

      const cycle = runImprovementCycle(config)

      // Complete rounds 1, 2, 3
      await cycle.next()
      await cycle.next({ action: 'continue', approvedSuggestions: [] })
      await cycle.next({ action: 'continue', approvedSuggestions: [] })
      await cycle.next({ action: 'continue', approvedSuggestions: [] })

      // Rollback to round 1 - should have empty previousScores
      const afterRollback = await cycle.next({ action: 'rollback', rollbackToRound: 1 })

      const value = afterRollback.value as RoundYield
      expect(value.context.previousScores).toEqual([])
    })

    it('should throw error when rollback to round 0', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(5)],
      }

      const cycle = runImprovementCycle(config)
      await cycle.next()

      // Round 0 does not exist (rounds start from 1)
      await expect(cycle.next({ action: 'rollback', rollbackToRound: 0 })).rejects.toThrow(
        'Cannot rollback to round 0: round not found'
      )
    })

    it('should throw error when rollback to negative round', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(5)],
      }

      const cycle = runImprovementCycle(config)
      await cycle.next()

      // Negative rounds are invalid
      await expect(cycle.next({ action: 'rollback', rollbackToRound: -1 })).rejects.toThrow(
        'Cannot rollback to round -1: round not found'
      )
    })

    it('should handle consecutive rollbacks correctly', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(20)],
      }

      const cycle = runImprovementCycle(config)

      // Round 1
      await cycle.next()
      await cycle.next({ action: 'continue', approvedSuggestions: [] })

      // Round 2
      await cycle.next({ action: 'continue', approvedSuggestions: [] })

      // Round 3
      await cycle.next({ action: 'continue', approvedSuggestions: [] })

      // First rollback: to round 2
      const afterFirstRollback = await cycle.next({ action: 'rollback', rollbackToRound: 2 })
      expect((afterFirstRollback.value as RoundYield).context.previousScores).toHaveLength(1)

      // Continue from rollback (round 5 now, using round 2's prompt)
      await cycle.next({ action: 'continue', approvedSuggestions: [] })

      // Second rollback: to round 1
      const afterSecondRollback = await cycle.next({ action: 'rollback', rollbackToRound: 1 })
      expect((afterSecondRollback.value as RoundYield).context.previousScores).toHaveLength(0)
    })
  })

  describe('context tracking', () => {
    it('should track previous scores', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(3)],
      }

      const cycle = runImprovementCycle(config)

      // Round 1
      const round1 = await cycle.next()
      expect((round1.value as RoundYield).context.previousScores).toHaveLength(0)

      // Round 2
      const round2 = await cycle.next({ action: 'continue', approvedSuggestions: [] })
      expect((round2.value as RoundYield).context.previousScores).toHaveLength(1)

      // Round 3
      const round3 = await cycle.next({ action: 'continue', approvedSuggestions: [] })
      expect((round3.value as RoundYield).context.previousScores).toHaveLength(2)
    })

    it('should calculate score delta', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(2)],
      }

      const cycle = runImprovementCycle(config)

      // Round 1 - no previous score
      const round1 = await cycle.next()
      expect((round1.value as RoundYield).roundResult.scoreDelta).toBeNull()

      // Round 2 - should have delta
      const round2 = await cycle.next({ action: 'continue', approvedSuggestions: [] })
      expect((round2.value as RoundYield).roundResult.scoreDelta).toBeDefined()
      expect(typeof (round2.value as RoundYield).roundResult.scoreDelta).toBe('number')
    })

    it('should track total cost', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(2)],
      }

      const cycle = runImprovementCycle(config)

      const round1 = await cycle.next()
      const cost1 = (round1.value as RoundYield).context.totalCost
      expect(cost1).toBeGreaterThanOrEqual(0)

      const round2 = await cycle.next({ action: 'continue', approvedSuggestions: [] })
      const cost2 = (round2.value as RoundYield).context.totalCost
      expect(cost2).toBeGreaterThanOrEqual(cost1)
    })
  })

  describe('cost calculation', () => {
    it('should return cost with agent, judge, improver, and total', async () => {
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(1)],
      }

      const cycle = runImprovementCycle(config)
      const round = await cycle.next()

      const value = round.value as RoundYield
      expect(value.roundResult.cost).toHaveProperty('agent')
      expect(value.roundResult.cost).toHaveProperty('judge')
      expect(value.roundResult.cost).toHaveProperty('improver')
      expect(value.roundResult.cost).toHaveProperty('total')
    })

    it('should capture improver cost from metadata', async () => {
      const mockImprover = createMockImprover()
      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: mockImprover,
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(1)],
        options: {
          pricingConfig: {
            providerPricing: {
              anthropic: {
                'claude-3-haiku-20240307': {
                  inputPricePerMillion: 0.25,
                  outputPricePerMillion: 1.25,
                },
              },
            },
          },
        },
      }

      const cycle = runImprovementCycle(config)
      const round = await cycle.next()

      const value = round.value as RoundYield
      expect(value.roundResult.cost.improver).toBeGreaterThan(0)
      expect(mockImprover.improve).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.any(String) }),
        expect.any(Array)
      )
    })
  })

  describe('error handling', () => {
    it('should complete session and re-throw when error occurs', async () => {
      // Make the mocked createEvalSuite throw an error
      const { createEvalSuite } = await import('@/core/suite')
      vi.mocked(createEvalSuite).mockImplementationOnce(() => ({
        run: vi.fn().mockRejectedValue(new Error('Suite execution failed')),
        withAgent: vi.fn(),
      }))

      const config: ImprovementCycleConfig<TestInput, TestOutput> = {
        createAgent: createMockAgent,
        initialPrompt: createTestPrompt(),
        judge: createMockJudge(),
        improver: createMockImprover(),
        testCases: [createTestCase({ query: 'test' })],
        terminateWhen: [maxRounds(1)],
      }

      const cycle = runImprovementCycle(config)

      await expect(cycle.next()).rejects.toThrow('Suite execution failed')
    })
  })
})

// =============================================================================
// Tests: runImprovementCycleAuto
// =============================================================================

describe('runImprovementCycleAuto', () => {
  it('should run until termination condition is met', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(3)],
    }

    const result = await runImprovementCycleAuto(config)

    expect(result.rounds).toHaveLength(3)
    expect(result.terminationReason).toContain('Maximum rounds')
  })

  it('should auto-approve all suggestions', async () => {
    const suggestions = [
      createTestSuggestion({ suggestedValue: 'First' }),
      createTestSuggestion({ suggestedValue: 'Second' }),
    ]

    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(suggestions),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(2)],
    }

    const result = await runImprovementCycleAuto(config)

    // First round should have approved suggestions
    expect(result.rounds[0].suggestionsApproved).toHaveLength(2)
    expect(result.rounds[0].suggestionsApproved.every((s) => s.approved)).toBe(true)
  })

  it('should return final improved prompt', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt({ version: '1.0.0' }),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(2)],
    }

    const result = await runImprovementCycleAuto(config)

    expect(result.finalPrompt).toBeDefined()
    expect(result.finalPrompt.id).toBe('test-prompt')
    // Version should have been bumped due to suggestions
    expect(result.finalPrompt.version).not.toBe('1.0.0')
  })

  it('should stop on targetScore termination', async () => {
    // Score will be 75, 80, 85, 90, 95...
    // targetScore(90) should trigger at round 4
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover([]), // No suggestions so we can track rounds
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [targetScore(90)],
    }

    const result = await runImprovementCycleAuto(config)

    // Should stop when score reaches 90
    expect(result.terminationReason).toContain('Target score')
  })

  it('should include total cost in result', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(2)],
    }

    const result = await runImprovementCycleAuto(config)

    expect(typeof result.totalCost).toBe('number')
    expect(result.totalCost).toBeGreaterThanOrEqual(0)
  })
})

// =============================================================================
// Tests: History Integration
// =============================================================================

describe('history integration', () => {
  it('should include history in result when config provided', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(1)],
      options: {
        history: {
          path: '/tmp/test-history.json',
          autoSave: false, // Don't actually save
        },
      },
    }

    const result = await runImprovementCycleAuto(config)

    expect(result.history).toBeDefined()
    expect(result.history?.sessionId).toBeDefined()
    expect(result.history?.schemaVersion).toBe('1.1.0')
  })

  it('should track rounds in history', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(2)],
      options: {
        history: {
          path: '/tmp/test-history.json',
          autoSave: false,
        },
      },
    }

    const result = await runImprovementCycleAuto(config)

    expect(result.history?.rounds).toHaveLength(2)
  })
})
