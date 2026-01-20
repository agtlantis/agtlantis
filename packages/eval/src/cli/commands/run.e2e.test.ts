/**
 * CLI E2E Tests
 *
 * These tests run the CLI as a subprocess to verify the complete flow
 * from config loading to test execution to report generation.
 *
 * Uses --mock flag to avoid real LLM API calls.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { execa, type ExecaError } from 'execa'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Get the directory of this file
const __dirname = dirname(fileURLToPath(import.meta.url))

// Path to CLI entry point (TypeScript source, run with tsx)
const CLI_PATH = join(__dirname, '../index.ts')

// Path to fixtures directory
const FIXTURES_DIR = join(__dirname, '../__fixtures__')

/**
 * Helper to run CLI with tsx (TypeScript runner)
 */
async function runCLI(args: string[], options: { reject?: boolean } = {}) {
  const { reject = true } = options

  try {
    const result = await execa('npx', ['tsx', CLI_PATH, ...args], {
      cwd: FIXTURES_DIR,
      reject,
      // Combine stdout and stderr for easier debugging
      all: true,
    })
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      all: result.all ?? '',
    }
  } catch (error) {
    // If reject is false and we still get an error, it's a real error
    const execaError = error as ExecaError
    if ('exitCode' in execaError) {
      return {
        exitCode: execaError.exitCode ?? 1,
        stdout: execaError.stdout ?? '',
        stderr: execaError.stderr ?? '',
        all: (execaError as { all?: string }).all ?? '',
      }
    }
    throw error
  }
}

describe('CLI E2E Tests', () => {
  describe('--mock mode with inline testCases', () => {
    it('should execute with --mock and exit 0 on success', async () => {
      const result = await runCLI([
        'run',
        join(FIXTURES_DIR, 'agent-eval.config.ts'),
        '--mock',
        '--no-report',
      ])

      expect(result.exitCode).toBe(0)
      expect(result.all).toContain('Using mock Provider')
      expect(result.all).toContain('Passed')
    })

    it('should run multiple test cases', async () => {
      const result = await runCLI([
        'run',
        join(FIXTURES_DIR, 'agent-eval.config.ts'),
        '--mock',
        '--no-report',
      ])

      expect(result.exitCode).toBe(0)
      // Config has 2 test cases
      expect(result.all).toContain('2')
    })
  })

  describe('YAML discovery', () => {
    it('should discover and run YAML test files', async () => {
      const result = await runCLI([
        'run',
        join(FIXTURES_DIR, 'yaml-config.ts'),
        '--mock',
        '--no-report',
      ])

      expect(result.exitCode).toBe(0)
      expect(result.all).toContain('Discovering YAML')
      expect(result.all).toContain('Discovered')
    })

    it('should apply --tags filter correctly', async () => {
      const result = await runCLI([
        'run',
        join(FIXTURES_DIR, 'yaml-config.ts'),
        '--mock',
        '--no-report',
        '--tags',
        'math',
      ])

      // Should succeed but only run tagged tests
      expect(result.exitCode).toBe(0)
    })
  })

  describe('CLI options', () => {
    it('should respect --verbose option', async () => {
      const result = await runCLI([
        'run',
        join(FIXTURES_DIR, 'agent-eval.config.ts'),
        '--mock',
        '--no-report',
        '--verbose',
      ])

      expect(result.exitCode).toBe(0)
      expect(result.all).toContain('Using mock Provider')
    })

    it('should skip report with --no-report', async () => {
      const result = await runCLI([
        'run',
        join(FIXTURES_DIR, 'agent-eval.config.ts'),
        '--mock',
        '--no-report',
      ])

      expect(result.exitCode).toBe(0)
      // Should not contain "Report saved"
      expect(result.all).not.toContain('Report saved to')
    })
  })

  describe('error cases', () => {
    it('should exit 1 when config not found', async () => {
      const result = await runCLI(
        ['run', 'nonexistent.config.ts'],
        { reject: false }
      )

      expect(result.exitCode).toBe(1)
      expect(result.all).toContain('Config file not found')
    })

    it('should show error when agent not in registry', async () => {
      // Create a YAML file that references a non-existent agent
      const result = await runCLI(
        [
          'run',
          join(FIXTURES_DIR, 'yaml-config.ts'),
          '--mock',
          '--no-report',
          '--agent',
          'non-existent-agent',
        ],
        { reject: false }
      )

      expect(result.exitCode).toBe(1)
      expect(result.all).toContain('No YAML files found for agent')
    })
  })
})
