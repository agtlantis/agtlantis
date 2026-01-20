import { describe, it, expect } from 'vitest'
import { EvalError, EvalErrorCode } from './errors'

describe('EvalErrorCode', () => {
  it('should have all expected error codes', () => {
    expect(EvalErrorCode.LLM_API_ERROR).toBe('LLM_API_ERROR')
    expect(EvalErrorCode.LLM_RATE_LIMIT).toBe('LLM_RATE_LIMIT')
    expect(EvalErrorCode.LLM_TIMEOUT).toBe('LLM_TIMEOUT')
    expect(EvalErrorCode.JSON_PARSE_ERROR).toBe('JSON_PARSE_ERROR')
    expect(EvalErrorCode.VERDICT_PARSE_ERROR).toBe('VERDICT_PARSE_ERROR')
    expect(EvalErrorCode.AGENT_EXECUTION_ERROR).toBe('AGENT_EXECUTION_ERROR')
    expect(EvalErrorCode.INVALID_CONFIG).toBe('INVALID_CONFIG')
    expect(EvalErrorCode.MISSING_API_KEY).toBe('MISSING_API_KEY')
    expect(EvalErrorCode.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR')
  })
})

describe('EvalError', () => {
  describe('constructor', () => {
    it('should create an error with message and code', () => {
      const error = new EvalError('Something went wrong', {
        code: EvalErrorCode.LLM_API_ERROR,
      })

      expect(error.message).toBe('Something went wrong')
      expect(error.code).toBe(EvalErrorCode.LLM_API_ERROR)
      expect(error.name).toBe('EvalError')
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(EvalError)
    })

    it('should store cause error', () => {
      const cause = new Error('Original error')
      const error = new EvalError('Wrapped error', {
        code: EvalErrorCode.LLM_API_ERROR,
        cause,
      })

      expect(error.cause).toBe(cause)
    })

    it('should store context', () => {
      const context = { requestId: '123', model: 'gpt-4' }
      const error = new EvalError('API error', {
        code: EvalErrorCode.LLM_API_ERROR,
        context,
      })

      expect(error.context).toEqual(context)
    })
  })

  describe('from()', () => {
    it('should return existing EvalError unchanged', () => {
      const original = new EvalError('Original', {
        code: EvalErrorCode.LLM_API_ERROR,
      })

      const result = EvalError.from(original, EvalErrorCode.UNKNOWN_ERROR)

      expect(result).toBe(original)
      expect(result.code).toBe(EvalErrorCode.LLM_API_ERROR)
    })

    it('should wrap Error with new code', () => {
      const cause = new Error('Network failed')

      const result = EvalError.from(cause, EvalErrorCode.LLM_TIMEOUT)

      expect(result).toBeInstanceOf(EvalError)
      expect(result.message).toBe('Network failed')
      expect(result.code).toBe(EvalErrorCode.LLM_TIMEOUT)
      expect(result.cause).toBe(cause)
    })

    it('should wrap non-Error values', () => {
      const result = EvalError.from('string error', EvalErrorCode.UNKNOWN_ERROR)

      expect(result).toBeInstanceOf(EvalError)
      expect(result.message).toBe('string error')
      expect(result.code).toBe(EvalErrorCode.UNKNOWN_ERROR)
    })

    it('should include context when provided', () => {
      const context = { testCase: 'test-1' }
      const result = EvalError.from(new Error('fail'), EvalErrorCode.AGENT_EXECUTION_ERROR, context)

      expect(result.context).toEqual(context)
    })
  })

  describe('toJSON()', () => {
    it('should return serializable object', () => {
      const cause = new Error('Original')
      const error = new EvalError('Test error', {
        code: EvalErrorCode.JSON_PARSE_ERROR,
        cause,
        context: { input: 'bad json' },
      })

      const json = error.toJSON()

      expect(json).toEqual({
        name: 'EvalError',
        message: 'Test error',
        code: 'JSON_PARSE_ERROR',
        cause: 'Original',
        context: { input: 'bad json' },
      })
    })

    it('should handle missing cause', () => {
      const error = new EvalError('No cause', {
        code: EvalErrorCode.INVALID_CONFIG,
      })

      const json = error.toJSON()

      expect(json.cause).toBeUndefined()
    })
  })
})
