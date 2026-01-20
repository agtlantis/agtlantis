import { describe, expect, it } from 'vitest'
import type { ConversationContext, CustomCondition, TerminationCondition } from './types'
import { checkCondition, checkTermination, getFieldValue } from './termination'

describe('getFieldValue', () => {
  it('should access a simple field', () => {
    const obj = { name: 'test' }
    expect(getFieldValue(obj, 'name')).toBe('test')
  })

  it('should access nested fields with dot notation', () => {
    const obj = { result: { recommendation: 'Computer Science' } }
    expect(getFieldValue(obj, 'result.recommendation')).toBe('Computer Science')
  })

  it('should access deeply nested fields', () => {
    const obj = { a: { b: { c: { d: 42 } } } }
    expect(getFieldValue(obj, 'a.b.c.d')).toBe(42)
  })

  it('should return undefined for missing simple field', () => {
    const obj = { name: 'test' }
    expect(getFieldValue(obj, 'missing')).toBeUndefined()
  })

  it('should return undefined for missing nested field', () => {
    const obj = { result: { name: 'test' } }
    expect(getFieldValue(obj, 'result.recommendation')).toBeUndefined()
  })

  it('should return undefined when intermediate field is missing', () => {
    const obj = { a: { b: 1 } }
    expect(getFieldValue(obj, 'a.missing.c')).toBeUndefined()
  })

  it('should return undefined for null object', () => {
    expect(getFieldValue(null, 'field')).toBeUndefined()
  })

  it('should return undefined for undefined object', () => {
    expect(getFieldValue(undefined, 'field')).toBeUndefined()
  })

  it('should return null field value (not treat as missing)', () => {
    const obj = { field: null }
    expect(getFieldValue(obj, 'field')).toBeNull()
  })

  it('should handle array index in path', () => {
    // Note: This tests current behavior - arrays use string keys
    const obj = { items: ['a', 'b', 'c'] }
    expect(getFieldValue(obj, 'items.0')).toBe('a')
    expect(getFieldValue(obj, 'items.1')).toBe('b')
  })
})

