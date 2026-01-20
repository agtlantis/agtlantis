/**
 * Test Cases for Prompt Improvement Scenario
 *
 * Math problem test cases designed to expose weaknesses in a minimal prompt.
 * These cases test for:
 * - Clear numerical answers (accuracy)
 * - Step-by-step reasoning (relevance)
 * - Consistent output format (structure)
 */

import type { TestCase } from '@/core/types'

// ============================================================================
// Input/Output Types
// ============================================================================

export interface MathInput {
  problem: string
}

/**
 * Expected structure after improvement.
 * Initially, the weak prompt won't produce this structure consistently.
 */
export interface MathOutput {
  answer: string
  reasoning?: string
}

// ============================================================================
// Test Cases
// ============================================================================

/**
 * Full set of math test cases (6 cases)
 *
 * Variety of problem types to test prompt robustness:
 * - Basic arithmetic
 * - Word problems
 * - Multi-step problems
 * - Problems requiring explanation
 */
export const MATH_IMPROVEMENT_CASES: TestCase<MathInput>[] = [
  {
    id: 'math-basic-addition',
    input: { problem: 'What is 15 + 27?' },
  },
  {
    id: 'math-basic-multiplication',
    input: { problem: 'Calculate 8 times 12.' },
  },
  {
    id: 'math-word-problem',
    input: {
      problem:
        'A store has 45 apples. If 12 are sold and then 8 more are added, how many apples are there?',
    },
  },
  {
    id: 'math-multi-step',
    input: {
      problem: 'First add 25 and 17, then multiply the result by 3. What is the final answer?',
    },
  },
  {
    id: 'math-percentage',
    input: { problem: 'What is 20% of 150?' },
  },
  {
    id: 'math-division-remainder',
    input: { problem: 'If you divide 100 by 7, what is the quotient and remainder?' },
  },
]

/**
 * Minimal set for cost-controlled testing (2 cases)
 * Enough to generate meaningful evaluation and improvement suggestions.
 */
export const MATH_IMPROVEMENT_CASES_MINIMAL: TestCase<MathInput>[] = [
  MATH_IMPROVEMENT_CASES[0], // Basic addition
  MATH_IMPROVEMENT_CASES[2], // Word problem
]

/**
 * Medium set for balanced testing (4 cases)
 */
export const MATH_IMPROVEMENT_CASES_MEDIUM: TestCase<MathInput>[] = MATH_IMPROVEMENT_CASES.slice(
  0,
  4,
)

/**
 * Helper to get a subset of test cases.
 *
 * @example
 * getMathTestCases(3)  // Returns first 3 cases
 */
export function getMathTestCases(count: number = 2): TestCase<MathInput>[] {
  return MATH_IMPROVEMENT_CASES.slice(0, Math.min(count, MATH_IMPROVEMENT_CASES.length))
}
