import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import crypto from 'node:crypto'

import { compileTemplate } from '@agtlantis/core'
import { EvalError, EvalErrorCode } from '@/core/errors'
import type { AgentPrompt } from '@/core/types'
import type {
  ImprovementHistory,
  SerializedPrompt,
  SerializedRoundResult,
  RoundResult,
} from './types'

/** Storage abstraction for testability - allows injecting mock storage */
export interface HistoryStorage {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  exists: (path: string) => boolean
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<string | undefined | void>
}

export const defaultHistoryStorage: HistoryStorage = {
  readFile: (path) => readFile(path, 'utf-8'),
  writeFile: (path, content) => writeFile(path, content, 'utf-8'),
  exists: existsSync,
  mkdir: (path, options) => mkdir(path, options),
}

export interface ImprovementSession {
  readonly sessionId: string
  readonly history: Readonly<ImprovementHistory>
  readonly canSave: boolean
  addRound(roundResult: RoundResult, updatedPrompt: SerializedPrompt): void
  complete(terminationReason: string): void
  save(): Promise<void>
  flush(): Promise<void>
}

export interface SessionConfig {
  path?: string
  autoSave?: boolean
  storage?: HistoryStorage
  onAutoSaveError?: (error: Error) => void
}

export function hasUserTemplate(
  prompt: AgentPrompt<unknown>,
): prompt is AgentPrompt<unknown> & { userTemplate: string } {
  return typeof (prompt as { userTemplate?: unknown }).userTemplate === 'string'
}

/** @throws EvalError with PROMPT_INVALID_FORMAT if userTemplate is missing */
export function serializePrompt<TInput>(prompt: AgentPrompt<TInput>): SerializedPrompt {
  const p = prompt as AgentPrompt<unknown>
  if (!hasUserTemplate(p)) {
    throw new EvalError('Cannot serialize prompt: userTemplate field is required', {
      code: EvalErrorCode.PROMPT_INVALID_FORMAT,
      context: { promptId: p.id },
    })
  }

  const { id, version, system, userTemplate, buildUserPrompt, ...rest } = p as AgentPrompt<unknown> & {
    userTemplate: string
  }
  const customFields = Object.keys(rest).length > 0 ? (rest as Record<string, unknown>) : undefined

  return {
    id,
    version,
    system,
    userTemplate,
    ...(customFields && { customFields }),
  }
}

function validateDeserializedPrompt(
  obj: Record<string, unknown>,
  promptId: string
): asserts obj is Record<string, unknown> & {
  id: string
  version: string
  system: string
  userTemplate: string
  buildUserPrompt: (input: unknown) => string
} {
  const requiredStrings = ['id', 'version', 'system', 'userTemplate'] as const
  for (const field of requiredStrings) {
    if (typeof obj[field] !== 'string') {
      throw new EvalError(`Invalid deserialized prompt: ${field} must be a string`, {
        code: EvalErrorCode.PROMPT_INVALID_FORMAT,
        context: { promptId, field, actual: typeof obj[field] },
      })
    }
  }

  if (typeof obj.buildUserPrompt !== 'function') {
    throw new EvalError('Invalid deserialized prompt: buildUserPrompt must be a function', {
      code: EvalErrorCode.PROMPT_INVALID_FORMAT,
      context: { promptId, actual: typeof obj.buildUserPrompt },
    })
  }
}

/** Reconstructs buildUserPrompt using compileTemplate. */
export function deserializePrompt<TInput>(serialized: SerializedPrompt): AgentPrompt<TInput> {
  const { id, version, system, userTemplate, customFields } = serialized

  let buildUserPrompt: (input: TInput) => string
  try {
    buildUserPrompt = compileTemplate<TInput>(userTemplate, id)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new EvalError(`Failed to compile userTemplate: ${message}`, {
      code: EvalErrorCode.TEMPLATE_COMPILE_ERROR,
      context: { promptId: id, userTemplate },
    })
  }

  // Spread customFields first, then core fields to prevent override attacks
  const result = {
    ...customFields,
    id,
    version,
    system,
    userTemplate,
    buildUserPrompt,
  }

  validateDeserializedPrompt(result, id)
  return result as AgentPrompt<TInput>
}

function serializeRoundResult(result: RoundResult): SerializedRoundResult {
  const { summary } = result.report

  return {
    round: result.round,
    completedAt: result.completedAt.toISOString(),
    avgScore: summary.avgScore,
    passed: summary.passed,
    failed: summary.failed,
    totalTests: summary.totalTests,
    suggestionsGenerated: result.suggestionsGenerated,
    suggestionsApproved: result.suggestionsApproved,
    promptSnapshot: result.promptSnapshot,
    promptVersionAfter: result.promptVersionAfter,
    cost: result.cost,
    scoreDelta: result.scoreDelta,
  }
}

function validateHistorySchema(data: unknown): asserts data is ImprovementHistory {
  if (typeof data !== 'object' || data === null) {
    throw new EvalError('Invalid history: not an object', {
      code: EvalErrorCode.SCHEMA_VALIDATION_ERROR,
    })
  }

  const h = data as Record<string, unknown>

  if (h.schemaVersion !== '1.1.0') {
    throw new EvalError(`Unsupported schema version: ${String(h.schemaVersion)}`, {
      code: EvalErrorCode.SCHEMA_VALIDATION_ERROR,
      context: { schemaVersion: h.schemaVersion },
    })
  }

  const requiredFields = ['sessionId', 'startedAt', 'initialPrompt', 'currentPrompt', 'rounds', 'totalCost']
  for (const field of requiredFields) {
    if (!(field in h)) {
      throw new EvalError(`Invalid history: missing field "${field}"`, {
        code: EvalErrorCode.SCHEMA_VALIDATION_ERROR,
        context: { missingField: field },
      })
    }
  }
}

