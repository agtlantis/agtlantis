/**
 * Error codes for agent-eval operations
 */
export enum EvalErrorCode {
  // LLM errors
  LLM_API_ERROR = 'LLM_API_ERROR',
  LLM_RATE_LIMIT = 'LLM_RATE_LIMIT',
  LLM_TIMEOUT = 'LLM_TIMEOUT',

  // Parsing errors
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
  VERDICT_PARSE_ERROR = 'VERDICT_PARSE_ERROR',
  TEMPLATE_COMPILE_ERROR = 'TEMPLATE_COMPILE_ERROR',

  // Agent errors
  AGENT_EXECUTION_ERROR = 'AGENT_EXECUTION_ERROR',

  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_API_KEY = 'MISSING_API_KEY',

  // Prompt Repository errors
  PROMPT_NOT_FOUND = 'PROMPT_NOT_FOUND',
  PROMPT_INVALID_FORMAT = 'PROMPT_INVALID_FORMAT',
  PROMPT_WRITE_ERROR = 'PROMPT_WRITE_ERROR',
  PROMPT_READ_ERROR = 'PROMPT_READ_ERROR',

  // Suggestion apply errors
  SUGGESTION_APPLY_ERROR = 'SUGGESTION_APPLY_ERROR',

  // Schema validation errors
  SCHEMA_VALIDATION_ERROR = 'SCHEMA_VALIDATION_ERROR',
  SCHEMA_GENERATION_ERROR = 'SCHEMA_GENERATION_ERROR',

  // File context errors (Phase 5.3)
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',

  // Concurrency errors
  CONCURRENT_MODIFICATION = 'CONCURRENT_MODIFICATION',

  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface EvalErrorOptions {
  code: EvalErrorCode
  cause?: Error
  context?: Record<string, unknown>
}

/**
 * Custom error class for agent-eval operations.
 * Provides structured error information including error code and optional context.
 */
export class EvalError extends Error {
  readonly code: EvalErrorCode
  readonly cause?: Error
  readonly context?: Record<string, unknown>

  constructor(message: string, options: EvalErrorOptions) {
    super(message)
    this.name = 'EvalError'
    this.code = options.code
    this.cause = options.cause
    this.context = options.context

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EvalError)
    }
  }

  /**
   * Creates an EvalError from an unknown error with a specific code.
   */
  static from(error: unknown, code: EvalErrorCode, context?: Record<string, unknown>): EvalError {
    if (error instanceof EvalError) {
      return error
    }

    const cause = error instanceof Error ? error : new Error(String(error))
    return new EvalError(cause.message, { code, cause, context })
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      cause: this.cause?.message,
    }
  }
}
