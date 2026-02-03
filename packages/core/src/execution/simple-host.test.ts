import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Logger } from '@/observability/logger';
import { SimpleSession } from '../session/simple-session';
import { SessionSummary } from '../session/types';
import { SimpleExecutionHost } from './simple-host';
import { createSimpleSessionFactory } from './testing/fixtures';
import { createMockLogger } from './testing/vitest-assertions';

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

/**
 * SimpleExecutionHost-specific tests.
 * Contract tests (cancel, onDone hooks, signal propagation, user signal, cleanup)
 * are covered in testing/contract.test.ts
 */
describe('SimpleExecutionHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic execution', () => {
    it('should execute function and return result', async () => {
      const fn = vi.fn().mockResolvedValue('test-result');
      const execution = new SimpleExecutionHost(createSimpleSessionFactory(), fn);

      const result = await execution.result();

      expect(result.status).toBe('succeeded');
      if (result.status === 'succeeded') {
        expect(result.value).toBe('test-result');
      }
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass session to the function', async () => {
      const fn = vi.fn().mockImplementation((session) => {
        expect(session).toBeInstanceOf(SimpleSession);
        return Promise.resolve('result');
      });

      const execution = new SimpleExecutionHost(createSimpleSessionFactory(), fn);
      await execution.result();

      expect(fn).toHaveBeenCalled();
    });

    it('should cache result on subsequent result calls', async () => {
      const fn = vi.fn().mockResolvedValue('cached-result');
      const execution = new SimpleExecutionHost(createSimpleSessionFactory(), fn);

      const result1 = await execution.result();
      const result2 = await execution.result();
      const result3 = await execution.result();

      expect(result1.status).toBe('succeeded');
      expect(result2.status).toBe('succeeded');
      expect(result3.status).toBe('succeeded');
      if (result1.status === 'succeeded') {
        expect(result1.value).toBe('cached-result');
      }
      // Function should only be called once
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should return failed status on error', async () => {
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);
      const execution = new SimpleExecutionHost(createSimpleSessionFactory(), fn);

      const result = await execution.result();

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.error.message).toBe('Test error');
      }
    });
  });

  describe('result() summary access', () => {
    it('should return session summary after successful execution', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const execution = new SimpleExecutionHost(createSimpleSessionFactory(), fn);

      const result = await execution.result();

      expect(result.summary).toBeInstanceOf(SessionSummary);
    });

    it('should return summary even if execution failed', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Failed'));
      const execution = new SimpleExecutionHost(createSimpleSessionFactory(), fn);

      const result = await execution.result();

      expect(result.status).toBe('failed');
      expect(result.summary).toBeInstanceOf(SessionSummary);
    });

    it('should wait for execution to complete before returning result', async () => {
      let resolveExecution: (value: string) => void;
      const executionPromise = new Promise<string>((resolve) => {
        resolveExecution = resolve;
      });
      const fn = vi.fn().mockReturnValue(executionPromise);

      const execution = new SimpleExecutionHost(createSimpleSessionFactory(), fn);

      // Start getting result (should wait)
      const resultPromise = execution.result();

      // Resolve execution
      resolveExecution!('result');

      const result = await resultPromise;
      expect(result.status).toBe('succeeded');
      expect(result.summary).toBeInstanceOf(SessionSummary);
    });
  });

  describe('Logger events', () => {
    it('should call onExecutionStart and onExecutionDone on successful completion', async () => {
      const logger = createMockLogger();
      const fn = vi.fn().mockResolvedValue('test-result');
      const execution = new SimpleExecutionHost(
        createSimpleSessionFactory({ logger }),
        fn
      );

      const result = await execution.result();

      expect(result.status).toBe('succeeded');
      expect(logger.onExecutionStart).toHaveBeenCalledTimes(1);
      expect(logger.onExecutionStart).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'execution_start',
          timestamp: expect.any(Number),
        })
      );

      expect(logger.onExecutionDone).toHaveBeenCalledTimes(1);
      expect(logger.onExecutionDone).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'execution_done',
          timestamp: expect.any(Number),
          duration: expect.any(Number),
          data: 'test-result',
          summary: expect.any(SessionSummary),
        })
      );

      // Should not call error
      expect(logger.onExecutionError).not.toHaveBeenCalled();
    });

    it('should call onExecutionStart before onExecutionDone (correct order)', async () => {
      const callOrder: string[] = [];
      const logger: Logger = {
        onExecutionStart: vi.fn(() => callOrder.push('start')),
        onExecutionDone: vi.fn(() => callOrder.push('done')),
        onExecutionError: vi.fn(() => callOrder.push('error')),
      };

      const fn = vi.fn().mockResolvedValue('result');
      const execution = new SimpleExecutionHost(
        createSimpleSessionFactory({ logger }),
        fn
      );

      await execution.result();

      expect(callOrder).toEqual(['start', 'done']);
    });

    it('should call onExecutionStart and onExecutionError on failure', async () => {
      const logger = createMockLogger();
      const error = new Error('Test execution error');
      const fn = vi.fn().mockRejectedValue(error);
      const execution = new SimpleExecutionHost(
        createSimpleSessionFactory({ logger }),
        fn
      );

      const result = await execution.result();

      expect(result.status).toBe('failed');
      expect(logger.onExecutionStart).toHaveBeenCalledTimes(1);
      expect(logger.onExecutionError).toHaveBeenCalledTimes(1);
      expect(logger.onExecutionError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'execution_error',
          timestamp: expect.any(Number),
          duration: expect.any(Number),
          error,
        })
      );

      // Should not call done
      expect(logger.onExecutionDone).not.toHaveBeenCalled();
    });

    it('should NOT call onExecutionError for AbortError', async () => {
      const logger = createMockLogger();
      const fn = vi.fn().mockImplementation(async (session: SimpleSession) => {
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, 10000);
          const signal = (session as any).signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }
        });
        return 'result';
      });

      const execution = new SimpleExecutionHost(
        createSimpleSessionFactory({ logger }),
        fn
      );

      // Cancel immediately
      execution.cancel();

      const result = await execution.result();

      // Should be canceled, not failed
      expect(result.status).toBe('canceled');

      // Should call start but NOT error (AbortError is normal cancellation)
      expect(logger.onExecutionStart).toHaveBeenCalledTimes(1);
      expect(logger.onExecutionError).not.toHaveBeenCalled();
      expect(logger.onExecutionDone).not.toHaveBeenCalled();
    });

    it('should include duration in onExecutionDone event', async () => {
      vi.useFakeTimers();
      const logger = createMockLogger();
      const fn = vi.fn().mockImplementation(async () => {
        await vi.advanceTimersByTimeAsync(1000);
        return 'result';
      });

      const execution = new SimpleExecutionHost(
        createSimpleSessionFactory({ logger }),
        fn
      );

      const resultPromise = execution.result();
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(logger.onExecutionDone).toHaveBeenCalledTimes(1);
      const doneEvent = logger.onExecutionDone.mock.calls[0][0];
      expect(doneEvent.duration).toBeGreaterThanOrEqual(1000);
    });

    it('should include duration in onExecutionError event', async () => {
      const logger = createMockLogger();
      const fn = vi.fn().mockImplementation(async () => {
        // Simulate some delay using real time promise
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error('Delayed error');
      });

      const execution = new SimpleExecutionHost(
        createSimpleSessionFactory({ logger }),
        fn
      );

      const result = await execution.result();

      expect(result.status).toBe('failed');
      expect(logger.onExecutionError).toHaveBeenCalledTimes(1);
      const errorEvent = logger.onExecutionError.mock.calls[0][0];
      // Duration should be at least 0 (execution happened)
      expect(errorEvent.duration).toBeGreaterThanOrEqual(0);
    });

    it('should work without logger (no events)', async () => {
      // Session without logger
      const fn = vi.fn().mockResolvedValue('result');
      const execution = new SimpleExecutionHost(createSimpleSessionFactory(), fn);

      // Should not throw
      const result = await execution.result();
      expect(result.status).toBe('succeeded');
      if (result.status === 'succeeded') {
        expect(result.value).toBe('result');
      }
    });
  });
});
