import type {
  CycleContext,
  CycleTerminationCondition,
  CycleTerminationResult,
  TargetScoreCondition,
  MaxRoundsCondition,
  NoImprovementCondition,
  MaxCostCondition,
  CustomCycleCondition,
} from './types'
import {
  isTargetScoreCondition,
  isMaxRoundsCondition,
  isNoImprovementCondition,
  isMaxCostCondition,
  isCustomCycleCondition,
} from './types'
import { EvalError, EvalErrorCode } from '@/core/errors'
import {
  createAndCheck,
  createOrCheck,
  createNotCheck,
  formatCompositeDescription,
} from '../utils/condition-composites'

/** Terminates when the average score reaches or exceeds threshold. */
export function targetScore(threshold: number): TargetScoreCondition {
  if (!Number.isFinite(threshold)) {
    throw new EvalError('threshold must be a finite number', {
      code: EvalErrorCode.INVALID_CONFIG,
      context: { threshold },
    })
  }
  if (threshold < 0 || threshold > 100) {
    throw new EvalError('threshold must be between 0 and 100', {
      code: EvalErrorCode.INVALID_CONFIG,
      context: { threshold },
    })
  }
  return { type: 'targetScore', threshold }
}

/** Terminates after completing the specified number of rounds. */
export function maxRounds(count: number): MaxRoundsCondition {
  if (!Number.isInteger(count) || count < 1) {
    throw new EvalError('count must be a positive integer', {
      code: EvalErrorCode.INVALID_CONFIG,
      context: { count },
    })
  }
  return { type: 'maxRounds', count }
}

/** Terminates when score hasn't improved for N consecutive rounds. */
export function noImprovement(
  consecutiveRounds: number,
  minDelta?: number
): NoImprovementCondition {
  if (!Number.isInteger(consecutiveRounds) || consecutiveRounds < 1) {
    throw new EvalError('consecutiveRounds must be a positive integer', {
      code: EvalErrorCode.INVALID_CONFIG,
      context: { consecutiveRounds },
    })
  }
  if (minDelta !== undefined && (!Number.isFinite(minDelta) || minDelta < 0)) {
    throw new EvalError('minDelta must be a non-negative finite number', {
      code: EvalErrorCode.INVALID_CONFIG,
      context: { minDelta },
    })
  }
  return {
    type: 'noImprovement',
    consecutiveRounds,
    ...(minDelta !== undefined && { minDelta }),
  }
}

/** Terminates when total accumulated cost reaches or exceeds the budget. */
export function maxCost(maxUSD: number): MaxCostCondition {
  if (!Number.isFinite(maxUSD) || maxUSD <= 0) {
    throw new EvalError('maxUSD must be a positive finite number', {
      code: EvalErrorCode.INVALID_CONFIG,
      context: { maxUSD },
    })
  }
  return { type: 'maxCost', maxUSD }
}

/** Custom termination condition with arbitrary logic. Supports async checks. */
export function customCondition(
  check: (ctx: CycleContext) => boolean | Promise<boolean>,
  description?: string
): CustomCycleCondition {
  return {
    type: 'custom',
    check,
    ...(description !== undefined && { description }),
  }
}

/** All conditions must be met for termination. Short-circuits on first false. */
export function and(
  ...conditions: CycleTerminationCondition[]
): CustomCycleCondition {
  if (conditions.length === 0) {
    return {
      type: 'custom',
      check: () => false,
      description: formatCompositeDescription('and', []),
    }
  }

  return {
    type: 'custom',
    check: createAndCheck(conditions, checkCycleCondition),
    description: formatCompositeDescription('and', conditions),
  }
}

/** Any condition being met causes termination. Short-circuits on first true. */
export function or(
  ...conditions: CycleTerminationCondition[]
): CustomCycleCondition {
  if (conditions.length === 0) {
    return {
      type: 'custom',
      check: () => false,
      description: formatCompositeDescription('or', []),
    }
  }

  return {
    type: 'custom',
    check: createOrCheck(conditions, checkCycleCondition),
    description: formatCompositeDescription('or', conditions),
  }
}

/** Invert a condition's result. Terminates when inner condition does NOT terminate. */
export function not(
  condition: CycleTerminationCondition
): CustomCycleCondition {
  return {
    type: 'custom',
    check: createNotCheck(condition, checkCycleCondition),
    description: `not(${condition.type})`,
  }
}

