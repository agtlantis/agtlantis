/**
 * Test Cases for First Evaluation Scenario
 *
 * Simple greeting test cases for testing the basic Agent → Judge → Report flow.
 */

import type { TestCase } from '@/core/types'

// ============================================================================
// Input Types
// ============================================================================

export interface GreetingInput {
  name: string
}

// ============================================================================
// Test Cases
// ============================================================================

/**
 * Full set of greeting test cases (5 cases)
 */
export const GREETING_TEST_CASES: TestCase<GreetingInput>[] = [
  { id: 'greet-alice', input: { name: 'Alice' } },
  { id: 'greet-bob', input: { name: 'Bob' } },
  { id: 'greet-charlie', input: { name: 'Charlie' } },
  { id: 'greet-diana', input: { name: 'Diana' } },
  { id: 'greet-eve', input: { name: 'Eve' } },
]

/**
 * Minimal set for cost-controlled testing (1 case)
 */
export const GREETING_TEST_CASES_MINIMAL: TestCase<GreetingInput>[] = [GREETING_TEST_CASES[0]]

/**
 * Helper to get a subset of test cases
 */
export function getGreetingTestCases(count: number = 1): TestCase<GreetingInput>[] {
  return GREETING_TEST_CASES.slice(0, count)
}
