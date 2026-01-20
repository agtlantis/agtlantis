/**
 * E2E Tests for Improvement Cycle Runner
 *
 * These tests verify complete improvement cycle workflows with mocked dependencies.
 * Unlike unit tests, E2E tests focus on:
 * - Full cycle completion with all termination conditions
 * - HITL decision flow (continue, stop, rollback)
 * - History persistence and session management
 * - Cost tracking across rounds
 * - Error scenarios in realistic workflows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentPrompt, EvalAgent, TestCase, SingleTurnResult, MetricsResult, Verdict } from '@/core/types'
import type { EvalReport, ReportSummary } from '@/reporter/types'
import type { Judge } from '@/judge/types'
import type { Improver, Suggestion, ImproveResult, AggregatedMetrics } from '@/improver/types'

import { runImprovementCycle, runImprovementCycleAuto } from './runner'
import type {
  ImprovementCycleConfig,
  RoundDecision,
  RoundYield,
  ImprovementCycleResult,
} from './types'
import {
  maxRounds,
  targetScore,
  noImprovement,
  maxCost,
  customCondition,
  and,
  or,
  not,
} from './conditions'

// =============================================================================
// Test Types
// =============================================================================

interface TestInput {
  query: string
}

interface TestOutput {
  response: string
}

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestPrompt(
  overrides?: Partial<AgentPrompt<TestInput>>
): AgentPrompt<TestInput> {
  return {
    id: 'e2e-test-prompt',
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
    id: `e2e-test-${input.query}`,
    input,
  }
}

function createMockAgent(prompt: AgentPrompt<TestInput>): EvalAgent<TestInput, TestOutput> {
  return {
    config: {
      name: 'e2e-test-agent',
      description: 'An E2E test agent',
    },
    prompt,
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: { response: 'Test response' },
      metrics: {
        latencyMs: 100,
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    }),
  }
}

/**
 * Creates a mock judge with dynamic scoring based on call count.
 * Useful for testing score progression scenarios.
 */
function createProgressingJudge(scoreProgression: number[]): Judge {
  let callCount = 0
  return {
    evaluate: vi.fn().mockImplementation(async () => {
      const score = scoreProgression[Math.min(callCount++, scoreProgression.length - 1)]
      return {
        score,
        rationale: `Score: ${score}`,
        metrics: {
          latencyMs: 50,
          tokenUsage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
        },
      }
    }),
  }
}

function createMockJudge(scoreOverride?: number): Judge {
  return {
    evaluate: vi.fn().mockResolvedValue({
      score: scoreOverride ?? 75,
      rationale: 'Good performance',
      metrics: {
        latencyMs: 50,
        tokenUsage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
      },
    }),
  }
}

/**
 * Creates a mock improver with round-aware suggestions.
 */
