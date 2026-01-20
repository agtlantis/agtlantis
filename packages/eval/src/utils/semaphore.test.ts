import { describe, it, expect } from 'vitest'
import { createSemaphore } from './semaphore'

describe('createSemaphore', () => {
  it('should allow up to limit concurrent operations', async () => {
    const semaphore = createSemaphore(3)
    let concurrent = 0
    let maxConcurrent = 0

    const doWork = async () => {
      await semaphore.acquire()
      try {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise(resolve => setTimeout(resolve, 10))
      } finally {
        concurrent--
        semaphore.release()
      }
    }

    await Promise.all(Array.from({ length: 10 }, () => doWork()))

    expect(maxConcurrent).toBe(3)
  })

  it('should process all operations eventually', async () => {
    const semaphore = createSemaphore(2)
    const completed: number[] = []

    const doWork = async (id: number) => {
      await semaphore.acquire()
      try {
        await new Promise(resolve => setTimeout(resolve, 5))
        completed.push(id)
      } finally {
        semaphore.release()
      }
    }

    await Promise.all(Array.from({ length: 5 }, (_, i) => doWork(i)))

    expect(completed).toHaveLength(5)
    expect(completed.sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('should work with limit of 1 (sequential)', async () => {
    const semaphore = createSemaphore(1)
    let concurrent = 0
    let maxConcurrent = 0

    const doWork = async () => {
      await semaphore.acquire()
      try {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise(resolve => setTimeout(resolve, 5))
      } finally {
        concurrent--
        semaphore.release()
      }
    }

    await Promise.all(Array.from({ length: 5 }, () => doWork()))

    expect(maxConcurrent).toBe(1)
  })

  it('should handle immediate release without waiting', async () => {
    const semaphore = createSemaphore(5)
    const results: string[] = []

    const doWork = async (id: string) => {
      await semaphore.acquire()
      results.push(id)
      semaphore.release()
    }

    await Promise.all(['a', 'b', 'c'].map(id => doWork(id)))

    expect(results).toHaveLength(3)
  })
})
