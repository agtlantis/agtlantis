/**
 * E2E Test Lifecycle Management
 *
 * Utilities for managing test directories, fixtures, and cleanup.
 * These functions register Vitest hooks (beforeAll, afterAll) to ensure
 * proper setup and teardown of test resources.
 */

import { existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, afterAll } from 'vitest'

import { E2E_CONFIG } from './config'
import { createTimestampedPath } from './paths'

/**
 * Creates a managed test directory with auto-cleanup via Vitest hooks.
 * Must be called at describe scope (not inside it blocks).
 *
 * @example
 * describe('Resume Tests', () => {
 *   const TEST_DIR = createTestDirectory(E2E_PATHS.history)
 *   it('should save history', async () => {
 *     const historyPath = path.join(TEST_DIR, 'test.json')
 *   })
 * })
 */
export function createTestDirectory(dirPath: string): string {
  beforeAll(() => {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
  })

  afterAll(() => {
    try {
      rmSync(dirPath, { recursive: true, force: true })
    } catch (error) {
      if (E2E_CONFIG.verbose) {
        console.debug(`[cleanup] Failed to remove ${dirPath}:`, error)
      }
    }
  })

  return dirPath
}

/**
 * Copies a fixture file to target with auto-cleanup via Vitest hooks.
 * Must be called at describe scope (not inside it blocks).
 *
 * @example
 * describe('Rollback Tests', () => {
 *   const TEST_DIR = createTestDirectory(E2E_PATHS.cli)
 *   const historyPath = withTestFixture(HISTORY_FIXTURE, TEST_DIR, 'rollback-source.json')
 *   it('should rollback', async () => { ... })
 * })
 */
export function withTestFixture(
  sourcePath: string,
  targetDir: string,
  targetName?: string,
): string {
  const fileName = targetName || `${Date.now()}-${path.basename(sourcePath)}`
  const targetPath = path.join(targetDir, fileName)

  beforeAll(() => {
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }
    copyFileSync(sourcePath, targetPath)
  })

  afterAll(() => {
    try {
      rmSync(targetPath, { force: true })
    } catch (error) {
      if (E2E_CONFIG.verbose) {
        console.debug(`[cleanup] Failed to remove ${targetPath}:`, error)
      }
    }
  })

  return targetPath
}

export { createTimestampedPath as createTestPath }