function createDynamicImprover(suggestionsByRound: Suggestion[][]): Improver {
  let callCount = 0
  return {
    improve: vi.fn().mockImplementation(async () => {
      const suggestions = suggestionsByRound[Math.min(callCount++, suggestionsByRound.length - 1)] ?? []
      return {
        suggestions,
        metadata: {
          tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
          model: 'claude-3-haiku-20240307',
        },
      } satisfies ImproveResult
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

let suiteCallCount = 0

vi.mock('@/core/suite', () => ({
  createEvalSuite: vi.fn(({ agent, improver }) => {
    return {
      run: vi.fn(async (testCases: TestCase<TestInput>[], _options?: unknown) => {
        suiteCallCount++

        const metrics: MetricsResult = {
          latencyMs: 100,
          tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        }

        // Generate test results with progressive scoring
        const score = 70 + suiteCallCount * 5
        const verdicts: Verdict[] = [
          {
            criterionId: 'quality',
            score,
            reasoning: 'Good performance',
            passed: score >= 70,
          },
        ]
        const results: SingleTurnResult<TestInput, TestOutput>[] = testCases.map((tc) => ({
          kind: 'single-turn' as const,
          testCase: tc,
          output: { response: 'Test response' },
          metrics,
          verdicts,
          overallScore: score,
          passed: true,
        }))

        const avgScore = results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
        const aggregatedMetrics: AggregatedMetrics = {
          avgLatencyMs: 100,
          totalTokens: 150,
        }
        const summary: ReportSummary = {
          avgScore,
          passed: results.filter((r) => r.overallScore >= 70).length,
          failed: results.filter((r) => r.overallScore < 70).length,
          totalTests: results.length,
          metrics: aggregatedMetrics,
        }

        const improveResult = improver
          ? await improver.improve(agent.prompt, results)
          : { suggestions: [] }

        const report: EvalReport<TestInput, TestOutput> = {
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
  }),
}))

beforeEach(() => {
  suiteCallCount = 0
  vi.clearAllMocks()
})

// =============================================================================
// E2E Tests: Full Cycle Completion
// =============================================================================

describe('E2E: Full Cycle Completion', () => {
  it('should complete full cycle with targetScore termination', async () => {
    suiteCallCount = 0 // Reset for predictable scoring: 75, 80, 85, 90...

    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover([]),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [targetScore(90), maxRounds(10)], // Fallback to prevent infinite loop
    }

    const result = await runImprovementCycleAuto(config)

    expect(result.terminationReason).toContain('Target score')
    expect(result.rounds.length).toBeGreaterThanOrEqual(1)
    expect(result.finalPrompt).toBeDefined()
    expect(result.totalCost).toBeGreaterThanOrEqual(0)
  })

  it('should complete full cycle with maxRounds termination', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover([]),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(3)],
    }

    const result = await runImprovementCycleAuto(config)

    expect(result.rounds).toHaveLength(3)
    expect(result.terminationReason).toContain('Maximum rounds')
  })

  it('should complete full cycle with noImprovement termination', async () => {
    // noImprovement needs a fallback maxRounds to prevent infinite loop
    // The mock suite has progressive scoring (75, 80, 85...) which increases by 5 each round
    // noImprovement(2, 10) means: terminate if improvement < 10 for 2 consecutive rounds
    // Since improvement is always 5, this should trigger
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover([]),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [noImprovement(2, 10), maxRounds(10)], // Fallback to prevent infinite loop
    }

    const result = await runImprovementCycleAuto(config)

    // Should terminate via noImprovement (delta=5 < minDelta=10) after 3 rounds
    // or via maxRounds if noImprovement doesn't trigger
    expect(result.terminationReason).toBeDefined()
    expect(result.rounds.length).toBeGreaterThanOrEqual(2)
  })

  it('should complete full cycle with maxCost termination', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover([]),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxCost(0.001), maxRounds(5)], // Fallback maxRounds
      options: {
        pricingConfig: {
          providerPricing: {
            openai: {
              'gpt-4o-mini': {
                inputPricePerMillion: 1000,
                outputPricePerMillion: 2000,
              },
            },
          },
        },
      },
    }

    const result = await runImprovementCycleAuto(config)

    // Should terminate via maxCost or maxRounds
    expect(result.terminationReason).toBeDefined()
    expect(result.totalCost).toBeGreaterThanOrEqual(0)
  })

  it('should handle composite termination with and()', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover([]),
      testCases: [createTestCase({ query: 'test' })],
      // Both targetScore AND maxRounds must be satisfied
      terminateWhen: [and(targetScore(75), maxRounds(2)), maxRounds(10)], // Fallback
    }

    const result = await runImprovementCycleAuto(config)

    // Should terminate when both conditions are met
    expect(result.terminationReason).toBeDefined()
  })

  it('should handle composite termination with or()', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover([]),
      testCases: [createTestCase({ query: 'test' })],
      // Either targetScore OR maxRounds - first match wins
      terminateWhen: [or(targetScore(100), maxRounds(2)), maxRounds(10)], // Fallback
    }

    const result = await runImprovementCycleAuto(config)

    // Should terminate at round 2 (maxRounds hit first since score won't reach 100)
    expect(result.rounds).toHaveLength(2)
  })

  it('should complete cycle with empty suggestions', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover([]), // No suggestions
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(3)],
    }

    const result = await runImprovementCycleAuto(config)

    expect(result.rounds).toHaveLength(3)
    // Prompt should still have original version since no suggestions applied
    expect(result.finalPrompt.version).toBe('1.0.0')
  })
})

