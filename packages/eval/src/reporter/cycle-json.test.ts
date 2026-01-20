/**
 * Cycle JSON Reporter Tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { saveCycleJson } from './cycle-json'
import type { ImprovementCycleResult } from '@/improvement-cycle/types'

const TEST_OUTPUT_DIR = path.join(__dirname, '../../test-output/cycle-json')

function createMockCycleResult(): ImprovementCycleResult<string, string> {
  return {
    rounds: [
      {
        round: 1,
        completedAt: new Date('2025-01-01T00:00:00Z'),
        report: {
          summary: {
            totalTests: 2,
            passed: 1,
            failed: 1,
            avgScore: 75,
            metrics: { avgLatencyMs: 100, totalTokenUsage: 500, avgInputTokens: 100, avgOutputTokens: 150 },
          },
          results: [],
          suggestions: [],
          generatedAt: new Date('2025-01-01T00:00:00Z'),
          promptVersion: 'v1.0.0',
        },
        suggestionsGenerated: [{ type: 'system_prompt', currentValue: 'old', suggestedValue: 'new' }],
        suggestionsApproved: [{ type: 'system_prompt', currentValue: 'old', suggestedValue: 'new' }],
        promptSnapshot: { system: 'test prompt', userTemplate: '{{input}}' },
        promptVersionAfter: 'v1.0.1',
        cost: { agent: 0.01, judge: 0.005, improver: 0.002, total: 0.017 },
        scoreDelta: 5,
      },
      {
        round: 2,
        completedAt: new Date('2025-01-01T01:00:00Z'),
        report: {
          summary: {
            totalTests: 2,
            passed: 2,
            failed: 0,
            avgScore: 90,
            metrics: { avgLatencyMs: 100, totalTokenUsage: 500, avgInputTokens: 100, avgOutputTokens: 150 },
          },
          results: [],
          suggestions: [],
          generatedAt: new Date('2025-01-01T01:00:00Z'),
          promptVersion: 'v1.0.1',
        },
        suggestionsGenerated: [],
        suggestionsApproved: [],
        promptSnapshot: { system: 'improved prompt', userTemplate: '{{input}}' },
        promptVersionAfter: 'v1.0.1',
        cost: { agent: 0.01, judge: 0.005, improver: 0, total: 0.015 },
        scoreDelta: 15,
      },
    ],
    terminationReason: 'targetScore',
    totalCost: 0.032,
    finalPrompt: () => ({ system: 'final', userTemplate: '{{input}}' }),
  } as unknown as ImprovementCycleResult<string, string>
}

describe('saveCycleJson', () => {
  beforeEach(() => {
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true })
    }
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true })
    }
  })

  describe('auto mode (outputDir + name)', () => {
    it('creates timestamped directory with cycle summary', () => {
      const result = createMockCycleResult()

      const cycleDir = saveCycleJson(result, { outputDir: TEST_OUTPUT_DIR, name: 'test-agent' })

      expect(cycleDir).toMatch(/test-agent-\d+$/)
      expect(existsSync(cycleDir)).toBe(true)
      expect(existsSync(path.join(cycleDir, 'cycle-summary.json'))).toBe(true)
    })

    it('saves structured cycle summary with correct fields', () => {
      const result = createMockCycleResult()

      const cycleDir = saveCycleJson(result, { outputDir: TEST_OUTPUT_DIR, name: 'test-agent' })

      const summary = JSON.parse(readFileSync(path.join(cycleDir, 'cycle-summary.json'), 'utf-8'))
      expect(summary.roundCount).toBe(2)
      expect(summary.terminationReason).toBe('targetScore')
      expect(summary.totalCost).toBe(0.032)
      expect(summary.initialScore).toBe(75)
      expect(summary.finalScore).toBe(90)
      expect(summary.rounds).toHaveLength(2)
      expect(summary.rounds[0].round).toBe(1)
      expect(summary.rounds[0].score).toBe(75)
    })

    it('saves round reports when saveRounds is true', () => {
      const result = createMockCycleResult()

      const cycleDir = saveCycleJson(result, { outputDir: TEST_OUTPUT_DIR, name: 'test-agent', saveRounds: true })

      expect(existsSync(path.join(cycleDir, 'round-1-report.json'))).toBe(true)
      expect(existsSync(path.join(cycleDir, 'round-2-report.json'))).toBe(true)
    })

    it('does not save round reports when saveRounds is false', () => {
      const result = createMockCycleResult()

      const cycleDir = saveCycleJson(result, { outputDir: TEST_OUTPUT_DIR, name: 'test-agent', saveRounds: false })

      expect(existsSync(path.join(cycleDir, 'cycle-summary.json'))).toBe(true)
      expect(existsSync(path.join(cycleDir, 'round-1-report.json'))).toBe(false)
      expect(existsSync(path.join(cycleDir, 'round-2-report.json'))).toBe(false)
    })
  })

  describe('explicit mode (directory)', () => {
    it('uses provided directory directly without timestamp', () => {
      const result = createMockCycleResult()
      const existingDir = path.join(TEST_OUTPUT_DIR, 'my-existing-dir')
      mkdirSync(existingDir, { recursive: true })

      const cycleDir = saveCycleJson(result, { directory: existingDir })

      expect(cycleDir).toBe(existingDir)
      expect(existsSync(path.join(existingDir, 'cycle-summary.json'))).toBe(true)
    })

    it('creates directory if it does not exist', () => {
      const result = createMockCycleResult()
      const newDir = path.join(TEST_OUTPUT_DIR, 'new-dir')

      const cycleDir = saveCycleJson(result, { directory: newDir })

      expect(cycleDir).toBe(newDir)
      expect(existsSync(newDir)).toBe(true)
      expect(existsSync(path.join(newDir, 'cycle-summary.json'))).toBe(true)
    })

    it('saves round reports in explicit directory mode', () => {
      const result = createMockCycleResult()
      const existingDir = path.join(TEST_OUTPUT_DIR, 'with-rounds')

      const cycleDir = saveCycleJson(result, { directory: existingDir, saveRounds: true })

      expect(existsSync(path.join(cycleDir, 'round-1-report.json'))).toBe(true)
      expect(existsSync(path.join(cycleDir, 'round-2-report.json'))).toBe(true)
    })

    it('respects saveRounds: false in explicit mode', () => {
      const result = createMockCycleResult()
      const existingDir = path.join(TEST_OUTPUT_DIR, 'no-rounds')

      const cycleDir = saveCycleJson(result, { directory: existingDir, saveRounds: false })

      expect(existsSync(path.join(cycleDir, 'cycle-summary.json'))).toBe(true)
      expect(existsSync(path.join(cycleDir, 'round-1-report.json'))).toBe(false)
    })
  })

  describe('error handling', () => {
    it('throws when neither directory nor outputDir+name provided', () => {
      const result = createMockCycleResult()

      expect(() => saveCycleJson(result, {})).toThrow(
        'saveCycleJson requires either "directory" or both "outputDir" and "name"',
      )
    })

    it('throws when only outputDir provided without name', () => {
      const result = createMockCycleResult()

      expect(() => saveCycleJson(result, { outputDir: TEST_OUTPUT_DIR })).toThrow(
        'saveCycleJson requires either "directory" or both "outputDir" and "name"',
      )
    })

    it('throws when only name provided without outputDir', () => {
      const result = createMockCycleResult()

      expect(() => saveCycleJson(result, { name: 'test' })).toThrow(
        'saveCycleJson requires either "directory" or both "outputDir" and "name"',
      )
    })
  })
})
