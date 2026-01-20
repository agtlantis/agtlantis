import { SessionSummary } from '../session/types';
import type { SimpleSession } from '../session/simple-session';
import type { SimpleExecution } from './types';
import { combineSignals } from './utils';

/**
 * SimpleExecutionHost implements the SimpleExecution interface for eager execution.
 *
 * Unlike StreamingExecutionHost which is lazy (starts on iteration), SimpleExecutionHost
 * starts execution immediately on construction. This enables cancel() to abort in-progress
 * LLM calls.
 *
 * Signal combination:
 * - If userSignal is provided, it's combined with internal AbortController
 * - Both cancel() and userSignal abort will trigger cancellation
 * - The combined signal is passed to SimpleSession for AI SDK calls
 */
export class SimpleExecutionHost<TResult> implements SimpleExecution<TResult> {
  private readonly abortController = new AbortController();
  private readonly effectiveSignal: AbortSignal;
  private readonly promise: Promise<{ result: TResult; session: SimpleSession }>;
  private cachedResult?: TResult;
  private cachedSession?: SimpleSession;
  private completed = false;
  private hooksRan = false;
  private readonly startTime = Date.now();

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
    this.promise = this.execute(createSession, fn);
  }

  private async execute(
    createSession: (signal?: AbortSignal) => SimpleSession,
    fn: (session: SimpleSession) => Promise<TResult>
  ): Promise<{ result: TResult; session: SimpleSession }> {
    const session = createSession(this.effectiveSignal);
    this.cachedSession = session;

    // Notify execution start
    session.notifyExecutionStart();

    try {
      const result = await fn(session);
      this.completed = true;

      // Notify execution done
      await session.notifyExecutionDone(result, this.startTime);

      return { result, session };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));

      // Notify execution error (AbortError excluded - treated as normal cancellation)
      if (errorObj.name !== 'AbortError' && !this.abortController.signal.aborted) {
        await session.notifyExecutionError(errorObj, this.startTime);
      }

      throw error;
    } finally {
      // Always run hooks, even on error/abort
      if (!this.hooksRan) {
        this.hooksRan = true;
        await session.runOnDoneHooks();
      }
    }
  }

  /**
   * Request cancellation of the execution.
   * Aborts the current LLM call if in progress.
   * No-op if execution already completed.
   */
  cancel(): void {
    this.abortController.abort();
  }

  /**
   * Get the final result of the execution.
   * @throws AbortError if execution was cancelled
   * @throws Error if execution failed
   */
  async toResult(): Promise<TResult> {
    if (this.cachedResult !== undefined) {
      return this.cachedResult;
    }

    const { result } = await this.promise;
    this.cachedResult = result;
    return result;
  }

  /**
   * Get execution summary (token usage, duration, costs, etc.).
   * Waits for execution to complete (success or error) before returning.
   */
  async getSummary(): Promise<SessionSummary> {
    // Wait for completion, ignore errors (we still want summary on failure)
    await this.promise.catch(() => {});

    if (this.cachedSession) {
      return this.cachedSession.getSummary();
    }

    // Fallback if session creation itself failed
    return SessionSummary.empty(Date.now());
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