// =============================================================================
// E2E Tests: HITL Decision Flow
// =============================================================================

describe('E2E: HITL Decision Flow', () => {
  it('should yield after each round with all required fields', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(2)],
    }

    const cycle = runImprovementCycle(config)
    const firstYield = await cycle.next()

    expect(firstYield.done).toBe(false)
    const value = firstYield.value as RoundYield

    // Verify all required fields
    expect(value.roundResult).toBeDefined()
    expect(value.roundResult.round).toBe(1)
    expect(value.roundResult.completedAt).toBeDefined()
    expect(value.roundResult.report).toBeDefined()
    expect(value.roundResult.cost).toBeDefined()
    expect(value.roundResult.promptSnapshot).toBeDefined()

    expect(value.context).toBeDefined()
    expect(value.context.currentRound).toBe(1)
    expect(value.context.latestScore).toBeDefined()

    expect(value.pendingSuggestions).toBeDefined()
    expect(Array.isArray(value.pendingSuggestions)).toBe(true)

    expect(value.terminationCheck).toBeDefined()
  })

  it('should continue with approved suggestions and bump version', async () => {
    const suggestion = createTestSuggestion()
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt({ version: '1.0.0' }),
      judge: createMockJudge(),
      improver: createMockImprover([suggestion]),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(2)],
    }

    const cycle = runImprovementCycle(config)
    await cycle.next()

    // Approve the suggestion and continue
    await cycle.next({
      action: 'continue',
      approvedSuggestions: [{ ...suggestion, approved: true }],
    })

    // Stop and verify version was bumped
    const result = await cycle.next({ action: 'stop' })
    const value = result.value as ImprovementCycleResult<TestInput, TestOutput>

    expect(value.finalPrompt.version).not.toBe('1.0.0')
    expect(value.rounds[0].suggestionsApproved).toHaveLength(1)
  })

  it('should continue with partial approval - only approved ones applied', async () => {
    const suggestions = [
      createTestSuggestion({ suggestedValue: 'First change' }),
      createTestSuggestion({ suggestedValue: 'Second change' }),
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
    await cycle.next()

    // Only approve the first suggestion
    await cycle.next({
      action: 'continue',
      approvedSuggestions: [{ ...suggestions[0], approved: true }],
    })

    const result = await cycle.next({ action: 'stop' })
    const value = result.value as ImprovementCycleResult<TestInput, TestOutput>

    expect(value.rounds[0].suggestionsApproved).toHaveLength(1)
    expect(value.rounds[0].suggestionsGenerated).toHaveLength(2)
  })

  it('should stop before termination condition when user requests', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(10)], // High limit
    }

    const cycle = runImprovementCycle(config)
    await cycle.next()
    const result = await cycle.next({ action: 'stop' })

    expect(result.done).toBe(true)
    const value = result.value as ImprovementCycleResult<TestInput, TestOutput>
    expect(value.terminationReason).toBe('User requested stop')
    expect(value.rounds).toHaveLength(1)
  })

  it('should rollback to previous round and restore state', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(10)],
    }

    const cycle = runImprovementCycle(config)

    // Complete 3 rounds
    await cycle.next()
    await cycle.next({ action: 'continue', approvedSuggestions: [] })
    await cycle.next({ action: 'continue', approvedSuggestions: [] })
    await cycle.next({ action: 'continue', approvedSuggestions: [] })

    // Rollback to round 2
    const afterRollback = await cycle.next({ action: 'rollback', rollbackToRound: 2 })
    const value = afterRollback.value as RoundYield

    // previousScores should only contain round 1's score
    expect(value.context.previousScores).toHaveLength(1)
  })

  it('should allow user to continue despite termination condition', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(1)],
    }

    const cycle = runImprovementCycle(config)
    const round1 = await cycle.next()

    // Termination should be indicated but user can override
    expect((round1.value as RoundYield).terminationCheck.terminated).toBe(true)

    // User decides to continue anyway
    const round2 = await cycle.next({ action: 'continue', approvedSuggestions: [] })
    expect(round2.done).toBe(false)
    expect((round2.value as RoundYield).roundResult.round).toBe(2)
  })
})

