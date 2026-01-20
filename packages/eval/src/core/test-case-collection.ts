import type { TestCase } from './types'

/**
 * Options for random selection.
 */
export interface RandomOptions {
  /** Seed for reproducible random selection */
  seed?: number
}

/**
 * Immutable collection for managing and selecting test cases.
 * Provides fluent API for filtering, sampling, and accessing test cases.
 *
 * ## Immutability
 * - All selection methods (`filter`, `first`, `random`, etc.) return **new collections**
 * - Chaining creates intermediate collections without modifying the original
 * - Internal array is frozen with `Object.freeze()` to prevent accidental mutation
 * - `toArray()` returns a **mutable copy** for consumer convenience
 *
 * @example
 * ```typescript
 * import { TestCaseCollection, createEvalSuite } from '@agtlantis/eval'
 *
 * const cases = TestCaseCollection.from([
 *   { id: 'basic', input: { query: 'Hello' } },
 *   { id: 'complex', input: { query: 'Explain quantum computing' } },
 *   { id: 'edge', input: { query: '' } },
 * ])
 *
 * // Development: quick feedback
 * await suite.run(cases.minimal().toArray())
 *
 * // CI: full coverage
 * await suite.run(cases.all().toArray())
 *
 * // Debugging specific case
 * await suite.run(cases.byIds(['edge']).toArray())
 *
 * // Chaining: filter then sample
 * const filtered = cases.filter(tc => tc.tags?.includes('fast')).random(3).toArray()
 * ```
 */
export class TestCaseCollection<TInput> {
  private readonly cases: ReadonlyArray<TestCase<TInput>>

  private constructor(cases: TestCase<TInput>[]) {
    this.cases = Object.freeze([...cases])
  }

  // ============================================================================
  // Static Factories
  // ============================================================================

  /**
   * Create a collection from an array of test cases.
   */
  static from<T>(cases: TestCase<T>[]): TestCaseCollection<T> {
    return new TestCaseCollection(cases)
  }

  /**
   * Create an empty collection.
   */
  static empty<T>(): TestCaseCollection<T> {
    return new TestCaseCollection<T>([])
  }

  // ============================================================================
  // Properties
  // ============================================================================

  /**
   * Number of test cases in the collection.
   */
  get length(): number {
    return this.cases.length
  }

  /**
   * Whether the collection is empty.
   */
  get isEmpty(): boolean {
    return this.cases.length === 0
  }

  // ============================================================================
  // Selection Methods (return new TestCaseCollection - chainable)
  // ============================================================================

  /**
   * Returns all test cases.
   * Returns `this` since the collection is immutable (frozen array).
   * Useful as explicit starting point in chains.
   */
  all(): TestCaseCollection<TInput> {
    return this
  }

  /**
   * Returns the first N test cases (default: 1).
   * Useful for cost-controlled testing during development.
   */
  minimal(count: number = 1): TestCaseCollection<TInput> {
    return this.first(count)
  }

  /**
   * Returns the first N test cases.
   */
  first(count: number): TestCaseCollection<TInput> {
    if (count <= 0) {
      return TestCaseCollection.empty()
    }
    return new TestCaseCollection([...this.cases.slice(0, count)])
  }

  /**
   * Returns the last N test cases (default: 1).
   * Preserves original order (earlier cases first).
   */
  last(count: number = 1): TestCaseCollection<TInput> {
    if (count <= 0) {
      return TestCaseCollection.empty()
    }
    const startIndex = Math.max(0, this.cases.length - count)
    return new TestCaseCollection([...this.cases.slice(startIndex)])
  }

  /**
   * Returns N random test cases.
   *
   * @param count - Number of cases to select
   * @param options - Optional seed for reproducibility
   *
   * @example
   * ```typescript
   * // Different each time
   * collection.random(5)
   *
   * // Same result with same seed
   * collection.random(5, { seed: 42 })
   * ```
   */
  random(count: number, options?: RandomOptions): TestCaseCollection<TInput> {
    if (count <= 0 || this.cases.length === 0) {
      return TestCaseCollection.empty()
    }

    const actualCount = Math.min(count, this.cases.length)
    const indices = [...Array(this.cases.length).keys()]

    const rng =
      options?.seed !== undefined ? createSeededRng(options.seed) : Math.random

    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
    }