describe('checkCondition', () => {
  describe('maxTurns condition', () => {
    const maxTurnsCondition: TerminationCondition = { type: 'maxTurns', count: 5 }

    it('should return terminated=true when currentTurn equals count', async () => {
      const context: ConversationContext<string, string> = {
        currentTurn: 5,
        history: [
          { turn: 1, input: 'a', output: 'b' },
          { turn: 2, input: 'c', output: 'd' },
        ],
      }

      const result = await checkCondition(maxTurnsCondition, context)

      expect(result.terminated).toBe(true)
      expect(result.matchedCondition).toEqual(maxTurnsCondition)
      expect(result.reason).toContain('Maximum turns reached')
    })

    it('should return terminated=true when currentTurn exceeds count', async () => {
      const context: ConversationContext<string, string> = {
        currentTurn: 7,
        history: [],
      }

      const result = await checkCondition(maxTurnsCondition, context)

      expect(result.terminated).toBe(true)
      expect(result.matchedCondition).toEqual(maxTurnsCondition)
    })

    it('should return terminated=false when currentTurn is below count', async () => {
      const context: ConversationContext<string, string> = {
        currentTurn: 3,
        history: [],
      }

      const result = await checkCondition(maxTurnsCondition, context)

      expect(result.terminated).toBe(false)
      expect(result.matchedCondition).toBeUndefined()
      expect(result.reason).toContain('Turn 3 of 5')
    })

    it('should handle maxTurns count of 0', async () => {
      const zeroCondition: TerminationCondition = { type: 'maxTurns', count: 0 }
      const context: ConversationContext<string, string> = {
        currentTurn: 1,
        history: [],
      }

      const result = await checkCondition(zeroCondition, context)

      // Turn 1 >= 0, so terminated
      expect(result.terminated).toBe(true)
    })
  })

  describe('fieldSet condition', () => {
    describe('without expectedValue (any non-nullish value)', () => {
      const fieldSetCondition: TerminationCondition = {
        type: 'fieldSet',
        fieldPath: 'result.recommendation',
      }

      it('should return terminated=true when field is set', async () => {
        const context: ConversationContext<string, { result: { recommendation: string } }> = {
          currentTurn: 1,
          history: [],
          lastOutput: { result: { recommendation: 'CS' } },
        }

        const result = await checkCondition(fieldSetCondition, context)

        expect(result.terminated).toBe(true)
        expect(result.matchedCondition).toEqual(fieldSetCondition)
        expect(result.reason).toContain('is set')
      })

      it('should return terminated=false when field is undefined', async () => {
        const context: ConversationContext<string, { result: Record<string, unknown> }> = {
          currentTurn: 1,
          history: [],
          lastOutput: { result: {} },
        }

        const result = await checkCondition(fieldSetCondition, context)

        expect(result.terminated).toBe(false)
        expect(result.matchedCondition).toBeUndefined()
        expect(result.reason).toContain('not set')
      })

      it('should return terminated=false when field is null', async () => {
        const context: ConversationContext<string, { result: { recommendation: null } }> = {
          currentTurn: 1,
          history: [],
          lastOutput: { result: { recommendation: null } },
        }

        const result = await checkCondition(fieldSetCondition, context)

        expect(result.terminated).toBe(false)
        expect(result.matchedCondition).toBeUndefined()
      })

      it('should return terminated=false when lastOutput is undefined', async () => {
        const context: ConversationContext<string, unknown> = {
          currentTurn: 1,
          history: [],
          lastOutput: undefined,
        }

        const result = await checkCondition(fieldSetCondition, context)

        expect(result.terminated).toBe(false)
      })

      it('should return terminated=true for falsy but set values (0, empty string, false)', async () => {
        const context0: ConversationContext<string, { result: { recommendation: number } }> = {
          currentTurn: 1,
          history: [],
          lastOutput: { result: { recommendation: 0 } },
        }
        expect((await checkCondition(fieldSetCondition, context0)).terminated).toBe(true)

        const contextEmpty: ConversationContext<string, { result: { recommendation: string } }> = {
          currentTurn: 1,
          history: [],
          lastOutput: { result: { recommendation: '' } },
        }
        expect((await checkCondition(fieldSetCondition, contextEmpty)).terminated).toBe(true)

        const contextFalse: ConversationContext<string, { result: { recommendation: boolean } }> = {
          currentTurn: 1,
          history: [],
          lastOutput: { result: { recommendation: false } },
        }
        expect((await checkCondition(fieldSetCondition, contextFalse)).terminated).toBe(true)
      })
    })

    describe('with expectedValue (exact match required)', () => {
      const fieldValueCondition: TerminationCondition = {
        type: 'fieldValue',
        fieldPath: 'booking.status',
        expectedValue: 'confirmed',
      }

      it('should return terminated=true when field equals expectedValue', async () => {
        const context: ConversationContext<string, { booking: { status: string } }> = {
          currentTurn: 1,
          history: [],
          lastOutput: { booking: { status: 'confirmed' } },
        }

        const result = await checkCondition(fieldValueCondition, context)

        expect(result.terminated).toBe(true)
        expect(result.matchedCondition).toEqual(fieldValueCondition)
        expect(result.reason).toContain('equals expected value')
      })

      it('should return terminated=false when field does not equal expectedValue', async () => {
        const context: ConversationContext<string, { booking: { status: string } }> = {
          currentTurn: 1,
          history: [],
          lastOutput: { booking: { status: 'pending' } },
        }

        const result = await checkCondition(fieldValueCondition, context)

        expect(result.terminated).toBe(false)
        expect(result.matchedCondition).toBeUndefined()
        expect(result.reason).toContain('does not equal expected value')
      })

      it('should use strict equality (===) for comparison', async () => {
        const conditionWithNumber: TerminationCondition = {
          type: 'fieldValue',
          fieldPath: 'count',
          expectedValue: 1,
        }

        // String "1" should not match number 1
        const context: ConversationContext<string, { count: string }> = {
          currentTurn: 1,
          history: [],
          lastOutput: { count: '1' },
        }

        expect((await checkCondition(conditionWithNumber, context)).terminated).toBe(false)
      })
    })
  })

  describe('custom condition', () => {
    it('should return terminated=true when check returns true', async () => {
      const customCondition: CustomCondition<string, { done: boolean }> = {
        type: 'custom',
        check: (ctx) => ctx.lastOutput?.done === true,
        description: 'Check if done',
      }

      const context: ConversationContext<string, { done: boolean }> = {
        currentTurn: 1,
        history: [],
        lastOutput: { done: true },
      }

      const result = await checkCondition(customCondition, context)

      expect(result.terminated).toBe(true)
      expect(result.matchedCondition).toEqual(customCondition)
      expect(result.reason).toContain('Check if done')
      expect(result.reason).toContain('met')
    })

    it('should return terminated=false when check returns false', async () => {
      const customCondition: CustomCondition<string, { done: boolean }> = {
        type: 'custom',
        check: (ctx) => ctx.lastOutput?.done === true,
        description: 'Check if done',
      }

      const context: ConversationContext<string, { done: boolean }> = {
        currentTurn: 1,
        history: [],
        lastOutput: { done: false },
      }

      const result = await checkCondition(customCondition, context)

      expect(result.terminated).toBe(false)
      expect(result.matchedCondition).toBeUndefined()
      expect(result.reason).toContain('not met')
    })

    it('should support async check functions', async () => {
      const asyncCondition: CustomCondition<string, { value: number }> = {
        type: 'custom',
        check: async (ctx) => {
          // Simulate async operation
          await new Promise((resolve) => setTimeout(resolve, 1))
          return (ctx.lastOutput?.value ?? 0) > 10
        },
        description: 'Async value check',
      }

      const context: ConversationContext<string, { value: number }> = {
        currentTurn: 1,
        history: [],
        lastOutput: { value: 15 },
      }

      const result = await checkCondition(asyncCondition, context)

      expect(result.terminated).toBe(true)
    })

    it('should handle check function errors gracefully', async () => {
      const errorCondition: CustomCondition<string, unknown> = {
        type: 'custom',
        check: () => {
          throw new Error('Check failed!')
        },
        description: 'Error condition',
      }

      const context: ConversationContext<string, unknown> = {
        currentTurn: 1,
        history: [],
      }

      const result = await checkCondition(errorCondition, context)

      // Should not terminate on error
      expect(result.terminated).toBe(false)
      expect(result.reason).toContain('Error condition')
      expect(result.reason).toContain('failed')
      expect(result.reason).toContain('Check failed!')
    })

    it('should use default description when not provided', async () => {
      const noDescCondition: CustomCondition<string, { ok: boolean }> = {
        type: 'custom',
        check: (ctx) => ctx.lastOutput?.ok === true,
      }

      const context: ConversationContext<string, { ok: boolean }> = {
        currentTurn: 1,
        history: [],
        lastOutput: { ok: true },
      }

      const result = await checkCondition(noDescCondition, context)

      expect(result.reason).toContain('Custom condition')
    })

    it('should have access to full conversation context', async () => {
      const historyCondition: CustomCondition<string, { count: number }> = {
        type: 'custom',
        check: (ctx) => ctx.history.length >= 3,
        description: 'At least 3 turns completed',
      }

      const contextWith2Turns: ConversationContext<string, { count: number }> = {
        currentTurn: 2,
        history: [
          { turn: 1, input: 'a', output: { count: 1 } },
          { turn: 2, input: 'b', output: { count: 2 } },
        ],
        lastOutput: { count: 2 },
      }

      expect((await checkCondition(historyCondition, contextWith2Turns)).terminated).toBe(false)

      const contextWith3Turns: ConversationContext<string, { count: number }> = {
        currentTurn: 3,
        history: [
          { turn: 1, input: 'a', output: { count: 1 } },
          { turn: 2, input: 'b', output: { count: 2 } },
          { turn: 3, input: 'c', output: { count: 3 } },
        ],
        lastOutput: { count: 3 },
      }

      expect((await checkCondition(historyCondition, contextWith3Turns)).terminated).toBe(true)
    })
  })
})

