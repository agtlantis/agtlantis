import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { reportToMarkdown, saveReportMarkdown, compareReports } from './markdown'
import type { EvalReport } from './types'

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

// ============================================================================
// Test Helpers
// ============================================================================

function createTestReport<TInput = unknown, TOutput = unknown>(
  overrides: Partial<EvalReport<TInput, TOutput>> = {}
): EvalReport<TInput, TOutput> {
  return {
    summary: {
      totalTests: 3,
      passed: 2,
      failed: 1,
      avgScore: 75,
      metrics: {
        avgLatencyMs: 150,
        totalTokens: 1000,
      },
    },
    results: [
      {
        kind: 'single-turn',
        testCase: { id: 'test-1', input: { query: 'hello' } as TInput },
        output: { answer: 'world' } as TOutput,
        metrics: { latencyMs: 100, tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } },
        verdicts: [
          { criterionId: 'accuracy', score: 90, reasoning: 'Good response', passed: true },
        ],
        overallScore: 90,
        passed: true,
      },
      {
        kind: 'single-turn',
        testCase: { id: 'test-2', input: { query: 'foo' } as TInput, description: 'Test description' },
        output: { answer: 'bar' } as TOutput,
        metrics: { latencyMs: 200, tokenUsage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 } },
        verdicts: [
          { criterionId: 'accuracy', score: 85, reasoning: 'Mostly correct', passed: true },
        ],
        overallScore: 85,
        passed: true,
      },
      {
        kind: 'single-turn',
        testCase: { id: 'test-3', input: { query: 'bad' } as TInput },
        output: { answer: 'wrong' } as TOutput,
        metrics: { latencyMs: 150, tokenUsage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 } },
        verdicts: [
          { criterionId: 'accuracy', score: 40, reasoning: 'Incorrect answer', passed: false },
          { criterionId: 'relevance', score: 60, reasoning: 'Somewhat relevant', passed: false },
        ],
        overallScore: 50,
        passed: false,
      },
    ],
    suggestions: [
      {
        type: 'system_prompt',
        priority: 'high',
        currentValue: 'Be helpful',
        suggestedValue: 'Be helpful and accurate',
        reasoning: 'Need more accuracy',
        expectedImprovement: 'Improve accuracy scores',
      },
      {
        type: 'user_prompt',
        priority: 'low',
        currentValue: 'Answer: {{query}}',
        suggestedValue: 'Please answer: {{query}}',
        reasoning: 'More polite',
        expectedImprovement: 'Better user experience',
      },
    ],
    generatedAt: new Date('2026-01-05T10:00:00Z'),
    promptVersion: '1.0.0',
    ...overrides,
  }
}

// ============================================================================
// reportToMarkdown Tests
// ============================================================================

