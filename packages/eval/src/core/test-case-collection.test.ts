import { describe, it, expect, beforeEach } from 'vitest'
import type { TestCase } from './types'
import {
  TestCaseCollection,
  testCase,
  testCases,
  type RandomOptions,
} from './test-case-collection'

interface TestInput {
  name: string
}

describe('TestCaseCollection', () => {
  const sampleCases: TestCase<TestInput>[] = [
    { id: 'case-1', input: { name: 'Alice' }, tags: ['fast', 'unit'] },
    { id: 'case-2', input: { name: 'Bob' }, tags: ['slow', 'integration'] },
    { id: 'case-3', input: { name: 'Charlie' }, tags: ['fast'] },
    { id: 'case-4', input: { name: 'Diana' } },
    { id: 'case-5', input: { name: 'Eve' }, tags: ['fast', 'unit'] },
  ]

  let collection: TestCaseCollection<TestInput>

  beforeEach(() => {
    collection = TestCaseCollection.from(sampleCases)
  })

  // ==========================================================================
  // Static Factories
  // ==========================================================================

  describe('from()', () => {
    it('creates collection from array', () => {
      const c = TestCaseCollection.from(sampleCases)

      expect(c.length).toBe(5)
      expect(c.toArray()).toEqual(sampleCases)
    })

    it('creates immutable copy (original array modification does not affect collection)', () => {
      const mutableCases = [...sampleCases]
      const c = TestCaseCollection.from(mutableCases)

      mutableCases.push({ id: 'new', input: { name: 'New' } })

      expect(c.length).toBe(5)
    })

    it('creates collection from empty array', () => {
      const c = TestCaseCollection.from<TestInput>([])

      expect(c.length).toBe(0)
      expect(c.isEmpty).toBe(true)
    })
  })

  describe('empty()', () => {
    it('creates empty collection', () => {
      const c = TestCaseCollection.empty<TestInput>()

      expect(c.length).toBe(0)
      expect(c.isEmpty).toBe(true)
      expect(c.toArray()).toEqual([])
    })
  })

  // ==========================================================================
  // Properties
  // ==========================================================================

  describe('length', () => {
    it('returns correct count', () => {
      expect(collection.length).toBe(5)
    })

    it('returns 0 for empty collection', () => {
      expect(TestCaseCollection.empty().length).toBe(0)
    })
  })

  describe('isEmpty', () => {
    it('returns false for non-empty collection', () => {
      expect(collection.isEmpty).toBe(false)
    })

    it('returns true for empty collection', () => {
      expect(TestCaseCollection.empty().isEmpty).toBe(true)
    })
  })

  // ==========================================================================
  // Selection Methods
  // ==========================================================================

  describe('all()', () => {
    it('returns collection with all cases', () => {
      const result = collection.all()

      expect(result.length).toBe(5)
      expect(result.toArray()).toEqual(sampleCases)
    })

    it('returns same instance since collection is immutable', () => {
      const result = collection.all()

      expect(result).toBe(collection)
    })
  })

  describe('minimal()', () => {
    it('returns first case by default', () => {
      const result = collection.minimal()

      expect(result.length).toBe(1)
      expect(result.at(0)?.id).toBe('case-1')
    })

    it('returns first N cases when count provided', () => {
      const result = collection.minimal(3)

      expect(result.length).toBe(3)
      expect(result.toArray().map((tc) => tc.id)).toEqual([
        'case-1',
        'case-2',
        'case-3',
      ])
    })

    it('returns all when count exceeds length', () => {
      const result = collection.minimal(10)

      expect(result.length).toBe(5)
    })

    it('returns empty for count <= 0', () => {
      expect(collection.minimal(0).isEmpty).toBe(true)
      expect(collection.minimal(-1).isEmpty).toBe(true)
    })

    it('returns empty for empty collection', () => {
      const empty = TestCaseCollection.empty<TestInput>()

      expect(empty.minimal().isEmpty).toBe(true)
    })
  })

  describe('first()', () => {
    it('returns first N cases', () => {
      const result = collection.first(2)

      expect(result.length).toBe(2)
      expect(result.at(0)?.id).toBe('case-1')
      expect(result.at(1)?.id).toBe('case-2')
    })
  })

  describe('last()', () => {
    it('returns last case by default', () => {
      const result = collection.last()

      expect(result.length).toBe(1)
      expect(result.at(0)?.id).toBe('case-5')
    })

    it('returns last N cases', () => {
      const result = collection.last(3)

      expect(result.length).toBe(3)
      expect(result.toArray().map((tc) => tc.id)).toEqual([
        'case-3',
        'case-4',
        'case-5',
      ])
    })

    it('preserves order (earliest first)', () => {
      const result = collection.last(2)

      expect(result.at(0)?.id).toBe('case-4')
      expect(result.at(1)?.id).toBe('case-5')
    })

    it('returns all when count exceeds length', () => {
      const result = collection.last(10)

      expect(result.length).toBe(5)
    })

    it('returns empty for count <= 0', () => {
      expect(collection.last(0).isEmpty).toBe(true)
      expect(collection.last(-1).isEmpty).toBe(true)
    })
  })

  describe('random()', () => {
    it('returns N random cases', () => {
      const result = collection.random(3)

      expect(result.length).toBe(3)
    })

    it('returns different cases on each call without seed', () => {
      const results = new Set<string>()

      for (let i = 0; i < 20; i++) {
        const result = collection.random(2)
        const ids = result
          .toArray()
          .map((tc) => tc.id)
          .join(',')
        results.add(ids)
      }

      expect(results.size).toBeGreaterThan(1)
    })

    it('returns same cases with same seed', () => {
      const options: RandomOptions = { seed: 42 }

      const result1 = collection.random(3, options)
      const result2 = collection.random(3, options)

      expect(result1.toArray().map((tc) => tc.id)).toEqual(
        result2.toArray().map((tc) => tc.id),
      )
    })

    it('returns different cases with different seeds', () => {
      const result1 = collection.random(3, { seed: 42 })
      const result2 = collection.random(3, { seed: 123 })

      const ids1 = result1.toArray().map((tc) => tc.id)
      const ids2 = result2.toArray().map((tc) => tc.id)

      expect(ids1).not.toEqual(ids2)
    })

    it('never returns more than available', () => {
      const result = collection.random(100)

      expect(result.length).toBe(5)
    })

    it('returns empty for count <= 0', () => {
      expect(collection.random(0).isEmpty).toBe(true)
      expect(collection.random(-1).isEmpty).toBe(true)
    })

    it('returns empty for empty collection', () => {
      const empty = TestCaseCollection.empty<TestInput>()

      expect(empty.random(5).isEmpty).toBe(true)
    })
  })

  describe('filter()', () => {
    it('filters by predicate', () => {
      const result = collection.filter((tc) => tc.tags?.includes('fast') ?? false)

      expect(result.length).toBe(3)
      expect(result.toArray().map((tc) => tc.id)).toEqual([
        'case-1',
        'case-3',
        'case-5',
      ])
    })

    it('returns empty when no matches', () => {
      const result = collection.filter((tc) => tc.tags?.includes('nonexistent') ?? false)

      expect(result.isEmpty).toBe(true)
    })

    it('returns all when all match', () => {
      const result = collection.filter(() => true)

      expect(result.length).toBe(5)
    })
  })

  describe('byId()', () => {
    it('finds case by ID', () => {
      const result = collection.byId('case-3')

      expect(result.length).toBe(1)
      expect(result.at(0)?.input.name).toBe('Charlie')
    })

    it('returns empty when not found', () => {
      const result = collection.byId('nonexistent')

      expect(result.isEmpty).toBe(true)
    })

    it('returns first match when duplicates exist', () => {
      const casesWithDuplicates: TestCase<TestInput>[] = [
        { id: 'dup', input: { name: 'First' } },
        { id: 'dup', input: { name: 'Second' } },
      ]
      const c = TestCaseCollection.from(casesWithDuplicates)

      const result = c.byId('dup')

      expect(result.length).toBe(1)
      expect(result.at(0)?.input.name).toBe('First')
    })
  })

  describe('byIds()', () => {
    it('finds cases by multiple IDs', () => {
      const result = collection.byIds(['case-1', 'case-3', 'case-5'])

      expect(result.length).toBe(3)
    })

    it('preserves order of provided IDs', () => {
      const result = collection.byIds(['case-5', 'case-1', 'case-3'])

      expect(result.toArray().map((tc) => tc.id)).toEqual([
        'case-5',
        'case-1',
        'case-3',
      ])
    })

    it('skips non-existent IDs', () => {
      const result = collection.byIds(['case-1', 'nonexistent', 'case-3'])

      expect(result.length).toBe(2)
      expect(result.toArray().map((tc) => tc.id)).toEqual(['case-1', 'case-3'])
    })

    it('returns empty for empty ID list', () => {
      const result = collection.byIds([])

      expect(result.isEmpty).toBe(true)
    })

    it('deduplicates duplicate IDs in request', () => {
      const result = collection.byIds(['case-1', 'case-1', 'case-1'])

      expect(result.length).toBe(1)
      expect(result.at(0)?.id).toBe('case-1')
    })

    it('preserves first occurrence order when deduplicating', () => {
      const result = collection.byIds(['case-3', 'case-1', 'case-3', 'case-2'])

      expect(result.length).toBe(3)
      expect(result.toArray().map((tc) => tc.id)).toEqual([
        'case-3',
        'case-1',
        'case-2',
      ])
    })
  })

  // ==========================================================================
  // Access Methods
  // ==========================================================================

  describe('get()', () => {
    it('returns TestCase by ID', () => {
      const result = collection.get('case-2')

      expect(result?.input.name).toBe('Bob')
    })

    it('returns undefined when not found', () => {
      const result = collection.get('nonexistent')

      expect(result).toBeUndefined()
    })
  })

  describe('at()', () => {
    it('returns case at index', () => {
      expect(collection.at(0)?.id).toBe('case-1')
      expect(collection.at(2)?.id).toBe('case-3')
    })

    it('returns undefined for out of bounds', () => {
      expect(collection.at(10)).toBeUndefined()
      expect(collection.at(-10)).toBeUndefined()
    })

    it('supports negative indices', () => {
      expect(collection.at(-1)?.id).toBe('case-5')
      expect(collection.at(-2)?.id).toBe('case-4')
    })
  })

  // ==========================================================================
  // Conversion Methods
  // ==========================================================================

  describe('toArray()', () => {
    it('returns array copy', () => {
      const arr = collection.toArray()

      expect(arr).toEqual(sampleCases)
    })

    it('returned array is mutable', () => {
      const arr = collection.toArray()

      arr.push({ id: 'new', input: { name: 'New' } })

      expect(arr.length).toBe(6)
      expect(collection.length).toBe(5)
    })
  })

  // ==========================================================================
  // Iterator Support
  // ==========================================================================

  describe('[Symbol.iterator]', () => {
    it('supports for...of loops', () => {
      const ids: string[] = []

      for (const tc of collection) {
        ids.push(tc.id ?? '')
      }

      expect(ids).toEqual(['case-1', 'case-2', 'case-3', 'case-4', 'case-5'])
    })

    it('supports spread operator', () => {
      const arr = [...collection]

      expect(arr.length).toBe(5)
      expect(arr[0].id).toBe('case-1')
    })
  })

  // ==========================================================================
  // Method Chaining
  // ==========================================================================

  describe('method chaining', () => {
    it('supports chaining multiple methods', () => {
      const result = collection
        .filter((tc) => tc.tags?.includes('fast') ?? false)
        .random(2, { seed: 42 })
        .toArray()

      expect(result).toHaveLength(2)
      result.forEach((c) => expect(c.tags).toContain('fast'))
    })

    it('handles empty intermediate results', () => {
      const result = collection
        .filter((tc) => tc.tags?.includes('nonexistent') ?? false)
        .random(10)
        .toArray()

      expect(result).toEqual([])
    })

    it('chains filter -> first -> toArray', () => {
      const result = collection
        .filter((tc) => tc.tags?.includes('fast') ?? false)
        .first(1)
        .toArray()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('case-1')
    })

    it('chains byIds -> filter', () => {
      const result = collection
        .byIds(['case-1', 'case-2', 'case-3'])
        .filter((tc) => tc.tags?.includes('fast') ?? false)
        .toArray()

      expect(result).toHaveLength(2)
      expect(result.map((tc) => tc.id)).toEqual(['case-1', 'case-3'])
    })
  })
})

