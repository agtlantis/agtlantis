import { existsSync } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { printBanner, printProgress, printError } from '../output/console.js'
import {
  loadHistory,
  type ImprovementHistory,
  type SerializedPrompt,
} from '../../improvement-cycle/index.js'

export interface RollbackCommandOptions {
  round?: string
  initial?: boolean
  output: string
  format?: 'json' | 'ts'
}

export async function rollbackCommand(
  historyPath: string,
  options: RollbackCommandOptions
): Promise<void> {
  try {
    printBanner()

    validateRollbackOptions(historyPath, options)

    printProgress(`Loading history from ${historyPath}...`)
    const history = await loadHistory(historyPath)

    const { prompt: serializedPrompt, sourceLabel } = extractPromptSnapshot(history, options)

    printProgress(`Extracting ${sourceLabel}...`)

    const format = options.format ?? 'json'
    const output = formatPromptOutput(serializedPrompt, format)

    await writeOutputFile(options.output, output)

    console.log()
    console.log(`  Prompt extracted to: ${options.output}`)
    console.log(`    Prompt ID: ${serializedPrompt.id}`)
    console.log(`    Version: ${serializedPrompt.version}`)
    console.log()
  } catch (error) {
    printError(error instanceof Error ? error : new Error(String(error)))
    process.exit(1)
  }
}

interface PromptSnapshot {
  prompt: SerializedPrompt
  sourceLabel: string
}

function extractPromptSnapshot(
  history: ImprovementHistory,
  options: RollbackCommandOptions
): PromptSnapshot {
  if (options.initial) {
    return {
      prompt: history.initialPrompt,
      sourceLabel: 'initial prompt',
    }
  }

  const roundNumber = parseInt(options.round!, 10)
  return {
    prompt: extractPromptFromRound(history, roundNumber),
    sourceLabel: `round ${roundNumber}`,
  }
}

function validateRollbackOptions(
  historyPath: string,
  options: RollbackCommandOptions
): void {
  if (!historyPath) {
    throw new Error('History file path is required')
  }

  const hasRound = options.round !== undefined
  const hasInitial = options.initial === true

  if (!hasRound && !hasInitial) {
    throw new Error('Either --round <n> or --initial is required')
  }

  if (hasRound && hasInitial) {
    throw new Error('Cannot use both --round and --initial')
  }

  if (!options.output) {
    throw new Error('--output <path> is required')
  }

  if (hasRound) {
    const roundNum = parseInt(options.round!, 10)
    if (!Number.isInteger(roundNum) || roundNum < 1) {
      throw new Error(`Invalid round number: ${options.round}. Must be 1 or greater.`)
    }
  }

  if (options.format && !['json', 'ts'].includes(options.format)) {
    throw new Error(`Invalid format: ${options.format}. Use 'json' or 'ts'`)
  }
}

function extractPromptFromRound(
  history: ImprovementHistory,
  roundNumber: number
): SerializedPrompt {
  const roundIndex = roundNumber - 1
  if (roundIndex < 0 || roundIndex >= history.rounds.length) {
    const availableRounds =
      history.rounds.length > 0 ? `1-${history.rounds.length}` : 'none'
    throw new Error(
      `Round ${roundNumber} not found. Available rounds: ${availableRounds}. Use --initial for the original prompt.`
    )
  }

  return history.rounds[roundIndex].promptSnapshot
}

function formatPromptOutput(
  prompt: SerializedPrompt,
  format: 'json' | 'ts'
): string {
  if (format === 'json') {
    return JSON.stringify(prompt, null, 2)
  }

  return generateTypeScriptPrompt(prompt)
}

function generateTypeScriptPrompt(prompt: SerializedPrompt): string {
  const escapedSystem = escapeTemplateString(prompt.system)
  const escapedUserTemplate = escapeTemplateString(prompt.userTemplate)

  const customFieldsComment = prompt.customFields
    ? `\n * Custom fields: ${Object.keys(prompt.customFields).join(', ')}`
    : ''

  return `import { compileTemplate } from 'agent-eval'
import type { AgentPrompt } from 'agent-eval'

/**
 * Extracted from improvement cycle
 * Original ID: ${prompt.id}
 * Version: ${prompt.version}${customFieldsComment}
 */
export const prompt: AgentPrompt<YourInputType> = {
  id: '${prompt.id}',
  version: '${prompt.version}',
  system: \`${escapedSystem}\`,
  userTemplate: \`${escapedUserTemplate}\`,
  buildUserPrompt: compileTemplate(\`${escapedUserTemplate}\`),
}
`
}

function escapeTemplateString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${')
}

async function writeOutputFile(path: string, content: string): Promise<void> {
  const dir = dirname(path)
  if (dir && dir !== '.' && dir !== '/' && !existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await writeFile(path, content, 'utf-8')
}
