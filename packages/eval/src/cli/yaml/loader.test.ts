import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EvalError, EvalErrorCode } from '@/core/errors.js'
import { mock } from '@agtlantis/core/testing'
import {
  loadYamlEvalFile,
  loadYamlEvalFiles,
  convertToTestCases,
  type YamlConversionContext,
} from './loader.js'
import type { YamlEvalFile } from './types.js'

// ============================================================================
// Test Setup
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, '__fixtures__')

const getFixturePath = (filename: string) => resolve(fixturesDir, filename)

// Mock Provider for conversion tests
const createTestContext = <TInput = Record<string, unknown>, TOutput = unknown>(): YamlConversionContext<TInput, TOutput> => ({
  provider: mock.provider(mock.text('mock response')),
})

// ============================================================================
// loadYamlEvalFile Tests
// ============================================================================

describe('loadYamlEvalFile', () => {
  describe('successful loading', () => {
    it('should load valid simple YAML file', async () => {
      const result = await loadYamlEvalFile(getFixturePath('valid-simple.yaml'))

      expect(result.agent).toBe('qa-agent')
      expect(result.name).toBe('Q&A Agent Evaluation')
      expect(result.cases).toHaveLength(2)
      expect(result.cases[0].id).toBe('simple-math')
    })

    it('should load valid multi-turn YAML file', async () => {
      const result = await loadYamlEvalFile(getFixturePath('valid-multi-turn.yaml'))

      expect(result.agent).toBe('booking-agent')
      expect(result.defaults).toBeDefined()
      expect(result.defaults?.maxTurns).toBe(10)
      expect(result.personas).toBeDefined()
      expect(result.personas?.friendly).toBeDefined()
      expect(result.cases).toHaveLength(4)
    })

    it('should load file with natural language termination condition', async () => {
      const result = await loadYamlEvalFile(getFixturePath('valid-natural-language.yaml'))

      expect(result.agent).toBe('support-agent')
      expect(result.cases[0].endWhen?.naturalLanguage).toContain('resolved')
    })

    it('should handle relative paths with basePath option', async () => {
      const result = await loadYamlEvalFile('valid-simple.yaml', {
        basePath: fixturesDir,
      })

      expect(result.agent).toBe('qa-agent')
    })

    it('should handle absolute paths', async () => {
      const absolutePath = getFixturePath('valid-simple.yaml')
      const result = await loadYamlEvalFile(absolutePath)

      expect(result.agent).toBe('qa-agent')
    })
  })

  describe('error handling', () => {
    it('should throw FILE_READ_ERROR for non-existent file', async () => {
      await expect(
        loadYamlEvalFile(getFixturePath('non-existent.yaml'))
      ).rejects.toMatchObject({
        code: EvalErrorCode.FILE_READ_ERROR,
        message: expect.stringContaining('YAML eval file not found'),
      })
    })

    it('should throw INVALID_CONFIG for malformed YAML syntax', async () => {
      await expect(
        loadYamlEvalFile(getFixturePath('invalid-syntax.yaml'))
      ).rejects.toMatchObject({
        code: EvalErrorCode.INVALID_CONFIG,
        message: expect.stringContaining('Failed to parse YAML'),
      })
    })

    it('should throw INVALID_CONFIG for schema validation failure', async () => {
      await expect(
        loadYamlEvalFile(getFixturePath('invalid-schema.yaml'))
      ).rejects.toMatchObject({
        code: EvalErrorCode.INVALID_CONFIG,
        message: expect.stringContaining('Invalid YAML eval file'),
      })
    })

    it('should include path in error context', async () => {
      const path = 'non-existent.yaml'
      const error = await loadYamlEvalFile(path, { basePath: fixturesDir }).catch(e => e)

      expect(error).toBeInstanceOf(EvalError)
      expect(error.context?.path).toBe(path)
    })
  })

  describe('skipValidation option', () => {
    it('should skip schema validation when skipValidation is true', async () => {
      // This file would fail schema validation but should pass with skipValidation
      const result = await loadYamlEvalFile(getFixturePath('invalid-schema.yaml'), {
        skipValidation: true,
      })

      // The file is parsed but not validated
      expect(result).toBeDefined()
      expect(result.name).toBe('Missing agent field')
    })
  })
})

// ============================================================================
// loadYamlEvalFiles Tests
// ============================================================================

