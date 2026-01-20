import { describe, it, expect } from 'vitest'
import { EvalError, EvalErrorCode } from '@/core/errors.js'
import {
  yamlEvalFileSchema,
  yamlTestCaseSchema,
  yamlPersonaSchema,
  yamlExpectationSchema,
  yamlTerminationConditionSchema,
  yamlTestCaseDefaultsSchema,
  validateYamlEvalFile,
  validateYamlEvalFilePartial,
} from './schema.js'

// ============================================================================
// Test Fixtures
// ============================================================================

const minimalValidFile = {
  agent: 'test-agent',
  cases: [
    {
      id: 'test-1',
      input: { message: 'Hello' },
    },
  ],
}

const fullValidFile = {
  agent: 'booking-agent',
  name: 'Booking Agent Evaluation',
  description: 'Test suite for booking agent',
  defaults: {
    maxTurns: 10,
    onConditionMet: 'pass' as const,
    onMaxTurnsReached: 'fail' as const,
    tags: ['default-tag'],
  },
  personas: {
    friendly: {
      name: 'Friendly Customer',
      description: 'A cooperative customer',
      systemPrompt: 'You are a friendly customer who wants to book a hotel.',
    },
  },
  cases: [
    {
      id: 'happy-path',
      name: 'Happy Path Booking',
      description: 'Complete booking flow with friendly customer',
      tags: ['p0', 'multi-turn'],
      input: { message: 'I want to book a room' },
      persona: 'friendly',
      maxTurns: 5,
      endWhen: { field: 'booking.status', equals: 'confirmed' },
      onConditionMet: 'pass' as const,
      expectedOutput: { status: 'confirmed' },
      expect: { minTurns: 2, maxTurns: 5, minScore: 80 },
    },
  ],
}

// ============================================================================
// yamlEvalFileSchema Tests
// ============================================================================

describe('yamlEvalFileSchema', () => {
  describe('valid files', () => {
    it('should validate minimal file (agent + 1 case)', () => {
      const result = yamlEvalFileSchema.safeParse(minimalValidFile)
      expect(result.success).toBe(true)
    })

    it('should validate file with all optional fields', () => {
      const result = yamlEvalFileSchema.safeParse(fullValidFile)
      expect(result.success).toBe(true)
    })

    it('should validate file with multiple test cases', () => {
      const file = {
        agent: 'test-agent',
        cases: [
          { id: 'test-1', input: { a: 1 } },
          { id: 'test-2', input: { b: 2 } },
          { id: 'test-3', input: { c: 3 } },
        ],
      }
      const result = yamlEvalFileSchema.safeParse(file)
      expect(result.success).toBe(true)
    })

    it('should validate file with inline personas section', () => {
      const file = {
        agent: 'test-agent',
        personas: {
          customer: {
            name: 'Customer',
            systemPrompt: 'You are a customer',
          },
          agent: {
            name: 'Support Agent',
            description: 'A helpful support agent',
            systemPrompt: 'You are a support agent',
          },
        },
        cases: [{ id: 'test-1', input: { msg: 'hi' } }],
      }
      const result = yamlEvalFileSchema.safeParse(file)
      expect(result.success).toBe(true)
    })

    it('should validate test case with string persona reference', () => {
      const file = {
        agent: 'test-agent',
        personas: {
          friendly: { name: 'Friendly', systemPrompt: 'Be friendly' },
        },
        cases: [{ id: 'test-1', input: {}, persona: 'friendly' }],
      }
      const result = yamlEvalFileSchema.safeParse(file)
      expect(result.success).toBe(true)
    })

    it('should validate test case with inline persona definition', () => {
      const file = {
        agent: 'test-agent',
        cases: [
          {
            id: 'test-1',
            input: {},
            persona: {
              name: 'Inline Persona',
              systemPrompt: 'Custom prompt',
            },
          },
        ],
      }
      const result = yamlEvalFileSchema.safeParse(file)
      expect(result.success).toBe(true)
    })
  })

  describe('invalid files', () => {
    it('should reject missing agent field', () => {
      const file = {
        cases: [{ id: 'test-1', input: {} }],
      }
      const result = yamlEvalFileSchema.safeParse(file)
      expect(result.success).toBe(false)
    })

    it('should reject missing cases field', () => {
      const file = {
        agent: 'test-agent',
      }
      const result = yamlEvalFileSchema.safeParse(file)
      expect(result.success).toBe(false)
    })

    it('should reject empty cases array', () => {
      const file = {
        agent: 'test-agent',
        cases: [],
      }
      const result = yamlEvalFileSchema.safeParse(file)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('At least one test case is required')
      }
    })

    it('should reject test case without id', () => {
      const file = {
        agent: 'test-agent',
        cases: [{ input: {} }],
      }
      const result = yamlEvalFileSchema.safeParse(file)
      expect(result.success).toBe(false)
    })

    it('should reject test case without input', () => {
      const file = {
        agent: 'test-agent',
        cases: [{ id: 'test-1' }],
      }
      const result = yamlEvalFileSchema.safeParse(file)
      expect(result.success).toBe(false)
    })

    it('should reject empty agent string', () => {
      const file = {
        agent: '',
        cases: [{ id: 'test-1', input: {} }],
      }
      const result = yamlEvalFileSchema.safeParse(file)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Agent name is required')
      }
    })

    it('should reject empty test case id', () => {
      const file = {
        agent: 'test-agent',
        cases: [{ id: '', input: {} }],
      }
      const result = yamlEvalFileSchema.safeParse(file)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Test case id is required')
      }
    })
  })
})

