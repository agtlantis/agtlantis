import { wrapAsError } from './utils';

export enum ExecutionErrorCode {
  EXECUTION_ERROR = 'EXECUTION_ERROR',
  STREAM_ERROR = 'STREAM_ERROR',
  RESULT_EXTRACTION_ERROR = 'RESULT_EXTRACTION_ERROR',
  CANCELLED = 'CANCELLED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

export enum ConfigurationErrorCode {
  CONFIG_ERROR = 'CONFIG_ERROR',
  MISSING_API_KEY = 'MISSING_API_KEY',
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_REQUIRED = 'MISSING_REQUIRED',
}

export enum FileErrorCode {
  FILE_ERROR = 'FILE_ERROR',
  UPLOAD_ERROR = 'UPLOAD_ERROR',
  DELETE_ERROR = 'DELETE_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  TOO_LARGE = 'TOO_LARGE',
  UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE',
}

export type AgtlantisErrorCode = ExecutionErrorCode | ConfigurationErrorCode | FileErrorCode;

export interface AgtlantisErrorOptions<TCode extends AgtlantisErrorCode = AgtlantisErrorCode> {
  code: TCode;
  cause?: Error;
  context?: Record<string, unknown>;
}

export interface ErrorOptions<TCode extends AgtlantisErrorCode> {
  code?: TCode;
  cause?: Error;
  context?: Record<string, unknown>;
}

export type ExecutionErrorOptions = ErrorOptions<ExecutionErrorCode>;
export type ConfigurationErrorOptions = ErrorOptions<ConfigurationErrorCode>;
export type FileErrorOptions = ErrorOptions<FileErrorCode>;

/**
 * Base error class for all Agtlantis errors.
 * Provides structured error information including error code and optional context.
 */
export class AgtlantisError<TCode extends AgtlantisErrorCode = AgtlantisErrorCode> extends Error {
  readonly code: TCode;
  override readonly cause?: Error;
  readonly context?: Record<string, unknown>;

  constructor(message: string, options: AgtlantisErrorOptions<TCode>) {
    super(message);
    this.name = 'AgtlantisError';
    this.code = options.code;
    this.cause = options.cause;
    this.context = options.context;

    // V8-specific stack trace capture
    const ErrorWithCapture = Error as typeof Error & {
      captureStackTrace?: (targetObject: object, constructorOpt?: Function) => void;
    };
    ErrorWithCapture.captureStackTrace?.(this, this.constructor);
  }

  get isRetryable(): boolean {
    return false;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      isRetryable: this.isRetryable,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

/**
 * Error thrown during agent execution (streaming failures, result extraction, cancellation).
 */
export class ExecutionError extends AgtlantisError<ExecutionErrorCode> {
  constructor(message: string, options: ExecutionErrorOptions = {}) {
    super(message, {
      code: options.code ?? ExecutionErrorCode.EXECUTION_ERROR,
      cause: options.cause,
      context: options.context,
    });
    this.name = 'ExecutionError';
  }

  static from(
    error: unknown,
    code: ExecutionErrorCode = ExecutionErrorCode.EXECUTION_ERROR,
    context?: Record<string, unknown>
  ): ExecutionError {
    if (error instanceof ExecutionError) {
      return error;
    }
    return wrapAsError(error, ExecutionError, { code, context });
  }
}

/**
 * Error thrown when configuration is invalid or missing (API keys, model names).
 */
export class ConfigurationError extends AgtlantisError<ConfigurationErrorCode> {
  constructor(message: string, options: ConfigurationErrorOptions = {}) {
    super(message, {
      code: options.code ?? ConfigurationErrorCode.CONFIG_ERROR,
      cause: options.cause,
      context: options.context,
    });
    this.name = 'ConfigurationError';
  }

  static from(
    error: unknown,
    code: ConfigurationErrorCode = ConfigurationErrorCode.CONFIG_ERROR,
    context?: Record<string, unknown>
  ): ConfigurationError {
    if (error instanceof ConfigurationError) {
      return error;
    }
    return wrapAsError(error, ConfigurationError, { code, context });
  }
}

/**
 * Error thrown during file operations (upload, delete, not found, size limits).
 */
export class FileError extends AgtlantisError<FileErrorCode> {
  constructor(message: string, options: FileErrorOptions = {}) {
    super(message, {
      code: options.code ?? FileErrorCode.FILE_ERROR,
      cause: options.cause,
      context: options.context,
    });
    this.name = 'FileError';
  }

  static from(
    error: unknown,
    code: FileErrorCode = FileErrorCode.FILE_ERROR,
    context?: Record<string, unknown>
  ): FileError {
    if (error instanceof FileError) {
      return error;
    }
    return wrapAsError(error, FileError, { code, context });
  }
}
