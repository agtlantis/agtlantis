import { existsSync, rmSync } from 'node:fs'
import { beforeEach, afterEach } from 'vitest'

/**
 * Removes a directory if it exists.
 * Useful for cleaning up test output directories.
 */
export function cleanDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true })
  }
}

/**
 * Sets up automatic directory cleanup before and after each test.
 * Call this at the top level of a describe block.
 *
 * @example
 * describe('JsonReporter', () => {
 *   setupCleanDir('./test-output')
 *   // tests...
 * })
 */
export function setupCleanDir(dir: string): void {
  beforeEach(() => cleanDir(dir))
  afterEach(() => cleanDir(dir))
}
