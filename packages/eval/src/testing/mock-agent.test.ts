import { describe, it, expect } from 'vitest'
import { createMockAgent, createMockJudge } from './mock-agent'

describe('createMockAgent', () => {
  it('should return configured response', async () => {
    const agent = createMockAgent<{ query: string }, { answer: string }>({
      response: { answer: 'Hello!' },
    })

    const result = await agent.execute({ query: 'Hi' })

    expect(result.result).toEqual({ answer: 'Hello!' })
  })

  it('should include token usage in metadata', async () => {
    const tokenUsage = { inputTokens: 100, outputTokens: 200, totalTokens: 300 }
    const agent = createMockAgent({
      response: { data: 'test' },
      tokenUsage,
    })

    const result = await agent.execute({})

    expect(result.metadata?.tokenUsage).toEqual(tokenUsage)
  })

  it('should delay response when configured', async () => {
    const delay = 50
    const agent = createMockAgent({
      response: { data: 'test' },
      delay,
    })

    const start = Date.now()
    await agent.execute({})
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(delay - 10)
  })

  it('should throw error when shouldError is true', async () => {
    const agent = createMockAgent({
      shouldError: true,
      errorMessage: 'Custom error',
    })

    // Use rejects.toMatchObject for flexible error matching
    await expect(agent.execute({})).rejects.toMatchObject({
      message: 'Custom error',
    })
  })

  it('should use custom execute function when provided', async () => {
    const agent = createMockAgent<{ id: number }, { doubled: number }>({
      executeFn: async (input) => ({
        result: { doubled: input.id * 2 },
      }),
    })

    const result = await agent.execute({ id: 5 })

    expect(result.result).toEqual({ doubled: 10 })
  })

  it('should have correct config and prompt', () => {
    const agent = createMockAgent({
      name: 'TestAgent',
      description: 'A test agent',
    })

    expect(agent.config.name).toBe('TestAgent')
    expect(agent.config.description).toBe('A test agent')
    expect(agent.prompt.id).toBe('mock-prompt')
  })
})

describe('createMockJudge', () => {
  it('should return configured score and passed status', async () => {
    const judge = createMockJudge({
      score: 85,
      passed: true,
    })

    const result = await judge.evaluate({
      input: {},
      output: {},
      agentDescription: 'Test agent',
    })

    expect(result.overallScore).toBe(85)
    expect(result.passed).toBe(true)
  })

  it('should return configured verdicts', async () => {
    const verdicts = [
      { criterionId: 'accuracy', score: 90, reasoning: 'Good', passed: true },
      { criterionId: 'clarity', score: 80, reasoning: 'Clear', passed: true },
    ]
    const judge = createMockJudge({ verdicts })

    const result = await judge.evaluate({
      input: {},
      output: {},
      agentDescription: 'Test agent',
    })

    expect(result.verdicts).toEqual(verdicts)
  })

  it('should throw error when shouldError is true', async () => {
    const judge = createMockJudge({
      shouldError: true,
      errorMessage: 'Evaluation failed',
    })

    // Use rejects.toMatchObject for flexible error matching
    await expect(
      judge.evaluate({
        input: {},
        output: {},
        agentDescription: 'Test agent',
      })
    ).rejects.toMatchObject({
      message: 'Evaluation failed',
    })
  })

  it('should use custom evaluate function when provided', async () => {
    let capturedInput: unknown
    let capturedOutput: unknown
    let capturedDescription: string = ''

    const judge = createMockJudge({
      evaluateFn: async (context) => {
        capturedInput = context.input
        capturedOutput = context.output
        capturedDescription = context.agentDescription
        return {
          verdicts: [],
          overallScore: 100,
          passed: true,
        }
      },
    })

    await judge.evaluate({
      input: { query: 'test' },
      output: { answer: 'response' },
      agentDescription: 'My agent',
    })

    expect(capturedInput).toEqual({ query: 'test' })
    expect(capturedOutput).toEqual({ answer: 'response' })
    expect(capturedDescription).toBe('My agent')
  })
})