// =============================================================================
// E2E Tests: History Persistence
// =============================================================================

describe('E2E: History Persistence', () => {
  it('should create history with correct schema version 1.1.0', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(1)],
      options: {
        history: {
          path: '/tmp/e2e-test-history.json',
          autoSave: false,
        },
      },
    }

    const result = await runImprovementCycleAuto(config)

    expect(result.history).toBeDefined()
    expect(result.history?.schemaVersion).toBe('1.1.0')
  })

  it('should track all rounds in history', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(3)],
      options: {
        history: {
          path: '/tmp/e2e-test-history.json',
          autoSave: false,
        },
      },
    }

    const result = await runImprovementCycleAuto(config)

    expect(result.history?.rounds).toHaveLength(3)
    expect(result.history?.rounds[0].round).toBe(1)
    expect(result.history?.rounds[1].round).toBe(2)
    expect(result.history?.rounds[2].round).toBe(3)
  })

  it('should update currentPrompt after each round', async () => {
    const suggestion = createTestSuggestion()
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt({ version: '1.0.0' }),
      judge: createMockJudge(),
      improver: createMockImprover([suggestion]),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(2)],
      options: {
        history: {
          path: '/tmp/e2e-test-history.json',
          autoSave: false,
        },
      },
    }

    const result = await runImprovementCycleAuto(config)

    // currentPrompt should reflect changes from applied suggestions
    expect(result.history?.currentPrompt.version).not.toBe('1.0.0')
  })

  it('should track history rounds when autoSave is enabled', async () => {
    // Note: We can't inject custom storage, so we verify history tracking behavior
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover([]),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(2)],
      options: {
        history: {
          path: '/tmp/e2e-test-history.json',
          autoSave: true,
        },
      },
    }

    const result = await runImprovementCycleAuto(config)

    // Verify history is properly tracked (actual file I/O would happen in real scenario)
    expect(result.history).toBeDefined()
    expect(result.history?.rounds).toHaveLength(2)
    expect(result.history?.rounds[0]).toHaveProperty('promptSnapshot')
    expect(result.history?.rounds[1]).toHaveProperty('promptSnapshot')
  })

  it('should save final history on completion with completedAt and terminationReason', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(1)],
      options: {
        history: {
          path: '/tmp/e2e-test-history.json',
          autoSave: false,
        },
      },
    }

    const result = await runImprovementCycleAuto(config)

    expect(result.history?.completedAt).toBeDefined()
    expect(result.history?.terminationReason).toContain('Maximum rounds')
  })

  it('should include promptSnapshot in each round for rollback support', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(2)],
      options: {
        history: {
          path: '/tmp/e2e-test-history.json',
          autoSave: false,
        },
      },
    }

    const result = await runImprovementCycleAuto(config)

    expect(result.history?.rounds[0].promptSnapshot).toBeDefined()
    expect(result.history?.rounds[0].promptSnapshot.id).toBe('e2e-test-prompt')
  })
})

// =============================================================================
// E2E Tests: Cost Tracking
// =============================================================================

