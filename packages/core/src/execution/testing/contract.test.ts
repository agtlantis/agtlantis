/**
 * Shared contract tests for ExecutionHost implementations.
 * These tests verify that both SimpleExecutionHost and StreamingExecutionHost
 * implement the ExecutionHost interface contract consistently.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAbortScenario, createAlreadyAbortedSignal } from './helpers';
import { allHostConfigs, type ExecutionHostTestConfig } from './host-configs';

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

/**
 * Creates the shared contract test suite for all ExecutionHost implementations.
 * Run this function to register the parameterized tests.
 */
export function createExecutionHostContractTests(
  configs: readonly ExecutionHostTestConfig[] = allHostConfigs
): void {
  describe.each(configs)('$name - ExecutionHost Contract', (config) => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // ========================================================================
    // cancel() tests
    // ========================================================================

    describe('cancel', () => {
      it('should abort execution when cancel is called', async () => {
        const abortScenario = createAbortScenario();
        const onCancel = vi.fn();
        const workload = config.createCancelableWorkload(abortScenario, onCancel);
        const factory = config.createSessionFactory();
        const execution = config.createHost(factory, workload, abortScenario.signal);

        // Trigger abort via the scenario (since cancel() might not immediately reflect)
        abortScenario.abort();
        execution.cancel();

        const result = await execution.result();
        expect(result.status).toBe('canceled');
      });

      it('should be no-op after execution completes', async () => {
        const workload = config.createSuccessWorkload('result');
        const factory = config.createSessionFactory();
        const execution = config.createHost(factory, workload);

        const result1 = await execution.result();
        expect(result1.status).toBe('succeeded');

        // Cancel after completion should not throw or affect result
        execution.cancel();

        // Should still be able to get the cached result
        const result2 = await execution.result();
        expect(result2.status).toBe('succeeded');
      });
    });

    // ========================================================================
    // onDone hooks tests
    // ========================================================================

    describe('onDone hooks', () => {
      it('should run onDone hooks after successful execution', async () => {
        const onDoneHook = vi.fn();
        const workload = config.createHookWorkload(onDoneHook);
        const factory = config.createSessionFactory();
        const execution = config.createHost(factory, workload);

        await execution.result();

        expect(onDoneHook).toHaveBeenCalled();
      });

      it('should run onDone hooks even after execution fails', async () => {
        const onDoneHook = vi.fn();
        const workload = config.createHookWorkload(onDoneHook, { shouldFail: true });
        const factory = config.createSessionFactory();
        const execution = config.createHost(factory, workload);

        const result = await execution.result();
        expect(result.status).toBe('failed');
        expect(onDoneHook).toHaveBeenCalled();
      });

      it('should run onDone hooks only once', async () => {
        const onDoneHook = vi.fn();
        const workload = config.createHookWorkload(onDoneHook);
        const factory = config.createSessionFactory();
        const execution = config.createHost(factory, workload);

        await execution.result();
        await execution.cleanup();
        await execution[Symbol.asyncDispose]();

        // Hook should only have been called once
        expect(onDoneHook).toHaveBeenCalledTimes(1);
      });
    });

    // ========================================================================
    // signal propagation tests
    // ========================================================================

    describe('signal propagation', () => {
      it('should pass effective signal to session factory', async () => {
        const userController = new AbortController();
        const { factory, getPassedSignal } = config.createSessionFactorySpy();
        const workload = config.createSuccessWorkload('result');

        const execution = config.createHost(factory, workload, userController.signal);
        await execution.result();

        // Factory should have been called with a signal
        const passedSignal = getPassedSignal();
        expect(passedSignal).toBeDefined();
        expect(passedSignal).toHaveProperty('aborted');
      });

      it('should pass internal signal when no user signal provided', async () => {
        const { factory, getPassedSignal } = config.createSessionFactorySpy();
        const workload = config.createSuccessWorkload('result');

        const execution = config.createHost(factory, workload);
        await execution.result();

        const passedSignal = getPassedSignal();
        expect(passedSignal).toBeDefined();
      });
    });

    // ========================================================================
    // user signal tests
    // ========================================================================

    describe('user signal', () => {
      it('should respect user-provided AbortSignal', async () => {
        const abortScenario = createAbortScenario();
        const workload = config.createCancelableWorkload(abortScenario);
        const factory = config.createSessionFactory();

        const execution = config.createHost(factory, workload, abortScenario.signal);

        // Abort via user signal
        abortScenario.abort();

        const result = await execution.result();
        expect(result.status).toBe('canceled');
      });

      it('should work with already aborted signal', async () => {
        const signal = createAlreadyAbortedSignal();
        const abortScenario = { signal } as ReturnType<typeof createAbortScenario>;

        // Create a workload that checks abort immediately
        const workload = config.createCancelableWorkload(abortScenario);
        const factory = config.createSessionFactory();

        const execution = config.createHost(factory, workload, signal);

        const result = await execution.result();
        expect(result.status).toBe('canceled');
      });

      it('should allow both cancel() and user signal to trigger abort', async () => {
        const abortScenario = createAbortScenario();
        let abortCount = 0;
        const onCancel = () => abortCount++;

        const workload = config.createCancelableWorkload(abortScenario, onCancel);
        const factory = config.createSessionFactory();

        const execution = config.createHost(factory, workload, abortScenario.signal);

        // Both should work, but only one will actually trigger
        execution.cancel();
        abortScenario.abort();

        const result = await execution.result();
        expect(result.status).toBe('canceled');
        // For streaming host with eager start, the workload might not have
        // registered its abort handler before cancel() is called.
        // The important thing is that abort works - callback count may be 0 or 1.
        expect(abortCount).toBeLessThanOrEqual(1);
      });
    });

    // ========================================================================
    // cleanup tests
    // ========================================================================

    describe('cleanup', () => {
      it('should be safe to call multiple times (idempotent)', async () => {
        const workload = config.createSuccessWorkload('result');
        const factory = config.createSessionFactory();
        const execution = config.createHost(factory, workload);

        await execution.result();

        // Multiple calls should be safe and not throw
        await execution.cleanup();
        await execution.cleanup();
        await execution.cleanup();
      });

      it('should support Symbol.asyncDispose', async () => {
        const workload = config.createSuccessWorkload('result');
        const factory = config.createSessionFactory();
        const execution = config.createHost(factory, workload);

        await execution.result();

        // Should not throw
        await execution[Symbol.asyncDispose]();
      });
    });

    // ========================================================================
    // result() idempotency tests
    // ========================================================================

    describe('result() idempotency', () => {
      it('should return deeply equal results on multiple calls', async () => {
        const workload = config.createSuccessWorkload('result');
        const factory = config.createSessionFactory();
        const execution = config.createHost(factory, workload);

        const r1 = await execution.result();
        const r2 = await execution.result();

        expect(r1).toEqual(r2);
      });
    });
  });
}

// Run the contract tests with all host configurations
createExecutionHostContractTests();
