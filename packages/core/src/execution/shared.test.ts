import { describe, it, expect, vi } from 'vitest';
import { isAbortError, normalizeError, determineResultStatus, createHookRunner } from './shared';

describe('shared utilities', () => {
  describe('isAbortError', () => {
    it('should return true for error with name AbortError', () => {
      const error = new DOMException('Aborted', 'AbortError');
      const controller = new AbortController();

      expect(isAbortError(error, controller.signal)).toBe(true);
    });

    it('should return true when signal is aborted', () => {
      const error = new Error('Some other error');
      const controller = new AbortController();
      controller.abort();

      expect(isAbortError(error, controller.signal)).toBe(true);
    });

    it('should return false for regular error with non-aborted signal', () => {
      const error = new Error('Regular error');
      const controller = new AbortController();

      expect(isAbortError(error, controller.signal)).toBe(false);
    });

    it('should return false for non-Error values with non-aborted signal', () => {
      const controller = new AbortController();

      expect(isAbortError('string error', controller.signal)).toBe(false);
      expect(isAbortError(null, controller.signal)).toBe(false);
      expect(isAbortError(undefined, controller.signal)).toBe(false);
      expect(isAbortError(42, controller.signal)).toBe(false);
    });

    it('should return true for non-Error values when signal is aborted', () => {
      const controller = new AbortController();
      controller.abort();

      expect(isAbortError('string error', controller.signal)).toBe(true);
      expect(isAbortError(null, controller.signal)).toBe(true);
    });
  });

  describe('normalizeError', () => {
    it('should return Error instance as-is', () => {
      const error = new Error('Original');
      expect(normalizeError(error)).toBe(error);
    });

    it('should preserve Error subclasses', () => {
      const error = new TypeError('Type error');
      const result = normalizeError(error);
      expect(result).toBe(error);
      expect(result).toBeInstanceOf(TypeError);
    });

    it('should convert string to Error', () => {
      const result = normalizeError('string error');
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('string error');
    });

    it('should convert number to Error', () => {
      const result = normalizeError(42);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('42');
    });

    it('should convert object to Error', () => {
      const result = normalizeError({ code: 500 });
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('[object Object]');
    });

    it('should convert null to Error', () => {
      const result = normalizeError(null);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('null');
    });

    it('should convert undefined to Error', () => {
      const result = normalizeError(undefined);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('undefined');
    });
  });

  describe('determineResultStatus', () => {
    describe('cancellation scenarios', () => {
      it('should return canceled when cancelRequested is true', () => {
        expect(determineResultStatus(true, false, false)).toBe('canceled');
      });

      it('should return canceled when aborted is true', () => {
        expect(determineResultStatus(false, true, false)).toBe('canceled');
      });

      it('should return canceled when both cancelRequested and aborted', () => {
        expect(determineResultStatus(true, true, false)).toBe('canceled');
      });

      it('should return canceled even when hasError is true (cancellation takes priority)', () => {
        expect(determineResultStatus(true, false, true)).toBe('canceled');
        expect(determineResultStatus(false, true, true)).toBe('canceled');
        expect(determineResultStatus(true, true, true)).toBe('canceled');
      });
    });

    describe('error scenarios', () => {
      it('should return failed when hasError is true and not canceled', () => {
        expect(determineResultStatus(false, false, true)).toBe('failed');
      });
    });

    describe('success scenarios', () => {
      it('should return succeeded when no errors and not canceled', () => {
        expect(determineResultStatus(false, false, false)).toBe('succeeded');
      });
    });
  });

  describe('createHookRunner', () => {
    it('should run hooks on first call', async () => {
      const runHooks = vi.fn().mockResolvedValue(undefined);
      const runner = createHookRunner(runHooks);

      await runner.ensureRun();

      expect(runHooks).toHaveBeenCalledTimes(1);
    });

    it('should not run hooks on subsequent calls', async () => {
      const runHooks = vi.fn().mockResolvedValue(undefined);
      const runner = createHookRunner(runHooks);

      await runner.ensureRun();
      await runner.ensureRun();
      await runner.ensureRun();

      expect(runHooks).toHaveBeenCalledTimes(1);
    });

    it('should report hasRun correctly before and after execution', async () => {
      const runHooks = vi.fn().mockResolvedValue(undefined);
      const runner = createHookRunner(runHooks);

      expect(runner.hasRun()).toBe(false);
      await runner.ensureRun();
      expect(runner.hasRun()).toBe(true);
    });

    it('should propagate errors from hooks', async () => {
      const error = new Error('Hook failed');
      const runHooks = vi.fn().mockRejectedValue(error);
      const runner = createHookRunner(runHooks);

      await expect(runner.ensureRun()).rejects.toThrow('Hook failed');
    });

    it('should mark as run even when hooks throw', async () => {
      const runHooks = vi.fn().mockRejectedValue(new Error('Hook failed'));
      const runner = createHookRunner(runHooks);

      try {
        await runner.ensureRun();
      } catch {
        // Expected
      }

      expect(runner.hasRun()).toBe(true);
    });

    it('should not re-run hooks after error on subsequent calls', async () => {
      const runHooks = vi.fn().mockRejectedValue(new Error('Hook failed'));
      const runner = createHookRunner(runHooks);

      try {
        await runner.ensureRun();
      } catch {
        // Expected
      }

      // Second call should be a no-op (doesn't throw, doesn't call runHooks again)
      await runner.ensureRun();
      expect(runHooks).toHaveBeenCalledTimes(1);
    });
  });
});
