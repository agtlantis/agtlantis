import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LanguageModel } from 'ai';
import type { FileManager } from '@/provider/types';
import type { Logger } from '@/observability/logger';
import { SimpleSession } from '../session/simple-session';
import { SessionSummary } from '../session/types';
import { SimpleExecutionHost } from './simple-host';

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

const TEST_PROVIDER_TYPE = 'google' as const;

function createMockModel(): LanguageModel {
  return {
    specificationVersion: 'v1',
    provider: 'test-provider',
    modelId: 'test-model',
    defaultObjectGenerationMode: 'json',
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  } as unknown as LanguageModel;
}

function createMockFileManager(): FileManager {
  return {
    upload: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    getUploadedFiles: vi.fn().mockReturnValue([]),
  };
}

type MockLogger = Logger & {
  onLLMCallStart: ReturnType<typeof vi.fn>;
  onLLMCallEnd: ReturnType<typeof vi.fn>;
  onExecutionStart: ReturnType<typeof vi.fn>;
  onExecutionEmit: ReturnType<typeof vi.fn>;
  onExecutionDone: ReturnType<typeof vi.fn>;
  onExecutionError: ReturnType<typeof vi.fn>;
};

function createMockLogger(): MockLogger {
  return {
    onLLMCallStart: vi.fn(),
    onLLMCallEnd: vi.fn(),
    onExecutionStart: vi.fn(),
    onExecutionEmit: vi.fn(),
    onExecutionDone: vi.fn(),
    onExecutionError: vi.fn(),
  } as MockLogger;
}