// ============================================================================
// yamlTerminationConditionSchema Tests
// ============================================================================

describe('yamlTerminationConditionSchema', () => {
  it('should validate field-based condition', () => {
    const condition = { field: 'status' }
    const result = yamlTerminationConditionSchema.safeParse(condition)
    expect(result.success).toBe(true)
  })

  it('should validate naturalLanguage condition', () => {
    const condition = { naturalLanguage: 'The booking is complete' }
    const result = yamlTerminationConditionSchema.safeParse(condition)
    expect(result.success).toBe(true)
  })

  it('should validate field with equals value', () => {
    const condition = { field: 'booking.status', equals: 'confirmed' }
    const result = yamlTerminationConditionSchema.safeParse(condition)
    expect(result.success).toBe(true)
  })

  it('should validate field with equals to null', () => {
    const condition = { field: 'error', equals: null }
    const result = yamlTerminationConditionSchema.safeParse(condition)
    expect(result.success).toBe(true)
  })

  it('should validate both field and naturalLanguage together', () => {
    const condition = { field: 'status', naturalLanguage: 'Check if done' }
    const result = yamlTerminationConditionSchema.safeParse(condition)
    expect(result.success).toBe(true)
  })

  it('should reject condition with neither field nor naturalLanguage', () => {
    const condition = { equals: 'confirmed' }
    const result = yamlTerminationConditionSchema.safeParse(condition)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'Either field or naturalLanguage must be specified'
      )
    }
  })

  it('should reject empty field string', () => {
    const condition = { field: '' }
    const result = yamlTerminationConditionSchema.safeParse(condition)
    expect(result.success).toBe(false)
  })

  it('should reject empty naturalLanguage string', () => {
    const condition = { naturalLanguage: '' }
    const result = yamlTerminationConditionSchema.safeParse(condition)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// yamlPersonaSchema Tests
// ============================================================================

describe('yamlPersonaSchema', () => {
  it('should validate minimal persona (name + systemPrompt)', () => {
    const persona = {
      name: 'Test Persona',
      systemPrompt: 'You are a test persona',
    }
    const result = yamlPersonaSchema.safeParse(persona)
    expect(result.success).toBe(true)
  })

  it('should validate full persona with description', () => {
    const persona = {
      name: 'Full Persona',
      description: 'A fully described persona',
      systemPrompt: 'You are a complete persona',
    }
    const result = yamlPersonaSchema.safeParse(persona)
    expect(result.success).toBe(true)
  })

  it('should reject persona without name', () => {
    const persona = {
      systemPrompt: 'You are a persona',
    }
    const result = yamlPersonaSchema.safeParse(persona)
    expect(result.success).toBe(false)
  })

  it('should reject persona without systemPrompt', () => {
    const persona = {
      name: 'Test Persona',
    }
    const result = yamlPersonaSchema.safeParse(persona)
    expect(result.success).toBe(false)
  })

  it('should reject empty name', () => {
    const persona = {
      name: '',
      systemPrompt: 'You are a persona',
    }
    const result = yamlPersonaSchema.safeParse(persona)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Persona name is required')
    }
  })

  it('should reject empty systemPrompt', () => {
    const persona = {
      name: 'Test',
      systemPrompt: '',
    }
    const result = yamlPersonaSchema.safeParse(persona)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Persona systemPrompt is required')
    }
  })
})

