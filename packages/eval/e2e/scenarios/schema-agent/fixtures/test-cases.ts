/**
 * Test Cases for Schema Validation Scenario
 *
 * Defines inputs that trigger valid and invalid JSON outputs from the extractor agent.
 * The agent attempts to extract structured data from natural language text.
 */

import type { TestCase } from '@/core/types'
import type { SchemaName } from './schema-definitions'

// ============================================================================
// Input Types
// ============================================================================

export interface ExtractorInput {
  /** Natural language text to extract data from */
  text: string
  /** Which schema the output should conform to */
  targetSchema: SchemaName
}

// ============================================================================
// Valid Extraction Cases
// ============================================================================

/**
 * Inputs with clear, complete information that should produce valid JSON.
 */
export const VALID_PERSON_CASES: TestCase<ExtractorInput>[] = [
  {
    id: 'person-simple',
    input: {
      text: 'John Smith is 30 years old.',
      targetSchema: 'person',
    },
  },
  {
    id: 'person-with-email',
    input: {
      text: 'Contact Jane Doe, age 25, at jane.doe@example.com.',
      targetSchema: 'person',
    },
  },
]

/**
 * Inputs with complete order information.
 */
export const VALID_ORDER_CASES: TestCase<ExtractorInput>[] = [
  {
    id: 'order-simple',
    input: {
      text: 'Order #A123: 2x Widget at $10.00 each, 1x Gadget at $25.00. Total: $45.00.',
      targetSchema: 'order',
    },
  },
  {
    id: 'order-multiple-items',
    input: {
      text: 'Purchase ID ORD-456: Apple x3 ($2.50), Banana x5 ($1.00), Orange x2 ($3.00). Grand total is $18.50.',
      targetSchema: 'order',
    },
  },
]

/**
 * Combined valid cases for batch testing.
 */
export const VALID_EXTRACTION_CASES: TestCase<ExtractorInput>[] = [
  ...VALID_PERSON_CASES,
  ...VALID_ORDER_CASES,
]

/**
 * Minimal set for cost-controlled testing.
 */
export const VALID_EXTRACTION_MINIMAL: TestCase<ExtractorInput>[] = [VALID_PERSON_CASES[0]]

// ============================================================================
// Invalid Extraction Cases
// ============================================================================

/**
 * Inputs with missing required information that should produce invalid JSON.
 *
 * Note: These are designed to test schema validation failure, not agent failure.
 * The agent will still produce JSON, but it won't match the schema.
 */
export const INVALID_PERSON_CASES: TestCase<ExtractorInput>[] = [
  {
    id: 'person-missing-age',
    input: {
      text: 'Someone named Alex works here.',
      targetSchema: 'person',
    },
  },
  {
    id: 'person-invalid-email',
    input: {
      text: 'Bob is 40 years old. Contact him at not-an-email.',
      targetSchema: 'person',
    },
  },
]

/**
 * Inputs with incomplete order information.
 */
export const INVALID_ORDER_CASES: TestCase<ExtractorInput>[] = [
  {
    id: 'order-no-items',
    input: {
      text: 'Empty order #EMPTY-001, no items purchased.',
      targetSchema: 'order',
    },
  },
  {
    id: 'order-missing-total',
    input: {
      text: 'Order #X789 has 1 Book at $15.',
      targetSchema: 'order',
    },
  },
]

/**
 * Combined invalid cases.
 */
export const INVALID_EXTRACTION_CASES: TestCase<ExtractorInput>[] = [
  ...INVALID_PERSON_CASES,
  ...INVALID_ORDER_CASES,
]

/**
 * Minimal invalid case for focused testing.
 */
export const INVALID_EXTRACTION_MINIMAL: TestCase<ExtractorInput>[] = [INVALID_PERSON_CASES[0]]

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a subset of valid cases for the specified schema.
 */
export function getValidCases(
  schemaName: SchemaName,
  count: number = 1,
): TestCase<ExtractorInput>[] {
  const cases = schemaName === 'person' ? VALID_PERSON_CASES : VALID_ORDER_CASES
  return cases.slice(0, count)
}

/**
 * Get a subset of invalid cases for the specified schema.
 */
export function getInvalidCases(
  schemaName: SchemaName,
  count: number = 1,
): TestCase<ExtractorInput>[] {
  const cases = schemaName === 'person' ? INVALID_PERSON_CASES : INVALID_ORDER_CASES
  return cases.slice(0, count)
}
