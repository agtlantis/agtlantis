/**
 * Config Schema Tests
 */

import { describe, it, expect } from 'vitest'
import {
  evalConfigSchema,
  llmConfigSchema,
  judgeConfigSchema,
  criterionSchema,
  testCaseSchema,
  validateConfig,
  validateConfigPartial,
} from './schema.js'

// ============================================================================
// Test Fixtures
// ============================================================================

const createMinimalAgent = () => ({
  config: { name: 'TestAgent', description: 'A test agent' },
  prompt: {
    id: 'test-prompt',
    version: '1.0.0',
    system: 'You are a helpful assistant.',
    buildUserPrompt: (input: unknown) => String(input),
  },
  execute: async (input: unknown) => ({ result: input }),
})

const createMinimalConfig = () => ({
  agent: createMinimalAgent(),
  llm: { provider: 'openai' as const },
  judge: {
    criteria: [
      { id: 'accuracy', name: 'Accuracy', description: 'How accurate is the response' },
    ],
  },
  testCases: [{ id: 'test-1', input: { question: 'Hello' } }],
})

// ============================================================================
// LLM Config Schema Tests
// ============================================================================

describe('llmConfigSchema', () => {
  it('should validate minimal openai config', () => {
    const config = { provider: 'openai' }
    const result = llmConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('should validate minimal gemini config', () => {
    const config = { provider: 'gemini' }
    const result = llmConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('should validate full openai config', () => {
    const config = {
      provider: 'openai',
      apiKey: 'sk-test',
      defaultModel: 'gpt-4o-mini',
      reasoningEffort: 'medium',
      defaultResponseFormat: { type: 'json_object' },
    }
    const result = llmConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('should reject invalid provider', () => {
    const config = { provider: 'invalid' }
    const result = llmConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('should reject invalid reasoningEffort', () => {
    const config = { provider: 'openai', reasoningEffort: 'super-high' }
    const result = llmConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// Criterion Schema Tests
// ============================================================================

describe('criterionSchema', () => {
  it('should validate minimal criterion', () => {
    const criterion = {
      id: 'accuracy',
      name: 'Accuracy',
      description: 'How accurate is the response',
    }
    const result = criterionSchema.safeParse(criterion)
    expect(result.success).toBe(true)
  })

  it('should validate criterion with weight', () => {
    const criterion = {
      id: 'accuracy',
      name: 'Accuracy',
      description: 'How accurate',
      weight: 2,
    }
    const result = criterionSchema.safeParse(criterion)
    expect(result.success).toBe(true)
  })

  it('should validate criterion with validator function', () => {
    const criterion = {
      id: 'schema',
      name: 'Schema',
      description: 'Validates schema',
      validator: () => ({ valid: true }),
    }
    const result = criterionSchema.safeParse(criterion)
    expect(result.success).toBe(true)
  })

  it('should reject criterion without id', () => {
    const criterion = {
      name: 'Accuracy',
      description: 'How accurate',
    }
    const result = criterionSchema.safeParse(criterion)
    expect(result.success).toBe(false)
  })

  it('should reject criterion with empty id', () => {
    const criterion = {
      id: '',
      name: 'Accuracy',
      description: 'How accurate',
    }
    const result = criterionSchema.safeParse(criterion)
    expect(result.success).toBe(false)
  })

  it('should reject criterion with negative weight', () => {
    const criterion = {
      id: 'accuracy',
      name: 'Accuracy',
      description: 'How accurate',
      weight: -1,
    }
    const result = criterionSchema.safeParse(criterion)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// Judge Config Schema Tests
// ============================================================================

describe('judgeConfigSchema', () => {
  it('should validate minimal judge config', () => {
    const config = {
      criteria: [
        { id: 'accuracy', name: 'Accuracy', description: 'How accurate' },
      ],
    }
    const result = judgeConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('should validate judge config with all options', () => {
    const config = {
      llm: { provider: 'openai', defaultModel: 'gpt-4o' },
      criteria: [
        { id: 'accuracy', name: 'Accuracy', description: 'How accurate' },
      ],
      passThreshold: 80,
    }
    const result = judgeConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('should reject empty criteria array', () => {
    const config = { criteria: [] }
    const result = judgeConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('should reject passThreshold > 100', () => {
    const config = {
      criteria: [{ id: 'a', name: 'A', description: 'A' }],
      passThreshold: 150,
    }
    const result = judgeConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('should reject passThreshold < 0', () => {
    const config = {
      criteria: [{ id: 'a', name: 'A', description: 'A' }],
      passThreshold: -10,
    }
    const result = judgeConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// Test Case Schema Tests
// ============================================================================

describe('testCaseSchema', () => {
  it('should validate minimal test case', () => {
    const testCase = { input: { question: 'Hello' } }
    const result = testCaseSchema.safeParse(testCase)
    expect(result.success).toBe(true)
  })

  it('should validate test case with all single-turn options', () => {
    const testCase = {
      id: 'test-1',
      input: { question: 'Hello' },
      tags: ['basic', 'greeting'],
      description: 'A simple greeting test',
      expectedOutput: { answer: 'Hi!' },
    }
    const result = testCaseSchema.safeParse(testCase)
    expect(result.success).toBe(true)
  })

  it('should validate multi-turn test case', () => {
    const testCase = {
      id: 'multi-turn-1',
      input: { message: 'Hello' },
      multiTurn: {
        followUpInputs: [
          { input: { message: 'How are you?' }, description: 'Follow-up' },
        ],
        terminateWhen: [{ type: 'maxTurns', count: 5 }],
        maxTurns: 10,
        onConditionMet: 'pass',
        onMaxTurnsReached: 'fail',
      },
    }
    const result = testCaseSchema.safeParse(testCase)
    expect(result.success).toBe(true)
  })

  it('should validate multi-turn with fieldSet condition', () => {
    const testCase = {
      input: { message: 'Book a table' },
      multiTurn: {
        terminateWhen: [
          { type: 'fieldSet', fieldPath: 'booking.confirmed' },
        ],
      },
    }
    const result = testCaseSchema.safeParse(testCase)
    expect(result.success).toBe(true)
  })

  it('should validate multi-turn with custom condition', () => {
    const testCase = {
      input: { message: 'Start' },
      multiTurn: {
        terminateWhen: [
          {
            type: 'custom',
            check: (ctx: unknown) => true,
            description: 'Custom check',
          },
        ],
      },
    }
    const result = testCaseSchema.safeParse(testCase)
    expect(result.success).toBe(true)
  })

  it('should reject multi-turn without terminateWhen', () => {
    const testCase = {
      input: { message: 'Hello' },
      multiTurn: {
        followUpInputs: [{ input: { message: 'Hi' } }],
      },
    }
    const result = testCaseSchema.safeParse(testCase)
    expect(result.success).toBe(false)
  })

  it('should reject multi-turn with empty terminateWhen', () => {
    const testCase = {
      input: { message: 'Hello' },
      multiTurn: {
        terminateWhen: [],
      },
    }
    const result = testCaseSchema.safeParse(testCase)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// Full Config Schema Tests
// ============================================================================

describe('evalConfigSchema', () => {
  it('should validate minimal config', () => {
    const config = createMinimalConfig()
    const result = evalConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('should validate full config', () => {
    const config = {
      ...createMinimalConfig(),
      name: 'Full Test Suite',
      agentDescription: 'A comprehensive test agent',
      improver: {
        llm: { provider: 'gemini' },
      },
      output: {
        dir: './custom-reports',
        filename: 'report-{timestamp}.md',
        verbose: true,
      },
      run: {
        concurrency: 5,
        iterations: 3,
        stopOnFirstFailure: true,
      },
    }
    const result = evalConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('should reject config without agent', () => {
    const config = {
      llm: { provider: 'openai' },
      judge: {
        criteria: [{ id: 'a', name: 'A', description: 'A' }],
      },
      testCases: [{ input: {} }],
    }
    const result = evalConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('should reject config without llm', () => {
    const config = {
      agent: createMinimalAgent(),
      judge: {
        criteria: [{ id: 'a', name: 'A', description: 'A' }],
      },
      testCases: [{ input: {} }],
    }
    const result = evalConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('should reject config without judge', () => {
    const config = {
      agent: createMinimalAgent(),
      llm: { provider: 'openai' },
      testCases: [{ input: {} }],
    }
    const result = evalConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('should reject config without testCases AND without include', () => {
    const config = {
      agent: createMinimalAgent(),
      llm: { provider: 'openai' },
      judge: {
        criteria: [{ id: 'a', name: 'A', description: 'A' }],
      },
      // No testCases, no include
    }
    const result = evalConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        'Either testCases or include must be provided'
      )
    }
  })

  it('should reject config with empty testCases AND without include', () => {
    const config = {
      ...createMinimalConfig(),
      testCases: [],
      // No include
    }
    const result = evalConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        'Either testCases or include must be provided'
      )
    }
  })

  it('should accept config with include but without testCases', () => {
    const config = {
      agent: createMinimalAgent(),
      llm: { provider: 'openai' as const },
      judge: {
        criteria: [{ id: 'a', name: 'A', description: 'A' }],
      },
      include: ['evals/**/*.eval.yaml'],
    }
    const result = evalConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('should accept config with both testCases and include', () => {
    const config = {
      ...createMinimalConfig(),
      include: ['evals/**/*.eval.yaml'],
    }
    const result = evalConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('should reject include with empty patterns array', () => {
    const config = {
      agent: createMinimalAgent(),
      llm: { provider: 'openai' as const },
      judge: {
        criteria: [{ id: 'a', name: 'A', description: 'A' }],
      },
      include: [], // Empty array
    }
    const result = evalConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('should reject include with empty string pattern', () => {
    const config = {
      agent: createMinimalAgent(),
      llm: { provider: 'openai' as const },
      judge: {
        criteria: [{ id: 'a', name: 'A', description: 'A' }],
      },
      include: [''], // Empty string in array
    }
    const result = evalConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('should validate agents registry', () => {
    const config = {
      ...createMinimalConfig(),
      agents: {
        'my-agent': createMinimalAgent(),
      },
    }
    const result = evalConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// validateConfig Tests
// ============================================================================

describe('validateConfig', () => {
  it('should return validated config on success', () => {
    const config = createMinimalConfig()
    const validated = validateConfig(config)
    expect(validated.llm.provider).toBe('openai')
  })

  it('should throw error on invalid config', () => {
    const invalidConfig = { invalid: true }
    expect(() => validateConfig(invalidConfig)).toThrow('Invalid configuration')
  })

  it('should include field path in error message', () => {
    const invalidConfig = {
      ...createMinimalConfig(),
      llm: { provider: 'invalid' },
    }
    expect(() => validateConfig(invalidConfig)).toThrow('llm.provider')
  })
})

// ============================================================================
// validateConfigPartial Tests
// ============================================================================

describe('validateConfigPartial', () => {
  it('should return success for valid config', () => {
    const config = createMinimalConfig()
    const result = validateConfigPartial(config)
    expect(result.success).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('should return errors for invalid config', () => {
    const invalidConfig = { invalid: true }
    const result = validateConfigPartial(invalidConfig)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  it('should include all validation errors', () => {
    const invalidConfig = {
      agent: {}, // Invalid agent
      llm: { provider: 'invalid' }, // Invalid provider
      judge: { criteria: [] }, // Empty criteria
      testCases: [], // Empty test cases
    }
    const result = validateConfigPartial(invalidConfig)
    expect(result.success).toBe(false)
    expect(result.errors!.length).toBeGreaterThan(1)
  })
})