describe('reportToMarkdown', () => {
  describe('basic structure', () => {
    it('should generate markdown with header and metadata', () => {
      const report = createTestReport()
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('# Evaluation Report')
      expect(markdown).toContain('Generated: 2026-01-05T10:00:00.000Z')
      expect(markdown).toContain('Prompt Version: 1.0.0')
    })

    it('should include summary section with metrics', () => {
      const report = createTestReport()
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('## Summary')
      expect(markdown).toContain('Total Tests | 3')
      expect(markdown).toContain('Passed | 2 (66.7%)')
      expect(markdown).toContain('Failed | 1')
      expect(markdown).toContain('Average Score | 75.0')
      expect(markdown).toContain('Avg Latency | 150ms')
      expect(markdown).toContain('Total Tokens | 1000')
      // Cost is not included by default (requires costSummary to be set)
      expect(markdown).not.toContain('Est. Cost')
    })

    it('should include cost when costSummary is provided', () => {
      const report = createTestReport()
      report.summary.costSummary = { total: 0.01, byComponent: { agent: 0.007, judge: 0.003 } }
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('Est. Cost | $0.0100')
    })
  })

  describe('failed tests section', () => {
    it('should show failed tests expanded', () => {
      const report = createTestReport()
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('## ❌ Failed Tests')
      expect(markdown).toContain('### test-3 (Score: 50.0)')
      expect(markdown).toContain('❌ **accuracy**: 40 - Incorrect answer')
      expect(markdown).toContain('❌ **relevance**: 60 - Somewhat relevant')
    })

    it('should not show failed section when no failures', () => {
      const report = createTestReport()
      report.results = report.results.filter((r) => r.passed)
      report.summary.failed = 0
      const markdown = reportToMarkdown(report)

      expect(markdown).not.toContain('## ❌ Failed Tests')
    })
  })

  describe('passed tests section', () => {
    it('should show passed tests collapsed by default', () => {
      const report = createTestReport()
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('## ✅ Passed Tests')
      expect(markdown).toContain('<details>')
      expect(markdown).toContain('<summary>Click to expand passed tests</summary>')
      expect(markdown).toContain('</details>')
      expect(markdown).toContain('### test-1 (Score: 90.0)')
      expect(markdown).toContain('### test-2 (Score: 85.0)')
    })

    it('should expand passed tests when expandPassedTests is true', () => {
      const report = createTestReport()
      const markdown = reportToMarkdown(report, { expandPassedTests: true })

      expect(markdown).toContain('## ✅ Passed Tests')
      expect(markdown).not.toContain('<details>')
      expect(markdown).not.toContain('<summary>')
      expect(markdown).toContain('### test-1 (Score: 90.0)')
    })

    it('should not show passed section when no passed tests', () => {
      const report = createTestReport()
      report.results = report.results.filter((r) => !r.passed)
      report.summary.passed = 0
      const markdown = reportToMarkdown(report)

      expect(markdown).not.toContain('## ✅ Passed Tests')
    })

    it('should include test description when available', () => {
      const report = createTestReport()
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('> Test description')
    })
  })

  describe('suggestions section', () => {
    it('should show suggestions sorted by priority', () => {
      const report = createTestReport()
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('## 💡 Improvement Suggestions')
      // High priority should come first
      const highIndex = markdown.indexOf('[HIGH]')
      const lowIndex = markdown.indexOf('[LOW]')
      expect(highIndex).toBeLessThan(lowIndex)
    })

    it('should include suggestion details with diff', () => {
      const report = createTestReport()
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('🔴 [HIGH] system_prompt')
      expect(markdown).toContain('**Reasoning:** Need more accuracy')
      expect(markdown).toContain('**Expected Improvement:** Improve accuracy scores')
      expect(markdown).toContain('```diff')
      expect(markdown).toContain('- Be helpful')
      expect(markdown).toContain('+ Be helpful and accurate')
    })

    it('should not show suggestions section when empty', () => {
      const report = createTestReport({ suggestions: [] })
      const markdown = reportToMarkdown(report)

      expect(markdown).not.toContain('## 💡 Improvement Suggestions')
    })

    it('should handle multi-line suggestions in diff', () => {
      const report = createTestReport({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'medium',
            currentValue: 'Line 1\nLine 2',
            suggestedValue: 'New Line 1\nNew Line 2\nNew Line 3',
            reasoning: 'Better structure',
            expectedImprovement: 'Improved clarity',
          },
        ],
      })
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('- Line 1\n- Line 2')
      expect(markdown).toContain('+ New Line 1\n+ New Line 2\n+ New Line 3')
    })

    it('should show correct icon for medium priority suggestions', () => {
      const report = createTestReport({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'medium',
            currentValue: 'old',
            suggestedValue: 'new',
            reasoning: 'improvement',
            expectedImprovement: 'better',
          },
        ],
      })
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('🟡 [MEDIUM] system_prompt')
    })
  })

  describe('output truncation', () => {
    it('should truncate long output by default (200 chars)', () => {
      const report = createTestReport()
      const longOutput = { answer: 'x'.repeat(300) }
      report.results[0].output = longOutput as unknown as typeof report.results[0]['output']
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('...')
      expect(markdown).not.toContain('x'.repeat(300))
    })

    it('should respect custom outputPreviewLength', () => {
      const report = createTestReport()
      const longOutput = { answer: 'x'.repeat(100) }
      report.results[0].output = longOutput as unknown as typeof report.results[0]['output']
      const markdown = reportToMarkdown(report, { outputPreviewLength: 50 })

      expect(markdown).toContain('...')
    })
  })

  describe('raw output option', () => {
    it('should include raw output when includeRawOutput is true', () => {
      const report = createTestReport()
      const markdown = reportToMarkdown(report, { includeRawOutput: true })

      expect(markdown).toContain('<summary>Raw Output</summary>')
    })

    it('should not include raw output by default', () => {
      const report = createTestReport()
      const markdown = reportToMarkdown(report)

      expect(markdown).not.toContain('<summary>Raw Output</summary>')
    })
  })

  describe('edge cases', () => {
    it('should handle test without id', () => {
      const report = createTestReport()
      report.results[0].testCase.id = undefined
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('### unnamed (Score: 90.0)')
    })

    it('should handle empty results', () => {
      const report = createTestReport({
        results: [],
        summary: {
          totalTests: 0,
          passed: 0,
          failed: 0,
          avgScore: 0,
          metrics: { avgLatencyMs: 0, totalTokens: 0 },
        },
      })
      const markdown = reportToMarkdown(report)

      expect(markdown).toContain('# Evaluation Report')
      expect(markdown).toContain('Total Tests | 0')
    })

    it('should handle zero total tests for pass rate calculation', () => {
      const report = createTestReport({
        results: [],
        summary: {
          totalTests: 0,
          passed: 0,
          failed: 0,
          avgScore: 0,
          metrics: { avgLatencyMs: 0, totalTokens: 0 },
        },
      })
      const markdown = reportToMarkdown(report)

      // Should show 0.0% instead of NaN%
      expect(markdown).toContain('Passed | 0 (0.0%)')
      expect(markdown).not.toContain('NaN')
    })

    it('should handle test with empty verdicts array', () => {
      const report = createTestReport()
      report.results[0].verdicts = []
      const markdown = reportToMarkdown(report)

      // Should not crash and should render the test without verdicts section content
      expect(markdown).toContain('### test-1 (Score: 90.0)')
      expect(markdown).toContain('**Verdicts:**')
    })
  })
})

