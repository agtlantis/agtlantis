import { describe, it, expect, vi } from 'vitest';
import {
  withValidation,
  ValidationHistory,
  ValidationExhaustedError,
  ValidationErrorCode,
  type ReadonlyValidationHistory,
  type ValidationAttempt,
} from './index';
import { AgtlantisError } from '../errors';

interface TestResult {
  value: number;
  confidence: number;
}

describe('withValidation', () => {
  it('should return result on first attempt if valid', async () => {
    const result = await withValidation(
      async () => ({ value: 42, confidence: 0.9 }),
      {
        validate: (r: TestResult) => ({ valid: r.confidence > 0.8 }),
      }
    );

    expect(result).toEqual({ value: 42, confidence: 0.9 });
  });

  it('should retry and return result when validation succeeds after failures', async () => {
    let attempt = 0;
    const results: TestResult[] = [
      { value: 1, confidence: 0.5 },
      { value: 2, confidence: 0.6 },
      { value: 3, confidence: 0.9 },
    ];

    const result = await withValidation(
      async () => results[attempt++],
      {
        validate: (r: TestResult) => ({
          valid: r.confidence > 0.8,
          reason: `Confidence ${r.confidence} below 0.8`,
        }),
        maxAttempts: 3,
      }
    );

    expect(result).toEqual({ value: 3, confidence: 0.9 });
    expect(attempt).toBe(3);
  });

  it('should throw ValidationExhaustedError after maxAttempts failures', async () => {
    let attempt = 0;

    await expect(
      withValidation(
        async () => ({ value: attempt++, confidence: 0.5 }),
        {
          validate: () => ({ valid: false, reason: 'Too low' }),
          maxAttempts: 3,
        }
      )
    ).rejects.toThrow(ValidationExhaustedError);
  });

  it('should include history in ValidationExhaustedError', async () => {
    try {
      await withValidation(
        async () => ({ value: 1, confidence: 0.5 }),
        {
          validate: () => ({ valid: false, reason: 'Too low' }),
          maxAttempts: 2,
        }
      );
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationExhaustedError);
      const error = e as ValidationExhaustedError<TestResult>;
      expect(error.history.all.length).toBe(2);
      expect(error.history.failureReasons).toEqual(['Too low', 'Too low']);
    }
  });

  it('should set history.isRetry to false on first attempt, true after', async () => {
    const isRetryValues: boolean[] = [];

    await withValidation<TestResult>(
      async (history) => {
        isRetryValues.push(history.isRetry);
        return { value: isRetryValues.length, confidence: isRetryValues.length >= 2 ? 0.9 : 0.5 };
      },
      {
        validate: (r: TestResult) => ({ valid: r.confidence > 0.8 }),
        maxAttempts: 3,
      }
    );

    expect(isRetryValues).toEqual([false, true]);
  });

  it('should provide history.last with previous attempt info', async () => {
    const lastValues: Array<TestResult | undefined> = [];

    await withValidation<TestResult>(
      async (history) => {
        lastValues.push(history.last?.result);
        const attempt = lastValues.length;
        return { value: attempt, confidence: attempt >= 3 ? 0.9 : 0.5 };
      },
      {
        validate: (r: TestResult) => ({
          valid: r.confidence > 0.8,
          reason: `Attempt ${r.value} failed`,
        }),
        maxAttempts: 3,
      }
    );

    expect(lastValues[0]).toBeUndefined();
    expect(lastValues[1]).toEqual({ value: 1, confidence: 0.5 });
    expect(lastValues[2]).toEqual({ value: 2, confidence: 0.5 });
  });

  it('should collect failureReasons from failed attempts', async () => {
    let historySnapshot: ReadonlyValidationHistory<TestResult> | null = null;

    await withValidation<TestResult>(
      async (history) => {
        historySnapshot = history;
        const attempt = history.nextAttempt;
        return { value: attempt, confidence: attempt >= 3 ? 0.9 : 0.5 };
      },
      {
        validate: (r: TestResult) => ({
          valid: r.confidence > 0.8,
          reason: `Attempt ${r.value}: confidence ${r.confidence}`,
        }),
        maxAttempts: 3,
      }
    );

    expect(historySnapshot!.failureReasons).toEqual([
      'Attempt 1: confidence 0.5',
      'Attempt 2: confidence 0.5',
    ]);
  });

  it('should default maxAttempts to 3', async () => {
    let attempts = 0;

    try {
      await withValidation(
        async () => {
          attempts++;
          return { value: 1, confidence: 0.5 };
        },
        {
          validate: () => ({ valid: false }),
        }
      );
    } catch {
      // Expected to throw
    }

    expect(attempts).toBe(3);
  });

  it('should enforce minimum maxAttempts of 1', async () => {
    let attempts = 0;

    try {
      await withValidation(
        async () => {
          attempts++;
          return { value: 1, confidence: 0.5 };
        },
        {
          validate: () => ({ valid: false }),
          maxAttempts: 0,
        }
      );
    } catch {
      // Expected to throw
    }

    expect(attempts).toBe(1);
  });

  it('should support async validate function', async () => {
    const result = await withValidation(
      async () => ({ value: 42, confidence: 0.9 }),
      {
        validate: async (r) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { valid: r.confidence > 0.8 };
        },
      }
    );

    expect(result).toEqual({ value: 42, confidence: 0.9 });
  });

  it('should pass history to validate for comparison with previous attempts', async () => {
    const validateSpy = vi.fn();

    await withValidation<TestResult>(
      async (history) => {
        const attempt = history.nextAttempt;
        return { value: attempt, confidence: attempt >= 2 ? 0.9 : 0.5 };
      },
      {
        validate: (result: TestResult, history) => {
          validateSpy(result, history.last?.result);
          return { valid: result.confidence > 0.8 };
        },
        maxAttempts: 3,
      }
    );

    expect(validateSpy).toHaveBeenCalledTimes(2);
    expect(validateSpy).toHaveBeenNthCalledWith(1, { value: 1, confidence: 0.5 }, undefined);
    expect(validateSpy).toHaveBeenNthCalledWith(2, { value: 2, confidence: 0.9 }, { value: 1, confidence: 0.5 });
  });

  it('should throw when signal is aborted before first attempt', async () => {
    const controller = new AbortController();
    controller.abort('User cancelled');

    await expect(
      withValidation(
        async () => ({ value: 1, confidence: 0.9 }),
        {
          validate: () => ({ valid: true }),
          signal: controller.signal,
        }
      )
    ).rejects.toThrow();
  });

  it('should throw when signal is aborted between attempts', async () => {
    const controller = new AbortController();
    let attempts = 0;

    await expect(
      withValidation(
        async () => {
          attempts++;
          if (attempts === 2) {
            controller.abort('Cancelled after first attempt');
          }
          return { value: attempts, confidence: 0.5 };
        },
        {
          validate: () => ({ valid: false }),
          maxAttempts: 3,
          signal: controller.signal,
        }
      )
    ).rejects.toThrow();

    expect(attempts).toBe(2);
  });

  it('should apply retryDelay between attempts', async () => {
    const startTime = Date.now();
    let attempts = 0;

    await withValidation(
      async () => {
        attempts++;
        return { value: attempts, confidence: attempts >= 2 ? 0.9 : 0.5 };
      },
      {
        validate: (r: TestResult) => ({ valid: r.confidence > 0.8 }),
        maxAttempts: 3,
        retryDelay: 50,
      }
    );

    const elapsed = Date.now() - startTime;
    expect(attempts).toBe(2);
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('should not apply retryDelay after successful validation', async () => {
    const startTime = Date.now();

    await withValidation(
      async () => ({ value: 1, confidence: 0.9 }),
      {
        validate: () => ({ valid: true }),
        retryDelay: 100,
      }
    );

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(50);
  });

  it('should call onAttempt after each attempt', async () => {
    const attemptLog: ValidationAttempt<TestResult>[] = [];

    await withValidation<TestResult>(
      async (history) => {
        const attempt = history.nextAttempt;
        return { value: attempt, confidence: attempt >= 2 ? 0.9 : 0.5 };
      },
      {
        validate: (r: TestResult) => ({
          valid: r.confidence > 0.8,
          reason: r.confidence <= 0.8 ? 'Too low' : undefined,
        }),
        maxAttempts: 3,
        onAttempt: (attempt: ValidationAttempt<TestResult>) => attemptLog.push(attempt),
      }
    );

    expect(attemptLog).toHaveLength(2);
    expect(attemptLog[0]).toEqual({
      result: { value: 1, confidence: 0.5 },
      valid: false,
      reason: 'Too low',
      attempt: 1,
    });
    expect(attemptLog[1]).toEqual({
      result: { value: 2, confidence: 0.9 },
      valid: true,
      attempt: 2,
    });
  });

  it('should call onAttempt even when validation exhausted', async () => {
    const attemptLog: ValidationAttempt<TestResult>[] = [];

    try {
      await withValidation(
        async () => ({ value: 1, confidence: 0.5 }),
        {
          validate: () => ({ valid: false, reason: 'Always fails' }),
          maxAttempts: 2,
          onAttempt: (attempt) => attemptLog.push(attempt),
        }
      );
    } catch {
      // Expected
    }

    expect(attemptLog).toHaveLength(2);
  });
});

