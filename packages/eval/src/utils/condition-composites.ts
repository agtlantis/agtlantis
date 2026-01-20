/**
 * Shared Condition Composite Helpers
 *
 * These helper functions provide the core logic for AND/OR/NOT condition composites.
 * Domain-specific modules (multi-turn, improvement-cycle) use these helpers while
 * maintaining their own type definitions.
 *
 * @example
 * ```typescript
 * // In multi-turn/conditions.ts
 * import { createAndCheck } from '@/utils/condition-composites'
 *
 * export function and<TInput, TOutput>(
 *   ...conditions: TerminationCondition<TInput, TOutput>[]
 * ): CustomCondition<TInput, TOutput> {
 *   return {
 *     type: 'custom',
 *     check: createAndCheck(conditions, checkCondition),
 *     description: `and(${conditions.map(c => c.type).join(', ')})`,
 *   }
 * }
 * ```
 */

/**
 * Result type expected from condition check functions.
 * Both multi-turn and improvement-cycle use this shape.
 */
export interface ConditionCheckResult {
  terminated: boolean
}

/**
 * Type for condition check functions.
 * The check function receives a condition and context, returns a result.
 */
export type ConditionCheckFn<TCondition, TContext> = (
  condition: TCondition,
  context: TContext
) => ConditionCheckResult | Promise<ConditionCheckResult>

/**
 * Create an AND check function.
 *
 * Returns a function that evaluates all conditions and returns true only if ALL terminate.
 * Short-circuits on first non-terminating condition.
 *
 * @param conditions - Array of conditions to check
 * @param checkFn - Function to check a single condition
 * @returns Async function that returns true if all conditions terminate
 */
export function createAndCheck<TCondition, TContext>(
  conditions: TCondition[],
  checkFn: ConditionCheckFn<TCondition, TContext>
): (context: TContext) => Promise<boolean> {
  return async (context: TContext) => {
    for (const condition of conditions) {
      const result = await checkFn(condition, context)
      if (!result.terminated) {
        return false
      }
    }
    return true
  }
}

/**
 * Create an OR check function.
 *
 * Returns a function that evaluates conditions and returns true if ANY terminates.
 * Short-circuits on first terminating condition.
 *
 * @param conditions - Array of conditions to check
 * @param checkFn - Function to check a single condition
 * @returns Async function that returns true if any condition terminates
 */
export function createOrCheck<TCondition, TContext>(
  conditions: TCondition[],
  checkFn: ConditionCheckFn<TCondition, TContext>
): (context: TContext) => Promise<boolean> {
  return async (context: TContext) => {
    for (const condition of conditions) {
      const result = await checkFn(condition, context)
      if (result.terminated) {
        return true
      }
    }
    return false
  }
}

/**
 * Create a NOT check function.
 *
 * Returns a function that inverts the result of a single condition check.
 *
 * @param condition - The condition to invert
 * @param checkFn - Function to check the condition
 * @returns Async function that returns true if condition does NOT terminate
 */
export function createNotCheck<TCondition, TContext>(
  condition: TCondition,
  checkFn: ConditionCheckFn<TCondition, TContext>
): (context: TContext) => Promise<boolean> {
  return async (context: TContext) => {
    const result = await checkFn(condition, context)
    return !result.terminated
  }
}

/**
 * Format a description for composite conditions.
 *
 * @param type - Composite type ('and', 'or', 'not')
 * @param conditions - Conditions being composed
 * @returns Formatted description string
 */
export function formatCompositeDescription<TCondition extends { type: string }>(
  type: 'and' | 'or',
  conditions: TCondition[]
): string {
  if (conditions.length === 0) {
    return `${type}() - empty, never terminates`
  }
  return `${type}(${conditions.map((c) => c.type).join(', ')})`
}
