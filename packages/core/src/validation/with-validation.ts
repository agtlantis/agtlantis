import type { ReadonlyValidationHistory, ValidationOptions } from './types';
import { ValidationHistory } from './validation-history';
import { ValidationExhaustedError } from './errors';

/**
 * Wraps an async operation with validation and retry logic.
 *
 * Executes the function and validates the result. If validation fails,
 * retries up to maxAttempts times, passing the history to the execute
 * function so it can adjust its approach based on previous failures.
 *
 * @param execute - Function to execute. Receives history for retry context.
 * @param options - Validation options including the validate function.
 * @returns The first result that passes validation.
 * @throws {ValidationExhaustedError} If all attempts fail validation.
 *
 * @example
 * ```typescript
 * const result = await withValidation(
 *   (history) => session.generateText({
 *     messages: [
 *       { role: 'user', content: prompt },
 *       ...(history.isRetry ? [{
 *         role: 'user' as const,
 *         content: `Fix: ${history.last!.reason}`,
 *       }] : []),
 *     ],
 *     schema,
 *   }),
 *   {
 *     validate: (result) => ({
 *       valid: result.confidence > 0.8,
 *       reason: `Confidence ${result.confidence} below 0.8`,
 *     }),
 *     maxAttempts: 3,
 *   }
 * );
 * ```
 */
export async function withValidation<TResult>(
  execute: (history: ReadonlyValidationHistory<NoInfer<TResult>>) => Promise<TResult>,
  options: ValidationOptions<NoInfer<TResult>>
): Promise<TResult> {
  const { validate, maxAttempts: rawMax, signal, retryDelay, onAttempt } = options;
  const maxAttempts = Math.max(1, rawMax ?? 3);
  const history = new ValidationHistory<TResult>();

  while (history.nextAttempt <= maxAttempts) {
    signal?.throwIfAborted();

    const result = await execute(history);
    const validation = await validate(result, history);
    history.add(result, validation);

    onAttempt?.(history.last!);

    if (validation.valid) {
      return result;
    }

    const hasMoreAttempts = history.nextAttempt <= maxAttempts;
    if (retryDelay && hasMoreAttempts) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  throw new ValidationExhaustedError(
    `Validation failed after ${history.all.length} attempts`,
    history
  );
}
