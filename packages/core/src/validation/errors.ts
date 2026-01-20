import { AgtlantisError, type AgtlantisErrorCode } from '../errors';
import type { ReadonlyValidationHistory } from './types';

export enum ValidationErrorCode {
  VALIDATION_EXHAUSTED = 'VALIDATION_EXHAUSTED',
}

/**
 * Error thrown when validation fails after all attempts are exhausted.
 * Contains the full validation history for debugging and partial result recovery.
 *
 * @example
 * ```typescript
 * try {
 *   const result = await withValidation(execute, options);
 * } catch (e) {
 *   if (e instanceof ValidationExhaustedError) {
 *     console.log(`Failed after ${e.history.all.length} attempts`);
 *     console.log('Last result:', e.history.last?.result);
 *     console.log('All failures:', e.history.failureReasons);
 *     console.log('Error code:', e.code); // 'VALIDATION_EXHAUSTED'
 *   }
 * }
 * ```
 */
export class ValidationExhaustedError<TResult> extends AgtlantisError<
  ValidationErrorCode & AgtlantisErrorCode
> {
  constructor(
    message: string,
    public readonly history: ReadonlyValidationHistory<TResult>
  ) {
    super(message, {
      code: ValidationErrorCode.VALIDATION_EXHAUSTED as ValidationErrorCode & AgtlantisErrorCode,
      context: {
        attempts: history.all.length,
        failureReasons: history.failureReasons,
      },
    });
    this.name = 'ValidationExhaustedError';
  }
}