class ImprovementSessionImpl implements ImprovementSession {
  private _history: ImprovementHistory
  private _isUpdating = false
  private _savePromise: Promise<void> = Promise.resolve()
  private readonly config: Required<Pick<SessionConfig, 'autoSave'>> & SessionConfig

  constructor(history: ImprovementHistory, config: SessionConfig = {}) {
    this._history = history
    this.config = {
      autoSave: config.autoSave ?? false,
      ...config,
    }
  }

  get sessionId(): string {
    return this._history.sessionId
  }

  get history(): Readonly<ImprovementHistory> {
    return this._history
  }

  get canSave(): boolean {
    return this.config.path !== undefined
  }

  addRound(roundResult: RoundResult, updatedPrompt: SerializedPrompt): void {
    if (this._isUpdating) {
      throw new EvalError('Session is being updated', {
        code: EvalErrorCode.CONCURRENT_MODIFICATION,
        context: { sessionId: this.sessionId },
      })
    }

    if (this._history.completedAt) {
      throw new EvalError('Cannot add round to completed session', {
        code: EvalErrorCode.INVALID_CONFIG,
        context: { sessionId: this.sessionId },
      })
    }

    this._isUpdating = true
    try {
      const serializedRound = serializeRoundResult(roundResult)

      this._history = {
        ...this._history,
        currentPrompt: updatedPrompt,
        rounds: [...this._history.rounds, serializedRound],
        totalCost: this._history.totalCost + roundResult.cost.total,
      }

      if (this.config.autoSave && this.canSave) {
        this.save().catch((err) => this.handleAutoSaveError(err))
      }
    } finally {
      this._isUpdating = false
    }
  }

  complete(terminationReason: string): void {
    this._history = {
      ...this._history,
      completedAt: new Date().toISOString(),
      terminationReason,
    }

    if (this.config.autoSave && this.canSave) {
      this.save().catch((err) => this.handleAutoSaveError(err))
    }
  }

  private handleAutoSaveError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error))
    if (this.config.onAutoSaveError) {
      this.config.onAutoSaveError(err)
    } else {
      console.error('Auto-save failed:', err)
    }
  }

  async save(): Promise<void> {
    if (!this.config.path) {
      throw new EvalError('Cannot save: no path configured', {
        code: EvalErrorCode.INVALID_CONFIG,
        context: { sessionId: this.sessionId },
      })
    }

    // Serialize saves to prevent race conditions from back-to-back autoSave triggers
    this._savePromise = this._savePromise.then(async () => {
      await saveHistory(this._history, this.config.path!, this.config.storage)
    })
    return this._savePromise
  }


  async flush(): Promise<void> {
    return this._savePromise
  }
}

/** @throws EvalError with PROMPT_INVALID_FORMAT if prompt lacks userTemplate */
export function createSession<TInput>(
  initialPrompt: AgentPrompt<TInput>,
  config?: SessionConfig,
): ImprovementSession {
  const serializedPrompt = serializePrompt(initialPrompt)

  const history: ImprovementHistory = {
    schemaVersion: '1.1.0',
    sessionId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    initialPrompt: serializedPrompt,
    currentPrompt: serializedPrompt,
    rounds: [],
    totalCost: 0,
  }

  return new ImprovementSessionImpl(history, config)
}

/** Resume from a history file. Clears completion status to allow adding new rounds. */
export async function resumeSession(
  path: string,
  config?: Omit<SessionConfig, 'path'>,
): Promise<ImprovementSession> {
  const history = await loadHistory(path, config?.storage)

  const reopenedHistory: ImprovementHistory = {
    ...history,
    completedAt: undefined,
    terminationReason: undefined,
  }

  return new ImprovementSessionImpl(reopenedHistory, { ...config, path })
}

/** Save history to JSON file. Creates parent directories if needed. */
export async function saveHistory(
  history: ImprovementHistory,
  path: string,
  storage: HistoryStorage = defaultHistoryStorage,
): Promise<void> {
  try {
    const dir = dirname(path)
    if (dir && dir !== '.' && dir !== '/' && !storage.exists(dir)) {
      await storage.mkdir(dir, { recursive: true })
    }
    await storage.writeFile(path, JSON.stringify(history, null, 2))
  } catch (error) {
    if (error instanceof EvalError) throw error
    throw EvalError.from(error, EvalErrorCode.FILE_WRITE_ERROR, { path })
  }
}

export async function loadHistory(
  path: string,
  storage: HistoryStorage = defaultHistoryStorage,
): Promise<ImprovementHistory> {
  try {
    if (!storage.exists(path)) {
      throw new EvalError(`History file not found: ${path}`, {
        code: EvalErrorCode.FILE_READ_ERROR,
        context: { path },
      })
    }

    const content = await storage.readFile(path)
    const history = JSON.parse(content) as unknown
    validateHistorySchema(history)

    return history
  } catch (error) {
    if (error instanceof EvalError) throw error
    throw EvalError.from(error, EvalErrorCode.FILE_READ_ERROR, { path })
  }
}
