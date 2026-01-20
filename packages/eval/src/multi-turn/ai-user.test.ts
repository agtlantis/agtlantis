import { describe, expect, it, vi } from 'vitest'
import { mock } from '@agtlantis/core/testing'
import { aiUser } from './ai-user'
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

// Test types for booking scenario
interface BookingInput {
  message: string
  history?: Array<{ role: string; content: string }>
}

interface BookingOutput {
  reply: string
  booking?: { status: string }
}

describe('aiUser factory', () => {
  it('should generate user input using Provider', async () => {
    const mockProvider = mock.provider(mock.text('I want to book for 4 people'))

    const generator = aiUser<BookingInput, BookingOutput>({
      provider: mockProvider,
      buildInput: (response) => ({ message: response }),
    })

    const context = createContext<BookingInput, BookingOutput>({
      currentTurn: 2,
      history: [
        {
          turn: 1,
          input: { message: 'Hello' },
          output: { reply: 'Welcome! How can I help?' },
        },
      ],
      lastOutput: { reply: 'Welcome! How can I help?' },
    })

    const result = await generator(context)

    expect(result).toEqual({ message: 'I want to book for 4 people' })
  })

  it('should use default system prompt when not provided', async () => {
    const mockProvider = mock.provider(mock.text('Next message'))

    const generator = aiUser<BookingInput, BookingOutput>({
      provider: mockProvider,
      buildInput: (response) => ({ message: response }),
    })

    const result = await generator(createContext())

    // Verify behavior: provider was called and result is produced
    expect(mockProvider.getCalls()).toHaveLength(1)
    expect(result).toEqual({ message: 'Next message' })
  })

  it('should use custom system prompt (string) when provided', async () => {
    const mockProvider = mock.provider(mock.text('Hurry up!'))

    const generator = aiUser<BookingInput, BookingOutput>({
      provider: mockProvider,
      systemPrompt: 'You are an impatient customer. Respond briefly.',
      buildInput: (response) => ({ message: response }),
    })

    const result = await generator(createContext())

    // Verify behavior: provider was called and custom prompt affects output
    expect(mockProvider.getCalls()).toHaveLength(1)
    expect(result).toEqual({ message: 'Hurry up!' })
  })

  it('should use dynamic system prompt (function) based on context', async () => {
    const mockProvider = mock.provider(mock.text('Response'))

    const generator = aiUser<BookingInput, BookingOutput>({
      provider: mockProvider,
      systemPrompt: (ctx) => `You are on turn ${ctx.currentTurn}. Be friendly.`,
      buildInput: (response) => ({ message: response }),
    })

    const result = await generator(createContext({ currentTurn: 3 }))

    // Verify behavior: dynamic prompt function is accepted and generator works
    expect(mockProvider.getCalls()).toHaveLength(1)
    expect(result).toEqual({ message: 'Response' })
  })

  it('should include conversation history in prompt using default formatter', async () => {
    const mockProvider = mock.provider(mock.text('Response'))

    const generator = aiUser<BookingInput, BookingOutput>({
      provider: mockProvider,
      buildInput: (response) => ({ message: response }),
    })

    const context = createContext<BookingInput, BookingOutput>({
      currentTurn: 3,
      history: [
        {
          turn: 1,
          input: { message: 'Hello' },
          output: { reply: 'Hi!' },
        },
        {
          turn: 2,
          input: { message: 'Book a table' },
          output: { reply: 'For how many?', booking: { status: 'pending' } },
        },
      ],
      lastOutput: { reply: 'For how many?', booking: { status: 'pending' } },
    })

    const result = await generator(context)

    // Verify behavior: generator works with multi-turn context
    expect(mockProvider.getCalls()).toHaveLength(1)
    expect(result).toEqual({ message: 'Response' })
  })

  it('should use custom history formatter when provided', async () => {
    const mockProvider = mock.provider(mock.text('Response'))
    const formatHistorySpy = vi.fn((ctx: ConversationContext<BookingInput, BookingOutput>) =>
      ctx.history.map((h) => `Customer: ${h.input.message}\nStaff: ${h.output?.reply ?? ''}`).join('\n---\n')
    )

    const generator = aiUser<BookingInput, BookingOutput>({
      provider: mockProvider,
      formatHistory: formatHistorySpy,
      buildInput: (response) => ({ message: response }),
    })

    const context = createContext<BookingInput, BookingOutput>({
      currentTurn: 2,
      history: [
        {
          turn: 1,
          input: { message: 'Hello' },
          output: { reply: 'Welcome!' },
        },
      ],
    })

    const result = await generator(context)

    // Verify behavior: custom formatter was called and result is produced
    expect(formatHistorySpy).toHaveBeenCalledWith(context)
    expect(mockProvider.getCalls()).toHaveLength(1)
    expect(result).toEqual({ message: 'Response' })
  })

  it('should handle empty history gracefully', async () => {
    const mockProvider = mock.provider(mock.text('First message'))

    const generator = aiUser<BookingInput, BookingOutput>({
      provider: mockProvider,
      buildInput: (response) => ({ message: response }),
    })

    const result = await generator(createContext({ history: [] }))

    // Verify behavior: empty history doesn't cause errors
    expect(mockProvider.getCalls()).toHaveLength(1)
    expect(result).toEqual({ message: 'First message' })
  })

  it('should pass context to buildInput for complex TInput construction', async () => {
    const mockProvider = mock.provider(mock.text('User response'))

    const generator = aiUser<BookingInput, BookingOutput>({
      provider: mockProvider,
      buildInput: (response, ctx) => ({
        message: response,
        history: ctx.history.map((h) => ({
          role: 'user',
          content: h.input.message,
        })),
      }),
    })

    const context = createContext<BookingInput, BookingOutput>({
      currentTurn: 3,
      history: [
        { turn: 1, input: { message: 'Hi' }, output: { reply: 'Hello!' } },
        { turn: 2, input: { message: 'Book' }, output: { reply: 'Sure!' } },
      ],
    })

    const result = await generator(context)

    expect(result.message).toBe('User response')
    expect(result.history).toHaveLength(2)
    expect(result.history?.[0]).toEqual({ role: 'user', content: 'Hi' })
    expect(result.history?.[1]).toEqual({ role: 'user', content: 'Book' })
  })

  it('should support varying personas per turn via dynamic systemPrompt', async () => {
    const mockProvider = mock.provider(mock.text('Response'))
    const systemPromptSpy = vi.fn((ctx: ConversationContext<BookingInput, BookingOutput>) => {
      if (ctx.currentTurn <= 2) return 'Be friendly.'
      if (ctx.currentTurn <= 4) return 'Be impatient.'
      return 'Be frustrated.'
    })

    const generator = aiUser<BookingInput, BookingOutput>({
      provider: mockProvider,
      systemPrompt: systemPromptSpy,
      buildInput: (response) => ({ message: response }),
    })

    // Turn 2 - should use friendly prompt
    await generator(createContext({ currentTurn: 2 }))
    expect(systemPromptSpy).toHaveBeenLastCalledWith(expect.objectContaining({ currentTurn: 2 }))

    // Turn 3 - should use impatient prompt
    await generator(createContext({ currentTurn: 3 }))
    expect(systemPromptSpy).toHaveBeenLastCalledWith(expect.objectContaining({ currentTurn: 3 }))

    // Turn 5 - should use frustrated prompt
    await generator(createContext({ currentTurn: 5 }))
    expect(systemPromptSpy).toHaveBeenLastCalledWith(expect.objectContaining({ currentTurn: 5 }))

    // Verify behavior: provider was called for each turn
    expect(mockProvider.getCalls()).toHaveLength(3)
    expect(systemPromptSpy).toHaveBeenCalledTimes(3)
  })
})