describe('checkTermination', () => {
  it('should return terminated=true on first matching condition (OR relationship)', async () => {
    const conditions: TerminationCondition<string, { second: string }>[] = [
      { type: 'fieldSet', fieldPath: 'first' },
      { type: 'fieldSet', fieldPath: 'second' },
      { type: 'maxTurns', count: 10 },
    ]

    const context: ConversationContext<string, { second: string }> = {
      currentTurn: 1,
      history: [],
      lastOutput: { second: 'value' },
    }

    const result = await checkTermination(conditions, context)

    expect(result.terminated).toBe(true)
    // Should match the second condition (index 1)
    expect(result.matchedCondition).toEqual({ type: 'fieldSet', fieldPath: 'second' })
  })

  it('should return first matching condition when multiple could match', async () => {
    const conditions: TerminationCondition<string, { first: string }>[] = [
      { type: 'fieldSet', fieldPath: 'first' },
      { type: 'maxTurns', count: 5 },
    ]

    const context: ConversationContext<string, { first: string }> = {
      currentTurn: 5, // maxTurns would also match
      history: [],
      lastOutput: { first: 'value' },
    }

    const result = await checkTermination(conditions, context)

    expect(result.terminated).toBe(true)
    // First condition should be returned (fieldSet, not maxTurns)
    expect(result.matchedCondition?.type).toBe('fieldSet')
  })

  it('should return terminated=false when no conditions match', async () => {
    const conditions: TerminationCondition<string, Record<string, unknown>>[] = [
      { type: 'fieldSet', fieldPath: 'missing' },
      { type: 'maxTurns', count: 10 },
    ]

    const context: ConversationContext<string, Record<string, unknown>> = {
      currentTurn: 1,
      history: [],
      lastOutput: {},
    }

    const result = await checkTermination(conditions, context)

    expect(result.terminated).toBe(false)
    expect(result.matchedCondition).toBeUndefined()
    expect(result.reason).toBe('No termination conditions met')
  })

  it('should return terminated=false when conditions array is empty', async () => {
    const context: ConversationContext<string, unknown> = {
      currentTurn: 1,
      history: [],
    }

    const result = await checkTermination([], context)

    expect(result.terminated).toBe(false)
    expect(result.reason).toBe('No termination conditions specified')
  })

  it('should handle complex nested field paths', async () => {
    const conditions: TerminationCondition<string, { data: { results: Array<{ status: string }> } }>[] = [
      { type: 'fieldValue', fieldPath: 'data.results.0.status', expectedValue: 'complete' },
    ]

    const context: ConversationContext<string, { data: { results: Array<{ status: string }> } }> = {
      currentTurn: 1,
      history: [],
      lastOutput: { data: { results: [{ status: 'complete' }] } },
    }

    const result = await checkTermination(conditions, context)

    expect(result.terminated).toBe(true)
  })

  it('should support mixed condition types including custom', async () => {
    const conditions: TerminationCondition<string, { value: number }>[] = [
      { type: 'fieldSet', fieldPath: 'notExists' },
      {
        type: 'custom',
        check: (ctx) => (ctx.lastOutput?.value ?? 0) > 5,
        description: 'Value > 5',
      },
      { type: 'maxTurns', count: 10 },
    ]

    const context: ConversationContext<string, { value: number }> = {
      currentTurn: 1,
      history: [],
      lastOutput: { value: 10 },
    }

    const result = await checkTermination(conditions, context)

    expect(result.terminated).toBe(true)
    expect(result.matchedCondition?.type).toBe('custom')
    expect(result.reason).toContain('Value > 5')
  })
})
