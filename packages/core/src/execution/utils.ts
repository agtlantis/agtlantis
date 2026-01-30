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

/**
 * A Promise that can be resolved or rejected externally.
 *
 * Useful for bridging callback-based APIs to async/await patterns.
 * The resolve/reject functions are exposed as instance properties,
 * allowing external code to control when the promise settles.
 *
 * @typeParam T - The type of the resolved value (defaults to void)
 *
 * @example
 * ```typescript
 * const deferred = new Deferred<string>();
 *
 * // Later, in a callback:
 * someApi.onData((data) => deferred.resolve(data));
 * someApi.onError((err) => deferred.reject(err));
 *
 * // Await the result:
 * const result = await deferred.promise;
 * ```
 *
 * @example
 * ```typescript
 * // In async generator for event notification:
 * let pending = new Deferred<void>();
 * const subscriber = () => pending.resolve();
 *
 * while (!done) {
 *   await pending.promise;
 *   pending = new Deferred<void>(); // Reset for next wait
 * }
 * ```
 */
export class Deferred<T = void> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;

  constructor() {
    let res!: (value: T) => void;
    let rej!: (error: Error) => void;
    this.promise = new Promise<T>((resolve, reject) => {
      res = resolve;
      rej = reject;
    });
    this.resolve = res;
    this.reject = rej;
  }
}
