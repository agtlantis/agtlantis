/**
 * E2E Test Directory Configuration
 *
 * Centralizes all test output directory paths for easy composition.
 * Override base directory with E2E_REPORT_DIR environment variable.
 */

import path from 'node:path'

const SHARED_DIR = __dirname
const E2E_DIR = path.resolve(SHARED_DIR, '..')
const PACKAGE_ROOT = path.resolve(E2E_DIR, '..')

export const E2E_ROOT = E2E_DIR
export { PACKAGE_ROOT }

/** Base output directory (overridable via E2E_REPORT_DIR). */
export const TEST_OUTPUT_BASE = process.env.E2E_REPORT_DIR
  || path.join(PACKAGE_ROOT, 'test-output')

/** Pre-defined output directories for E2E scenarios. */
export const E2E_PATHS = {
  base: TEST_OUTPUT_BASE,
  firstEval: path.join(TEST_OUTPUT_BASE, 'first-eval'),
  improvementCycle: path.join(TEST_OUTPUT_BASE, 'improvement-cycle'),
  cli: path.join(TEST_OUTPUT_BASE, 'cli'),
  history: path.join(TEST_OUTPUT_BASE, 'history'),
} as const

export type E2EPathKey = keyof typeof E2E_PATHS

/** Creates a timestamped file path: 'dir/prefix-1234567890.ext'. */
export function createTimestampedPath(
  dir: string,
  prefix: string,
  ext: string = 'json',
): string {
  return path.join(dir, `${prefix}-${Date.now()}.${ext}`)
}

/** Creates a subdirectory path under an E2E path or custom base. */
export function createSubdir(base: E2EPathKey | string, subdir: string): string {
  const basePath = typeof base === 'string' && base in E2E_PATHS
    ? E2E_PATHS[base as E2EPathKey]
    : base
  return path.join(basePath, subdir)
}