describe('ValidationHistory', () => {
  it('should start with nextAttempt = 1', () => {
    const history = new ValidationHistory<TestResult>();
    expect(history.nextAttempt).toBe(1);
  });

  it('should increment nextAttempt after each add', () => {
    const history = new ValidationHistory<TestResult>();

    history.add({ value: 1, confidence: 0.5 }, { valid: false, reason: 'Low' });
    expect(history.nextAttempt).toBe(2);

    history.add({ value: 2, confidence: 0.9 }, { valid: true });
    expect(history.nextAttempt).toBe(3);
  });

  it('should return last attempt', () => {
    const history = new ValidationHistory<TestResult>();

    expect(history.last).toBeUndefined();

    history.add({ value: 1, confidence: 0.5 }, { valid: false, reason: 'Low' });
    expect(history.last).toEqual({
      result: { value: 1, confidence: 0.5 },
      valid: false,
      reason: 'Low',
      attempt: 1,
    });

    history.add({ value: 2, confidence: 0.9 }, { valid: true });
    expect(history.last).toEqual({
      result: { value: 2, confidence: 0.9 },
      valid: true,
      attempt: 2,
    });
  });

  it('should return all attempts as readonly array', () => {
    const history = new ValidationHistory<TestResult>();

    history.add({ value: 1, confidence: 0.5 }, { valid: false, reason: 'Low' });
    history.add({ value: 2, confidence: 0.9 }, { valid: true });

    expect(history.all).toHaveLength(2);
    expect(history.all[0].attempt).toBe(1);
    expect(history.all[1].attempt).toBe(2);
  });

  it('should collect only failure reasons', () => {
    const history = new ValidationHistory<TestResult>();

    history.add({ value: 1, confidence: 0.5 }, { valid: false, reason: 'Too low' });
    history.add({ value: 2, confidence: 0.6 }, { valid: false });
    history.add({ value: 3, confidence: 0.9 }, { valid: true, reason: 'Passed' });

    expect(history.failureReasons).toEqual(['Too low']);
  });

  it('should set isRetry correctly', () => {
    const history = new ValidationHistory<TestResult>();

    expect(history.isRetry).toBe(false);

    history.add({ value: 1, confidence: 0.5 }, { valid: false });
    expect(history.isRetry).toBe(true);
  });
});