// ============================================================================
// Factory Functions
// ============================================================================

describe('testCase()', () => {
  it('creates test case with provided ID', () => {
    const tc = testCase({ name: 'Alice' }, 'custom-id')

    expect(tc.id).toBe('custom-id')
    expect(tc.input).toEqual({ name: 'Alice' })
  })

  it('creates test case with auto-generated ID', () => {
    const tc1 = testCase({ name: 'Alice' })
    const tc2 = testCase({ name: 'Bob' })

    expect(tc1.id).toMatch(/^test-\d+$/)
    expect(tc2.id).toMatch(/^test-\d+$/)
    expect(tc1.id).not.toBe(tc2.id)
  })
})

describe('testCases()', () => {
  it('creates multiple test cases', () => {
    const cases = testCases([{ name: 'Alice' }, { name: 'Bob' }])

    expect(cases).toHaveLength(2)
    expect(cases[0].input).toEqual({ name: 'Alice' })
    expect(cases[1].input).toEqual({ name: 'Bob' })
  })

  it('uses prefix for auto-generated IDs', () => {
    const cases = testCases([{ name: 'Alice' }, { name: 'Bob' }], 'greet')

    expect(cases[0].id).toBe('greet-0')
    expect(cases[1].id).toBe('greet-1')
  })

  it('uses default prefix when not provided', () => {
    const cases = testCases([{ name: 'Alice' }])

    expect(cases[0].id).toBe('case-0')
  })
})