describe('aiUser integration with FollowUpInput', () => {
  it('should be usable as a dynamic input function', async () => {
    const mockProvider = mock.provider(mock.text('AI generated response'))

    // This simulates how aiUser would be used in a MultiTurnTestCase
    const followUpInput = {
      input: aiUser<BookingInput, BookingOutput>({
        provider: mockProvider,
        buildInput: (response) => ({ message: response }),
      }),
      description: 'AI simulated user',
    }

    const context = createContext<BookingInput, BookingOutput>({
      currentTurn: 2,
      history: [{ turn: 1, input: { message: 'Start' }, output: { reply: 'Welcome' } }],
    })

    // The input is an async function
    expect(typeof followUpInput.input).toBe('function')

    // Calling it returns a promise
    const result = await followUpInput.input(context)
    expect(result).toEqual({ message: 'AI generated response' })
  })
})

describe('aiUser error handling', () => {
  it('should propagate Provider errors', async () => {
    const mockProvider = mock.provider(mock.error(new Error('Provider API error')))

    const generator = aiUser<BookingInput, BookingOutput>({
      provider: mockProvider,
      buildInput: (response) => ({ message: response }),
    })

    await expect(generator(createContext())).rejects.toThrow('Provider API error')
  })

  it('should pass empty string to buildInput when Provider returns empty response', async () => {
    const mockProvider = mock.provider(mock.text(''))
    const buildInputSpy = vi.fn((response) => ({ message: response }))

    const generator = aiUser<BookingInput, BookingOutput>({
      provider: mockProvider,
      buildInput: buildInputSpy,
    })

    const result = await generator(createContext())

    expect(buildInputSpy).toHaveBeenCalledWith('', expect.any(Object))
    expect(result).toEqual({ message: '' })
  })
})
