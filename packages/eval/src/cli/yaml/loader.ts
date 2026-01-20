/**
 * YAML Eval File Loader
 *
 * Two-phase architecture:
 * 1. Load: Read YAML file, validate, return YamlEvalFile
 * 2. Convert: YamlEvalFile + context -> TestCase[] / MultiTurnTestCase[]
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { EvalError, EvalErrorCode } from '@/core/errors.js'
import type { TestCase } from '@/core/types.js'
import type { Provider } from '@agtlantis/core'
import {
  aiUser,
  fieldEquals,
  fieldIsSet,
  naturalLanguage,
  type ConversationContext,
  type FollowUpInput,
  type MultiTurnTestCase,
  type TerminationCondition,
} from '@/multi-turn/index.js'
import { validateYamlEvalFile } from './schema.js'
import type {
  DiscoveredEvalFile,
  YamlEvalFile,
  YamlLoadOptions,
  YamlPersona,
  YamlTerminationCondition,
  YamlTestCase,
  YamlTestCaseDefaults,
} from './types.js'

export async function loadYamlEvalFile(
  path: string,
  options: YamlLoadOptions = {}
): Promise<YamlEvalFile> {
  const { basePath = process.cwd(), skipValidation = false } = options

  const absolutePath = isAbsolute(path) ? path : resolve(basePath, path)

  if (!existsSync(absolutePath)) {
    throw new EvalError(`YAML eval file not found: ${absolutePath}`, {
      code: EvalErrorCode.FILE_READ_ERROR,
      context: { path, absolutePath },
    })
  }

  let content: string
  try {
    content = await readFile(absolutePath, 'utf-8')
  } catch (error) {
    throw EvalError.from(error, EvalErrorCode.FILE_READ_ERROR, {
      path,
      absolutePath,
    })
  }

  let parsed: unknown
  try {
    parsed = parseYaml(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new EvalError(`Failed to parse YAML: ${message}`, {
      code: EvalErrorCode.INVALID_CONFIG,
      context: { path, absolutePath },
      cause: error instanceof Error ? error : undefined,
    })
  }

  if (skipValidation) {
    return parsed as YamlEvalFile
  }

  return validateYamlEvalFile(parsed)
}

export async function loadYamlEvalFiles(
  paths: string[],
  options: YamlLoadOptions = {}
): Promise<DiscoveredEvalFile[]> {
  const results: DiscoveredEvalFile[] = []

  for (const path of paths) {
    const content = await loadYamlEvalFile(path, options)
    results.push({ path, content })
  }

  return results
}

export interface YamlConversionContext<TInput = unknown, TOutput = unknown> {
  provider: Provider
  /** Custom buildInput for aiUser. Default: wraps response in { message: response } */
  buildInput?: (response: string, ctx: ConversationContext<TInput, TOutput>) => TInput
  formatHistory?: (ctx: ConversationContext<TInput, TOutput>) => string
}

/**
 * Convert YamlEvalFile to TestCase or MultiTurnTestCase array.
 * Cases with persona or endWhen become MultiTurnTestCase, others become TestCase.
 */
export function convertToTestCases<
  TInput = Record<string, unknown>,
  TOutput = unknown,
>(
  yaml: YamlEvalFile,
  context: YamlConversionContext<TInput, TOutput>
): Array<TestCase<TInput> | MultiTurnTestCase<TInput, TOutput>> {
  const { defaults, personas, cases } = yaml

  return cases.map((testCase) => {
    const merged = mergeWithDefaults(testCase, defaults)

    if (isMultiTurnCase(merged)) {
      return convertToMultiTurnTestCase(merged, personas, context)
    }

    return convertToSimpleTestCase<TInput>(merged)
  })
}

interface MergedTestCase {
  id: string
  name?: string
  description?: string
  tags?: string[]
  input: Record<string, unknown>
  persona?: string | YamlPersona
  maxTurns?: number
  endWhen?: YamlTerminationCondition
  onConditionMet?: 'pass' | 'fail'
  onMaxTurnsReached?: 'pass' | 'fail'
  expectedOutput?: Record<string, unknown>
}