function checkTargetScore(
  condition: TargetScoreCondition,
  ctx: CycleContext
): CycleTerminationResult {
  if (ctx.latestScore >= condition.threshold) {
    return {
      terminated: true,
      matchedCondition: condition,
      reason: `Target score ${condition.threshold} reached (current: ${ctx.latestScore})`,
    }
  }
  return {
    terminated: false,
    reason: `Score ${ctx.latestScore} below target ${condition.threshold}`,
  }
}

function checkMaxRounds(
  condition: MaxRoundsCondition,
  ctx: CycleContext
): CycleTerminationResult {
  if (ctx.currentRound >= condition.count) {
    return {
      terminated: true,
      matchedCondition: condition,
      reason: `Maximum rounds reached (${condition.count})`,
    }
  }
  return {
    terminated: false,
    reason: `Round ${ctx.currentRound} of ${condition.count}`,
  }
}

/**
 * Counts consecutive rounds without improvement from most recent to oldest.
 * Breaks on null delta (first round) or on improvement (scoreDelta > minDelta).
 */
function checkNoImprovement(
  condition: NoImprovementCondition,
  ctx: CycleContext
): CycleTerminationResult {
  const { consecutiveRounds, minDelta = 0 } = condition
  const { history } = ctx

  let noImprovementCount = 0

  for (let i = history.length - 1; i >= 0; i--) {
    const round = history[i]

    if (round.scoreDelta === null) break
    if (round.scoreDelta <= minDelta) {
      noImprovementCount++
    } else {
      break
    }
  }

  if (noImprovementCount >= consecutiveRounds) {
    return {
      terminated: true,
      matchedCondition: condition,
      reason: `No improvement for ${noImprovementCount} consecutive round${noImprovementCount === 1 ? '' : 's'}`,
    }
  }

  const roundWord = noImprovementCount === 1 ? 'round' : 'rounds'
  return {
    terminated: false,
    reason: `${noImprovementCount} ${roundWord} without improvement (need ${consecutiveRounds})`,
  }
}

function checkMaxCost(
  condition: MaxCostCondition,
  ctx: CycleContext
): CycleTerminationResult {
  if (ctx.totalCost >= condition.maxUSD) {
    return {
      terminated: true,
      matchedCondition: condition,
      reason: `Cost limit exceeded ($${ctx.totalCost.toFixed(2)} >= $${condition.maxUSD.toFixed(2)})`,
    }
  }
  return {
    terminated: false,
    reason: `Cost $${ctx.totalCost.toFixed(2)} under limit $${condition.maxUSD.toFixed(2)}`,
  }
}

async function checkCustomCondition(
  condition: CustomCycleCondition,
  ctx: CycleContext
): Promise<CycleTerminationResult> {
  const description = condition.description ?? 'Custom condition'

  try {
    const shouldTerminate = await condition.check(ctx)

    if (shouldTerminate) {
      return {
        terminated: true,
        matchedCondition: condition,
        reason: `${description} met`,
      }
    }
    return {
      terminated: false,
      reason: `${description} not met`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      terminated: false,
      reason: `${description} check failed: ${message}`,
    }
  }
}

/** Dispatches to the appropriate check function based on condition type. */
export async function checkCycleCondition(
  condition: CycleTerminationCondition,
  context: CycleContext
): Promise<CycleTerminationResult> {
  if (isTargetScoreCondition(condition)) {
    return checkTargetScore(condition, context)
  }
  if (isMaxRoundsCondition(condition)) {
    return checkMaxRounds(condition, context)
  }
  if (isNoImprovementCondition(condition)) {
    return checkNoImprovement(condition, context)
  }
  if (isMaxCostCondition(condition)) {
    return checkMaxCost(condition, context)
  }
  if (isCustomCycleCondition(condition)) {
    return checkCustomCondition(condition, context)
  }

  // Exhaustive check - TypeScript will error if we miss a case
  const _exhaustive: never = condition
  throw new EvalError(`Unknown condition type: ${JSON.stringify(_exhaustive)}`, {
    code: EvalErrorCode.UNKNOWN_ERROR,
    context: { condition: _exhaustive },
  })
}

/** Check all conditions with OR semantics - first match wins. */
export async function checkCycleTermination(
  conditions: CycleTerminationCondition[],
  context: CycleContext
): Promise<CycleTerminationResult> {
  if (conditions.length === 0) {
    return {
      terminated: false,
      reason: 'No termination conditions specified',
    }
  }

  for (const condition of conditions) {
    const result = await checkCycleCondition(condition, context)
    if (result.terminated) {
      return result // First match wins (OR semantics)
    }
  }

  return {
    terminated: false,
    reason: 'No termination conditions met',
  }
}
