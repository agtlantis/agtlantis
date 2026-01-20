import { describe, it, expect } from 'vitest'
import { accuracy, consistency, relevance } from './index'
import type { Criterion } from '@/core/types'

describe('criteria factory functions', () => {
  describe('accuracy', () => {
    it('should return criterion with correct id', () => {
      const criterion = accuracy()
      expect(criterion.id).toBe('accuracy')
    })

    it('should return criterion with English name', () => {
      const criterion = accuracy()
      expect(criterion.name).toBe('Accuracy')
    })

    it('should return criterion with description about factual correctness', () => {
      const criterion = accuracy()
      expect(criterion.description).toContain('factually correct')
      expect(criterion.description).toContain('hallucinations')
    })

    it('should have undefined weight by default', () => {
      const criterion = accuracy()
      expect(criterion.weight).toBeUndefined()
    })

    it('should accept custom weight', () => {
      const criterion = accuracy({ weight: 2 })
      expect(criterion.weight).toBe(2)
    })

    it('should return valid Criterion type', () => {
      const criterion: Criterion = accuracy()
      expect(criterion.id).toBeDefined()
      expect(criterion.name).toBeDefined()
      expect(criterion.description).toBeDefined()
    })
  })

  describe('consistency', () => {
    it('should return criterion with correct id', () => {
      const criterion = consistency()
      expect(criterion.id).toBe('consistency')
    })

    it('should return criterion with English name', () => {
      const criterion = consistency()
      expect(criterion.name).toBe('Consistency')
    })

    it('should return criterion with description about internal coherence', () => {
      const criterion = consistency()
      expect(criterion.description).toContain('coherent')
      expect(criterion.description).toContain('contradictions')
    })

    it('should have undefined weight by default', () => {
      const criterion = consistency()
      expect(criterion.weight).toBeUndefined()
    })

    it('should accept custom weight', () => {
      const criterion = consistency({ weight: 1.5 })
      expect(criterion.weight).toBe(1.5)
    })
  })

  describe('relevance', () => {
    it('should return criterion with correct id', () => {
      const criterion = relevance()
      expect(criterion.id).toBe('relevance')
    })

    it('should return criterion with English name', () => {
      const criterion = relevance()
      expect(criterion.name).toBe('Relevance')
    })

    it('should return criterion with description about appropriateness', () => {
      const criterion = relevance()
      expect(criterion.description).toContain('addresses the input')
      expect(criterion.description).toContain('user intent')
    })

    it('should have undefined weight by default', () => {
      const criterion = relevance()
      expect(criterion.weight).toBeUndefined()
    })

    it('should accept custom weight', () => {
      const criterion = relevance({ weight: 3 })
      expect(criterion.weight).toBe(3)
    })
  })

  describe('factory function independence', () => {
    it('should create new objects on each call', () => {
      const c1 = accuracy()
      const c2 = accuracy()
      expect(c1).not.toBe(c2)
    })

    it('should allow different weights for same criterion type', () => {
      const c1 = accuracy({ weight: 1 })
      const c2 = accuracy({ weight: 2 })
      expect(c1.weight).toBe(1)
      expect(c2.weight).toBe(2)
    })
  })

  describe('combined usage', () => {
    it('should work together in an array', () => {
      const criteria: Criterion[] = [
        accuracy({ weight: 2 }),
        consistency(),
        relevance({ weight: 1.5 }),
      ]

      expect(criteria).toHaveLength(3)
      expect(criteria.map((c) => c.id)).toEqual(['accuracy', 'consistency', 'relevance'])
    })
  })
})