function createSessionFactory(
  signal?: AbortSignal,
  logger?: Logger
): (signal?: AbortSignal) => SimpleSession {
  return (providedSignal?: AbortSignal) =>
    new SimpleSession({
      defaultLanguageModel: createMockModel(),
      providerType: TEST_PROVIDER_TYPE,
      fileManager: createMockFileManager(),
      signal: providedSignal ?? signal,
      logger,
    });
}

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
      const execution = new SimpleExecutionHost(createSessionFactory(), fn);

      const result = await execution.toResult();

      expect(result).toBe('test-result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass session to the function', async () => {
      const fn = vi.fn().mockImplementation((session) => {
        expect(session).toBeInstanceOf(SimpleSession);
        return Promise.resolve('result');
      });

      const execution = new SimpleExecutionHost(createSessionFactory(), fn);
      await execution.toResult();

      expect(fn).toHaveBeenCalled();
    });

    it('should cache result on subsequent toResult calls', async () => {
      const fn = vi.fn().mockResolvedValue('cached-result');
      const execution = new SimpleExecutionHost(createSessionFactory(), fn);

      const result1 = await execution.toResult();
      const result2 = await execution.toResult();
      const result3 = await execution.toResult();

      expect(result1).toBe('cached-result');
      expect(result2).toBe('cached-result');
      expect(result3).toBe('cached-result');
      // Function should only be called once
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from the function', async () => {
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);
      const execution = new SimpleExecutionHost(createSessionFactory(), fn);

      await expect(execution.toResult()).rejects.toThrow('Test error');
    });
  });

  describe('getSummary', () => {
    it('should return session summary after successful execution', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const execution = new SimpleExecutionHost(createSessionFactory(), fn);

      await execution.toResult();
      const summary = await execution.getSummary();

      expect(summary).toBeInstanceOf(SessionSummary);
    });

    it('should return summary even if execution failed', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Failed'));
      const execution = new SimpleExecutionHost(createSessionFactory(), fn);

      // toResult will throw, but getSummary should still work
      await expect(execution.toResult()).rejects.toThrow('Failed');

      const summary = await execution.getSummary();
      expect(summary).toBeInstanceOf(SessionSummary);
    });

    it('should wait for execution to complete before returning summary', async () => {
      let resolveExecution: (value: string) => void;
      const executionPromise = new Promise<string>((resolve) => {
        resolveExecution = resolve;
      });
      const fn = vi.fn().mockReturnValue(executionPromise);

      const execution = new SimpleExecutionHost(createSessionFactory(), fn);

      // Start getting summary (should wait)
      const summaryPromise = execution.getSummary();

      // Resolve execution
      resolveExecution!('result');

      const summary = await summaryPromise;
      expect(summary).toBeInstanceOf(SessionSummary);
    });
  });

  describe('cancel', () => {
    it('should abort execution when cancel is called', async () => {
      let receivedSignal: AbortSignal | undefined;

      const fn = vi.fn().mockImplementation(async (session: SimpleSession) => {
        // Access the signal through the session options (via internal state)
        // We'll simulate a long operation that checks the signal
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, 10000);

          // Get signal from session factory closure
          receivedSignal = (session as any).signal;
          if (receivedSignal) {
            receivedSignal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }
        });
        return 'result';
      });

      const execution = new SimpleExecutionHost(createSessionFactory(), fn);

      // Cancel immediately
      execution.cancel();

      await expect(execution.toResult()).rejects.toThrow();
    });

    it('should be no-op after execution completes', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const execution = new SimpleExecutionHost(createSessionFactory(), fn);

      const result = await execution.toResult();
      expect(result).toBe('result');

      // Cancel after completion should not throw or affect result
      execution.cancel();

      // Should still be able to get the cached result
      const resultAgain = await execution.toResult();
      expect(resultAgain).toBe('result');
    });
  });

  describe('user signal', () => {
    it('should respect user-provided AbortSignal', async () => {
      const userController = new AbortController();

      const fn = vi.fn().mockImplementation(async (session: SimpleSession) => {
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, 10000);

          const signal = (session as any).signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(new DOMException('Aborted by user', 'AbortError'));
            });
          }
        });
        return 'result';
      });

      const execution = new SimpleExecutionHost(
        createSessionFactory(),
        fn,
        userController.signal
      );

      // Abort via user signal
      userController.abort();

      await expect(execution.toResult()).rejects.toThrow();
    });

    it('should work with already aborted signal', async () => {
      const userController = new AbortController();
      userController.abort(); // Abort before creating execution

      const fn = vi.fn().mockImplementation(async (session: SimpleSession) => {
        const signal = (session as any).signal;
        if (signal?.aborted) {
          throw new DOMException('Already aborted', 'AbortError');
        }
        return 'result';
      });

      const execution = new SimpleExecutionHost(
        createSessionFactory(),
        fn,
        userController.signal
      );

      await expect(execution.toResult()).rejects.toThrow();
    });

    it('should allow both cancel() and user signal to trigger abort', async () => {
      const userController = new AbortController();
      let abortCount = 0;

      const fn = vi.fn().mockImplementation(async (session: SimpleSession) => {
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, 10000);

          const signal = (session as any).signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              abortCount++;
              clearTimeout(timeoutId);
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }
        });
        return 'result';
      });

      const execution = new SimpleExecutionHost(
        createSessionFactory(),
        fn,
        userController.signal
      );

      // Both should work, but only one will actually trigger
      execution.cancel();

      await expect(execution.toResult()).rejects.toThrow();
      expect(abortCount).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should be a no-op (hooks already run)', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const execution = new SimpleExecutionHost(createSessionFactory(), fn);

      await execution.toResult();

      // Should not throw
      await execution.cleanup();
      await execution.cleanup(); // Multiple calls should be safe
    });
  });

  describe('async disposal', () => {
    it('should support Symbol.asyncDispose', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const execution = new SimpleExecutionHost(createSessionFactory(), fn);

      await execution.toResult();

      // Should not throw
      await execution[Symbol.asyncDispose]();
    });
  });

  describe('onDone hooks', () => {
    it('should run onDone hooks after successful execution', async () => {
      const onDoneHook = vi.fn();

      const fn = vi.fn().mockImplementation(async (session: SimpleSession) => {
        session.onDone(onDoneHook);
        return 'result';
      });

      const execution = new SimpleExecutionHost(createSessionFactory(), fn);
      await execution.toResult();

      expect(onDoneHook).toHaveBeenCalled();
    });

    it('should run onDone hooks even after execution fails', async () => {
      const onDoneHook = vi.fn();

      const fn = vi.fn().mockImplementation(async (session: SimpleSession) => {
        session.onDone(onDoneHook);
        throw new Error('Execution failed');
      });

      const execution = new SimpleExecutionHost(createSessionFactory(), fn);

      await expect(execution.toResult()).rejects.toThrow('Execution failed');
      expect(onDoneHook).toHaveBeenCalled();
    });

    it('should run onDone hooks only once', async () => {
      const onDoneHook = vi.fn();

      const fn = vi.fn().mockImplementation(async (session: SimpleSession) => {
        session.onDone(onDoneHook);
        return 'result';
      });

      const execution = new SimpleExecutionHost(createSessionFactory(), fn);
      await execution.toResult();
      await execution.cleanup();
      await execution[Symbol.asyncDispose]();

      // Hook should only have been called once during execute()
      expect(onDoneHook).toHaveBeenCalledTimes(1);
    });
  });

  describe('signal propagation to session', () => {
    it('should pass effective signal to session factory', async () => {
      const factorySpy = vi.fn().mockImplementation((signal?: AbortSignal) => {
        return new SimpleSession({
          defaultLanguageModel: createMockModel(),
          providerType: TEST_PROVIDER_TYPE,
          fileManager: createMockFileManager(),
          signal,
        });
      });

      const fn = vi.fn().mockResolvedValue('result');
      const userController = new AbortController();

      const execution = new SimpleExecutionHost(
        factorySpy,
        fn,
        userController.signal
      );

      await execution.toResult();

      // Factory should have been called with a signal
      expect(factorySpy).toHaveBeenCalledWith(expect.any(Object));
      const passedSignal = factorySpy.mock.calls[0][0];
      expect(passedSignal).toBeDefined();
      expect(passedSignal).toHaveProperty('aborted');
    });

    it('should pass internal signal when no user signal provided', async () => {
      const factorySpy = vi.fn().mockImplementation((signal?: AbortSignal) => {
        return new SimpleSession({
          defaultLanguageModel: createMockModel(),
          providerType: TEST_PROVIDER_TYPE,
          fileManager: createMockFileManager(),
          signal,
        });
      });

      const fn = vi.fn().mockResolvedValue('result');

      const execution = new SimpleExecutionHost(factorySpy, fn);

      await execution.toResult();

      expect(factorySpy).toHaveBeenCalledWith(expect.any(Object));
      const passedSignal = factorySpy.mock.calls[0][0];
      expect(passedSignal).toBeDefined();
    });
  });

  describe('Logger events', () => {
    it('should call onExecutionStart and onExecutionDone on successful completion', async () => {
      const logger = createMockLogger();
      const fn = vi.fn().mockResolvedValue('test-result');
      const execution = new SimpleExecutionHost(
        createSessionFactory(undefined, logger),
        fn
      );

      await execution.toResult();

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
        createSessionFactory(undefined, logger),
        fn
      );

      await execution.toResult();

      expect(callOrder).toEqual(['start', 'done']);
    });

    it('should call onExecutionStart and onExecutionError on failure', async () => {
      const logger = createMockLogger();
      const error = new Error('Test execution error');
      const fn = vi.fn().mockRejectedValue(error);
      const execution = new SimpleExecutionHost(
        createSessionFactory(undefined, logger),
        fn
      );

      await expect(execution.toResult()).rejects.toThrow('Test execution error');

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
        createSessionFactory(undefined, logger),
        fn
      );

      // Cancel immediately
      execution.cancel();

      await expect(execution.toResult()).rejects.toThrow();

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
        createSessionFactory(undefined, logger),
        fn
      );

      const resultPromise = execution.toResult();
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
        createSessionFactory(undefined, logger),
        fn
      );

      await expect(execution.toResult()).rejects.toThrow('Delayed error');

      expect(logger.onExecutionError).toHaveBeenCalledTimes(1);
      const errorEvent = logger.onExecutionError.mock.calls[0][0];
      // Duration should be at least 0 (execution happened)
      expect(errorEvent.duration).toBeGreaterThanOrEqual(0);
    });

    it('should work without logger (no events)', async () => {
      // Session without logger
      const fn = vi.fn().mockResolvedValue('result');
      const execution = new SimpleExecutionHost(createSessionFactory(), fn);

      // Should not throw
      const result = await execution.toResult();
      expect(result).toBe('result');
    });
  });
});
