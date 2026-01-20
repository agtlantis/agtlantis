import { z, ZodError } from 'zod'
import type { ValidatorCriterion, SchemaValidationResult } from '@/core/types.js'
import type { CriterionOptions } from './index.js'

export interface SchemaOptions<T> extends CriterionOptions {
  schema: z.ZodType<T>
  /** Use unique IDs when using multiple validators */
  id?: string
  name?: string
  description?: string
}

function formatZodErrors(error: ZodError): string {
  return error.errors
    .map((e) => {
      const path = e.path.length > 0 ? `${e.path.join('.')}: ` : ''
      return `- ${path}${e.message}`
    })
    .join('\n')
}

/**
 * Creates a schema validation criterion using Zod.
 *
 * Performs PROGRAMMATIC validation (not LLM-based).
 * Scoring is binary: 100 if validation passes, 0 if it fails.
 *
 * @example
 * ```typescript
 * import { z } from 'zod'
 * import { schema, createJudge, accuracy, defaultJudgePrompt } from '@agtlantis/eval'
 *
 * const RecipeSchema = z.object({
 *   name: z.string(),
 *   ingredients: z.array(z.object({
 *     name: z.string(),
 *     amount: z.string(),
 *   })),
 *   steps: z.array(z.string()).min(1),
 * })
 *
 * const judge = createJudge({
 *   llm: openaiClient,
 *   prompt: defaultJudgePrompt,
 *   criteria: [
 *     schema({ schema: RecipeSchema, weight: 2 }),
 *     accuracy(),
 *   ],
 * })
 * ```
 */
export function schema<T>(options: SchemaOptions<T>): ValidatorCriterion {
  const { schema, id, weight, name, description } = options

  return {
    id: id ?? 'schema-validation',
    name: name ?? '스키마 유효성',
    description:
      description ??
      '출력이 지정된 스키마(Zod)를 준수하는지 프로그래밍 방식으로 검증합니다.',
    weight,
    validator: (output: unknown): SchemaValidationResult => {
      const result = schema.safeParse(output)

      if (result.success) {
        return { valid: true }
      }

      return {
        valid: false,
        errors: result.error.errors,
        errorSummary: formatZodErrors(result.error),
      }
    },
  }
}
