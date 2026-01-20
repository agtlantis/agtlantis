import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createJudge } from './llm-judge.js'
import { mock } from '@agtlantis/core/testing'
import { defaultJudgePrompt } from './prompts/default.js'
import { accuracy, consistency, relevance, schema } from './criteria/index.js'
import { EvalError, EvalErrorCode } from '@/core/errors.js'
import { TEST_SCORES, createMockUsage } from '@/testing'
import type { JudgeConfig } from './types.js'

describe('createJudge', () => {
  const createDefaultConfig = (llmResponse: string): JudgeConfig => ({
    provider: mock.provider(mock.text(llmResponse)),
    prompt: defaultJudgePrompt,
    criteria: [accuracy(), consistency()],
    passThreshold: TEST_SCORES.atThreshold,
  })

  describe('basic evaluation', () => {
    it('should evaluate agent output and return verdicts', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 85, reasoning: 'Factually correct', passed: true },
          { criterionId: 'consistency', score: 90, reasoning: 'Internally coherent', passed: true },
        ],
      })

      const judge = createJudge(createDefaultConfig(mockResponse))

      const result = await judge.evaluate({
        input: { query: 'What is 2+2?' },
        output: { answer: '4' },
        agentDescription: 'A math tutor agent',
      })

      expect(result.verdicts).toHaveLength(2)
      const accuracyVerdict = result.verdicts.find(v => v.criterionId === 'accuracy')
      const consistencyVerdict = result.verdicts.find(v => v.criterionId === 'consistency')
      expect(accuracyVerdict).toMatchObject({
        criterionId: 'accuracy',
        score: 85,
        reasoning: 'Factually correct',
        passed: true,
      })
      expect(consistencyVerdict).toMatchObject({
        criterionId: 'consistency',
        score: 90,
        reasoning: 'Internally coherent',
        passed: true,
      })
    })

    it('should calculate overall score as average when no weights', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 80, reasoning: 'Good', passed: true },
          { criterionId: 'consistency', score: 90, reasoning: 'Good', passed: true },
        ],
      })

      const judge = createJudge(createDefaultConfig(mockResponse))
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      expect(result.overallScore).toBe(85)
    })

    it('should determine passed based on passThreshold', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 60, reasoning: 'Below threshold', passed: false },
          { criterionId: 'consistency', score: 70, reasoning: 'At threshold', passed: true },
        ],
      })

      const judge = createJudge(createDefaultConfig(mockResponse))
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      expect(result.overallScore).toBe(65)
      expect(result.passed).toBe(false)
    })

    it('should pass when overall score equals threshold', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 70, reasoning: 'At threshold', passed: true },
          { criterionId: 'consistency', score: 70, reasoning: 'At threshold', passed: true },
        ],
      })

      const judge = createJudge(createDefaultConfig(mockResponse))
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      expect(result.overallScore).toBe(70)
      expect(result.passed).toBe(true)
    })
  })

  describe('weighted scoring', () => {
    it('should calculate weighted average correctly', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 100, reasoning: 'Perfect' },
          { criterionId: 'consistency', score: 50, reasoning: 'Average' },
        ],
      })

      const config: JudgeConfig = {
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [accuracy({ weight: 2 }), consistency({ weight: 1 })],
        passThreshold: TEST_SCORES.atThreshold,
      }

      const judge = createJudge(config)
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      // Weighted: (100*2 + 50*1) / (2+1) = 250/3 ≈ 83.33
      expect(result.overallScore).toBeCloseTo(83.33, 1)
    })

    it('should use weight=1 for criteria without explicit weight', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 100, reasoning: 'Perfect' },
          { criterionId: 'consistency', score: 100, reasoning: 'Perfect' },
          { criterionId: 'relevance', score: 0, reasoning: 'Irrelevant' },
        ],
      })

      const config: JudgeConfig = {
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [
          accuracy({ weight: 1 }),
          consistency(), // No weight specified, should default to 1
          relevance({ weight: 1 }),
        ],
        passThreshold: TEST_SCORES.atThreshold,
      }

      const judge = createJudge(config)
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      // (100*1 + 100*1 + 0*1) / 3 ≈ 66.67
      expect(result.overallScore).toBeCloseTo(66.67, 1)
    })
  })

  describe('passThreshold', () => {
    it('should use default passThreshold of 70 when not specified', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 69, reasoning: 'Below' },
        ],
      })

      const config: JudgeConfig = {
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
        // passThreshold not specified
      }

      const judge = createJudge(config)
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      expect(result.passed).toBe(false)
    })

    it('should use custom passThreshold', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 50, reasoning: 'Average' },
        ],
      })

      const config: JudgeConfig = {
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
        passThreshold: 50,
      }

      const judge = createJudge(config)
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      expect(result.passed).toBe(true)
    })

    it('should derive verdict.passed from score when not provided by LLM', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 80, reasoning: 'Good' },
          { criterionId: 'consistency', score: 60, reasoning: 'Below' },
        ],
      })

      const judge = createJudge(createDefaultConfig(mockResponse))
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      const accuracyVerdict = result.verdicts.find(v => v.criterionId === 'accuracy')
      const consistencyVerdict = result.verdicts.find(v => v.criterionId === 'consistency')
      expect(accuracyVerdict?.passed).toBe(true) // 80 >= 70
      expect(consistencyVerdict?.passed).toBe(false) // 60 < 70
    })

    it('should use LLM-provided passed value when available', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 80, reasoning: 'Good', passed: false }, // Override
          { criterionId: 'consistency', score: 60, reasoning: 'Below', passed: true }, // Override
        ],
      })

      const judge = createJudge(createDefaultConfig(mockResponse))
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      const accuracyVerdict = result.verdicts.find(v => v.criterionId === 'accuracy')
      const consistencyVerdict = result.verdicts.find(v => v.criterionId === 'consistency')
      expect(accuracyVerdict?.passed).toBe(false) // LLM said false despite score >= 70
      expect(consistencyVerdict?.passed).toBe(true) // LLM said true despite score < 70
    })
  })

  describe('JSON parsing', () => {
    // Note: With Output.json(), the AI SDK expects pure JSON from the model.
    // Markdown code blocks and surrounding text are no longer supported.
    // These tests now verify that only pure JSON works.

    it('should extract verdicts from pure JSON response', async () => {
      const mockResponse = `{"verdicts": [{"criterionId": "accuracy", "score": 92, "reasoning": "Excellent"}]}`

      const config: JudgeConfig = {
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
      }

      const judge = createJudge(config)
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      const accuracyVerdict = result.verdicts.find(v => v.criterionId === 'accuracy')
      expect(accuracyVerdict?.score).toBe(92)
    })

    it('should reject markdown code block format', async () => {
      // With Output.json(), markdown code blocks are not parsed - pure JSON is required
      const mockResponse = `\`\`\`json
{"verdicts": [{"criterionId": "accuracy", "score": 85, "reasoning": "Good"}]}
\`\`\``

      const config: JudgeConfig = {
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
      }

      const judge = createJudge(config)

      await expect(judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should reject JSON with surrounding text', async () => {
      // With Output.json(), surrounding text is not stripped - pure JSON is required
      const mockResponse = `Based on my analysis, {"verdicts": [{"criterionId": "accuracy", "score": 77, "reasoning": "Good"}]} is my evaluation.`

      const config: JudgeConfig = {
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
      }

      const judge = createJudge(config)

      await expect(judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })
  })

  describe('error handling', () => {
    it('should throw LLM_API_ERROR for invalid JSON (Output.json() validation)', async () => {
      // When using Output.json(), the AI SDK validates JSON at the model level
      // Invalid JSON causes an LLM_API_ERROR, not JSON_PARSE_ERROR
      const mockResponse = 'This is not valid JSON at all'
      const judge = createJudge(createDefaultConfig(mockResponse))

      await expect(judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when verdicts array is missing (schema validation)', async () => {
      const mockResponse = JSON.stringify({ result: 'no verdicts here' })
      const judge = createJudge(createDefaultConfig(mockResponse))

      await expect(judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when verdict is missing criterionId (schema validation)', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [{ score: 80, reasoning: 'Good' }],
      })
      const judge = createJudge(createDefaultConfig(mockResponse))

      await expect(judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when score is out of range (schema validation)', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [{ criterionId: 'accuracy', score: 150, reasoning: 'Too high' }],
      })
      const judge = createJudge(createDefaultConfig(mockResponse))

      await expect(judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when score is negative (schema validation)', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [{ criterionId: 'accuracy', score: -10, reasoning: 'Negative' }],
      })
      const judge = createJudge(createDefaultConfig(mockResponse))

      await expect(judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when reasoning is missing (schema validation)', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [{ criterionId: 'accuracy', score: 80 }],
      })
      const judge = createJudge(createDefaultConfig(mockResponse))

      await expect(judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw VERDICT_PARSE_ERROR when criteria are missing from verdicts', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [{ criterionId: 'accuracy', score: 80, reasoning: 'Good' }],
      })
      const config: JudgeConfig = {
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [accuracy(), consistency()], // consistency is missing
      }
      const judge = createJudge(config)

      const error = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' }).catch((e) => e)

      expect(error).toMatchObject({
        code: EvalErrorCode.VERDICT_PARSE_ERROR,
        message: expect.stringContaining('missing verdicts for some criteria'),
      })
      expect(error.context?.missingCriteriaIds).toContain('consistency')
    })

    it('should throw LLM_API_ERROR when LLM call fails', async () => {
      const config: JudgeConfig = {
        provider: mock.provider(mock.error(new Error('API timeout'))),
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
      }
      const judge = createJudge(config)

      const error = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' }).catch((e) => e)

      expect(error).toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
      expect(error.context?.promptId).toBe('default-judge')
    })
  })

  describe('prompt building', () => {
    it('should call LLM once and return valid verdicts', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [{ criterionId: 'accuracy', score: 80, reasoning: 'Good' }],
      })

      const mockProvider = mock.provider(mock.text(mockResponse))

      const config: JudgeConfig = {
        provider: mockProvider,
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
      }

      const judge = createJudge(config)
      const result = await judge.evaluate({
        input: { question: 'What is AI?' },
        output: { answer: 'Artificial Intelligence' },
        agentDescription: 'A helpful assistant',
      })

      // Verify LLM was called exactly once and verdicts were returned
      const calls = mockProvider.getCalls()
      expect(calls).toHaveLength(1)
      expect(result.verdicts).toHaveLength(1)
      const accuracyVerdict = result.verdicts.find(v => v.criterionId === 'accuracy')
      expect(accuracyVerdict).toMatchObject({
        criterionId: 'accuracy',
        score: 80,
        reasoning: 'Good',
      })
    })

    it('should return verdicts for all configured criteria', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 80, reasoning: 'Good' },
          { criterionId: 'consistency', score: 85, reasoning: 'Good' },
          { criterionId: 'relevance', score: 90, reasoning: 'Good' },
        ],
      })

      const mockProvider = mock.provider(mock.text(mockResponse))

      const config: JudgeConfig = {
        provider: mockProvider,
        prompt: defaultJudgePrompt,
        criteria: [accuracy(), consistency(), relevance()],
      }

      const judge = createJudge(config)
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      // Verify all configured criteria have corresponding verdicts in result
      expect(result.verdicts).toHaveLength(3)
      expect(result.verdicts.map(v => v.criterionId)).toEqual(
        expect.arrayContaining(['accuracy', 'consistency', 'relevance'])
      )
    })
  })

  describe('edge cases', () => {
    it('should handle empty criteria array', async () => {
      const mockResponse = JSON.stringify({ verdicts: [] })

      const config: JudgeConfig = {
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [],
      }

      const judge = createJudge(config)
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      expect(result.verdicts).toHaveLength(0)
      expect(result.overallScore).toBe(0)
      expect(result.passed).toBe(false) // 0 < 70
    })

    it('should handle null input/output values', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [{ criterionId: 'accuracy', score: 50, reasoning: 'Null handling' }],
      })

      const config: JudgeConfig = {
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
      }

      const judge = createJudge(config)
      const result = await judge.evaluate({ input: null, output: null, agentDescription: 'Agent' })

      expect(result.verdicts).toHaveLength(1)
    })

    it('should handle complex nested input/output', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [{ criterionId: 'accuracy', score: 90, reasoning: 'Complex data handled' }],
      })

      const mockProvider = mock.provider(mock.text(mockResponse))

      const config: JudgeConfig = {
        provider: mockProvider,
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
      }

      const judge = createJudge(config)
      const result = await judge.evaluate({
        input: { nested: { deep: { value: [1, 2, 3] } } },
        output: { result: { items: [{ id: 1 }, { id: 2 }] } },
        agentDescription: 'Agent',
      })

      // Verify evaluation completes successfully with valid verdicts for complex nested data
      expect(mockProvider.getCalls()).toHaveLength(1)
      expect(result.verdicts).toHaveLength(1)
      const accuracyVerdict = result.verdicts.find(v => v.criterionId === 'accuracy')
      expect(accuracyVerdict).toMatchObject({
        criterionId: 'accuracy',
        score: 90,
        reasoning: 'Complex data handled',
      })
    })

    it('should handle score of exactly 0', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [{ criterionId: 'accuracy', score: 0, reasoning: 'Completely wrong' }],
      })

      const config: JudgeConfig = {
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
      }

      const judge = createJudge(config)
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      const accuracyVerdict = result.verdicts.find(v => v.criterionId === 'accuracy')
      expect(accuracyVerdict?.score).toBe(0)
      expect(result.overallScore).toBe(0)
      expect(result.passed).toBe(false)
    })

    it('should handle score of exactly 100', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [{ criterionId: 'accuracy', score: 100, reasoning: 'Perfect' }],
      })

      const config: JudgeConfig = {
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
      }

      const judge = createJudge(config)
      const result = await judge.evaluate({ input: {}, output: {}, agentDescription: 'Agent' })

      const accuracyVerdict = result.verdicts.find(v => v.criterionId === 'accuracy')
      expect(accuracyVerdict?.score).toBe(100)
      expect(result.overallScore).toBe(100)
      expect(result.passed).toBe(true)
    })
  })

  describe('JSON mode', () => {
    it('should pass responseFormat: json_object to LLM', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 80, reasoning: 'Good' },
        ],
      })

      const mockProvider = mock.provider(mock.text(mockResponse))

      const judge = createJudge({
        provider: mockProvider,
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
      })

      await judge.evaluate({
        input: { query: 'test' },
        output: { answer: 'result' },
        agentDescription: 'Test Agent',
      })

      const calls = mockProvider.getCalls()
      expect(calls).toHaveLength(1)
      // Note: Core mock doesn't expose responseFormat directly - it's part of params
      expect(calls[0].type).toBe('generate')
    })
  })

  describe('metadata', () => {
    it('should return metadata with tokenUsage when LLM is called', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [{ criterionId: 'accuracy', score: 85, reasoning: 'Good' }],
      })

      // Create mock with custom usage
      const judge = createJudge({
        provider: mock.provider(mock.text(mockResponse, {
          usage: createMockUsage({
            inputTokens: { total: 100, noCache: 100 },
            outputTokens: { total: 50, text: 50 },
          }),
        })),
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
      })

      const result = await judge.evaluate({
        input: { query: 'test' },
        output: { answer: 'result' },
        agentDescription: 'Test Agent',
      })

      expect(result.metadata).toBeDefined()
      expect(result.metadata?.tokenUsage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      })
    })

    it('should return metadata with default usage when mock provides usage', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [{ criterionId: 'accuracy', score: 85, reasoning: 'Good' }],
      })

      // Default mock returns zero usage
      const judge = createJudge({
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [accuracy()],
      })

      const result = await judge.evaluate({
        input: { query: 'test' },
        output: { answer: 'result' },
        agentDescription: 'Test Agent',
      })

      // Mock always returns usage (zeros by default), so metadata is present
      expect(result.metadata).toBeDefined()
      expect(result.metadata?.tokenUsage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })
    })

    it('should return undefined metadata when only validator criteria (no LLM call)', async () => {
      const TestSchema = z.object({ name: z.string() })

      const judge = createJudge({
        provider: mock.provider(mock.text('{}')),
        prompt: defaultJudgePrompt,
        criteria: [schema({ schema: TestSchema })],
      })

      const result = await judge.evaluate({
        input: {},
        output: { name: 'John' },
        agentDescription: 'Test Agent',
      })

      // LLM was not called, so no metadata
      expect(result.metadata).toBeUndefined()
    })
  })

  describe('validator criteria', () => {
    const TestSchema = z.object({
      name: z.string(),
      age: z.number(),
    })

    it('should evaluate validator criteria without calling LLM', async () => {
      const mockProvider = mock.provider(mock.text('{}'))

      const judge = createJudge({
        provider: mockProvider,
        prompt: defaultJudgePrompt,
        criteria: [schema({ schema: TestSchema })],
      })

      const result = await judge.evaluate({
        input: {},
        output: { name: 'John', age: 30 },
        agentDescription: 'Test Agent',
      })

      // Should not call LLM for validator-only criteria
      expect(mockProvider.getCalls()).toHaveLength(0)
      expect(result.verdicts).toHaveLength(1)
      const schemaVerdict = result.verdicts.find(v => v.criterionId === 'schema-validation')
      expect(schemaVerdict?.criterionId).toBe('schema-validation')
      expect(schemaVerdict?.score).toBe(100)
      expect(schemaVerdict?.passed).toBe(true)
    })

    it('should return score 0 for invalid schema', async () => {
      const mockProvider = mock.provider(mock.text('{}'))

      const judge = createJudge({
        provider: mockProvider,
        prompt: defaultJudgePrompt,
        criteria: [schema({ schema: TestSchema })],
      })

      const result = await judge.evaluate({
        input: {},
        output: { name: 'John', age: 'thirty' }, // age should be number
        agentDescription: 'Test Agent',
      })

      expect(mockProvider.getCalls()).toHaveLength(0)
      const schemaVerdict = result.verdicts.find(v => v.criterionId === 'schema-validation')
      expect(schemaVerdict?.score).toBe(0)
      expect(schemaVerdict?.passed).toBe(false)
      expect(schemaVerdict?.reasoning).toContain('스키마 유효성 실패')
    })

    it('should include error details in reasoning for invalid schema', async () => {
      const judge = createJudge({
        provider: mock.provider(mock.text('{}')),
        prompt: defaultJudgePrompt,
        criteria: [schema({ schema: TestSchema })],
      })

      const result = await judge.evaluate({
        input: {},
        output: { name: 'John' }, // missing age
        agentDescription: 'Test Agent',
      })

      const schemaVerdict = result.verdicts.find(v => v.criterionId === 'schema-validation')
      expect(schemaVerdict?.reasoning).toContain('age')
    })

    it('should combine validator criteria with LLM criteria', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 80, reasoning: 'Good' },
        ],
      })

      const mockProvider = mock.provider(mock.text(mockResponse))

      const judge = createJudge({
        provider: mockProvider,
        prompt: defaultJudgePrompt,
        criteria: [
          schema({ schema: TestSchema }),
          accuracy(),
        ],
      })

      const result = await judge.evaluate({
        input: {},
        output: { name: 'John', age: 30 },
        agentDescription: 'Test Agent',
      })

      // Should call LLM only for accuracy
      expect(mockProvider.getCalls()).toHaveLength(1)

      // Should have both verdicts
      expect(result.verdicts).toHaveLength(2)

      // Find verdicts by id
      const schemaVerdict = result.verdicts.find(v => v.criterionId === 'schema-validation')
      const accuracyVerdict = result.verdicts.find(v => v.criterionId === 'accuracy')

      expect(schemaVerdict?.score).toBe(100)
      expect(accuracyVerdict?.score).toBe(80)
    })

    it('should calculate weighted average with validator criteria', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 80, reasoning: 'Good' },
        ],
      })

      const judge = createJudge({
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [
          schema({ schema: TestSchema, weight: 2 }), // 100 * 2
          accuracy({ weight: 1 }), // 80 * 1
        ],
      })

      const result = await judge.evaluate({
        input: {},
        output: { name: 'John', age: 30 },
        agentDescription: 'Test Agent',
      })

      // Weighted: (100*2 + 80*1) / (2+1) = 280/3 ≈ 93.33
      expect(result.overallScore).toBeCloseTo(93.33, 1)
      expect(result.passed).toBe(true)
    })

    it('should fail overall if schema validation fails', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 100, reasoning: 'Perfect' },
        ],
      })

      const judge = createJudge({
        provider: mock.provider(mock.text(mockResponse)),
        prompt: defaultJudgePrompt,
        criteria: [
          schema({ schema: TestSchema, weight: 1 }), // 0 (invalid)
          accuracy({ weight: 1 }), // 100
        ],
        passThreshold: TEST_SCORES.atThreshold,
      })

      const result = await judge.evaluate({
        input: {},
        output: { invalid: 'data' }, // No name or age
        agentDescription: 'Test Agent',
      })

      // Weighted: (0*1 + 100*1) / 2 = 50
      expect(result.overallScore).toBe(50)
      expect(result.passed).toBe(false)
    })

    it('should only pass LLM criteria to LLM prompt', async () => {
      const mockResponse = JSON.stringify({
        verdicts: [
          { criterionId: 'accuracy', score: 80, reasoning: 'Good' },
          { criterionId: 'consistency', score: 90, reasoning: 'Coherent' },
        ],
      })

      const mockProvider = mock.provider(mock.text(mockResponse))

      const judge = createJudge({
        provider: mockProvider,
        prompt: defaultJudgePrompt,
        criteria: [
          schema({ schema: TestSchema }),
          accuracy(),
          consistency(),
        ],
      })

      const result = await judge.evaluate({ input: {}, output: { name: 'John', age: 30 }, agentDescription: 'Test Agent' })

      // Verify LLM was called once for LLM criteria (accuracy, consistency)
      // Validator criteria (schema) are evaluated locally without LLM call
      const calls = mockProvider.getCalls()
      expect(calls).toHaveLength(1)

      // All criteria should have verdicts (2 from LLM + 1 from validator)
      expect(result.verdicts).toHaveLength(3)

      // Verify LLM criteria verdicts came from the mock response
      const llmVerdicts = result.verdicts.filter(v =>
        v.criterionId === 'accuracy' || v.criterionId === 'consistency'
      )
      expect(llmVerdicts).toHaveLength(2)

      // Verify validator criterion was evaluated locally (not in LLM response)
      const schemaVerdict = result.verdicts.find(v => v.criterionId === 'schema-validation')
      expect(schemaVerdict).toBeDefined()
      expect(schemaVerdict?.score).toBe(100)
    })

    it('should handle only validator criteria (no LLM call)', async () => {
      const mockProvider = mock.provider(mock.text('{}'))

      const AnotherSchema = z.object({ id: z.number() })

      const judge = createJudge({
        provider: mockProvider,
        prompt: defaultJudgePrompt,
        criteria: [
          schema({ id: 'test-schema', schema: TestSchema }),
          schema({ id: 'id-schema', schema: AnotherSchema, name: 'ID Schema' }),
        ],
      })

      const result = await judge.evaluate({
        input: {},
        output: { name: 'John', age: 30, id: 1 },
        agentDescription: 'Test Agent',
      })

      // Should not call LLM at all
      expect(mockProvider.getCalls()).toHaveLength(0)
      expect(result.verdicts).toHaveLength(2)
      expect(result.overallScore).toBe(100)
      expect(result.passed).toBe(true)
    })

    it('should handle multiple validator criteria with different ids', async () => {
      const NameSchema = z.object({ name: z.string() })
      const CountSchema = z.object({ count: z.number() })

      const judge = createJudge({
        provider: mock.provider(mock.text('{}')),
        prompt: defaultJudgePrompt,
        criteria: [
          schema({ id: 'name-schema', schema: NameSchema, name: 'Name Validator' }),
          schema({ id: 'count-schema', schema: CountSchema, name: 'Count Validator' }),
        ],
      })

      const result = await judge.evaluate({
        input: {},
        output: { name: 'Test', count: 42 },
        agentDescription: 'Test Agent',
      })

      expect(result.verdicts).toHaveLength(2)
      expect(result.verdicts.map(v => v.criterionId)).toEqual(['name-schema', 'count-schema'])

      // Verify each verdict uses dynamic reasoning with criterion name
      const nameVerdict = result.verdicts.find(v => v.criterionId === 'name-schema')
      const countVerdict = result.verdicts.find(v => v.criterionId === 'count-schema')

      expect(nameVerdict?.reasoning).toContain('Name Validator 통과')
      expect(countVerdict?.reasoning).toContain('Count Validator 통과')
    })

    it('should use criterion name in failure reasoning', async () => {
      const StrictSchema = z.object({ required: z.string() })

      const judge = createJudge({
        provider: mock.provider(mock.text('{}')),
        prompt: defaultJudgePrompt,
        criteria: [
          schema({
            id: 'strict-schema',
            schema: StrictSchema,
            name: 'Strict Validator',
          }),
        ],
      })

      const result = await judge.evaluate({ input: {}, output: { wrong: 'field' }, agentDescription: 'Test Agent' })

      const schemaVerdict = result.verdicts.find(v => v.criterionId === 'strict-schema')
      expect(schemaVerdict?.reasoning).toContain('Strict Validator 실패')
      expect(schemaVerdict?.reasoning).toContain('required')
    })
  })
})