    const selected = indices.slice(0, actualCount).map((i) => this.cases[i])
    return new TestCaseCollection([...selected])
  }

  /**
   * Filter test cases by predicate.
   */
  filter(
    predicate: (testCase: TestCase<TInput>) => boolean,
  ): TestCaseCollection<TInput> {
    return new TestCaseCollection([...this.cases.filter(predicate)])
  }

  /**
   * Find test case by ID.
   * Returns collection with single case or empty collection.
   */
  byId(id: string): TestCaseCollection<TInput> {
    const found = this.cases.find((tc) => tc.id === id)
    return found
      ? new TestCaseCollection([found])
      : TestCaseCollection.empty<TInput>()
  }

  /**
   * Find test cases by multiple IDs.
   * Preserves order of provided IDs (first occurrence).
   * Skips non-existent IDs. Duplicate IDs in input are deduplicated.
   *
   * @example
   * ```typescript
   * collection.byIds(['a', 'b', 'a'])  // returns [case-a, case-b] (deduplicated)
   * collection.byIds(['b', 'a'])       // returns [case-b, case-a] (order preserved)
   * ```
   */
  byIds(ids: string[]): TestCaseCollection<TInput> {
    const uniqueIds = [...new Set(ids)]
    const idSet = new Set(uniqueIds)
    const idToCase = new Map<string, TestCase<TInput>>()

    for (const tc of this.cases) {
      if (tc.id && idSet.has(tc.id) && !idToCase.has(tc.id)) {
        idToCase.set(tc.id, tc)
      }
    }

    const result = uniqueIds
      .map((id) => idToCase.get(id))
      .filter((tc): tc is TestCase<TInput> => tc !== undefined)

    return new TestCaseCollection(result)
  }

  // ============================================================================
  // Access Methods
  // ============================================================================

  /**
   * Get test case by ID.
   * Returns undefined if not found.
   */
  get(id: string): TestCase<TInput> | undefined {
    return this.cases.find((tc) => tc.id === id)
  }

  /**
   * Get test case by index.
   * Supports negative indices (e.g., -1 for last item).
   * Returns undefined if index is out of bounds.
   */
  at(index: number): TestCase<TInput> | undefined {
    const normalizedIndex = index < 0 ? this.cases.length + index : index
    if (normalizedIndex < 0 || normalizedIndex >= this.cases.length) {
      return undefined
    }
    return this.cases[normalizedIndex]
  }

  // ============================================================================
  // Conversion Methods
  // ============================================================================

  /**
   * Convert to array.
   * Returns a mutable copy of the internal array.
   */
  toArray(): TestCase<TInput>[] {
    return [...this.cases]
  }

  // ============================================================================
  // Iterator Support
  // ============================================================================

  /**
   * Iterator support for for...of loops and spread operator.
   */
  [Symbol.iterator](): Iterator<TestCase<TInput>> {
    return this.cases[Symbol.iterator]()
  }
}

let autoIdCounter = 0

/**
 * Create a single test case with auto-generated ID if not provided.
 *
 * Auto-generated IDs use a global counter: `test-1`, `test-2`, etc.
 *
 * @param input - The test case input data
 * @param id - Optional custom ID (uses auto-generated if omitted)
 * @returns A TestCase object
 *
 * @example
 * ```typescript
 * const case1 = testCase({ name: 'Alice' })         // id: 'test-1'
 * const case2 = testCase({ name: 'Bob' })           // id: 'test-2'
 * const case3 = testCase({ name: 'Charlie' }, 'custom-id')  // id: 'custom-id'
 * ```
 *
 * @remarks
 * The global counter increments on every call. For deterministic IDs,
 * provide an explicit ID or use `testCases()` with a prefix.
 */
export function testCase<TInput>(input: TInput, id?: string): TestCase<TInput> {
  return {
    id: id ?? `test-${++autoIdCounter}`,
    input,
  }
}

/**
 * Create multiple test cases from inputs.
 * Auto-generates IDs with optional prefix.
 *
 * @example
 * ```typescript
 * const cases = testCases([{ name: 'Alice' }, { name: 'Bob' }], 'greet')
 * // Results in: [{ id: 'greet-0', input: {...} }, { id: 'greet-1', input: {...} }]
 * ```
 */
export function testCases<TInput>(
  inputs: TInput[],
  prefix: string = 'case',
): TestCase<TInput>[] {
  return inputs.map((input, index) => ({
    id: `${prefix}-${index}`,
    input,
  }))
}

/**
 * Simple seeded random number generator (mulberry32 algorithm).
 * Provides reproducible pseudo-random sequences for test case selection.
 *
 * **Algorithm**: Mulberry32 - fast, good distribution, 32-bit state
 * **Period**: ~2^32 unique outputs per seed
 * **Use case**: Test case shuffling (not suitable for cryptographic purposes)
 *
 * @see https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 * @internal
 */
function createSeededRng(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
