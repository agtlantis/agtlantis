/**
 * Resume E2E Tests - Tests history persistence and session resumption.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import * as path from 'path'
import { E2E_CONFIG, TEST_TIMEOUTS, E2E_PATHS, createTestDirectory } from './setup'
import {
  e2e,
  MATH_TEST_CASES_MINIMAL,
  loadHistory,
  resumeSession,
} from './test-helper'

describe.skipIf(!E2E_CONFIG.enabled)('Real E2E: Resume', () => {
  const TEST_OUTPUT_DIR = createTestDirectory(E2E_PATHS.history)

  function createHistoryPath(testName: string): string {
    return path.join(TEST_OUTPUT_DIR, `${testName}-${Date.now()}.json`)
  }

  it(
    'should save history to file after round completion',
    async () => {
      const historyPath = createHistoryPath('save-test')

      const cycle = e2e
        .mathSolver()
        .withTestCases(MATH_TEST_CASES_MINIMAL)
        .terminateAfter({ rounds: 2, cost: 0.05 }) // Need rounds > 1 so cycle is still running after nextRound()
        .withHistoryPath(historyPath)
        .runHITL()

      // Complete one round then stop
      await cycle.nextRound()
      await cycle.stop()

      // Verify history file was created and has correct structure
      expect(existsSync(historyPath)).toBe(true)

      const history = await loadHistory(historyPath)
      expect(history.schemaVersion).toBe('1.1.0')
      expect(history.sessionId).toBeDefined()
      expect(history.rounds.length).toBe(1)
      expect(history.completedAt).toBeDefined()
      expect(history.terminationReason).toContain('stop')
    },
    TEST_TIMEOUTS.resume,
  )

  it(
    'should preserve prompt snapshots in history for rollback',
    async () => {
      const historyPath = createHistoryPath('snapshot-test')

      await e2e
        .mathSolver()
        .withTestCases(MATH_TEST_CASES_MINIMAL)
        .terminateAfter({ rounds: 2, cost: 0.10 })
        .withHistoryPath(historyPath)
        .runAuto()

      const history = await loadHistory(historyPath)

      // Verify prompt snapshots exist for rollback
      for (const round of history.rounds) {
        expect(round.promptSnapshot).toBeDefined()
        expect(round.promptSnapshot.id).toBeDefined()
        expect(round.promptSnapshot.version).toBeDefined()
        expect(round.promptSnapshot.system).toBeDefined()
        expect(round.promptSnapshot.userTemplate).toBeDefined()
      }

      // Initial prompt should also be saved
      expect(history.initialPrompt).toBeDefined()
      expect(history.initialPrompt.userTemplate).toBeDefined()
    },
    TEST_TIMEOUTS.resume,
  )

  it(
    'should resume from saved history and restore session',
    async () => {
      const historyPath = createHistoryPath('resume-test')

      // First run: Complete 1 round and save
      const cycle = e2e
        .mathSolver()
        .withTestCases(MATH_TEST_CASES_MINIMAL)
        .terminateAfter({ rounds: 3, cost: 0.15 })
        .withHistoryPath(historyPath)
        .runHITL()

      const round1 = await cycle.nextRound()
      round1.expectScore().toBeValid()

      // Stop (simulating interruption)
      await cycle.stop()

      // Load history to get original session ID
      const savedHistory = await loadHistory(historyPath)
      const originalSessionId = savedHistory.sessionId

      // Resume from saved history
      const session = await resumeSession(historyPath)

      // Verify session was restored with same ID and data
      expect(session.sessionId).toBe(originalSessionId)
      expect(session.history.rounds.length).toBe(1)
    },
    TEST_TIMEOUTS.resume,
  )

  it(
    'should maintain session ID across multiple loads',
    async () => {
      const historyPath = createHistoryPath('session-id-test')

      const result = await e2e
        .mathSolver()
        .withTestCases(MATH_TEST_CASES_MINIMAL)
        .terminateAfter({ rounds: 1, cost: 0.05 })
        .withHistoryPath(historyPath)
        .runAuto()

      // Load history multiple times
      const history1 = await loadHistory(historyPath)
      const history2 = await loadHistory(historyPath)

      // Session ID should be consistent across loads
      expect(history1.sessionId).toBe(history2.sessionId)
      if (result.raw.history?.sessionId) {
        expect(history1.sessionId).toBe(result.raw.history.sessionId)
      }
    },
    TEST_TIMEOUTS.resume,
  )

  it(
    'should track prompt evolution in history',
    async () => {
      const historyPath = createHistoryPath('prompt-evolution-test')

      const result = await e2e
        .mathSolver()
        .withTestCases(MATH_TEST_CASES_MINIMAL)
        .terminateAfter({ rounds: 2, cost: 0.10 })
        .withVersionBump('minor')
        .withHistoryPath(historyPath)
        .runAuto()

      const history = await loadHistory(historyPath)

      // currentPrompt should reflect the latest state
      expect(history.currentPrompt).toBeDefined()

      // If suggestions were applied, version should have changed
      if (result.raw.rounds.length > 1) {
        const lastRound = result.raw.rounds[result.raw.rounds.length - 1]
        expect(history.currentPrompt.version).toBe(lastRound.promptVersionAfter)
      }
    },
    TEST_TIMEOUTS.resume,
  )

  it(
    'should include completedAt and terminationReason',
    async () => {
      const historyPath = createHistoryPath('completion-test')

      const result = await e2e
        .mathSolver()
        .withTestCases(MATH_TEST_CASES_MINIMAL)
        .terminateAfter({ rounds: 1 })
        .withHistoryPath(historyPath)
        .runAuto()

      const history = await loadHistory(historyPath)

      // Should have completion metadata
      expect(history.completedAt).toBeDefined()
      expect(new Date(history.completedAt!).getTime()).toBeGreaterThan(0)
      expect(history.terminationReason).toBe(result.raw.terminationReason)
    },
    TEST_TIMEOUTS.resume,
  )
})
