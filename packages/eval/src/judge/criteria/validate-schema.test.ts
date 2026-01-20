import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { schema } from './validate-schema.js'

describe('schema', () => {
  describe('criterion properties', () => {
    it('should return criterion with correct default id and name', () => {
      const testSchema = z.object({ name: z.string() })
      const criterion = schema({ schema: testSchema })

      expect(criterion.id).toBe('schema-validation')
      expect(criterion.name).toBe('스키마 유효성')
      expect(criterion.description).toContain('스키마')
    })

    it('should accept custom name and description', () => {
      const testSchema = z.object({ name: z.string() })
      const criterion = schema({
        schema: testSchema,
        name: 'Recipe Schema',
        description: 'Validates recipe output format',
      })

      expect(criterion.name).toBe('Recipe Schema')
      expect(criterion.description).toBe('Validates recipe output format')
    })

    it('should accept custom weight', () => {
      const testSchema = z.object({ name: z.string() })
      const criterion = schema({ schema: testSchema, weight: 2 })

      expect(criterion.weight).toBe(2)
    })

    it('should have undefined weight by default', () => {
      const testSchema = z.object({ name: z.string() })
      const criterion = schema({ schema: testSchema })

      expect(criterion.weight).toBeUndefined()
    })

    it('should have a validator function', () => {
      const testSchema = z.object({ name: z.string() })
      const criterion = schema({ schema: testSchema })

      expect(criterion.validator).toBeDefined()
      expect(typeof criterion.validator).toBe('function')
    })

    it('should use custom id when provided', () => {
      const testSchema = z.object({ name: z.string() })
      const criterion = schema({
        id: 'custom-schema-id',
        schema: testSchema,
      })

      expect(criterion.id).toBe('custom-schema-id')
    })

    it('should default to schema-validation when id not provided', () => {
      const testSchema = z.object({ name: z.string() })
      const criterion = schema({ schema: testSchema })

      expect(criterion.id).toBe('schema-validation')
    })

    it('should allow multiple validators with different ids', () => {
      const schema1 = z.object({ name: z.string() })
      const schema2 = z.object({ count: z.number() })

      const criterion1 = schema({ id: 'name-validator', schema: schema1 })
      const criterion2 = schema({ id: 'count-validator', schema: schema2 })

      expect(criterion1.id).toBe('name-validator')
      expect(criterion2.id).toBe('count-validator')
      expect(criterion1.id).not.toBe(criterion2.id)
    })
  })

  describe('validator - valid outputs', () => {
    it('should return valid=true for matching simple object', () => {
      const testSchema = z.object({ name: z.string(), age: z.number() })
      const criterion = schema({ schema: testSchema })

      const result = criterion.validator!({ name: 'John', age: 30 })

      expect(result.valid).toBe(true)
      expect(result.errors).toBeUndefined()
      expect(result.errorSummary).toBeUndefined()
    })

    it('should return valid=true for matching nested object', () => {
      const testSchema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
      })
      const criterion = schema({ schema: testSchema })

      const result = criterion.validator!({
        user: { name: 'John', email: 'john@example.com' },
      })

      expect(result.valid).toBe(true)
    })

    it('should return valid=true for matching array', () => {
      const testSchema = z.array(z.object({ id: z.number(), name: z.string() }))
      const criterion = schema({ schema: testSchema })

      const result = criterion.validator!([
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ])

      expect(result.valid).toBe(true)
    })

    it('should return valid=true with optional fields', () => {
      const testSchema = z.object({
        name: z.string(),
        nickname: z.string().optional(),
      })
      const criterion = schema({ schema: testSchema })

      const result = criterion.validator!({ name: 'John' })

      expect(result.valid).toBe(true)
    })
  })

  describe('validator - invalid outputs', () => {
    it('should return valid=false for missing required field', () => {
      const testSchema = z.object({ name: z.string(), age: z.number() })
      const criterion = schema({ schema: testSchema })

      const result = criterion.validator!({ name: 'John' })

      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
      expect(result.errorSummary).toContain('age')
    })

    it('should return valid=false for wrong type', () => {
      const testSchema = z.object({ name: z.string(), age: z.number() })
      const criterion = schema({ schema: testSchema })

      const result = criterion.validator!({ name: 'John', age: 'thirty' })

      expect(result.valid).toBe(false)
      expect(result.errorSummary).toContain('age')
    })

    it('should return valid=false for invalid nested field', () => {
      const testSchema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      })
      const criterion = schema({ schema: testSchema })

      const result = criterion.validator!({
        user: { email: 'not-an-email' },
      })

      expect(result.valid).toBe(false)
      expect(result.errorSummary).toContain('user.email')
    })

    it('should return valid=false for invalid array item', () => {
      const testSchema = z.array(z.object({ id: z.number() }))
      const criterion = schema({ schema: testSchema })

      const result = criterion.validator!([{ id: 1 }, { id: 'two' }])

      expect(result.valid).toBe(false)
      expect(result.errorSummary).toContain('1.id')
    })

    it('should return valid=false for null when object expected', () => {
      const testSchema = z.object({ name: z.string() })
      const criterion = schema({ schema: testSchema })

      const result = criterion.validator!(null)

      expect(result.valid).toBe(false)
    })

    it('should return valid=false for undefined when object expected', () => {
      const testSchema = z.object({ name: z.string() })
      const criterion = schema({ schema: testSchema })

      const result = criterion.validator!(undefined)

      expect(result.valid).toBe(false)
    })
  })

  describe('error formatting', () => {
    it('should format multiple errors with paths', () => {
      const testSchema = z.object({
        name: z.string(),
        age: z.number(),
        email: z.string().email(),
      })
      const criterion = schema({ schema: testSchema })

      const result = criterion.validator!({ age: 'not-a-number' })

      expect(result.valid).toBe(false)
      expect(result.errorSummary).toContain('- ')
      // Should have multiple error lines
      const errorLines = result.errorSummary!.split('\n')
      expect(errorLines.length).toBeGreaterThanOrEqual(2)
    })

    it('should format root-level error without path prefix', () => {
      const testSchema = z.string()
      const criterion = schema({ schema: testSchema })

      const result = criterion.validator!(123)

      expect(result.valid).toBe(false)
      expect(result.errorSummary).toBeDefined()
      // Root error should not have path prefix like ".: "
      expect(result.errorSummary).not.toContain('.: ')
    })
  })

  describe('complex schemas', () => {
    it('should validate union types', () => {
      const testSchema = z.union([
        z.object({ type: z.literal('text'), content: z.string() }),
        z.object({ type: z.literal('image'), url: z.string().url() }),
      ])
      const criterion = schema({ schema: testSchema })

      expect(criterion.validator!({ type: 'text', content: 'Hello' }).valid).toBe(true)
      expect(criterion.validator!({ type: 'image', url: 'https://example.com/img.png' }).valid).toBe(true)
      expect(criterion.validator!({ type: 'video', url: 'test' }).valid).toBe(false)
    })

    it('should validate with refinements', () => {
      const testSchema = z
        .object({
          password: z.string(),
          confirmPassword: z.string(),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: 'Passwords must match',
        })
      const criterion = schema({ schema: testSchema })

      expect(
        criterion.validator!({ password: 'abc123', confirmPassword: 'abc123' }).valid
      ).toBe(true)
      expect(
        criterion.validator!({ password: 'abc123', confirmPassword: 'xyz789' }).valid
      ).toBe(false)
    })

    it('should validate with transforms', () => {
      const testSchema = z.object({
        date: z.string().transform((val) => new Date(val)),
      })
      // Type assertion needed because transform changes input type (string) to output type (Date)
      const criterion = schema({
        schema: testSchema as unknown as z.ZodType<{ date: Date }>,
      })

      expect(criterion.validator!({ date: '2024-01-01' }).valid).toBe(true)
    })
  })

  describe('factory function behavior', () => {
    it('should create new criterion instance each time', () => {
      const testSchema = z.object({ name: z.string() })
      const criterion1 = schema({ schema: testSchema })
      const criterion2 = schema({ schema: testSchema })

      expect(criterion1).not.toBe(criterion2)
    })

    it('should allow different schemas', () => {
      const schema1 = z.object({ name: z.string() })
      const schema2 = z.object({ id: z.number() })

      const criterion1 = schema({ schema: schema1 })
      const criterion2 = schema({ schema: schema2 })

      expect(criterion1.validator!({ name: 'test' }).valid).toBe(true)
      expect(criterion1.validator!({ id: 123 }).valid).toBe(false)

      expect(criterion2.validator!({ id: 123 }).valid).toBe(true)
      expect(criterion2.validator!({ name: 'test' }).valid).toBe(false)
    })
  })
})