function mergeWithDefaults(
  testCase: YamlTestCase,
  defaults: YamlTestCaseDefaults | undefined
): MergedTestCase {
  if (!defaults) {
    return testCase
  }

  return {
    ...testCase,
    maxTurns: testCase.maxTurns ?? defaults.maxTurns,
    endWhen: testCase.endWhen ?? defaults.endWhen,
    onConditionMet: testCase.onConditionMet ?? defaults.onConditionMet,
    onMaxTurnsReached: testCase.onMaxTurnsReached ?? defaults.onMaxTurnsReached,
    tags: [...(defaults.tags ?? []), ...(testCase.tags ?? [])],
  }
}

function isMultiTurnCase(testCase: MergedTestCase): boolean {
  return testCase.persona !== undefined || testCase.endWhen !== undefined
}

function resolvePersona(
  ref: string | YamlPersona | undefined,
  personas: Record<string, YamlPersona> | undefined
): YamlPersona | undefined {
  if (ref === undefined) {
    return undefined
  }

  if (typeof ref === 'object') {
    return ref
  }

  if (!personas || !(ref in personas)) {
    throw new EvalError(`Persona not found: "${ref}"`, {
      code: EvalErrorCode.INVALID_CONFIG,
      context: {
        personaRef: ref,
        availablePersonas: personas ? Object.keys(personas) : [],
      },
    })
  }

  return personas[ref]
}

function convertTerminationCondition<TInput, TOutput>(
  condition: YamlTerminationCondition,
  provider: Provider
): TerminationCondition<TInput, TOutput> {
  if (condition.naturalLanguage) {
    return naturalLanguage<TInput, TOutput>({
      provider,
      prompt: condition.naturalLanguage,
    })
  }

  if (condition.field) {
    if (condition.equals !== undefined) {
      return fieldEquals<TInput, TOutput>(condition.field, condition.equals)
    }
    return fieldIsSet<TInput, TOutput>(condition.field)
  }

  throw new EvalError('Invalid termination condition: no field or naturalLanguage specified', {
    code: EvalErrorCode.INVALID_CONFIG,
    context: { condition },
  })
}

function convertToSimpleTestCase<TInput>(merged: MergedTestCase): TestCase<TInput> {
  return {
    id: merged.id,
    description: merged.name ?? merged.description,
    tags: merged.tags,
    input: merged.input as TInput,
    expectedOutput: merged.expectedOutput,
  }
}

function convertToMultiTurnTestCase<TInput, TOutput>(
  merged: MergedTestCase,
  personas: Record<string, YamlPersona> | undefined,
  context: YamlConversionContext<TInput, TOutput>
): MultiTurnTestCase<TInput, TOutput> {
  const { provider, buildInput, formatHistory } = context

  const persona = resolvePersona(merged.persona, personas)

  const terminateWhen: TerminationCondition<TInput, TOutput>[] = []
  if (merged.endWhen) {
    terminateWhen.push(convertTerminationCondition<TInput, TOutput>(merged.endWhen, provider))
  }

  const followUpInputs: FollowUpInput<TInput, TOutput>[] = []
  if (persona) {
    const defaultBuildInput = (response: string): TInput => ({ message: response }) as TInput

    const aiUserInput = aiUser<TInput, TOutput>({
      provider,
      systemPrompt: persona.systemPrompt,
      formatHistory,
      buildInput: buildInput ?? defaultBuildInput,
    })

    const maxTurns = merged.maxTurns ?? 10
    for (let i = 0; i < maxTurns - 1; i++) {
      followUpInputs.push({
        input: aiUserInput,
        description: `AI User (${persona.name}) - Turn ${i + 2}`,
      })
    }
  }

  return {
    id: merged.id,
    description: merged.name ?? merged.description,
    tags: merged.tags,
    input: merged.input as TInput,
    expectedOutput: merged.expectedOutput,
    multiTurn: {
      followUpInputs,
      terminateWhen,
      maxTurns: merged.maxTurns ?? 10,
      onConditionMet: merged.onConditionMet ?? 'pass',
      onMaxTurnsReached: merged.onMaxTurnsReached ?? 'fail',
    },
  }
}
