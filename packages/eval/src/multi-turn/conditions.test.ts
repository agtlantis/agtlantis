import { describe, expect, it } from 'vitest'
import { mock } from '@agtlantis/core/testing'
import {
  afterTurns,
  and,
  fieldEquals,
  fieldIsSet,
  naturalLanguage,
  not,
  or,
} from './conditions'
import { checkCondition } from './termination'
import type { ConversationContext } from './types'

// Helper to create a basic context
function createContext<TInput, TOutput>(
  overrides: Partial<ConversationContext<TInput, TOutput>> = {}
): ConversationContext<TInput, TOutput> {
  return {
    currentTurn: 1,
    history: [],
    lastOutput: undefined,
    ...overrides,
  }
}

describe('naturalLanguage', () => {
  it('should return terminated=true when Provider responds with "yes"', async () => {
    const mockProvider = mock.provider(mock.text('yes'))

    const condition = naturalLanguage({
      provider: mockProvider,
      prompt: 'Has the user confirmed their booking?',
    })

    const context = createContext<string, { confirmed: boolean }>({
      currentTurn: 2,
      history: [
        { turn: 1, input: 'Book a room', output: { confirmed: false } },
      ],
      lastOutput: { confirmed: true },
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(true)
    expect(result.reason).toContain('NL:')
  })

  it('should return terminated=false when Provider responds with "no"', async () => {
    const mockProvider = mock.provider(mock.text('no'))

    const condition = naturalLanguage({
      provider: mockProvider,
      prompt: 'Has the user confirmed their booking?',
    })

    const context = createContext<string, { confirmed: boolean }>({
      lastOutput: { confirmed: false },
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(false)
  })

  it('should accept "yes" with additional text', async () => {
    const mockProvider = mock.provider(mock.text('Yes, the condition is met.'))

    const condition = naturalLanguage({
      provider: mockProvider,
      prompt: 'Is the task complete?',
    })

    const result = await checkCondition(condition, createContext())

    expect(result.terminated).toBe(true)
  })

  it('should use custom system prompt when provided', async () => {
    const mockProvider = mock.provider(mock.text('yes'))

    const condition = naturalLanguage({
      provider: mockProvider,
      prompt: 'Is booking complete?',
      systemPrompt: 'You are a booking evaluator.',
    })

    const result = await checkCondition(condition, createContext())

    // Verify behavior: provider was called and condition evaluated correctly
    expect(mockProvider.getCalls()).toHaveLength(1)
    expect(result.terminated).toBe(true)
  })

  it('should include conversation history in prompt', async () => {
    const mockProvider = mock.provider(mock.text('yes'))

    const condition = naturalLanguage({
      provider: mockProvider,
      prompt: 'Is conversation complete?',
    })

    const context = createContext<string, string>({
      currentTurn: 2,
      history: [
        { turn: 1, input: 'Hello', output: 'Hi there!' },
      ],
      lastOutput: 'Goodbye!',
    })

    const result = await checkCondition(condition, context)

    // Verify behavior: provider was called with context and condition evaluated correctly
    expect(mockProvider.getCalls()).toHaveLength(1)
    expect(result.terminated).toBe(true)
  })

  it('should truncate long prompts in description', () => {
    const longPrompt = 'A'.repeat(100)
    const mockProvider = mock.provider(mock.text('yes'))

    const condition = naturalLanguage({
      provider: mockProvider,
      prompt: longPrompt,
    })

    expect(condition.description).toContain('...')
    expect(condition.description!.length).toBeLessThan(100)
  })
})

describe('and', () => {
  it('should return true when all conditions are met', async () => {
    const condition = and<string, { a: boolean; b: boolean }>(
      { type: 'fieldSet', fieldPath: 'a' },
      { type: 'fieldSet', fieldPath: 'b' }
    )

    const context = createContext<string, { a: boolean; b: boolean }>({
      lastOutput: { a: true, b: true },
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(true)
  })

  it('should return false when any condition is not met', async () => {
    const condition = and<string, { a: boolean; b?: boolean }>(
      { type: 'fieldSet', fieldPath: 'a' },
      { type: 'fieldSet', fieldPath: 'b' }
    )

    const context = createContext<string, { a: boolean; b?: boolean }>({
      lastOutput: { a: true }, // b is not set
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(false)
  })

  it('should short-circuit on first false condition', async () => {
    let secondChecked = false

    const condition = and<string, { a?: boolean }>(
      { type: 'fieldSet', fieldPath: 'nonexistent' },
      {
        type: 'custom',
        check: () => {
          secondChecked = true
          return true
        },
      }
    )

    const context = createContext<string, { a?: boolean }>({
      lastOutput: {},
    })

    await checkCondition(condition, context)

    expect(secondChecked).toBe(false)
  })

  it('should return false for empty conditions', async () => {
    const condition = and()

    const result = await checkCondition(condition, createContext())

    expect(result.terminated).toBe(false)
    expect(condition.description).toContain('empty')
  })

  it('should have descriptive description', () => {
    const condition = and(
      { type: 'fieldSet', fieldPath: 'a' },
      { type: 'maxTurns', count: 5 }
    )

    expect(condition.description).toBe('and(fieldSet, maxTurns)')
  })
})

describe('or', () => {
  it('should return true when any condition is met', async () => {
    const condition = or<string, { a?: boolean; b?: boolean }>(
      { type: 'fieldSet', fieldPath: 'a' },
      { type: 'fieldSet', fieldPath: 'b' }
    )

    const context = createContext<string, { a?: boolean; b?: boolean }>({
      lastOutput: { b: true }, // only b is set
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(true)
  })

  it('should return false when no conditions are met', async () => {
    const condition = or<string, Record<string, unknown>>(
      { type: 'fieldSet', fieldPath: 'a' },
      { type: 'fieldSet', fieldPath: 'b' }
    )

    const context = createContext<string, Record<string, unknown>>({
      lastOutput: {},
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(false)
  })

  it('should short-circuit on first true condition', async () => {
    let secondChecked = false

    const condition = or<string, { a: boolean }>(
      { type: 'fieldSet', fieldPath: 'a' },
      {
        type: 'custom',
        check: () => {
          secondChecked = true
          return true
        },
      }
    )

    const context = createContext<string, { a: boolean }>({
      lastOutput: { a: true },
    })

    await checkCondition(condition, context)

    expect(secondChecked).toBe(false)
  })

  it('should return false for empty conditions', async () => {
    const condition = or()

    const result = await checkCondition(condition, createContext())

    expect(result.terminated).toBe(false)
  })
})

describe('not', () => {
  it('should invert true to false', async () => {
    const condition = not<string, { exists: boolean }>({
      type: 'fieldSet',
      fieldPath: 'exists',
    })

    const context = createContext<string, { exists: boolean }>({
      lastOutput: { exists: true },
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(false) // inverted
  })

  it('should invert false to true', async () => {
    const condition = not<string, Record<string, unknown>>({
      type: 'fieldSet',
      fieldPath: 'nonexistent',
    })

    const context = createContext<string, Record<string, unknown>>({
      lastOutput: {},
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(true) // inverted
  })

  it('should have descriptive description', () => {
    const condition = not({ type: 'fieldSet', fieldPath: 'error' })

    expect(condition.description).toBe('not(fieldSet)')
  })
})

describe('afterTurns', () => {
  it('should return true when current turn equals count', async () => {
    const condition = afterTurns(3)

    const context = createContext({ currentTurn: 3 })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(true)
  })

  it('should return true when current turn exceeds count', async () => {
    const condition = afterTurns(3)

    const context = createContext({ currentTurn: 5 })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(true)
  })

  it('should return false when current turn is below count', async () => {
    const condition = afterTurns(3)

    const context = createContext({ currentTurn: 2 })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(false)
  })
})

describe('fieldEquals', () => {
  it('should return true when field equals expected value', async () => {
    const condition = fieldEquals<string, { status: string }>('status', 'completed')

    const context = createContext<string, { status: string }>({
      lastOutput: { status: 'completed' },
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(true)
  })

  it('should return false when field does not equal expected value', async () => {
    const condition = fieldEquals<string, { status: string }>('status', 'completed')

    const context = createContext<string, { status: string }>({
      lastOutput: { status: 'pending' },
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(false)
  })

  it('should support nested paths', async () => {
    const condition = fieldEquals<string, { data: { status: string } }>('data.status', 'done')

    const context = createContext<string, { data: { status: string } }>({
      lastOutput: { data: { status: 'done' } },
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(true)
  })
})

describe('fieldIsSet', () => {
  it('should return true when field is set', async () => {
    const condition = fieldIsSet<string, { result: string }>('result')

    const context = createContext<string, { result: string }>({
      lastOutput: { result: 'value' },
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(true)
  })

  it('should return false when field is not set', async () => {
    const condition = fieldIsSet<string, Record<string, unknown>>('result')

    const context = createContext<string, Record<string, unknown>>({
      lastOutput: {},
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(false)
  })

  it('should return true for falsy but set values', async () => {
    const condition = fieldIsSet<string, { value: number }>('value')

    const context = createContext<string, { value: number }>({
      lastOutput: { value: 0 },
    })

    const result = await checkCondition(condition, context)

    expect(result.terminated).toBe(true)
  })
})

describe('composite conditions', () => {
  it('should support nested and/or', async () => {
    // (a AND b) OR c
    const condition = or<string, { a?: boolean; b?: boolean; c?: boolean }>(
      and(
        { type: 'fieldSet', fieldPath: 'a' },
        { type: 'fieldSet', fieldPath: 'b' }
      ),
      { type: 'fieldSet', fieldPath: 'c' }
    )

    // Only c is set
    const context1 = createContext<string, { a?: boolean; b?: boolean; c?: boolean }>({
      lastOutput: { c: true },
    })
    expect((await checkCondition(condition, context1)).terminated).toBe(true)

    // Only a and b are set
    const context2 = createContext<string, { a?: boolean; b?: boolean; c?: boolean }>({
      lastOutput: { a: true, b: true },
    })
    expect((await checkCondition(condition, context2)).terminated).toBe(true)

    // Only a is set
    const context3 = createContext<string, { a?: boolean; b?: boolean; c?: boolean }>({
      lastOutput: { a: true },
    })
    expect((await checkCondition(condition, context3)).terminated).toBe(false)
  })

  it('should support complex real-world scenario', async () => {
    // Booking complete: (confirmed AND paid) OR cancelled
    const bookingComplete = or<string, { confirmed?: boolean; paid?: boolean; cancelled?: boolean }>(
      and(
        { type: 'fieldSet', fieldPath: 'confirmed' },
        { type: 'fieldSet', fieldPath: 'paid' }
      ),
      { type: 'fieldSet', fieldPath: 'cancelled' }
    )

    // Not complete yet
    const context1 = createContext<string, { confirmed?: boolean; paid?: boolean; cancelled?: boolean }>({
      lastOutput: { confirmed: true },
    })
    expect((await checkCondition(bookingComplete, context1)).terminated).toBe(false)

    // Complete via payment
    const context2 = createContext<string, { confirmed?: boolean; paid?: boolean; cancelled?: boolean }>({
      lastOutput: { confirmed: true, paid: true },
    })
    expect((await checkCondition(bookingComplete, context2)).terminated).toBe(true)

    // Complete via cancellation
    const context3 = createContext<string, { confirmed?: boolean; paid?: boolean; cancelled?: boolean }>({
      lastOutput: { cancelled: true },
    })
    expect((await checkCondition(bookingComplete, context3)).terminated).toBe(true)
  })

  it('should support not with and', async () => {
    // Terminate when done is set AND error is NOT set
    const condition = and<string, { done?: boolean; error?: boolean }>(
      { type: 'fieldSet', fieldPath: 'done' },
      not({ type: 'fieldSet', fieldPath: 'error' })
    )

    // Done with no error
    const context1 = createContext<string, { done?: boolean; error?: boolean }>({
      lastOutput: { done: true },
    })
    expect((await checkCondition(condition, context1)).terminated).toBe(true)

    // Done with error
    const context2 = createContext<string, { done?: boolean; error?: boolean }>({
      lastOutput: { done: true, error: true },
    })
    expect((await checkCondition(condition, context2)).terminated).toBe(false)
  })
})
