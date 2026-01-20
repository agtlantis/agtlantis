/**
 * Calculate duration from start time in milliseconds.
 *
 * @param startTime - The start timestamp from Date.now()
 * @returns Duration in milliseconds
 */
export function getDuration(startTime: number): number {
  return Date.now() - startTime;
}

/**
 * Combine multiple AbortSignals into a single signal.
 * The combined signal aborts when ANY of the source signals abort.
 *
 * Node 18 compatible - doesn't use AbortSignal.any() which is Node 20+.
 *
 * @param signals - AbortSignals to combine
 * @returns A new AbortSignal that aborts when any input signal aborts
 *
 * @example
 * ```typescript
 * const userController = new AbortController();
 * const timeoutController = new AbortController();
 *
 * const combined = combineSignals(userController.signal, timeoutController.signal);
 *
 * // Either abort triggers the combined signal
 * userController.abort(); // combined.aborted === true
 * ```
 */
export function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    // If any signal is already aborted, immediately abort and return
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }

    // Listen for future aborts
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
    });
  }

  return controller.signal;
}