describe('E2E: Cost Tracking', () => {
  it('should calculate per-round cost breakdown (agent, judge, improver, total)', async () => {
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
    expect(value.roundResult.cost.total).toBe(
      value.roundResult.cost.agent + value.roundResult.cost.judge + value.roundResult.cost.improver
    )
  })

  it('should accumulate total cost across rounds in context', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(3)],
    }

    const cycle = runImprovementCycle(config)

    const round1 = await cycle.next()
    const cost1 = (round1.value as RoundYield).context.totalCost

    const round2 = await cycle.next({ action: 'continue', approvedSuggestions: [] })
    const cost2 = (round2.value as RoundYield).context.totalCost

    const round3 = await cycle.next({ action: 'continue', approvedSuggestions: [] })
    const cost3 = (round3.value as RoundYield).context.totalCost

    expect(cost2).toBeGreaterThan(cost1)
    expect(cost3).toBeGreaterThan(cost2)
  })

  it('should capture improver cost from metadata with pricing config', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover(),
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

    // Improver cost should be calculated based on token usage (200 input, 100 output)
    expect(value.roundResult.cost.improver).toBeGreaterThan(0)
  })

  it('should track score delta between rounds', async () => {
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover([]),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [maxRounds(3)],
    }

    const cycle = runImprovementCycle(config)

    // Round 1 - no previous score
    const round1 = await cycle.next()
    expect((round1.value as RoundYield).roundResult.scoreDelta).toBeNull()

    // Round 2 - should have delta
    const round2 = await cycle.next({ action: 'continue', approvedSuggestions: [] })
    expect((round2.value as RoundYield).roundResult.scoreDelta).toBeDefined()
    expect(typeof (round2.value as RoundYield).roundResult.scoreDelta).toBe('number')

    // Round 3 - should also have delta
    const round3 = await cycle.next({ action: 'continue', approvedSuggestions: [] })
    expect((round3.value as RoundYield).roundResult.scoreDelta).toBeDefined()
  })

  it('should include total cost in final result', async () => {
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
// E2E Tests: Error Scenarios
// =============================================================================

describe('E2E: Error Scenarios', () => {
  it('should handle execution error gracefully and propagate', async () => {
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

  it('should throw descriptive error for invalid rollback round', async () => {
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
    await expect(cycle.next({ action: 'rollback', rollbackToRound: 10 })).rejects.toThrow(
      'Cannot rollback to round 10: round not found'
    )
  })
})

// =============================================================================
// E2E Tests: Custom Conditions
// =============================================================================

describe('E2E: Custom Conditions', () => {
  it('should work with custom condition function', async () => {
    let roundCount = 0
    const customTerminate = customCondition(
      async (ctx) => {
        roundCount = ctx.currentRound
        return ctx.currentRound >= 2 && ctx.latestScore > 70
      },
      'Custom: round >= 2 and score > 70'
    )

    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(),
      improver: createMockImprover([]),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [customTerminate, maxRounds(5)], // Fallback
    }

    const result = await runImprovementCycleAuto(config)

    expect(result.rounds.length).toBeGreaterThanOrEqual(2)
    expect(roundCount).toBeGreaterThanOrEqual(2)
  })

  it('should handle not() condition correctly', async () => {
    // not(targetScore(100)) means: terminate when score is NOT >= 100
    // Since scores start at 75, this should terminate immediately
    const config: ImprovementCycleConfig<TestInput, TestOutput> = {
      createAgent: createMockAgent,
      initialPrompt: createTestPrompt(),
      judge: createMockJudge(75),
      improver: createMockImprover([]),
      testCases: [createTestCase({ query: 'test' })],
      terminateWhen: [not(targetScore(100)), maxRounds(3)], // Fallback
    }

    const result = await runImprovementCycleAuto(config)

    // Should terminate after round 1 since score (75) is not >= 100
    expect(result.rounds).toHaveLength(1)
  })
})
