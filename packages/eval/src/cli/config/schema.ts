import { z } from 'zod'
import { EvalError, EvalErrorCode } from '@/core/errors'

export const llmConfigSchema = z.object({
  provider: z.enum(['openai', 'gemini'], {
    errorMap: () => ({
      message: "provider must be 'openai' or 'gemini'",
    }),
  }),
  apiKey: z.string().optional(),
  defaultModel: z.string().optional(),
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
  defaultResponseFormat: z
    .object({
      type: z.enum(['json_object', 'text']),
    })
    .optional(),
})

export const criterionSchema = z.object({
  id: z.string().min(1, 'Criterion id is required'),
  name: z.string().min(1, 'Criterion name is required'),
  description: z.string().min(1, 'Criterion description is required'),
  weight: z.number().positive().optional(),
  validator: z.function().optional(),
})

export const judgeConfigSchema = z.object({
  llm: llmConfigSchema.optional(),
  criteria: z
    .array(criterionSchema)
    .min(1, 'At least one criterion is required'),
  passThreshold: z.number().min(0).max(100).optional(),
  prompt: z.any().optional(),
})

export const improverConfigSchema = z
  .object({
    llm: llmConfigSchema.optional(),
    prompt: z.any().optional(),
  })
  .optional()

export const outputConfigSchema = z
  .object({
    dir: z.string().optional(),
    filename: z.string().optional(),
    verbose: z.boolean().optional(),
  })
  .optional()

export const runConfigSchema = z
  .object({
    concurrency: z.number().int().positive().optional(),
    iterations: z.number().int().positive().optional(),
    stopOnFirstFailure: z.boolean().optional(),
  })
  .optional()

const maxTurnsConditionSchema = z.object({
  type: z.literal('maxTurns'),
  count: z.number().int().positive(),
})

const fieldSetConditionSchema = z.object({
  type: z.literal('fieldSet'),
  fieldPath: z.string().min(1),
})

const fieldValueConditionSchema = z.object({
  type: z.literal('fieldValue'),
  fieldPath: z.string().min(1),
  expectedValue: z.unknown(),
})

const customConditionSchema = z.object({
  type: z.literal('custom'),
  check: z.function(),
  description: z.string().optional(),
})

export const terminationConditionSchema = z.union([
  maxTurnsConditionSchema,
  fieldSetConditionSchema,
  fieldValueConditionSchema,
  customConditionSchema,
])

export const followUpInputSchema = z.object({
  input: z.unknown(),
  description: z.string().optional(),
  turns: z.number().optional(),
})

export const multiTurnConfigSchema = z.object({
  followUpInputs: z.array(followUpInputSchema).optional(),
  terminateWhen: z
    .array(terminationConditionSchema)
    .min(1, 'At least one termination condition is required'),
  maxTurns: z.number().int().positive().optional(),
  onConditionMet: z.enum(['pass', 'fail']).optional(),
  onMaxTurnsReached: z.enum(['pass', 'fail']).optional(),
})

export const testCaseSchema = z.object({
  id: z.string().optional(),
  input: z.unknown(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  expectedOutput: z.unknown().optional(),
  files: z.array(z.any()).optional(),
  multiTurn: multiTurnConfigSchema.optional(),
})

export const agentSchema = z.object({
  config: z.object({
    name: z.string(),
    description: z.string().optional(),
  }),
  prompt: z.object({
    id: z.string(),
    version: z.string(),
    system: z.string(),
    buildUserPrompt: z.function(),
  }),
  execute: z.function(),
})

export const evalConfigSchema = z
  .object({
    name: z.string().optional(),
    agentDescription: z.string().optional(),
    agent: agentSchema,
    llm: llmConfigSchema,
    judge: judgeConfigSchema,
    improver: improverConfigSchema,
    testCases: z.array(testCaseSchema).optional(),
    output: outputConfigSchema,
    run: runConfigSchema,
    include: z
      .array(z.string().min(1, 'Include pattern cannot be empty'))
      .min(1, 'Include array must have at least one pattern')
      .optional(),
    agents: z.record(z.string(), agentSchema).optional(),
  })
  .refine(
    (data) => {
      const hasTestCases = (data.testCases?.length ?? 0) > 0
      const hasInclude = (data.include?.length ?? 0) > 0
      return hasTestCases || hasInclude
    },
    {
      message:
        'Either testCases or include must be provided. ' +
        'Use testCases for inline TypeScript tests, or include for YAML file discovery.',
      path: ['testCases'],
    }
  )

export type ValidatedLLMConfig = z.infer<typeof llmConfigSchema>
export type ValidatedJudgeConfig = z.infer<typeof judgeConfigSchema>
export type ValidatedImproverConfig = z.infer<typeof improverConfigSchema>
export type ValidatedOutputConfig = z.infer<typeof outputConfigSchema>
export type ValidatedRunConfig = z.infer<typeof runConfigSchema>
export type ValidatedTestCase = z.infer<typeof testCaseSchema>
export type ValidatedEvalConfig = z.infer<typeof evalConfigSchema>

export function validateConfig(config: unknown): ValidatedEvalConfig {
  const result = evalConfigSchema.safeParse(config)

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.')
        return path ? `  - ${path}: ${issue.message}` : `  - ${issue.message}`
      })
      .join('\n')

    throw new EvalError(`Invalid configuration:\n${errors}`, {
      code: EvalErrorCode.INVALID_CONFIG,
    })
  }

  return result.data
}

export function validateConfigPartial(config: unknown): {
  success: boolean
  errors?: string[]
} {
  const result = evalConfigSchema.safeParse(config)

  if (result.success) {
    return { success: true }
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    }),
  }
}
