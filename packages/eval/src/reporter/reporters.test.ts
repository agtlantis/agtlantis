/**
 * Reporter Classes Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { setupCleanDir } from '@/testing/test-utils'
import { MOCK_LATENCY } from '@/testing/constants'
import path from 'node:path'
import type { EvalReport } from './types'
import type { EvalPricingConfig } from './cost-helpers'
import { JsonReporter } from './json-reporter'
import { MarkdownReporter } from './markdown-reporter'
import { ConsoleReporter } from './console-reporter'
import { CompositeReporter } from './composite-reporter'
import {
  createJsonReporter,
  createMarkdownReporter,
  createConsoleReporter,
  createCompositeReporter,
  createDefaultReporter,
} from './factory'

const TEST_OUTPUT_DIR = path.join(__dirname, '../../test-output/reporters')

function createMockReport(): EvalReport<string, string> {
  return {
    summary: {
      totalTests: 2,
      passed: 1,
      failed: 1,
      avgScore: 75,
      metrics: {
        avgLatencyMs: MOCK_LATENCY.normal,
        totalTokenUsage: 500,
        avgInputTokens: 100,
        avgOutputTokens: 150,
      },
    },
    results: [
      {
        testCase: { id: 'test-1', input: 'hello' },
        output: 'Hello!',
        overallScore: 100,
        passed: true,
        verdicts: [{ criterionId: 'accuracy', score: 100, passed: true, reasoning: 'Correct' }],
        metrics: { latencyMs: 50, tokenUsage: { inputTokens: 50, outputTokens: 75, totalTokens: 125 } },
      },
      {
        testCase: { id: 'test-2', input: 'goodbye' },
        output: 'Bye',
        overallScore: 50,
        passed: false,
        verdicts: [{ criterionId: 'accuracy', score: 50, passed: false, reasoning: 'Incomplete' }],
        metrics: { latencyMs: 150, tokenUsage: { inputTokens: 150, outputTokens: 225, totalTokens: 375 } },
      },
    ],
    suggestions: [],
    generatedAt: new Date('2025-01-01T00:00:00Z'),
    promptVersion: 'v1.0.0',
  } as unknown as EvalReport<string, string>
}

describe('JsonReporter', () => {
  setupCleanDir(TEST_OUTPUT_DIR)

  it('should save report with timestamp by default', () => {
    const reporter = new JsonReporter({ outputDir: TEST_OUTPUT_DIR })
    const report = createMockReport()

    const filepath = reporter.save(report, 'test-report')

    expect(filepath).toMatch(/test-report-\d+\.json$/)
    expect(existsSync(filepath)).toBe(true)

    const saved = JSON.parse(readFileSync(filepath, 'utf-8'))
    expect(saved.summary.totalTests).toBe(2)
    expect(saved.promptVersion).toBe('v1.0.0')
  })

  it('should save report without timestamp when addTimestamp is false', () => {
    const reporter = new JsonReporter({ outputDir: TEST_OUTPUT_DIR, addTimestamp: false })
    const report = createMockReport()

    const filepath = reporter.save(report, 'fixed-name')

    expect(filepath).toBe(path.join(TEST_OUTPUT_DIR, 'fixed-name.json'))
    expect(existsSync(filepath)).toBe(true)
  })

  it('should create output directory if not exists', () => {
    const nestedDir = path.join(TEST_OUTPUT_DIR, 'nested', 'dir')
    const reporter = new JsonReporter({ outputDir: nestedDir })
    const report = createMockReport()

    reporter.save(report, 'test')

    expect(existsSync(nestedDir)).toBe(true)
  })
})

describe('MarkdownReporter', () => {
  setupCleanDir(TEST_OUTPUT_DIR)

  it('should save report as markdown', () => {
    const reporter = new MarkdownReporter({ outputDir: TEST_OUTPUT_DIR })
    const report = createMockReport()

    const filepath = reporter.save(report, 'test-report')

    expect(filepath).toMatch(/test-report-\d+\.md$/)
    expect(existsSync(filepath)).toBe(true)

    const content = readFileSync(filepath, 'utf-8')
    expect(content).toContain('# Evaluation Report')
    expect(content).toContain('v1.0.0')
  })

  it('should save without timestamp when configured', () => {
    const reporter = new MarkdownReporter({ outputDir: TEST_OUTPUT_DIR, addTimestamp: false })
    const report = createMockReport()

    const filepath = reporter.save(report, 'report')

    expect(filepath).toBe(path.join(TEST_OUTPUT_DIR, 'report.md'))
  })
})

describe('ConsoleReporter', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('should not expose save method (log-only reporter)', () => {
    const reporter = new ConsoleReporter()
    // save is optional in Reporter interface, ConsoleReporter doesn't implement it
    expect('save' in reporter).toBe(false)
  })

  it('logs report with summary verbosity', () => {
    const reporter = new ConsoleReporter({ verbosity: 'summary' })
    const report = createMockReport()

    reporter.log(report)

    expect(consoleSpy).toHaveBeenCalled()
    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    expect(output).toContain('2 tests')
    expect(output).toContain('75.0')
  })

  it('logs per-test results with detailed verbosity', () => {
    const reporter = new ConsoleReporter({ verbosity: 'detailed' })
    const report = createMockReport()

    reporter.log(report)

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    expect(output).toContain('test-1')
    expect(output).toContain('test-2')
  })
})

describe('CompositeReporter', () => {
  setupCleanDir(TEST_OUTPUT_DIR)

  it('saves to multiple file reporters', () => {
    const jsonReporter = new JsonReporter({ outputDir: TEST_OUTPUT_DIR, addTimestamp: false })
    const mdReporter = new MarkdownReporter({ outputDir: TEST_OUTPUT_DIR, addTimestamp: false })
    const composite = new CompositeReporter([jsonReporter, mdReporter])
    const report = createMockReport()

    const filepath = composite.save(report, 'combined')

    // Returns first successful path (JSON)
    expect(filepath).toBe(path.join(TEST_OUTPUT_DIR, 'combined.json'))
    // Both files exist
    expect(existsSync(path.join(TEST_OUTPUT_DIR, 'combined.json'))).toBe(true)
    expect(existsSync(path.join(TEST_OUTPUT_DIR, 'combined.md'))).toBe(true)
  })

  it('calls log on all reporters that support it', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const consoleReporter = new ConsoleReporter({ verbosity: 'summary' })
    const composite = new CompositeReporter([consoleReporter])
    const report = createMockReport()

    composite.log(report)

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('skips reporters without save method', () => {
    const jsonReporter = new JsonReporter({ outputDir: TEST_OUTPUT_DIR, addTimestamp: false })
    const consoleReporter = new ConsoleReporter() // no save method
    const composite = new CompositeReporter([consoleReporter, jsonReporter])
    const report = createMockReport()

    // Should not throw, returns JSON path
    const filepath = composite.save(report, 'test')
    expect(filepath).toBe(path.join(TEST_OUTPUT_DIR, 'test.json'))
  })
})

describe('Factory Functions', () => {
  setupCleanDir(TEST_OUTPUT_DIR)

  it('createJsonReporter creates JsonReporter', () => {
    const reporter = createJsonReporter(TEST_OUTPUT_DIR)
    expect(reporter).toBeInstanceOf(JsonReporter)
  })

  it('createMarkdownReporter creates MarkdownReporter', () => {
    const reporter = createMarkdownReporter(TEST_OUTPUT_DIR)
    expect(reporter).toBeInstanceOf(MarkdownReporter)
  })

  it('createConsoleReporter creates ConsoleReporter', () => {
    const reporter = createConsoleReporter()
    expect(reporter).toBeInstanceOf(ConsoleReporter)
  })

  it('createCompositeReporter creates CompositeReporter', () => {
    const reporter = createCompositeReporter([createJsonReporter(TEST_OUTPUT_DIR)])
    expect(reporter).toBeInstanceOf(CompositeReporter)
  })

  it('createDefaultReporter creates JSON + Console combo', () => {
    const reporter = createDefaultReporter(TEST_OUTPUT_DIR)
    expect(reporter).toBeInstanceOf(CompositeReporter)

    const report = createMockReport()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const filepath = reporter.save(report, 'default-test')

    // JSON saved
    expect(filepath).toMatch(/default-test-\d+\.json$/)
    // Console logged
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Pricing Integration Tests
// ─────────────────────────────────────────────────────────────────────────────

const TEST_PRICING_CONFIG: EvalPricingConfig = {
  providerPricing: {
    google: {
      'gemini-2.5-flash': {
        inputPricePerMillion: 1.0,
        outputPricePerMillion: 2.0,
      },
    },
  },
}

describe('Pricing Integration', () => {
  setupCleanDir(TEST_OUTPUT_DIR)

  it('JsonReporter includes costs in output when pricing is provided', () => {
    const reporter = new JsonReporter({
      outputDir: TEST_OUTPUT_DIR,
      pricing: TEST_PRICING_CONFIG,
      addTimestamp: false,
    })
    const filepath = reporter.save(createMockReport(), 'with-costs')
    const saved = JSON.parse(readFileSync(filepath, 'utf-8'))

    // Costs are stored as a separate 'costs' field, not in summary
    expect(saved.costs).toBeDefined()
    expect(saved.costs.total).toBeGreaterThan(0)
  })

  it('ConsoleReporter displays cost with pricing config', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const reporter = new ConsoleReporter({
      verbosity: 'summary',
      pricing: TEST_PRICING_CONFIG,
    })

    reporter.log(createMockReport())

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    expect(output).toMatch(/💰 Cost: \$[\d.]+/)
    consoleSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Edge Case Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  setupCleanDir(TEST_OUTPUT_DIR)

  it('handles empty reports (0 results)', () => {
    const emptyReport = {
      ...createMockReport(),
      results: [],
      summary: {
        ...createMockReport().summary,
        totalTests: 0,
        passed: 0,
        failed: 0,
      },
    }
    const reporter = new JsonReporter({ outputDir: TEST_OUTPUT_DIR })

    expect(() => reporter.save(emptyReport, 'empty')).not.toThrow()
  })

  it('CompositeReporter throws with details when all reporters fail', () => {
    // Create a composite with only console reporters (none support save)
    const composite = new CompositeReporter([new ConsoleReporter()])

    expect(() => composite.save(createMockReport(), 'test')).toThrow(
      /No reporter saved successfully/,
    )
  })

  it('handles special characters in filename', () => {
    const reporter = new JsonReporter({ outputDir: TEST_OUTPUT_DIR, addTimestamp: false })
    const filepath = reporter.save(createMockReport(), 'test-with-special_chars-123')

    expect(existsSync(filepath)).toBe(true)
  })
})
