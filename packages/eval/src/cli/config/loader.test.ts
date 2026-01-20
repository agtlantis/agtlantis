/**
 * Config Loader Tests
 *
 * Tests for discoverEvalFiles() function.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { discoverEvalFiles, ConfigError } from './loader.js'

// ============================================================================
// Test Setup
// ============================================================================

const TEST_DIR = join(tmpdir(), 'agent-eval-test-' + Date.now())

function createTestFile(relativePath: string, content: string = ''): string {
  const fullPath = join(TEST_DIR, relativePath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content)
  return fullPath
}

// ============================================================================
// discoverEvalFiles Tests
// ============================================================================

describe('discoverEvalFiles', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('should discover files matching config.include patterns', async () => {
    createTestFile('evals/test1.eval.yaml', 'agent: test')
    createTestFile('evals/test2.eval.yaml', 'agent: test')
    createTestFile('evals/other.txt', 'not yaml')

    const files = await discoverEvalFiles(
      { include: ['evals/**/*.eval.yaml'] },
      { cwd: TEST_DIR }
    )

    expect(files).toHaveLength(2)
    expect(files[0]).toContain('test1.eval.yaml')
    expect(files[1]).toContain('test2.eval.yaml')
  })

  it('should use options.include over config.include (CLI precedence)', async () => {
    createTestFile('evals/test.eval.yaml', 'agent: test')
    createTestFile('other/alt.eval.yaml', 'agent: alt')

    const files = await discoverEvalFiles(
      { include: ['evals/**/*.eval.yaml'] }, // Config pattern
      {
        include: ['other/**/*.eval.yaml'], // CLI override
        cwd: TEST_DIR,
      }
    )

    expect(files).toHaveLength(1)
    expect(files[0]).toContain('alt.eval.yaml')
  })

  it('should throw CONFIG_NO_INCLUDE_PATTERN when no patterns provided', async () => {
    await expect(
      discoverEvalFiles({ include: undefined }, { cwd: TEST_DIR })
    ).rejects.toMatchObject({
      code: 'CONFIG_NO_INCLUDE_PATTERN',
      message: expect.stringContaining('No include patterns specified'),
    })
  })

  it('should throw CONFIG_NO_INCLUDE_PATTERN when empty array provided', async () => {
    await expect(
      discoverEvalFiles({ include: [] }, { cwd: TEST_DIR })
    ).rejects.toMatchObject({
      code: 'CONFIG_NO_INCLUDE_PATTERN',
    })
  })

  it('should return empty array when no files match (not an error)', async () => {
    const files = await discoverEvalFiles(
      { include: ['nonexistent/**/*.yaml'] },
      { cwd: TEST_DIR }
    )

    expect(files).toEqual([])
  })

  it('should combine results from multiple patterns', async () => {
    createTestFile('evals/a.eval.yaml', 'agent: a')
    createTestFile('tests/b.eval.yaml', 'agent: b')

    const files = await discoverEvalFiles(
      { include: ['evals/**/*.yaml', 'tests/**/*.yaml'] },
      { cwd: TEST_DIR }
    )

    expect(files).toHaveLength(2)
  })

  it('should ignore node_modules by default', async () => {
    createTestFile('evals/test.eval.yaml', 'agent: test')
    createTestFile('node_modules/pkg/test.eval.yaml', 'agent: ignored')

    const files = await discoverEvalFiles(
      { include: ['**/*.eval.yaml'] },
      { cwd: TEST_DIR }
    )

    expect(files).toHaveLength(1)
    expect(files[0]).not.toContain('node_modules')
  })

  it('should respect custom ignore patterns', async () => {
    createTestFile('evals/test.eval.yaml', 'agent: test')
    createTestFile('evals/ignored.eval.yaml', 'agent: ignored')

    const files = await discoverEvalFiles(
      { include: ['**/*.eval.yaml'] },
      {
        cwd: TEST_DIR,
        ignore: ['**/ignored*'],
      }
    )

    expect(files).toHaveLength(1)
    expect(files[0]).toContain('test.eval.yaml')
  })

  it('should return absolute paths sorted alphabetically', async () => {
    createTestFile('evals/z.eval.yaml', '')
    createTestFile('evals/a.eval.yaml', '')
    createTestFile('evals/m.eval.yaml', '')

    const files = await discoverEvalFiles(
      { include: ['**/*.eval.yaml'] },
      { cwd: TEST_DIR }
    )

    expect(files).toHaveLength(3)
    // Check sorted order
    expect(files[0]).toContain('a.eval.yaml')
    expect(files[1]).toContain('m.eval.yaml')
    expect(files[2]).toContain('z.eval.yaml')
    // Check absolute paths (cross-platform)
    expect(files.every((f) => isAbsolute(f))).toBe(true)
  })

  it('should discover files in nested directories', async () => {
    createTestFile('evals/booking/flow.eval.yaml', '')
    createTestFile('evals/qa/basic/test.eval.yaml', '')
    createTestFile('evals/root.eval.yaml', '')

    const files = await discoverEvalFiles(
      { include: ['evals/**/*.eval.yaml'] },
      { cwd: TEST_DIR }
    )

    expect(files).toHaveLength(3)
  })

  it('should not follow symbolic links by default', async () => {
    // Create a real file in external directory
    createTestFile('external/real.eval.yaml', 'agent: real')
    // Create a symlink in evals directory pointing to external
    const evalsDir = join(TEST_DIR, 'evals')
    mkdirSync(evalsDir, { recursive: true })
    try {
      symlinkSync(join(TEST_DIR, 'external'), join(evalsDir, 'linked'), 'dir')
    } catch {
      // Skip test on systems that don't support symlinks (Windows without admin)
      return
    }

    const files = await discoverEvalFiles(
      { include: ['evals/**/*.eval.yaml'] },
      { cwd: TEST_DIR }
    )

    // Should NOT find files through symlink (followSymbolicLinks: false)
    expect(files).toHaveLength(0)
  })
})
