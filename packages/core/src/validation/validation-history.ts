import type {
  ValidationResult,
  ValidationAttempt,
  ReadonlyValidationHistory,
} from './types';

export class ValidationHistory<TResult>
  implements ReadonlyValidationHistory<TResult>
{
  private attempts: ValidationAttempt<TResult>[] = [];

  get nextAttempt(): number {
    return this.attempts.length + 1;
  }

  get last(): ValidationAttempt<TResult> | undefined {
    return this.attempts.at(-1);
  }

  get all(): readonly ValidationAttempt<TResult>[] {
    return this.attempts;
  }

  get failureReasons(): string[] {
    return this.attempts
      .filter((a) => !a.valid && a.reason)
      .map((a) => a.reason!);
  }

  get isRetry(): boolean {
    return this.attempts.length > 0;
  }

  /** Internal use only - not exposed via ReadonlyValidationHistory. */
  add(result: TResult, validation: ValidationResult): void {
    this.attempts.push({
      result,
      ...validation,
      attempt: this.attempts.length + 1,
    });
  }
}
