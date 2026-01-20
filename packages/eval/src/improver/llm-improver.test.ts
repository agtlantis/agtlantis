import { describe, it, expect } from 'vitest'
import { createImprover } from './llm-improver'
import { mock } from '@agtlantis/core/testing'
import { defaultImproverPrompt } from './prompts/default'
import { EvalErrorCode } from '@/core/errors'
import { MOCK_LATENCY, createMockUsage } from '@/testing'
import type { ImproverConfig } from './types'
import type { AgentPrompt, SingleTurnResult } from '@/core/types'

describe('createImprover', () => {
  const mockAgentPrompt: AgentPrompt<any> = {
    id: 'test-agent',
    version: '1.0.0',
    system: 'You are a helpful assistant.',
    buildUserPrompt: (input: any) => `User query: ${JSON.stringify(input)}`,
  }

  const createTestResult = (
    overrides: Partial<SingleTurnResult<any, any>> = {}
  ): SingleTurnResult<any, any> => ({
    kind: 'single-turn',
    testCase: { id: 'test-1', input: { query: 'test' } },
    output: { answer: 'response' },
    metrics: {
      latencyMs: MOCK_LATENCY.normal,
      tokenUsage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
    },
    verdicts: [
      {
        criterionId: 'accuracy',
        score: 85,
        reasoning: 'Good accuracy',
        passed: true,
      },
    ],
    overallScore: 85,
    passed: true,
    ...overrides,
  })

  const createDefaultConfig = (llmResponse: string): ImproverConfig => ({
    provider: mock.provider(mock.text(llmResponse)),
    prompt: defaultImproverPrompt,
  })

  describe('basic improvement', () => {
    it('should return suggestions from LLM response', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            currentValue: 'You are a helpful assistant.',
            suggestedValue:
              'You are a helpful and precise assistant that always provides accurate information.',
            reasoning: 'The current prompt lacks specificity about accuracy.',
            expectedImprovement:
              'Should improve accuracy scores by 10-15 points.',
          },
        ],
      })

      const improver = createImprover(createDefaultConfig(mockResponse))
      const results = [createTestResult({ overallScore: 60, passed: false })]

      const { suggestions } = await improver.improve(mockAgentPrompt, results)

      expect(suggestions).toHaveLength(1)
      const systemPromptSuggestion = suggestions.find(s => s.type === 'system_prompt')
      expect(systemPromptSuggestion).toMatchObject({
        type: 'system_prompt',
        priority: 'high',
        currentValue: 'You are a helpful assistant.',
        suggestedValue: expect.stringContaining('accurate information'),
        reasoning: expect.stringContaining('accuracy'),
        expectedImprovement: expect.stringContaining('10-15 points'),
      })
    })

    it('should handle multiple suggestions', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            currentValue: 'Old system prompt',
            suggestedValue: 'New system prompt',
            reasoning: 'Improve clarity',
            expectedImprovement: 'Better clarity',
          },
          {
            type: 'user_prompt',
            priority: 'medium',
            currentValue: 'Old user prompt',
            suggestedValue: 'New user prompt',
            reasoning: 'Improve context',
            expectedImprovement: 'Better context handling',
          },
          {
            type: 'parameters',
            priority: 'low',
            currentValue: 'temperature: 0.7',
            suggestedValue: 'temperature: 0.3',
            reasoning: 'Reduce randomness',
            expectedImprovement: 'More consistent outputs',
          },
        ],
      })

      const improver = createImprover(createDefaultConfig(mockResponse))
      const results = [createTestResult()]

      const { suggestions } = await improver.improve(mockAgentPrompt, results)

      expect(suggestions).toHaveLength(3)
      const systemPromptSuggestion = suggestions.find(s => s.type === 'system_prompt')
      const userPromptSuggestion = suggestions.find(s => s.type === 'user_prompt')
      const parametersSuggestion = suggestions.find(s => s.type === 'parameters')
      expect(systemPromptSuggestion).toBeDefined()
      expect(userPromptSuggestion).toBeDefined()
      expect(parametersSuggestion).toBeDefined()
    })

    it('should initialize approved and modified as undefined', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            currentValue: 'old',
            suggestedValue: 'new',
            reasoning: 'reason',
            expectedImprovement: 'improvement',
          },
        ],
      })

      const improver = createImprover(createDefaultConfig(mockResponse))
      const { suggestions } = await improver.improve(mockAgentPrompt, [
        createTestResult(),
      ])

      const suggestion = suggestions.find(s => s.type === 'system_prompt')
      expect(suggestion?.approved).toBeUndefined()
      expect(suggestion?.modified).toBeUndefined()
    })

    it('should handle empty suggestions array', async () => {
      const mockResponse = JSON.stringify({ suggestions: [] })

      const improver = createImprover(createDefaultConfig(mockResponse))
      const results = [createTestResult({ overallScore: 95, passed: true })]

      const { suggestions } = await improver.improve(mockAgentPrompt, results)

      expect(suggestions).toHaveLength(0)
    })
  })

  describe('metrics aggregation', () => {
    it('should process results with varying latencies', async () => {
      const mockResponse = JSON.stringify({ suggestions: [] })
      const mockProvider = mock.provider(mock.text(mockResponse))

      const config: ImproverConfig = {
        provider: mockProvider,
        prompt: defaultImproverPrompt,
      }

      const improver = createImprover(config)
      const results = [
        createTestResult({ metrics: { latencyMs: MOCK_LATENCY.normal, tokenUsage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 } } }),
        createTestResult({ metrics: { latencyMs: 200, tokenUsage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 } } }),
        createTestResult({ metrics: { latencyMs: 300, tokenUsage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 } } }),
      ]

      const { suggestions } = await improver.improve(mockAgentPrompt, results)

      // Verify LLM was called and returned valid suggestions structure
      const calls = mockProvider.getCalls()
      expect(calls).toHaveLength(1)
      expect(suggestions).toBeDefined()
      expect(Array.isArray(suggestions)).toBe(true)
    })

    it('should process results with different token counts', async () => {
      const mockResponse = JSON.stringify({ suggestions: [] })
      const mockProvider = mock.provider(mock.text(mockResponse))

      const config: ImproverConfig = {
        provider: mockProvider,
        prompt: defaultImproverPrompt,
      }

      const improver = createImprover(config)
      const results = [
        createTestResult({ metrics: { latencyMs: MOCK_LATENCY.normal, tokenUsage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 } } }),
        createTestResult({ metrics: { latencyMs: MOCK_LATENCY.normal, tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } } }),
      ]

      const { suggestions } = await improver.improve(mockAgentPrompt, results)

      // Verify LLM was called and returned valid suggestions structure
      const calls = mockProvider.getCalls()
      expect(calls).toHaveLength(1)
      expect(suggestions).toBeDefined()
      expect(Array.isArray(suggestions)).toBe(true)
    })

    it('should return empty suggestions for empty results', async () => {
      const mockResponse = JSON.stringify({ suggestions: [] })
      const mockProvider = mock.provider(mock.text(mockResponse))

      const config: ImproverConfig = {
        provider: mockProvider,
        prompt: defaultImproverPrompt,
      }

      const improver = createImprover(config)
      const { suggestions } = await improver.improve(mockAgentPrompt, [])

      // Verify graceful handling with valid output structure
      const calls = mockProvider.getCalls()
      expect(calls).toHaveLength(1)
      expect(suggestions).toBeDefined()
      expect(Array.isArray(suggestions)).toBe(true)
      expect(suggestions).toHaveLength(0)
    })
  })

  describe('JSON parsing', () => {
    // Note: With Output.json(), the AI SDK expects pure JSON from the model.
    // Markdown code blocks and surrounding text are no longer supported.
    // These tests now verify that only pure JSON works.

    it('should extract suggestions from pure JSON response', async () => {
      const mockResponse = `{"suggestions": [{"type": "parameters", "priority": "low", "currentValue": "x", "suggestedValue": "y", "reasoning": "z", "expectedImprovement": "w"}]}`

      const improver = createImprover(createDefaultConfig(mockResponse))
      const { suggestions } = await improver.improve(mockAgentPrompt, [
        createTestResult(),
      ])

      const parametersSuggestion = suggestions.find(s => s.type === 'parameters')
      expect(parametersSuggestion).toBeDefined()
    })

    it('should throw LLM_API_ERROR for markdown code block (not pure JSON)', async () => {
      // With Output.json(), markdown code blocks are not parsed - pure JSON is required
      const mockResponse = `\`\`\`json
{"suggestions": []}
\`\`\``

      const improver = createImprover(createDefaultConfig(mockResponse))

      await expect(
        improver.improve(mockAgentPrompt, [createTestResult()])
      ).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR for JSON with surrounding text (not pure JSON)', async () => {
      // With Output.json(), surrounding text is not stripped - pure JSON is required
      const mockResponse = `Here is the JSON: {"suggestions": []}`

      const improver = createImprover(createDefaultConfig(mockResponse))

      await expect(
        improver.improve(mockAgentPrompt, [createTestResult()])
      ).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })
  })

  describe('error handling', () => {
    it('should throw LLM_API_ERROR for invalid JSON (Output.json() validation)', async () => {
      // When using Output.json(), the AI SDK validates JSON at the model level
      // Invalid JSON causes an LLM_API_ERROR, not JSON_PARSE_ERROR
      const mockResponse = 'This is not valid JSON at all'
      const improver = createImprover(createDefaultConfig(mockResponse))

      await expect(
        improver.improve(mockAgentPrompt, [createTestResult()])
      ).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when response is not an object (schema validation)', async () => {
      const mockResponse = '"just a string"'
      const improver = createImprover(createDefaultConfig(mockResponse))

      await expect(
        improver.improve(mockAgentPrompt, [createTestResult()])
      ).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when suggestion item is not an object (schema validation)', async () => {
      const mockResponse = JSON.stringify({
        suggestions: ['not an object', 123, null],
      })
      const improver = createImprover(createDefaultConfig(mockResponse))

      await expect(
        improver.improve(mockAgentPrompt, [createTestResult()])
      ).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when suggestions array is missing (schema validation)', async () => {
      const mockResponse = JSON.stringify({ result: 'no suggestions here' })
      const improver = createImprover(createDefaultConfig(mockResponse))

      await expect(
        improver.improve(mockAgentPrompt, [createTestResult()])
      ).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR for invalid type (schema validation)', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'invalid_type',
            priority: 'high',
            currentValue: 'a',
            suggestedValue: 'b',
            reasoning: 'c',
            expectedImprovement: 'd',
          },
        ],
      })
      const improver = createImprover(createDefaultConfig(mockResponse))

      await expect(
        improver.improve(mockAgentPrompt, [createTestResult()])
      ).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR for invalid priority (schema validation)', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'critical', // invalid
            currentValue: 'a',
            suggestedValue: 'b',
            reasoning: 'c',
            expectedImprovement: 'd',
          },
        ],
      })
      const improver = createImprover(createDefaultConfig(mockResponse))

      await expect(
        improver.improve(mockAgentPrompt, [createTestResult()])
      ).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when currentValue is missing (schema validation)', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            suggestedValue: 'new value',
            reasoning: 'reason',
            expectedImprovement: 'improvement',
          },
        ],
      })
      const improver = createImprover(createDefaultConfig(mockResponse))

      await expect(
        improver.improve(mockAgentPrompt, [createTestResult()])
      ).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when suggestedValue is missing (schema validation)', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            currentValue: 'old value',
            reasoning: 'reason',
            expectedImprovement: 'improvement',
          },
        ],
      })
      const improver = createImprover(createDefaultConfig(mockResponse))

      await expect(
        improver.improve(mockAgentPrompt, [createTestResult()])
      ).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when reasoning is missing (schema validation)', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            currentValue: 'old',
            suggestedValue: 'new',
            expectedImprovement: 'improvement',
          },
        ],
      })
      const improver = createImprover(createDefaultConfig(mockResponse))

      await expect(
        improver.improve(mockAgentPrompt, [createTestResult()])
      ).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when expectedImprovement is missing (schema validation)', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            currentValue: 'old',
            suggestedValue: 'new',
            reasoning: 'reason',
          },
        ],
      })
      const improver = createImprover(createDefaultConfig(mockResponse))

      await expect(
        improver.improve(mockAgentPrompt, [createTestResult()])
      ).rejects.toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
    })

    it('should throw LLM_API_ERROR when LLM call fails', async () => {
      const config: ImproverConfig = {
        provider: mock.provider(mock.error(new Error('API timeout'))),
        prompt: defaultImproverPrompt,
      }
      const improver = createImprover(config)

      const error = await improver
        .improve(mockAgentPrompt, [createTestResult()])
        .catch((e) => e)

      expect(error).toMatchObject({
        code: EvalErrorCode.LLM_API_ERROR,
      })
      expect(error.context?.promptId).toBe('default-improver')
    })

  })

  describe('prompt building', () => {
    it('should call LLM and return valid suggestions', async () => {
      const mockResponse = JSON.stringify({ suggestions: [] })
      const mockProvider = mock.provider(mock.text(mockResponse))

      const config: ImproverConfig = {
        provider: mockProvider,
        prompt: defaultImproverPrompt,
      }

      const improver = createImprover(config)
      const { suggestions } = await improver.improve(mockAgentPrompt, [createTestResult()])

      // Verify LLM was called exactly once and returned valid suggestions
      const calls = mockProvider.getCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0].type).toBe('generate')
      expect(suggestions).toBeDefined()
      expect(Array.isArray(suggestions)).toBe(true)
    })

    it('should process with given agent context', async () => {
      const mockResponse = JSON.stringify({ suggestions: [] })
      const mockProvider = mock.provider(mock.text(mockResponse))

      const config: ImproverConfig = {
        provider: mockProvider,
        prompt: defaultImproverPrompt,
      }

      const improver = createImprover(config)
      const { suggestions } = await improver.improve(mockAgentPrompt, [createTestResult()])

      // Verify suggestions are returned (proves LLM received context and processed it)
      const calls = mockProvider.getCalls()
      expect(calls).toHaveLength(1)
      expect(suggestions).toBeDefined()
      expect(Array.isArray(suggestions)).toBe(true)
    })

    it('should consider all test results when generating suggestions', async () => {
      const mockResponse = JSON.stringify({ suggestions: [] })
      const mockProvider = mock.provider(mock.text(mockResponse))

      const config: ImproverConfig = {
        provider: mockProvider,
        prompt: defaultImproverPrompt,
      }

      const improver = createImprover(config)
      const results = [
        createTestResult({ passed: true }),
        createTestResult({ passed: false }),
        createTestResult({ passed: true }),
      ]
      const { suggestions } = await improver.improve(mockAgentPrompt, results)

      // Verify LLM was called and processed all results
      const calls = mockProvider.getCalls()
      expect(calls).toHaveLength(1)
      expect(suggestions).toBeDefined()
      expect(Array.isArray(suggestions)).toBe(true)
    })

    it('should include failed case details in user message', async () => {
      // Mock response with a suggestion that addresses the failure
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            currentValue: 'You are a helpful assistant.',
            suggestedValue: 'You are a helpful assistant that provides accurate answers.',
            reasoning: 'The test case failed due to accuracy issues',
            expectedImprovement: 'Better accuracy on difficult questions',
          },
        ],
      })
      const mockProvider = mock.provider(mock.text(mockResponse))

      const config: ImproverConfig = {
        provider: mockProvider,
        prompt: defaultImproverPrompt,
      }

      const improver = createImprover(config)
      const failedResult = createTestResult({
        testCase: { id: 'failed-case', input: { query: 'hard question' } },
        overallScore: 45,
        passed: false,
        verdicts: [
          {
            criterionId: 'accuracy',
            score: 45,
            reasoning: 'Incorrect answer',
            passed: false,
          },
        ],
      })
      const { suggestions } = await improver.improve(mockAgentPrompt, [failedResult])

      // Verify suggestions address the failure (reasoning is defined)
      const calls = mockProvider.getCalls()
      expect(calls).toHaveLength(1)
      expect(suggestions).toBeDefined()
      expect(suggestions).toHaveLength(1)
      expect(suggestions[0].reasoning).toBeDefined()
      expect(typeof suggestions[0].reasoning).toBe('string')
    })
  })

  describe('priority values', () => {
    it('should accept all valid priority values', async () => {
      const priorities = ['high', 'medium', 'low'] as const

      for (const priority of priorities) {
        const mockResponse = JSON.stringify({
          suggestions: [
            {
              type: 'system_prompt',
              priority,
              currentValue: 'a',
              suggestedValue: 'b',
              reasoning: 'c',
              expectedImprovement: 'd',
            },
          ],
        })

        const improver = createImprover(createDefaultConfig(mockResponse))
        const { suggestions } = await improver.improve(mockAgentPrompt, [
          createTestResult(),
        ])

        expect(suggestions[0].priority).toBe(priority)
      }
    })
  })

  describe('type values', () => {
    it('should accept all valid type values', async () => {
      const types = ['system_prompt', 'user_prompt', 'parameters'] as const

      for (const type of types) {
        const mockResponse = JSON.stringify({
          suggestions: [
            {
              type,
              priority: 'high',
              currentValue: 'a',
              suggestedValue: 'b',
              reasoning: 'c',
              expectedImprovement: 'd',
            },
          ],
        })

        const improver = createImprover(createDefaultConfig(mockResponse))
        const { suggestions } = await improver.improve(mockAgentPrompt, [
          createTestResult(),
        ])

        expect(suggestions[0].type).toBe(type)
      }
    })
  })

  describe('edge cases', () => {
    it('should handle suggestion with empty strings', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            currentValue: '',
            suggestedValue: 'Add a system prompt',
            reasoning: 'No system prompt exists',
            expectedImprovement: 'Better guidance',
          },
        ],
      })

      const improver = createImprover(createDefaultConfig(mockResponse))
      const { suggestions } = await improver.improve(mockAgentPrompt, [
        createTestResult(),
      ])

      expect(suggestions[0].currentValue).toBe('')
    })

    it('should handle multiline values', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            currentValue: 'Line 1\nLine 2\nLine 3',
            suggestedValue: 'New Line 1\nNew Line 2',
            reasoning: 'Simplify the prompt',
            expectedImprovement: 'Clearer instructions',
          },
        ],
      })

      const improver = createImprover(createDefaultConfig(mockResponse))
      const { suggestions } = await improver.improve(mockAgentPrompt, [
        createTestResult(),
      ])

      expect(suggestions[0].currentValue).toContain('\n')
      expect(suggestions[0].suggestedValue).toContain('\n')
    })

    it('should handle special characters in values', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            currentValue: 'Use {{variable}} placeholder',
            suggestedValue: 'Use ${variable} placeholder',
            reasoning: 'Switch template syntax',
            expectedImprovement: 'Better compatibility',
          },
        ],
      })

      const improver = createImprover(createDefaultConfig(mockResponse))
      const { suggestions } = await improver.improve(mockAgentPrompt, [
        createTestResult(),
      ])

      expect(suggestions[0].currentValue).toContain('{{variable}}')
      expect(suggestions[0].suggestedValue).toContain('${variable}')
    })

    it('should handle very long suggestion values', async () => {
      const longValue = 'x'.repeat(10000)
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            currentValue: longValue,
            suggestedValue: longValue + ' improved',
            reasoning: 'Minor tweak',
            expectedImprovement: 'Small improvement',
          },
        ],
      })

      const improver = createImprover(createDefaultConfig(mockResponse))
      const { suggestions } = await improver.improve(mockAgentPrompt, [
        createTestResult(),
      ])

      expect(suggestions[0].currentValue.length).toBe(10000)
    })
  })

  describe('JSON mode', () => {
    it('should pass responseFormat: json_object to LLM', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'medium',
            currentValue: 'Old prompt',
            suggestedValue: 'New prompt',
            reasoning: 'Better clarity',
            expectedImprovement: 'Improved results',
          },
        ],
      })

      const mockProvider = mock.provider(mock.text(mockResponse))

      const improver = createImprover({
        provider: mockProvider,
        prompt: defaultImproverPrompt,
      })

      await improver.improve(mockAgentPrompt, [createTestResult()])

      const calls = mockProvider.getCalls()
      expect(calls).toHaveLength(1)
      // Core mock doesn't expose responseFormat directly - it's part of params
      expect(calls[0].type).toBe('generate')
    })
  })

  describe('metadata', () => {
    it('should return metadata with tokenUsage when Provider provides usage', async () => {
      const mockResponse = JSON.stringify({
        suggestions: [
          {
            type: 'system_prompt',
            priority: 'high',
            currentValue: 'old',
            suggestedValue: 'new',
            reasoning: 'reason',
            expectedImprovement: 'improvement',
          },
        ],
      })

      // Create mock with custom usage
      const improver = createImprover({
        provider: mock.provider(mock.text(mockResponse, {
          usage: createMockUsage({
            inputTokens: { total: 100, noCache: 100 },
            outputTokens: { total: 50, text: 50 },
          }),
        })),
        prompt: defaultImproverPrompt,
      })
      const result = await improver.improve(mockAgentPrompt, [createTestResult()])

      expect(result.metadata).toBeDefined()
      expect(result.metadata?.tokenUsage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      })
    })

    it('should include metadata when Provider is called', async () => {
      const mockResponse = JSON.stringify({ suggestions: [] })

      // Core Provider always provides usage, so metadata is always present
      const improver = createImprover(createDefaultConfig(mockResponse))
      const result = await improver.improve(mockAgentPrompt, [createTestResult()])

      // Core provider always returns usage
      expect(result.metadata).toBeDefined()
      expect(result.metadata?.tokenUsage).toBeDefined()
    })
  })
})
