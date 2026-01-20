import { describe, it, expect } from 'vitest'
import { extractJson, truncate } from './json'

describe('extractJson', () => {
  describe('raw JSON', () => {
    it('should return raw JSON as-is', () => {
      const input = '{"key": "value"}'
      expect(extractJson(input)).toBe('{"key": "value"}')
    })

    it('should handle nested JSON objects', () => {
      const input = '{"outer": {"inner": "value"}}'
      expect(extractJson(input)).toBe('{"outer": {"inner": "value"}}')
    })
  })

  describe('markdown code blocks', () => {
    it('should extract from json-annotated code block', () => {
      const input = '```json\n{"foo": "bar"}\n```'
      expect(extractJson(input)).toBe('{"foo": "bar"}')
    })

    it('should extract from plain code block', () => {
      const input = '```\n{"foo": "bar"}\n```'
      expect(extractJson(input)).toBe('{"foo": "bar"}')
    })

    it('should handle code block with surrounding text', () => {
      const input = `Here is my response:

\`\`\`json
{"result": 42}
\`\`\`

Hope this helps!`
      expect(extractJson(input)).toBe('{"result": 42}')
    })

    it('should handle multiline JSON in code block', () => {
      const input = `\`\`\`json
{
  "key": "value",
  "nested": {
    "array": [1, 2, 3]
  }
}
\`\`\``
      const result = extractJson(input)
      expect(JSON.parse(result)).toEqual({
        key: 'value',
        nested: { array: [1, 2, 3] },
      })
    })
  })

  describe('embedded JSON', () => {
    it('should extract JSON from surrounding text', () => {
      const input = 'Based on my analysis, {"answer": 42} is the result.'
      expect(extractJson(input)).toBe('{"answer": 42}')
    })

    it('should handle JSON at end of text', () => {
      const input = 'The answer is: {"value": true}'
      expect(extractJson(input)).toBe('{"value": true}')
    })

    it('should handle JSON at start of text', () => {
      const input = '{"value": false} is my answer'
      expect(extractJson(input)).toBe('{"value": false}')
    })
  })

  describe('edge cases', () => {
    it('should trim whitespace', () => {
      const input = '  {"key": "value"}  '
      expect(extractJson(input)).toBe('{"key": "value"}')
    })

    it('should prefer code block over embedded JSON', () => {
      const input = 'Text {"ignored": true}\n```json\n{"preferred": true}\n```'
      expect(extractJson(input)).toBe('{"preferred": true}')
    })

    it('should return trimmed content if no JSON found', () => {
      const input = '  just plain text  '
      expect(extractJson(input)).toBe('just plain text')
    })

    it('should handle empty string', () => {
      expect(extractJson('')).toBe('')
    })

    it('should handle code block with spaces', () => {
      const input = '```json   \n{"key": "value"}\n```'
      expect(extractJson(input)).toBe('{"key": "value"}')
    })
  })
})

describe('truncate', () => {
  it('should not truncate strings shorter than maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('should not truncate strings equal to maxLength', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })

  it('should truncate strings longer than maxLength', () => {
    expect(truncate('hello world', 5)).toBe('hello...')
  })

  it('should handle empty string', () => {
    expect(truncate('', 10)).toBe('')
  })

  it('should handle maxLength of 0', () => {
    expect(truncate('hello', 0)).toBe('...')
  })

  it('should preserve exact boundary', () => {
    expect(truncate('abcdef', 3)).toBe('abc...')
  })
})