// ============================================================================
// saveReportMarkdown Tests
// ============================================================================

describe('saveReportMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should write markdown to file', async () => {
    const report = createTestReport()
    await saveReportMarkdown(report, './test-report.md')

    expect(writeFile).toHaveBeenCalledWith(
      './test-report.md',
      expect.stringContaining('# Evaluation Report'),
      'utf-8'
    )
  })

  it('should pass options to reportToMarkdown', async () => {
    const report = createTestReport()
    await saveReportMarkdown(report, './test-report.md', { expandPassedTests: true })

    const [[, content]] = (writeFile as ReturnType<typeof vi.fn>).mock.calls
    expect(content).not.toContain('<details>')
  })

  it('should propagate writeFile errors', async () => {
    const mockError = new Error('ENOENT: no such file or directory')
    vi.mocked(writeFile).mockRejectedValueOnce(mockError)

    const report = createTestReport()
    await expect(saveReportMarkdown(report, '/invalid/path/report.md')).rejects.toThrow(
      'ENOENT: no such file or directory'
    )
  })
})

// ============================================================================
// compareReports Tests
// ============================================================================

describe('compareReports', () => {
  describe('score delta', () => {
    it('should calculate positive score delta for improvement', () => {
      const before = createTestReport()
      before.summary.avgScore = 70

      const after = createTestReport()
      after.summary.avgScore = 85

      const comparison = compareReports(before, after)
      expect(comparison.scoreDelta).toBe(15)
    })

    it('should calculate negative score delta for regression', () => {
      const before = createTestReport()
      before.summary.avgScore = 85

      const after = createTestReport()
      after.summary.avgScore = 70

      const comparison = compareReports(before, after)
      expect(comparison.scoreDelta).toBe(-15)
    })

    it('should return zero when scores are equal', () => {
      const before = createTestReport()
      const after = createTestReport()
      before.summary.avgScore = 80
      after.summary.avgScore = 80

      const comparison = compareReports(before, after)
      expect(comparison.scoreDelta).toBe(0)
    })
  })

  describe('pass rate delta', () => {
    it('should calculate pass rate improvement', () => {
      const before = createTestReport()
      before.summary.totalTests = 10
      before.summary.passed = 5 // 50%

      const after = createTestReport()
      after.summary.totalTests = 10
      after.summary.passed = 8 // 80%

      const comparison = compareReports(before, after)
      expect(comparison.passRateDelta).toBeCloseTo(0.3) // 30% improvement
    })

    it('should handle zero total tests', () => {
      const before = createTestReport()
      before.summary.totalTests = 0
      before.summary.passed = 0

      const after = createTestReport()
      after.summary.totalTests = 0
      after.summary.passed = 0

      const comparison = compareReports(before, after)
      expect(comparison.passRateDelta).toBe(0)
    })
  })

  describe('metrics delta', () => {
    it('should calculate latency delta', () => {
      const before = createTestReport()
      before.summary.metrics.avgLatencyMs = 200

      const after = createTestReport()
      after.summary.metrics.avgLatencyMs = 150

      const comparison = compareReports(before, after)
      expect(comparison.metricsDelta.latencyMs).toBe(-50) // 50ms faster
    })

    it('should calculate token usage delta', () => {
      const before = createTestReport()
      before.summary.metrics.totalTokens = 1000

      const after = createTestReport()
      after.summary.metrics.totalTokens = 800

      const comparison = compareReports(before, after)
      expect(comparison.metricsDelta.tokenUsage).toBe(-200) // 200 fewer tokens
    })

  })

  describe('improved tests', () => {
    it('should identify tests that improved', () => {
      const before = createTestReport()
      before.results[0].overallScore = 70
      before.results[1].overallScore = 60

      const after = createTestReport()
      after.results[0].overallScore = 85 // improved
      after.results[1].overallScore = 60 // same

      const comparison = compareReports(before, after)
      expect(comparison.improved).toContain('test-1')
      expect(comparison.improved).not.toContain('test-2')
    })

    it('should return empty array when no improvements', () => {
      const before = createTestReport()
      const after = createTestReport()
      // Same scores
      before.results.forEach((r, i) => (r.overallScore = after.results[i].overallScore))

      const comparison = compareReports(before, after)
      expect(comparison.improved).toEqual([])
    })
  })

  describe('regressed tests', () => {
    it('should identify tests that regressed', () => {
      const before = createTestReport()
      before.results[0].overallScore = 90
      before.results[1].overallScore = 80

      const after = createTestReport()
      after.results[0].overallScore = 70 // regressed
      after.results[1].overallScore = 80 // same

      const comparison = compareReports(before, after)
      expect(comparison.regressed).toContain('test-1')
      expect(comparison.regressed).not.toContain('test-2')
    })

    it('should return empty array when no regressions', () => {
      const before = createTestReport()
      const after = createTestReport()
      // After scores equal or better
      after.results.forEach((r, i) => (r.overallScore = before.results[i].overallScore + 10))

      const comparison = compareReports(before, after)
      expect(comparison.regressed).toEqual([])
    })
  })

  describe('edge cases', () => {
    it('should handle unnamed tests', () => {
      const before = createTestReport()
      before.results[0].testCase.id = undefined

      const after = createTestReport()
      after.results[0].testCase.id = undefined
      after.results[0].overallScore = before.results[0].overallScore + 10

      const comparison = compareReports(before, after)
      expect(comparison.improved).toContain('unnamed')
    })

    it('should ignore new tests (not in before)', () => {
      const before = createTestReport()
      before.results = before.results.slice(0, 2) // Only test-1 and test-2

      const after = createTestReport() // Has test-1, test-2, test-3

      const comparison = compareReports(before, after)
      // test-3 is new, shouldn't be in improved or regressed
      expect(comparison.improved).not.toContain('test-3')
      expect(comparison.regressed).not.toContain('test-3')
    })

    it('should track removed tests (in before but not in after)', () => {
      const before = createTestReport() // Has test-1, test-2, test-3

      const after = createTestReport()
      after.results = after.results.slice(0, 2) // Only test-1 and test-2

      const comparison = compareReports(before, after)
      expect(comparison.removed).toContain('test-3')
      expect(comparison.removed).toHaveLength(1)
    })

    it('should return empty removed array when no tests removed', () => {
      const before = createTestReport()
      const after = createTestReport()

      const comparison = compareReports(before, after)
      expect(comparison.removed).toEqual([])
    })

    it('should handle empty results', () => {
      const before = createTestReport({ results: [] })
      const after = createTestReport({ results: [] })

      const comparison = compareReports(before, after)
      expect(comparison.improved).toEqual([])
      expect(comparison.regressed).toEqual([])
    })

    it('should correctly classify all cases (improved, regressed, same)', () => {
      const before = createTestReport()
      before.results[0].overallScore = 80 // will improve
      before.results[1].overallScore = 80 // will stay same
      before.results[2].overallScore = 80 // will regress

      const after = createTestReport()
      after.results[0].overallScore = 95 // improved
      after.results[1].overallScore = 80 // same
      after.results[2].overallScore = 65 // regressed

      const comparison = compareReports(before, after)
      expect(comparison.improved).toEqual(['test-1'])
      expect(comparison.regressed).toEqual(['test-3'])
    })
  })
})
