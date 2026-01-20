import type { Criterion } from '@/core/types.js'

export { schema, type SchemaOptions } from './validate-schema.js'

export interface CriterionOptions {
  weight?: number
}

/**
 * Evaluates whether the agent's output is factually accurate
 * and free from errors or hallucinations.
 */
export function accuracy(options?: CriterionOptions): Criterion {
  return {
    id: 'accuracy',
    name: 'Accuracy',
    description:
      'Evaluates whether the output is factually correct, free from errors, and avoids hallucinations. Check for incorrect facts, made-up information, or misrepresentation of the input data.',
    weight: options?.weight,
  }
}

/**
 * Evaluates whether the agent's output is internally consistent
 * and doesn't contradict itself or the provided context.
 */
export function consistency(options?: CriterionOptions): Criterion {
  return {
    id: 'consistency',
    name: 'Consistency',
    description:
      'Evaluates whether the output is internally coherent and logically consistent. Check for self-contradictions, conflicting statements, or logical inconsistencies within the response.',
    weight: options?.weight,
  }
}

/**
 * Evaluates whether the agent's output is relevant to the input
 * and addresses the user's needs appropriately.
 */
export function relevance(options?: CriterionOptions): Criterion {
  return {
    id: 'relevance',
    name: 'Relevance',
    description:
      'Evaluates whether the output directly addresses the input and fulfills the user intent. Check for off-topic content, missing key requirements, or responses that fail to answer the actual question.',
    weight: options?.weight,
  }
}

/**
 * Evaluates whether the agent's output shows clear step-by-step reasoning
 * or explanation of the solution process.
 */
export function stepByStep(options?: CriterionOptions): Criterion {
  return {
    id: 'step-by-step',
    name: 'Step-by-Step Reasoning',
    description:
      'Evaluates whether the output demonstrates clear, structured reasoning with explicit steps. ' +
      'Check for: numbered steps or clear progression, explanation of the thought process, ' +
      'intermediate results shown before the final answer. ' +
      'Penalize outputs that jump directly to the answer without showing work.',
    weight: options?.weight,
  }
}
