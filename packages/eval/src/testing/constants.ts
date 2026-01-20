/**
 * Mock token usage values for testing LLM-based components.
 * Use these instead of hardcoding token counts in tests.
 */
export const MOCK_TOKEN_USAGE = {
  small: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
  medium: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  large: { inputTokens: 500, outputTokens: 250, totalTokens: 750 },
} as const

/**
 * Mock latency values (in milliseconds) for testing timing-related behavior.
 */
export const MOCK_LATENCY = {
  fast: 50,
  normal: 100,
  slow: 500,
} as const

/**
 * Mock cost values for testing cost calculation and tracking.
 * Values represent typical costs per component per round.
 */
export const MOCK_COSTS = {
  singleRound: { agent: 0.01, judge: 0.005, improver: 0.002, total: 0.017 },
  highCost: { agent: 0.1, judge: 0.05, improver: 0.02, total: 0.17 },
} as const

/**
 * Score thresholds for testing pass/fail conditions.
 * Use these to create consistent test scenarios.
 */
export const TEST_SCORES = {
  passing: 85,
  failing: 45,
  atThreshold: 70,
  belowThreshold: 65,
} as const

/**
 * Deterministic seed values for reproducible random behavior in tests.
 */
export const DETERMINISTIC_SEEDS = {
  default: 42,
  alternative: 123,
} as const
