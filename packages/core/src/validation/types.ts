export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface ValidationAttempt<TResult> extends ValidationResult {
  result: TResult;
  attempt: number;
}

export interface ReadonlyValidationHistory<TResult> {
  /** 1-based attempt number for the next attempt. */
  readonly nextAttempt: number;

  /** Last validation attempt, or undefined if no attempts yet. */
  readonly last: ValidationAttempt<TResult> | undefined;

  /** All validation attempts as a readonly array. */
  readonly all: readonly ValidationAttempt<TResult>[];

  /** Reasons from all failed attempts. */
  readonly failureReasons: string[];

  /** True if at least one previous attempt exists. */
  readonly isRetry: boolean;
}

export interface ValidationOptions<TResult> {
  /**
   * Validation function that checks the result.
   * Can access history to compare with previous attempts.
   */
  validate: (
    result: TResult,
    history: ReadonlyValidationHistory<TResult>
  ) => ValidationResult | Promise<ValidationResult>;

  /**
   * Maximum number of attempts before throwing ValidationExhaustedError.
   * @default 3
   * @minimum 1
   */
  maxAttempts?: number;

  /**
   * AbortSignal for cancellation support.
   * When aborted, throws the abort reason before the next attempt.
   */
  signal?: AbortSignal;

  /**
   * Delay between retry attempts in milliseconds.
   * Only applied when there will be another attempt after a failure.
   */
  retryDelay?: number;

  /**
   * Callback invoked after each attempt (success or failure).
   * Useful for logging or progress tracking.
   */
  onAttempt?: (attempt: ValidationAttempt<TResult>) => void;
}