describe('loadYamlEvalFiles', () => {
  it('should load multiple files', async () => {
    const paths = [
      getFixturePath('valid-simple.yaml'),
      getFixturePath('valid-multi-turn.yaml'),
    ]

    const results = await loadYamlEvalFiles(paths)

    expect(results).toHaveLength(2)
    expect(results[0].path).toBe(paths[0])
    expect(results[0].content.agent).toBe('qa-agent')
    expect(results[1].path).toBe(paths[1])
    expect(results[1].content.agent).toBe('booking-agent')
  })

  it('should return empty array for empty paths', async () => {
    const results = await loadYamlEvalFiles([])
    expect(results).toHaveLength(0)
  })

  it('should throw on first file error', async () => {
    const paths = [
      getFixturePath('valid-simple.yaml'),
      getFixturePath('non-existent.yaml'),
    ]

    // The second file should cause an error
    await expect(loadYamlEvalFiles(paths)).rejects.toMatchObject({
      code: EvalErrorCode.FILE_READ_ERROR,
    })
  })
})

// ============================================================================
// convertToTestCases Tests
// ============================================================================

describe('convertToTestCases', () => {
  describe('simple test cases (no multi-turn)', () => {
    it('should convert simple test cases', () => {
      const yaml: YamlEvalFile = {
        agent: 'test-agent',
        cases: [
          {
            id: 'test-1',
            name: 'Test One',
            tags: ['basic'],
            input: { question: 'What is 2+2?' },
            expectedOutput: { answer: '4' },
          },
        ],
      }

      const context = createTestContext()
      const results = convertToTestCases(yaml, context)

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('test-1')
      expect(results[0].description).toBe('Test One')
      expect(results[0].tags).toEqual(['basic'])
      expect(results[0].input).toEqual({ question: 'What is 2+2?' })
      expect(results[0].expectedOutput).toEqual({ answer: '4' })
      // Should NOT have multiTurn property
      expect('multiTurn' in results[0]).toBe(false)
    })

    it('should use name for description when both are provided', () => {
      const yaml: YamlEvalFile = {
        agent: 'test-agent',
        cases: [
          {
            id: 'test-1',
            name: 'Short Name',
            description: 'Longer description',
            input: {},
          },
        ],
      }

      const results = convertToTestCases(yaml, createTestContext())

      // name takes precedence over description
      expect(results[0].description).toBe('Short Name')
    })
  })

  describe('multi-turn test cases with persona', () => {
    it('should convert test case with persona reference', () => {
      const yaml: YamlEvalFile = {
        agent: 'booking-agent',
        personas: {
          friendly: {
            name: 'Friendly Customer',
            systemPrompt: 'You are friendly.',
          },
        },
        cases: [
          {
            id: 'booking-1',
            input: { message: 'Hello' },
            persona: 'friendly',
            maxTurns: 5,
          },
        ],
      }

      const results = convertToTestCases(yaml, createTestContext())

      expect(results).toHaveLength(1)
      expect('multiTurn' in results[0]).toBe(true)

      const multiTurnCase = results[0] as any
      expect(multiTurnCase.multiTurn.maxTurns).toBe(5)
      // followUpInputs should have maxTurns - 1 entries
      expect(multiTurnCase.multiTurn.followUpInputs).toHaveLength(4)
    })

    it('should convert test case with inline persona', () => {
      const yaml: YamlEvalFile = {
        agent: 'test-agent',
        cases: [
          {
            id: 'inline-1',
            input: { message: 'Start' },
            persona: {
              name: 'Inline User',
              systemPrompt: 'You are inline.',
            },
          },
        ],
      }

      const results = convertToTestCases(yaml, createTestContext())

      expect('multiTurn' in results[0]).toBe(true)
      const multiTurnCase = results[0] as any
      expect(multiTurnCase.multiTurn.followUpInputs.length).toBeGreaterThan(0)
    })

    it('should throw on invalid persona reference', () => {
      const yaml: YamlEvalFile = {
        agent: 'test-agent',
        personas: {
          existing: {
            name: 'Existing',
            systemPrompt: 'I exist.',
          },
        },
        cases: [
          {
            id: 'bad-ref',
            input: {},
            persona: 'non-existent',
          },
        ],
      }

      expect(() => convertToTestCases(yaml, createTestContext())).toThrow(EvalError)
      expect(() => convertToTestCases(yaml, createTestContext())).toThrow('Persona not found')
    })
  })

  describe('multi-turn test cases with termination conditions', () => {
    it('should convert endWhen with field + equals', () => {
      const yaml: YamlEvalFile = {
        agent: 'test-agent',
        cases: [
          {
            id: 'field-equals',
            input: {},
            endWhen: {
              field: 'booking.status',
              equals: 'confirmed',
            },
          },
        ],
      }

      const results = convertToTestCases(yaml, createTestContext())

      expect('multiTurn' in results[0]).toBe(true)
      const multiTurnCase = results[0] as any
      expect(multiTurnCase.multiTurn.terminateWhen).toHaveLength(1)
      expect(multiTurnCase.multiTurn.terminateWhen[0].type).toBe('custom')
    })

    it('should convert endWhen with field only (fieldIsSet)', () => {
      const yaml: YamlEvalFile = {
        agent: 'test-agent',
        cases: [
          {
            id: 'field-set',
            input: {},
            endWhen: { field: 'result.ready' },
          },
        ],
      }

      const results = convertToTestCases(yaml, createTestContext())

      expect('multiTurn' in results[0]).toBe(true)
      const multiTurnCase = results[0] as any
      expect(multiTurnCase.multiTurn.terminateWhen).toHaveLength(1)
    })

    it('should convert endWhen with naturalLanguage', () => {
      const yaml: YamlEvalFile = {
        agent: 'test-agent',
        cases: [
          {
            id: 'nl-condition',
            input: {},
            endWhen: {
              naturalLanguage: 'Customer is satisfied',
            },
          },
        ],
      }

      const results = convertToTestCases(yaml, createTestContext())

      expect('multiTurn' in results[0]).toBe(true)
      const multiTurnCase = results[0] as any
      expect(multiTurnCase.multiTurn.terminateWhen).toHaveLength(1)
      // naturalLanguage creates a CustomCondition with description
      expect(multiTurnCase.multiTurn.terminateWhen[0].description).toContain('NL:')
    })
  })

  describe('defaults merging', () => {
    it('should apply defaults to all cases', () => {
      const yaml: YamlEvalFile = {
        agent: 'test-agent',
        defaults: {
          maxTurns: 8,
          onConditionMet: 'pass',
          onMaxTurnsReached: 'fail',
          tags: ['default-tag'],
        },
        cases: [
          {
            id: 'case-1',
            input: {},
            endWhen: { field: 'done' },
          },
        ],
      }

      const results = convertToTestCases(yaml, createTestContext())
      const multiTurnCase = results[0] as any

      expect(multiTurnCase.multiTurn.maxTurns).toBe(8)
      expect(multiTurnCase.multiTurn.onConditionMet).toBe('pass')
      expect(multiTurnCase.multiTurn.onMaxTurnsReached).toBe('fail')
      expect(multiTurnCase.tags).toContain('default-tag')
    })

    it('should override defaults with case-specific values', () => {
      const yaml: YamlEvalFile = {
        agent: 'test-agent',
        defaults: {
          maxTurns: 10,
          tags: ['default'],
        },
        cases: [
          {
            id: 'case-override',
            input: {},
            maxTurns: 5,
            tags: ['specific'],
            endWhen: { field: 'done' },
          },
        ],
      }

      const results = convertToTestCases(yaml, createTestContext())
      const multiTurnCase = results[0] as any

      expect(multiTurnCase.multiTurn.maxTurns).toBe(5)
      // Tags should be merged
      expect(multiTurnCase.tags).toContain('default')
      expect(multiTurnCase.tags).toContain('specific')
    })

    it('should merge default endWhen if case has no endWhen', () => {
      const yaml: YamlEvalFile = {
        agent: 'test-agent',
        defaults: {
          endWhen: { field: 'default.status' },
        },
        cases: [
          {
            id: 'use-default',
            input: {},
            // No endWhen here - should use default
          },
        ],
      }

      const results = convertToTestCases(yaml, createTestContext())

      expect('multiTurn' in results[0]).toBe(true)
      const multiTurnCase = results[0] as any
      expect(multiTurnCase.multiTurn.terminateWhen).toHaveLength(1)
    })
  })

  describe('custom buildInput', () => {
    it('should use provided buildInput function', () => {
      const yaml: YamlEvalFile = {
        agent: 'test-agent',
        personas: {
          test: {
            name: 'Test',
            systemPrompt: 'You are test.',
          },
        },
        cases: [
          {
            id: 'custom-build',
            input: { message: 'Start' },
            persona: 'test',
            maxTurns: 2,
          },
        ],
      }

      interface CustomInput {
        message: string
        timestamp: number
      }

      const customBuildInput = vi.fn((response: string) => ({
        message: response,
        timestamp: Date.now(),
      }))

      const context: YamlConversionContext<CustomInput, unknown> = {
        provider: mock.provider(mock.text('test')),
        buildInput: customBuildInput,
      }

      const results = convertToTestCases(yaml, context)

      // Just verify conversion succeeds with custom context
      expect('multiTurn' in results[0]).toBe(true)
      const multiTurnCase = results[0] as any
      expect(multiTurnCase.multiTurn.followUpInputs).toHaveLength(1)
    })
  })
})
