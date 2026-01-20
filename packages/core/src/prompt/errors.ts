/**
 * Prompt module error classes for @agtlantis/core.
 *
 * Each error type has a specific code and context for precise error handling.
 */

import { AgtlantisError, type AgtlantisErrorCode } from '../errors';

// =============================================================================
// Prompt Error Codes
// =============================================================================

export enum PromptErrorCode {
  /** Generic prompt error */
  PROMPT_ERROR = 'PROMPT_ERROR',
  /** Prompt not found in repository */
  NOT_FOUND = 'PROMPT_NOT_FOUND',
  /** Invalid prompt file format (e.g., malformed YAML) */
  INVALID_FORMAT = 'PROMPT_INVALID_FORMAT',
  /** Template compilation failed */
  TEMPLATE_ERROR = 'PROMPT_TEMPLATE_ERROR',
  /** File I/O operation failed */
  IO_ERROR = 'PROMPT_IO_ERROR',
}

// Extend AgtlantisErrorCode to include PromptErrorCode
declare module '../errors' {
  interface AgtlantisErrorCodeMap {
    prompt: PromptErrorCode;
  }
}

// =============================================================================
// Prompt Error Options
// =============================================================================

export interface PromptErrorOptions {
  code?: PromptErrorCode;
  cause?: Error;
  context?: Record<string, unknown>;
}

// =============================================================================
// Base Prompt Error
// =============================================================================

/**
 * Base error class for prompt operations.
 * Use specific error subclasses for more precise error handling.
 *
 * @example
 * ```typescript
 * throw new PromptError('Something went wrong', {
 *   code: PromptErrorCode.PROMPT_ERROR,
 *   context: { promptId: 'greeting' }
 * });
 * ```
 */
export class PromptError extends AgtlantisError<PromptErrorCode & AgtlantisErrorCode> {
  constructor(message: string, options: PromptErrorOptions = {}) {
    super(message, {
      code: (options.code ?? PromptErrorCode.PROMPT_ERROR) as PromptErrorCode & AgtlantisErrorCode,
      cause: options.cause,
      context: options.context,
    });
    this.name = 'PromptError';
  }

  /**
   * Creates a PromptError from an unknown error.
   */
  static from(
    error: unknown,
    code: PromptErrorCode = PromptErrorCode.PROMPT_ERROR,
    context?: Record<string, unknown>
  ): PromptError {
    if (error instanceof PromptError) {
      return error;
    }

    const cause = error instanceof Error ? error : new Error(String(error));
    return new PromptError(cause.message, { code, cause, context });
  }
}

// =============================================================================
// Prompt Not Found Error
// =============================================================================

/**
 * Error thrown when a prompt is not found in the repository.
 *
 * @example
 * ```typescript
 * throw new PromptNotFoundError('greeting', '1.0.0');
 * // Error: Prompt 'greeting' version '1.0.0' not found
 *
 * throw new PromptNotFoundError('greeting');
 * // Error: Prompt 'greeting' not found
 * ```
 */
export class PromptNotFoundError extends PromptError {
  readonly promptId: string;
  readonly version?: string;

  constructor(promptId: string, version?: string, options: Omit<PromptErrorOptions, 'code'> = {}) {
    const message = version
      ? `Prompt '${promptId}' version '${version}' not found`
      : `Prompt '${promptId}' not found`;

    super(message, {
      code: PromptErrorCode.NOT_FOUND,
      cause: options.cause,
      context: { promptId, version, ...options.context },
    });
    this.name = 'PromptNotFoundError';
    this.promptId = promptId;
    this.version = version;
  }
}

// =============================================================================
// Prompt Invalid Format Error
// =============================================================================

/**
 * Error thrown when a prompt file has invalid format.
 * Examples: malformed YAML, missing required fields, invalid schema.
 *
 * @example
 * ```typescript
 * throw new PromptInvalidFormatError('greeting', 'Missing required field: system');
 * // Error: Invalid format for prompt 'greeting': Missing required field: system
 * ```
 */
export class PromptInvalidFormatError extends PromptError {
  readonly promptId: string;
  readonly details: string;

  constructor(promptId: string, details: string, options: Omit<PromptErrorOptions, 'code'> = {}) {
    super(`Invalid format for prompt '${promptId}': ${details}`, {
      code: PromptErrorCode.INVALID_FORMAT,
      cause: options.cause,
      context: { promptId, details, ...options.context },
    });
    this.name = 'PromptInvalidFormatError';
    this.promptId = promptId;
    this.details = details;
  }
}

// =============================================================================
// Prompt Template Error
// =============================================================================

/**
 * Error thrown when template compilation fails.
 * Examples: invalid Handlebars syntax, missing helper.
 *
 * @example
 * ```typescript
 * throw new PromptTemplateError('greeting', 'Unexpected token {{/if}}');
 * // Error: Template compilation failed for prompt 'greeting': Unexpected token {{/if}}
 * ```
 */
export class PromptTemplateError extends PromptError {
  readonly promptId: string;
  readonly details: string;

  constructor(promptId: string, details: string, options: Omit<PromptErrorOptions, 'code'> = {}) {
    super(`Template compilation failed for prompt '${promptId}': ${details}`, {
      code: PromptErrorCode.TEMPLATE_ERROR,
      cause: options.cause,
      context: { promptId, details, ...options.context },
    });
    this.name = 'PromptTemplateError';
    this.promptId = promptId;
    this.details = details;
  }
}

// =============================================================================
// Prompt IO Error
// =============================================================================

/**
 * Error thrown when file I/O operations fail.
 * Examples: read failure, write failure, directory access denied.
 *
 * @example
 * ```typescript
 * throw new PromptIOError('read', '/path/to/prompt.yaml', {
 *   cause: originalError
 * });
 * // Error: Failed to read prompt file: /path/to/prompt.yaml
 * ```
 */
export class PromptIOError extends PromptError {
  readonly operation: 'read' | 'write' | 'list';
  readonly path: string;

  constructor(
    operation: 'read' | 'write' | 'list',
    path: string,
    options: Omit<PromptErrorOptions, 'code'> = {}
  ) {
    const opText = operation === 'list' ? 'list prompts in' : `${operation} prompt file`;
    super(`Failed to ${opText}: ${path}`, {
      code: PromptErrorCode.IO_ERROR,
      cause: options.cause,
      context: { operation, path, ...options.context },
    });
    this.name = 'PromptIOError';
    this.operation = operation;
    this.path = path;
  }
}