// ============================================================================
// yamlExpectationSchema Tests
// ============================================================================

describe('yamlExpectationSchema', () => {
  it('should validate all expectation fields', () => {
    const expectation = {
      minTurns: 2,
      maxTurns: 10,
      minScore: 80,
    }
    const result = yamlExpectationSchema.safeParse(expectation)
    expect(result.success).toBe(true)
  })

  it('should validate partial expectation', () => {
    const expectation = { minScore: 70 }
    const result = yamlExpectationSchema.safeParse(expectation)
    expect(result.success).toBe(true)
  })

  it('should validate empty expectation', () => {
    const expectation = {}
    const result = yamlExpectationSchema.safeParse(expectation)
    expect(result.success).toBe(true)
  })

  it('should reject negative minTurns', () => {
    const expectation = { minTurns: -1 }
    const result = yamlExpectationSchema.safeParse(expectation)
    expect(result.success).toBe(false)
  })

  it('should reject zero minTurns', () => {
    const expectation = { minTurns: 0 }
    const result = yamlExpectationSchema.safeParse(expectation)
    expect(result.success).toBe(false)
  })

  it('should reject score over 100', () => {
    const expectation = { minScore: 101 }
    const result = yamlExpectationSchema.safeParse(expectation)
    expect(result.success).toBe(false)
  })

  it('should reject negative score', () => {
    const expectation = { minScore: -10 }
    const result = yamlExpectationSchema.safeParse(expectation)
    expect(result.success).toBe(false)
  })

  it('should accept score at boundaries (0 and 100)', () => {
    expect(yamlExpectationSchema.safeParse({ minScore: 0 }).success).toBe(true)
    expect(yamlExpectationSchema.safeParse({ minScore: 100 }).success).toBe(true)
  })

  it('should reject non-integer turns', () => {
    const expectation = { minTurns: 2.5 }
    const result = yamlExpectationSchema.safeParse(expectation)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// yamlTestCaseDefaultsSchema Tests
// ============================================================================

describe('yamlTestCaseDefaultsSchema', () => {
  it('should validate empty defaults', () => {
    const result = yamlTestCaseDefaultsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('should validate full defaults', () => {
    const defaults = {
      maxTurns: 10,
      endWhen: { field: 'status' },
      onConditionMet: 'pass' as const,
      onMaxTurnsReached: 'fail' as const,
      tags: ['default', 'regression'],
    }
    const result = yamlTestCaseDefaultsSchema.safeParse(defaults)
    expect(result.success).toBe(true)
  })

  it('should reject invalid onConditionMet value', () => {
    const defaults = { onConditionMet: 'success' }
    const result = yamlTestCaseDefaultsSchema.safeParse(defaults)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// yamlTestCaseSchema Tests
// ============================================================================

describe('yamlTestCaseSchema', () => {
  it('should validate minimal test case', () => {
    const testCase = { id: 'test-1', input: { key: 'value' } }
    const result = yamlTestCaseSchema.safeParse(testCase)
    expect(result.success).toBe(true)
  })

  it('should validate test case with empty input object', () => {
    const testCase = { id: 'test-1', input: {} }
    const result = yamlTestCaseSchema.safeParse(testCase)
    expect(result.success).toBe(true)
  })

  it('should validate test case with nested input', () => {
    const testCase = {
      id: 'test-1',
      input: {
        user: { name: 'John', age: 30 },
        items: [1, 2, 3],
      },
    }
    const result = yamlTestCaseSchema.safeParse(testCase)
    expect(result.success).toBe(true)
  })

  it('should reject input as non-object', () => {
    const testCase = { id: 'test-1', input: 'string input' }
    const result = yamlTestCaseSchema.safeParse(testCase)
    expect(result.success).toBe(false)
  })

  it('should reject input as array', () => {
    const testCase = { id: 'test-1', input: [1, 2, 3] }
    const result = yamlTestCaseSchema.safeParse(testCase)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// validateYamlEvalFile Tests
// ============================================================================

describe('validateYamlEvalFile', () => {
  it('should return validated file for valid input', () => {
    const result = validateYamlEvalFile(minimalValidFile)
    expect(result.agent).toBe('test-agent')
    expect(result.cases).toHaveLength(1)
    expect(result.cases[0].id).toBe('test-1')
  })

  it('should throw EvalError with INVALID_CONFIG code for invalid input', () => {
    const invalidFile = { agent: '' }
    expect(() => validateYamlEvalFile(invalidFile)).toThrow(EvalError)

    try {
      validateYamlEvalFile(invalidFile)
    } catch (error) {
      expect(error).toBeInstanceOf(EvalError)
      expect((error as EvalError).code).toBe(EvalErrorCode.INVALID_CONFIG)
    }
  })

  it('should include path in error message', () => {
    const invalidFile = {
      agent: 'test',
      cases: [{ id: 'test-1' }], // missing input
    }

    try {
      validateYamlEvalFile(invalidFile)
    } catch (error) {
      expect((error as EvalError).message).toContain('cases.0.input')
    }
  })

  it('should include multiple errors in message', () => {
    const invalidFile = {
      agent: '',
      cases: [],
    }

    try {
      validateYamlEvalFile(invalidFile)
    } catch (error) {
      const message = (error as EvalError).message
      expect(message).toContain('agent')
      expect(message).toContain('cases')
    }
  })
})

// ============================================================================
// validateYamlEvalFilePartial Tests
// ============================================================================

describe('validateYamlEvalFilePartial', () => {
  it('should return success: true for valid file', () => {
    const result = validateYamlEvalFilePartial(minimalValidFile)
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.errors).toBeUndefined()
  })

  it('should return data with validated content', () => {
    const result = validateYamlEvalFilePartial(fullValidFile)
    expect(result.success).toBe(true)
    expect(result.data?.agent).toBe('booking-agent')
    expect(result.data?.name).toBe('Booking Agent Evaluation')
  })

  it('should return success: false with errors for invalid file', () => {
    const invalidFile = { agent: 'test' }
    const result = validateYamlEvalFilePartial(invalidFile)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  it('should include path in error messages', () => {
    const invalidFile = {
      agent: 'test',
      cases: [{ id: '' }],
    }
    const result = validateYamlEvalFilePartial(invalidFile)
    expect(result.success).toBe(false)
    expect(result.errors!.some((e) => e.includes('cases.0'))).toBe(true)
  })

  it('should return all validation errors', () => {
    const invalidFile = {
      agent: '',
      cases: [{ id: '', input: {} }],
    }
    const result = validateYamlEvalFilePartial(invalidFile)
    expect(result.success).toBe(false)
    expect(result.errors!.length).toBeGreaterThanOrEqual(2)
  })
})
