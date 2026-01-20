/**
 * CLI E2E Tests - Tests CLI commands (improve, rollback, resume) as subprocesses.
 *
 * Mock tests run without REAL_E2E. Real tests require REAL_E2E=true and GOOGLE_API_KEY.
 * Note: CLI --mock mode has a limitation where the improver doesn't work correctly
 * (mock LLM returns judge format, not suggestions). Happy-path improve tests require real LLM.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  runCLI,
  createCLIHistoryPath,
  CLI_FIXTURES_DIR,
  E2E_CONFIG,
  E2E_PATHS,
  createTestDirectory,
} from './setup'

const REAL_LLM_ENV = { GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? '' }
const CONFIG_PATH = join(CLI_FIXTURES_DIR, 'improve-config.ts')
const FIXTURES_DIR = join(__dirname, 'fixtures')
const HISTORY_FIXTURE_PATH = join(FIXTURES_DIR, 'history-fixture.json')

describe('CLI E2E Tests', () => {
  const CLI_OUTPUT_DIR = createTestDirectory(E2E_PATHS.cli)

  describe('improve command', () => {
    describe('validation (mock mode)', () => {
      it('should require --history or --resume', async () => {
        const result = await runCLI(
          ['improve', CONFIG_PATH, '--mock', '--max-rounds', '1'],
          { reject: false },
        )

        expect(result.exitCode).toBe(1)
        expect(result.all).toMatch(/--history|--resume/)
      })

      it('should require at least one termination condition', async () => {
        const historyPath = createCLIHistoryPath('no-termination')

        const result = await runCLI(
          ['improve', CONFIG_PATH, '--mock', '--history', historyPath],
          { reject: false },
        )

        expect(result.exitCode).toBe(1)
        expect(result.all).toMatch(
          /termination condition|--target-score|--max-rounds|--max-cost|--stale-rounds/i,
        )
      })
    })

    const hasApiKey = Boolean(process.env.GOOGLE_API_KEY)
    describe.skipIf(!E2E_CONFIG.enabled || !hasApiKey)('real LLM mode', () => {
      it(
        'should run and create history file',
        async () => {
          const historyPath = createCLIHistoryPath('real-improve')

          const result = await runCLI(
            [
              'improve',
              CONFIG_PATH,
              '--history',
              historyPath,
              '--max-rounds',
              '1',
              '--max-cost',
              '0.10',
            ],
            { reject: false, timeout: 120_000, env: REAL_LLM_ENV },
          )

          if (result.exitCode !== 0) {
            console.error('CLI output:', result.all)
          }
          expect(result.exitCode).toBe(0)

          expect(existsSync(historyPath)).toBe(true)
          const history = JSON.parse(readFileSync(historyPath, 'utf-8'))
          expect(history.schemaVersion).toBe('1.1.0')
          expect(history.sessionId).toBeDefined()
          expect(history.rounds.length).toBeGreaterThanOrEqual(1)
          expect(history.totalCost).toBeGreaterThan(0)
        },
        180_000,
      )
    })
  })

  describe('rollback command', () => {
    let testHistoryPath: string

    beforeAll(() => {
      testHistoryPath = join(CLI_OUTPUT_DIR, `rollback-source-${Date.now()}.json`)
      copyFileSync(HISTORY_FIXTURE_PATH, testHistoryPath)
    })

    it('should extract initial prompt with --initial flag', async () => {
      const outputPath = join(CLI_OUTPUT_DIR, `rollback-initial-${Date.now()}.json`)

      const result = await runCLI(
        ['rollback', testHistoryPath, '--initial', '--output', outputPath],
        { reject: false },
      )

      expect(result.exitCode).toBe(0)
      expect(result.all).toContain('initial prompt')

      expect(existsSync(outputPath)).toBe(true)
      const prompt = JSON.parse(readFileSync(outputPath, 'utf-8'))
      expect(prompt.id).toBe('math-solver')
      expect(prompt.version).toBe('1.0.0')
      expect(prompt.system).toBeDefined()
      expect(prompt.userTemplate).toBeDefined()
    })

    it('should extract prompt from round 1', async () => {
      const outputPath = join(CLI_OUTPUT_DIR, `rollback-r1-${Date.now()}.json`)

      const result = await runCLI(
        ['rollback', testHistoryPath, '--round', '1', '--output', outputPath],
        { reject: false },
      )

      expect(result.exitCode).toBe(0)
      expect(result.all).toContain('Prompt extracted')

      expect(existsSync(outputPath)).toBe(true)
      const prompt = JSON.parse(readFileSync(outputPath, 'utf-8'))
      expect(prompt.id).toBe('math-solver')
      expect(prompt.version).toBe('1.0.0') // Round 1's snapshot is the initial version
    })

    it('should extract prompt from round 2 (improved version)', async () => {
      const outputPath = join(CLI_OUTPUT_DIR, `rollback-r2-${Date.now()}.json`)

      const result = await runCLI(
        ['rollback', testHistoryPath, '--round', '2', '--output', outputPath],
        { reject: false },
      )

      expect(result.exitCode).toBe(0)
      expect(existsSync(outputPath)).toBe(true)

      const prompt = JSON.parse(readFileSync(outputPath, 'utf-8'))
      expect(prompt.id).toBe('math-solver')
      expect(prompt.version).toBe('1.1.0') // Round 2's snapshot has improved version
      expect(prompt.system).toContain('precise') // Improved system prompt
    })

    it('should support --format ts with --initial', async () => {
      const outputPath = join(CLI_OUTPUT_DIR, `rollback-ts-${Date.now()}.ts`)

      const result = await runCLI(
        [
          'rollback',
          testHistoryPath,
          '--initial',
          '--output',
          outputPath,
          '--format',
          'ts',
        ],
        { reject: false },
      )

      expect(result.exitCode).toBe(0)
      expect(existsSync(outputPath)).toBe(true)

      const content = readFileSync(outputPath, 'utf-8')
      expect(content).toContain('import')
      expect(content).toContain('export const prompt')
      expect(content).toContain('AgentPrompt')
    })

    it('should fail for invalid round number', async () => {
      const outputPath = join(CLI_OUTPUT_DIR, `rollback-invalid-${Date.now()}.json`)

      const result = await runCLI(
        ['rollback', testHistoryPath, '--round', '999', '--output', outputPath],
        { reject: false },
      )

      expect(result.exitCode).toBe(1)
      expect(result.all).toMatch(/Round 999 not found|Available/i)
    })

    it('should fail for missing history file', async () => {
      const result = await runCLI(
        [
          'rollback',
          '/nonexistent/path/history.json',
          '--initial',
          '--output',
          '/tmp/output.json',
        ],
        { reject: false },
      )

      expect(result.exitCode).toBe(1)
    })

    it('should require --round or --initial', async () => {
      const outputPath = join(CLI_OUTPUT_DIR, `rollback-no-option-${Date.now()}.json`)

      const result = await runCLI(
        ['rollback', testHistoryPath, '--output', outputPath],
        { reject: false },
      )

      expect(result.exitCode).toBe(1)
      expect(result.all).toMatch(/--round.*--initial|--initial.*--round/i)
    })
  })

  describe.skipIf(!E2E_CONFIG.enabled)('resume (via --resume)', () => {
    let sessionHistoryPath: string

    beforeAll(async () => {
      sessionHistoryPath = createCLIHistoryPath('resume-session')

      await runCLI(
        [
          'improve',
          CONFIG_PATH,
          '--history',
          sessionHistoryPath,
          '--max-rounds',
          '1',
          '--max-cost',
          '0.05',
        ],
        { timeout: 120_000, env: REAL_LLM_ENV },
      )
    }, 180_000)

    it(
      'should resume from existing history',
      async () => {
        const originalHistory = JSON.parse(readFileSync(sessionHistoryPath, 'utf-8'))
        const originalRounds = originalHistory.rounds.length
        const originalSessionId = originalHistory.sessionId

        const result = await runCLI(
          [
            'improve',
            CONFIG_PATH,
            '--resume',
            sessionHistoryPath,
            '--max-rounds',
            '1',
            '--max-cost',
            '0.10',
          ],
          { reject: false, timeout: 120_000, env: REAL_LLM_ENV },
        )

        expect(result.exitCode).toBe(0)
        expect(result.all).toMatch(/Resum/i)

        const updatedHistory = JSON.parse(readFileSync(sessionHistoryPath, 'utf-8'))
        expect(updatedHistory.sessionId).toBe(originalSessionId)
        expect(updatedHistory.rounds.length).toBeGreaterThan(originalRounds)
      },
      180_000,
    )

    it(
      'should accumulate cost across resume',
      async () => {
        const originalHistory = JSON.parse(readFileSync(sessionHistoryPath, 'utf-8'))
        const originalCost = originalHistory.totalCost

        await runCLI(
          [
            'improve',
            CONFIG_PATH,
            '--resume',
            sessionHistoryPath,
            '--max-rounds',
            '1',
            '--max-cost',
            '0.15',
          ],
          { reject: false, timeout: 120_000, env: REAL_LLM_ENV },
        )

        const updatedHistory = JSON.parse(readFileSync(sessionHistoryPath, 'utf-8'))
        expect(updatedHistory.totalCost).toBeGreaterThan(originalCost)
      },
      180_000,
    )
  })
})
