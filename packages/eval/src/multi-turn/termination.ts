import type {
  ConversationContext,
  CustomCondition,
  FieldSetCondition,
  FieldValueCondition,
  MaxTurnsCondition,
  TerminationCheckResult,
  TerminationCondition,
} from './types'
import {
  isCustomCondition,
  isFieldSetCondition,
  isFieldValueCondition,
  isMaxTurnsCondition,
} from './types'
import { EvalError, EvalErrorCode } from '@/core/errors'

/** Access a nested field value using dot notation (e.g., "result.recommendation"). */
export function getFieldValue(obj: unknown, fieldPath: string): unknown {
  if (obj === null || obj === undefined) {
    return undefined
  }

  const parts = fieldPath.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }

    if (typeof current !== 'object') {
      return undefined
    }

    current = (current as Record<string, unknown>)[part]
  }

  return current
}

function isSet(value: unknown): boolean {
  return value !== null && value !== undefined
}

function checkMaxTurns<TInput, TOutput>(
  condition: MaxTurnsCondition,
  context: ConversationContext<TInput, TOutput>
): TerminationCheckResult {
  const shouldTerminate = context.currentTurn >= condition.count

  if (shouldTerminate) {
    return {
      terminated: true,
      terminationType: 'maxTurns',
      matchedCondition: condition,
      reason: `Maximum turns reached (${condition.count})`,
    }
  }

  return {
    terminated: false,
    reason: `Turn ${context.currentTurn} of ${condition.count}`,
  }
}

function checkFieldSet<TInput, TOutput>(
  condition: FieldSetCondition,
  context: ConversationContext<TInput, TOutput>
): TerminationCheckResult {
  const fieldValue = getFieldValue(context.lastOutput, condition.fieldPath)
  const fieldIsSet = isSet(fieldValue)

  if (fieldIsSet) {
    return {
      terminated: true,
      terminationType: 'condition',
      matchedCondition: condition,
      reason: `Field "${condition.fieldPath}" is set (value: ${JSON.stringify(fieldValue)})`,
    }
  }

  return {
    terminated: false,
    reason: `Field "${condition.fieldPath}" is not set`,
  }
}

function checkFieldValue<TInput, TOutput>(
  condition: FieldValueCondition,
  context: ConversationContext<TInput, TOutput>
): TerminationCheckResult {
  const fieldValue = getFieldValue(context.lastOutput, condition.fieldPath)
  const matches = fieldValue === condition.expectedValue

  if (matches) {
    return {
      terminated: true,
      terminationType: 'condition',
      matchedCondition: condition,
      reason: `Field "${condition.fieldPath}" equals expected value`,
    }
  }

  return {
    terminated: false,
    reason: `Field "${condition.fieldPath}" does not equal expected value (got: ${JSON.stringify(fieldValue)})`,
  }
}

async function checkCustom<TInput, TOutput>(
  condition: CustomCondition<TInput, TOutput>,
  context: ConversationContext<TInput, TOutput>
): Promise<TerminationCheckResult> {
  const description = condition.description ?? 'Custom condition'

  try {
    const shouldTerminate = await condition.check(context)

    if (shouldTerminate) {
      return {
        terminated: true,
        terminationType: 'condition',
        matchedCondition: condition as TerminationCondition<unknown, unknown>,
        reason: `${description} met`,
      }
    }

    return {
      terminated: false,
      reason: `${description} not met`,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      terminated: false,
      reason: `${description} failed: ${errorMessage}`,
    }
  }
}

export async function checkCondition<TInput, TOutput>(
  condition: TerminationCondition<TInput, TOutput>,
  context: ConversationContext<TInput, TOutput>
): Promise<TerminationCheckResult> {
  if (isMaxTurnsCondition(condition)) {
    return checkMaxTurns(condition, context)
  }

  if (isFieldValueCondition(condition)) {
    return checkFieldValue(condition, context)
  }

  if (isFieldSetCondition(condition)) {
    return checkFieldSet(condition, context)
  }

  if (isCustomCondition(condition)) {
    return checkCustom(condition, context)
  }

  const _exhaustive: never = condition
  throw new EvalError(`Unknown condition type: ${JSON.stringify(_exhaustive)}`, {
    code: EvalErrorCode.UNKNOWN_ERROR,
    context: { condition: _exhaustive },
  })
}

/** Check all termination conditions (OR relationship). Returns on first termination. */
export async function checkTermination<TInput, TOutput>(
  conditions: TerminationCondition<TInput, TOutput>[],
  context: ConversationContext<TInput, TOutput>
): Promise<TerminationCheckResult> {
  if (conditions.length === 0) {
    return {
      terminated: false,
      reason: 'No termination conditions specified',
    }
  }

  for (const condition of conditions) {
    const result = await checkCondition(condition, context)
    if (result.terminated) {
      return result
    }
  }

  return {
    terminated: false,
    reason: 'No termination conditions met',
  }
}