describe('ValidationExhaustedError', () => {
  it('should have correct name', () => {
    const history = new ValidationHistory<TestResult>();
    const error = new ValidationExhaustedError('Test error', history);

    expect(error.name).toBe('ValidationExhaustedError');
  });

  it('should contain history', () => {
    const history = new ValidationHistory<TestResult>();
    history.add({ value: 1, confidence: 0.5 }, { valid: false, reason: 'Low' });

    const error = new ValidationExhaustedError('Validation failed', history);

    expect(error.history).toBe(history);
    expect(error.history.all).toHaveLength(1);
    expect(error.history.failureReasons).toEqual(['Low']);
  });

  it('should be instanceof Error and AgtlantisError', () => {
    const history = new ValidationHistory<TestResult>();
    const error = new ValidationExhaustedError('Test', history);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AgtlantisError);
    expect(error).toBeInstanceOf(ValidationExhaustedError);
  });

  it('should have error code VALIDATION_EXHAUSTED', () => {
    const history = new ValidationHistory<TestResult>();
    const error = new ValidationExhaustedError('Test', history);

    expect(error.code).toBe(ValidationErrorCode.VALIDATION_EXHAUSTED);
    expect(error.code).toBe('VALIDATION_EXHAUSTED');
  });

  it('should include context with attempts and failureReasons', () => {
    const history = new ValidationHistory<TestResult>();
    history.add({ value: 1, confidence: 0.5 }, { valid: false, reason: 'Too low' });
    history.add({ value: 2, confidence: 0.6 }, { valid: false, reason: 'Still low' });

    const error = new ValidationExhaustedError('Validation failed', history);

    expect(error.context).toEqual({
      attempts: 2,
      failureReasons: ['Too low', 'Still low'],
    });
  });
});
