/**
 * Evaluation Constants
 *
 * Centralized constants used across the evaluation system.
 * Eliminates magic numbers and provides semantic names.
 */

/**
 * Score-related constants.
 */
export const SCORE = {
  /** Minimum possible score */
  MIN: 0,
  /** Maximum possible score */
  MAX: 100,
  /** Default threshold for passing evaluation */
  DEFAULT_PASS_THRESHOLD: 70,
  /** Threshold for majority-based pass determination (50%) */
  MAJORITY_PASS_THRESHOLD: 0.5,
} as const

/**
 * Default configuration values.
 */
export const DEFAULTS = {
  /** Default maximum turns for multi-turn conversations */
  MAX_TURNS: 10,
  /** Default concurrency for parallel execution */
  CONCURRENCY: 1,
} as const


/**
 * Zero token usage - used for error cases or initialization.
 */
export const ZERO_TOKEN_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
} as const

/**
 * Type for score values (0-100).
 */
export type Score = number
