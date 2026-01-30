import type { ExecutionStatus } from './types';

/**
 * Shared utilities for execution hosts.
 *
 * These functions extract common patterns from SimpleExecutionHost and
 * StreamingExecutionHost to reduce code duplication and ensure consistent
 * behavior across both implementations.
 */

/**
 * Checks if an error is an abort-related error.
 *
 * An error is considered abort-related if either:
 * - The error has the name 'AbortError' (standard for AbortController)
 * - The signal has been aborted (covers edge cases where error name differs)
 *
 * @param error - The error to check
 * @param signal - The AbortSignal associated with the execution
 * @returns true if this is an abort-related error
 */
export function isAbortError(error: unknown, signal: AbortSignal): boolean {
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  return signal.aborted;
}

/**
 * Normalizes an unknown error to an Error instance.
 *
 * If the error is already an Error instance, it's returned as-is.
 * Otherwise, it's converted to a string and wrapped in a new Error.
 *
 * @param error - The unknown error to normalize
 * @returns A proper Error instance
 */
export function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Determines the execution status based on the execution state.
 *
 * Status determination priority:
 * 1. If user called cancel() OR the operation was aborted → 'canceled'
 * 2. If there's an error → 'failed'
 * 3. Otherwise → 'succeeded'
 *
 * Note: The 'aborted' flag takes precedence over 'hasError' because
 * AbortError is treated as a normal cancellation, not a failure.
 *
 * @param cancelRequested - Whether cancel() was explicitly called
 * @param aborted - Whether the signal was aborted (includes external abort)
 * @param hasError - Whether the execution ended with an error
 * @returns The appropriate execution status
 */
export function determineResultStatus(
  cancelRequested: boolean,
  aborted: boolean,
  hasError: boolean
): ExecutionStatus {
  // Cancellation takes priority (abort errors are treated as cancellation)
  if (cancelRequested || aborted) {
    return 'canceled';
  }

  // Error state
  if (hasError) {
    return 'failed';
  }

  // Success
  return 'succeeded';
}

/**
 * Return type for createHookRunner utility.
 */
export type HookRunner = {
  /**
   * Ensures hooks run exactly once.
   * Safe to call multiple times - only executes on first call.
   */
  ensureRun: () => Promise<void>;
  /**
   * Check if hooks have already been run.
   */
  hasRun: () => boolean;
};

/**
 * Creates a hook runner that ensures hooks run exactly once.
 *
 * This utility encapsulates the common pattern of running cleanup hooks
 * with a guard flag to prevent double execution. Both SimpleExecutionHost
 * and StreamingExecutionHost use this pattern for onDone hooks.
 *
 * @param runHooks - The async function to run hooks
 * @returns Object with ensureRun() and hasRun() methods
 *
 * @example
 * ```typescript
 * const hookRunner = createHookRunner(async () => {
 *   await session.runOnDoneHooks();
 * });
 *
 * // In finally block or cleanup:
 * await hookRunner.ensureRun();
 *
 * // Safe to call multiple times - only executes once
 * await hookRunner.ensureRun(); // no-op
 * ```
 */
export function createHookRunner(runHooks: () => Promise<void>): HookRunner {
  let ran = false;

  return {
    ensureRun: async () => {
      if (!ran) {
        ran = true;
        await runHooks();
      }
    },
    hasRun: () => ran,
  };
}
