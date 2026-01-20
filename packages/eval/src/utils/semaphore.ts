/**
 * A simple semaphore for limiting concurrent operations.
 *
 * @example
 * ```typescript
 * const semaphore = createSemaphore(3) // Allow 3 concurrent operations
 *
 * async function doWork(id: number) {
 *   await semaphore.acquire()
 *   try {
 *     console.log(`Starting work ${id}`)
 *     await someAsyncOperation()
 *   } finally {
 *     semaphore.release()
 *   }
 * }
 *
 * // Launch 10 tasks, but only 3 run at a time
 * await Promise.all(Array.from({ length: 10 }, (_, i) => doWork(i)))
 * ```
 */
export interface Semaphore {
  /**
   * Acquires a slot from the semaphore.
   * If no slots are available, waits until one is released.
   */
  acquire(): Promise<void>

  /**
   * Releases a slot back to the semaphore.
   * Must be called after acquire() completes, typically in a finally block.
   */
  release(): void
}

/**
 * Creates a semaphore with the specified concurrency limit.
 *
 * @param limit - Maximum number of concurrent operations allowed
 * @returns A Semaphore instance
 */
export function createSemaphore(limit: number): Semaphore {
  let running = 0
  const waiting: Array<() => void> = []

  return {
    async acquire(): Promise<void> {
      if (running < limit) {
        running++
        return
      }
      return new Promise<void>((resolve) => {
        waiting.push(resolve)
      })
    },

    release(): void {
      running--
      const next = waiting.shift()
      if (next) {
        running++
        next()
      }
    },
  }
}
