import { ProviderError, ProviderErrorCode, type ProviderErrorOptions } from '../errors';

export interface RateLimitErrorContext extends Record<string, unknown> {
  /** Seconds until rate limit resets */
  retryAfter?: number;
  /** Maximum requests allowed in the time window */
  limit?: number;
  /** Remaining requests in current time window */
  remaining?: number;
}

export interface TimeoutErrorContext extends Record<string, unknown> {
  /** Timeout duration in milliseconds */
  timeout: number;
  /** Operation that timed out */
  operation?: string;
}

export interface AuthenticationErrorContext extends Record<string, unknown> {
  /** Reason for authentication failure */
  reason?: string;
  /** Provider name */
  provider?: string;
}

export interface ModelNotFoundErrorContext extends Record<string, unknown> {
  /** The model identifier that was not found */
  model: string;
  /** Provider name */
  provider?: string;
  /** Available models (if known) */
  availableModels?: string[];
}

/**
 * Error thrown when the provider's rate limit is exceeded.
 * This error is retryable - wait for `retryAfter` seconds before retrying.
 */
export class RateLimitError extends ProviderError {
  readonly retryAfter?: number;
  readonly limit?: number;
  readonly remaining?: number;

  constructor(
    retryAfter?: number,
    options: Omit<ProviderErrorOptions, 'code'> & {
      limit?: number;
      remaining?: number;
    } = {}
  ) {
    const message = retryAfter
      ? `Rate limit exceeded. Retry after ${retryAfter} seconds.`
      : 'Rate limit exceeded';

    const context: RateLimitErrorContext = {
      retryAfter,
      limit: options.limit,
      remaining: options.remaining,
      ...(options.context as Record<string, unknown>),
    };

    super(message, {
      code: ProviderErrorCode.RATE_LIMIT,
      cause: options.cause,
      context,
    });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.limit = options.limit;
    this.remaining = options.remaining;
  }

  override get isRetryable(): boolean {
    return true;
  }
}

/**
 * Error thrown when a provider operation times out.
 * This error is retryable - the operation may succeed on retry.
 */
export class TimeoutError extends ProviderError {
  readonly timeout: number;
  readonly operation?: string;

  constructor(
    timeout: number,
    operation?: string,
    options: Omit<ProviderErrorOptions, 'code'> = {}
  ) {
    const message = operation
      ? `Operation '${operation}' timed out after ${timeout}ms`
      : `Operation timed out after ${timeout}ms`;

    const context: TimeoutErrorContext = {
      timeout,
      operation,
      ...(options.context as Record<string, unknown>),
    };

    super(message, {
      code: ProviderErrorCode.TIMEOUT,
      cause: options.cause,
      context,
    });
    this.name = 'TimeoutError';
    this.timeout = timeout;
    this.operation = operation;
  }

  override get isRetryable(): boolean {
    return true;
  }
}

/**
 * Error thrown when provider authentication fails.
 * This error is NOT retryable - authentication issues require configuration changes.
 */
export class AuthenticationError extends ProviderError {
  readonly reason?: string;
  readonly provider?: string;

  constructor(
    reason?: string,
    options: Omit<ProviderErrorOptions, 'code'> & {
      provider?: string;
    } = {}
  ) {
    const message = reason
      ? `Authentication failed: ${reason}`
      : 'Authentication failed';

    const context: AuthenticationErrorContext = {
      reason,
      provider: options.provider,
      ...(options.context as Record<string, unknown>),
    };

    super(message, {
      code: ProviderErrorCode.AUTH_ERROR,
      cause: options.cause,
      context,
    });
    this.name = 'AuthenticationError';
    this.reason = reason;
    this.provider = options.provider;
  }

  override get isRetryable(): boolean {
    return false;
  }
}

/**
 * Error thrown when the requested model is not found or not available.
 * This error is NOT retryable - the model configuration needs to be changed.
 */
export class ModelNotFoundError extends ProviderError {
  readonly model: string;
  readonly provider?: string;
  readonly availableModels?: string[];

  constructor(
    model: string,
    options: Omit<ProviderErrorOptions, 'code'> & {
      provider?: string;
      availableModels?: string[];
    } = {}
  ) {
    const message = `Model '${model}' not found`;

    const context: ModelNotFoundErrorContext = {
      model,
      provider: options.provider,
      availableModels: options.availableModels,
      ...(options.context as Record<string, unknown>),
    };

    super(message, {
      code: ProviderErrorCode.INVALID_MODEL,
      cause: options.cause,
      context,
    });
    this.name = 'ModelNotFoundError';
    this.model = model;
    this.provider = options.provider;
    this.availableModels = options.availableModels;
  }

  override get isRetryable(): boolean {
    return false;
  }
}
