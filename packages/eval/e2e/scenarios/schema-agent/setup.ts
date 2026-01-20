/**
 * Schema Validation E2E Test Setup
 *
 * Re-exports shared infrastructure and adds schema-specific utilities.
 * This scenario tests ValidatorCriterion with Zod schemas to verify
 * programmatic JSON validation in real LLM evaluations.
 *
 * @example
 * import {
 *   REAL_E2E_ENABLED,
 *   createTestLLMClient,
 *   createSchemaJudge,
 *   loadExtractorPrompt,
 *   runAndSave,
 * } from './setup'
 */

import path from 'node:path'
import { createFilePromptRepository } from '@agtlantis/core'
import type { AgentPrompt } from '@/core/types'
import { schema } from '@/judge/criteria'
import type { ValidatorCriterion } from '@/core/types'
import type { EvalReport } from '@/reporter/types'
import type { EvalSuite } from '@/core/suite'
import type { TestCase } from '@/core/types'
import type { ZodSchema } from 'zod'

import { PersonSchema, OrderSchema, SCHEMAS, type SchemaName } from './fixtures/schema-definitions'
import type { ExtractorInput } from './fixtures/test-cases'

// ============================================================================
// Shared Infrastructure Re-exports
// ============================================================================

export {
  E2E_CONFIG,
  skipIfNoRealE2E,
  validateEnvironment,
  createTestProvider,
  DEFAULT_CRITERIA,
  createTestJudge,
  createProviderAgent,
  TEST_PRICING_CONFIG,
  TEST_TIMEOUTS,
  logTestResultIO,
  logEvalReportIO,
  saveEvalReport,
  E2E_PATHS,
} from '@e2e/shared'

// Local imports for use within this module
import {
  E2E_CONFIG,
  E2E_PATHS,
  TEST_PRICING_CONFIG,
  logEvalReportIO,
  saveEvalReport,
} from '@e2e/shared'

export type { VerbosityLevel } from '@e2e/shared'

// ============================================================================
// Re-export Schema Definitions & Test Cases
// ============================================================================

export { PersonSchema, OrderSchema, SCHEMAS, type SchemaName } from './fixtures/schema-definitions'
export type { Person, Order, OrderItem } from './fixtures/schema-definitions'

export {
  type ExtractorInput,
  VALID_PERSON_CASES,
  VALID_ORDER_CASES,
  VALID_EXTRACTION_CASES,
  VALID_EXTRACTION_MINIMAL,
  INVALID_PERSON_CASES,
  INVALID_ORDER_CASES,
  INVALID_EXTRACTION_CASES,
  INVALID_EXTRACTION_MINIMAL,
  getValidCases,
  getInvalidCases,
} from './fixtures/test-cases'

// ============================================================================
// Schema-Specific Paths
// ============================================================================

/**
 * Output directory for schema-agent test reports.
 */
export const SCHEMA_AGENT_PATH = path.join(E2E_PATHS.base, 'schema-agent')

// ============================================================================
// Local Prompt Loading
// ============================================================================

const FIXTURES_DIR = path.join(__dirname, 'fixtures')

/**
 * Loads the JSON extractor prompt from the fixtures directory.
 * Uses Core's createFilePromptRepository with directory + ID pattern.
 *
 * The extractor agent parses natural language text and outputs structured JSON
 * that can be validated against Zod schemas.
 *
 * @example
 * const prompt = await loadExtractorPrompt()
 * const agent = createLLMAgent(llm, prompt)
 */
export async function loadExtractorPrompt(): Promise<AgentPrompt<ExtractorInput>> {
  const repo = createFilePromptRepository({
    directory: FIXTURES_DIR,
  })
  const prompt = await repo.read<ExtractorInput>('json-extractor')
  return prompt as AgentPrompt<ExtractorInput>
}

// ============================================================================
// Schema-Specific Judge Creation
// ============================================================================

/**
 * Creates a ValidatorCriterion for a given schema.
 *
 * @param schemaName - Name of the schema ('person' | 'order')
 * @param options - Optional overrides for id, name, weight
 *
 * @example
 * const criterion = createSchemaCriterion('person', { weight: 2 })
 */
export function createSchemaCriterion(
  schemaName: SchemaName,
  options: { id?: string; name?: string; weight?: number } = {},
): ValidatorCriterion {
  const zodSchema = SCHEMAS[schemaName] as ZodSchema
  return schema({
    schema: zodSchema,
    id: options.id ?? `${schemaName}-schema`,
    name: options.name ?? `${schemaName.charAt(0).toUpperCase() + schemaName.slice(1)} Schema`,
    weight: options.weight,
  })
}

// ============================================================================
// Convenience Wrapper
// ============================================================================

/**
 * Runs the suite, logs I/O, and saves the report automatically.
 *
 * @example
 * const report = await runAndSave(suite, testCases, 'person-valid')
 */
export async function runAndSave<TInput, TOutput>(
  suite: EvalSuite<TInput, TOutput>,
  testCases: TestCase<TInput>[],
  testName: string,
): Promise<EvalReport<TInput, TOutput>> {
  const report = await suite.run(testCases)
  logEvalReportIO(report, TEST_PRICING_CONFIG, E2E_CONFIG.verbose)
  saveEvalReport(report, testName, SCHEMA_AGENT_PATH, TEST_PRICING_CONFIG)
  return report
}
