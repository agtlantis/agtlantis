import { SessionSummary } from '../session/types';
import type { SimpleSession } from '../session/simple-session';
import type { SimpleExecution, SimpleResult } from './types';
import { combineSignals } from './utils';
import { isAbortError, normalizeError, createHookRunner } from './shared';

/**
 * Internal result structure for tracking execution outcome.
 * Used to avoid throwing errors in the execution flow.
 */
type InternalResult<T> =
  | { success: true; result: T; summary: SessionSummary }
  | { success: false; error: Error; aborted: boolean; summary: SessionSummary };

/**
 * SimpleExecutionHost implements the SimpleExecution interface for eager execution.
 *
 * Execution starts immediately on construction (eager evaluation).
 * Use result() to get the execution outcome with status and summary.
 *
 * Signal combination:
 * - If userSignal is provided, it's combined with internal AbortController
 * - Both cancel() and userSignal abort will trigger cancellation
 * - The combined signal is passed to SimpleSession for AI SDK calls
 *
 * @example
 * ```typescript
 * const execution = new SimpleExecutionHost(createSession, async (session) => {
 *   return await session.generateText({ prompt: 'Hello' });
 * });
 *
 * const result = await execution.result();
 *
 * if (result.status === 'succeeded') {
 *   console.log(result.value);
 * }
 * console.log(`Cost: $${result.summary.totalCost}`);
 * ```
 */
export class SimpleExecutionHost<TResult> implements SimpleExecution<TResult> {
  private readonly abortController = new AbortController();
  private readonly effectiveSignal: AbortSignal;
  private readonly consumerPromise: Promise<InternalResult<TResult>>;
  private cachedSession?: SimpleSession;
  private readonly startTime = Date.now();
  private cancelRequested = false;

  constructor(
    createSession: (signal?: AbortSignal) => SimpleSession,
    fn: (session: SimpleSession) => Promise<TResult>,
    userSignal?: AbortSignal
  ) {
    // Combine user signal with internal controller for dual cancellation support
    this.effectiveSignal = userSignal
      ? combineSignals(userSignal, this.abortController.signal)
      : this.abortController.signal;

    // Start execution immediately (eager evaluation)
    this.consumerPromise = this.execute(createSession, fn);
  }

  private async execute(
    createSession: (signal?: AbortSignal) => SimpleSession,
    fn: (session: SimpleSession) => Promise<TResult>
  ): Promise<InternalResult<TResult>> {
    const session = createSession(this.effectiveSignal);
    this.cachedSession = session;
    const hookRunner = createHookRunner(() => session.runOnDoneHooks());

    // Notify execution start
    session.notifyExecutionStart();

    try {
      const result = await fn(session);

      // Notify execution done
      await session.notifyExecutionDone(result, this.startTime);

      return {
        success: true,
        result,
        summary: await session.getSummary(),
      };
    } catch (error) {
      const errorObj = normalizeError(error);
      const isCancellation = isAbortError(error, this.abortController.signal);

      // Notify execution error (AbortError excluded - treated as normal cancellation)
      if (!isCancellation) {
        await session.notifyExecutionError(errorObj, this.startTime);
      }

      return {
        success: false,
        error: errorObj,
        aborted: isCancellation,
        summary: await session.getSummary(),
      };
    } finally {
      await hookRunner.ensureRun();
    }
  }

  /**
   * Request cancellation of the execution.
   * Aborts the current LLM call if in progress.
   * No-op if execution already completed.
   */
  cancel(): void {
    this.cancelRequested = true;
    this.abortController.abort();
  }

  /**
   * Get the execution result with status and summary.
   * Never throws - returns a discriminated union with status.
   */
  async result(): Promise<SimpleResult<TResult>> {
    const internal = await this.consumerPromise;

    // Success state
    if (internal.success) {
      return {
        status: 'succeeded',
        value: internal.result,
        summary: internal.summary,
      };
    }

    // Canceled state (user called cancel() or external signal aborted)
    if (this.cancelRequested || internal.aborted) {
      return {
        status: 'canceled',
        summary: internal.summary,
      };
    }

    // Failed state
    return {
      status: 'failed',
      error: internal.error,
      summary: internal.summary,
    };
  }

  /**
   * Cleanup resources.
   * For SimpleExecution, hooks are already run during execution,
   * so this is intentionally a no-op.
   */
  async cleanup(): Promise<void> {
    // SimpleExecution runs hooks in execute(), nothing to clean up
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.cleanup();
  }
}
