import type { AgtlantisError, AgtlantisErrorCode, AgtlantisErrorOptions } from './types';

/**
 * Wraps an unknown error as a specific AgtlantisError subclass.
 * Internal utility - not part of public API.
 *
 * @param error - The unknown error to wrap
 * @param ErrorClass - The error class constructor to use
 * @param options - Error options including code and optional context
 * @returns A new instance of the specified error class
 *
 * @internal
 */
export function wrapAsError<
  T extends AgtlantisError<TCode>,
  TCode extends AgtlantisErrorCode
>(
  error: unknown,
  ErrorClass: new (message: string, options: AgtlantisErrorOptions<TCode>) => T,
  options: { code: TCode; context?: Record<string, unknown> }
): T {
  const cause = error instanceof Error ? error : new Error(String(error));
  return new ErrorClass(cause.message, { ...options, cause });
}
