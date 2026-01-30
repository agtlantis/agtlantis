/**
 * Configuration objects for ExecutionHost contract tests.
 * Abstracts the differences between SimpleHost and StreamingHost
 * to enable shared contract testing.
 */

import { vi } from 'vitest';
import type { SessionStreamGeneratorFn } from '../types';
import { SimpleExecutionHost } from '../simple-host';
import { StreamingExecutionHost } from '../streaming-host';
import { SimpleSession } from '../../session/simple-session';
import { StreamingSession } from '../../session/streaming-session';
import {
  TEST_PROVIDER_TYPE,
  TestEvent,
  createMockModel,
  createMockFileManager,
} from './fixtures';
import type { AbortScenario } from './helpers';
import type { Logger } from '@/observability/logger';

// ============================================================================
// Types
// ============================================================================

export type SimpleSessionFactory = (signal?: AbortSignal) => SimpleSession;
export type StreamingSessionFactory = (
  signal?: AbortSignal
) => StreamingSession<TestEvent, string>;

export type SimpleWorkload = (session: SimpleSession) => Promise<unknown>;
export type StreamingWorkload = SessionStreamGeneratorFn<TestEvent, string>;

export interface ExecutionHost<TResult = string> {
  result(): Promise<{ status: string; [key: string]: unknown }>;
  cancel(): void;
  cleanup(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Configuration for testing an ExecutionHost implementation.
 * Abstracts the differences between SimpleHost and StreamingHost.
 */
export interface ExecutionHostTestConfig<TResult = string> {
  /** Name of the host for test descriptions */
  name: 'SimpleExecutionHost' | 'StreamingExecutionHost';

  /** Create a host with given factory, workload, and optional signal */
  createHost: (
    factory: SimpleSessionFactory | StreamingSessionFactory,
    workload: SimpleWorkload | StreamingWorkload,
    signal?: AbortSignal
  ) => ExecutionHost<TResult>;

  /** Create a session factory with optional logger */
  createSessionFactory: (logger?: Logger) => SimpleSessionFactory | StreamingSessionFactory;

  /** Create a session factory spy for signal verification */
  createSessionFactorySpy: () => {
    factory: SimpleSessionFactory | StreamingSessionFactory;
    getPassedSignal: () => AbortSignal | undefined;
  };

  /** Create a workload that succeeds with the given result */
  createSuccessWorkload: (result: TResult) => SimpleWorkload | StreamingWorkload;

  /** Create a workload that fails with the given error */
  createErrorWorkload: (error: Error) => SimpleWorkload | StreamingWorkload;

  /** Create a workload that waits for cancellation via closure pattern */
  createCancelableWorkload: (
    abortScenario: AbortScenario,
    onCancel?: () => void
  ) => SimpleWorkload | StreamingWorkload;

  /** Create a workload that registers onDone hooks */
  createHookWorkload: (
    hook: () => void,
    options?: { shouldFail?: boolean }
  ) => SimpleWorkload | StreamingWorkload;
}

// ============================================================================
// SimpleHost Configuration
// ============================================================================

export const simpleHostConfig: ExecutionHostTestConfig<string> = {
  name: 'SimpleExecutionHost',

  createHost(factory, workload, signal?) {
    return new SimpleExecutionHost(
      factory as SimpleSessionFactory,
      workload as SimpleWorkload,
      signal
    );
  },

  createSessionFactory(logger?: Logger) {
    return (signal?: AbortSignal) =>
      new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        signal,
        logger,
      });
  },

  createSessionFactorySpy() {
    let passedSignal: AbortSignal | undefined;
    const factory = vi.fn().mockImplementation((signal?: AbortSignal) => {
      passedSignal = signal;
      return new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        signal,
      });
    });
    return {
      factory,
      getPassedSignal: () => passedSignal,
    };
  },

  createSuccessWorkload(result: string) {
    return vi.fn().mockResolvedValue(result);
  },

  createErrorWorkload(error: Error) {
    return vi.fn().mockRejectedValue(error);
  },

  createCancelableWorkload(abortScenario: AbortScenario, onCancel?: () => void) {
    return async () => {
      await new Promise<void>((_, reject) => {
        const signal = abortScenario.signal;
        if (signal.aborted) {
          onCancel?.();
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => {
          onCancel?.();
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return 'should-not-reach';
    };
  },

  createHookWorkload(hook: () => void, options?: { shouldFail?: boolean }) {
    return async (session: SimpleSession) => {
      session.onDone(hook);
      if (options?.shouldFail) {
        throw new Error('Intentional failure');
      }
      return 'result';
    };
  },
};

// ============================================================================
// StreamingHost Configuration
// ============================================================================

export const streamingHostConfig: ExecutionHostTestConfig<string> = {
  name: 'StreamingExecutionHost',

  createHost(factory, workload, signal?) {
    return new StreamingExecutionHost(
      factory as StreamingSessionFactory,
      workload as StreamingWorkload,
      signal
    );
  },

  createSessionFactory(logger?: Logger) {
    return (signal?: AbortSignal) =>
      new StreamingSession<TestEvent, string>({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        signal,
        logger,
      });
  },

  createSessionFactorySpy() {
    let passedSignal: AbortSignal | undefined;
    const factory = vi.fn().mockImplementation((signal?: AbortSignal) => {
      passedSignal = signal;
      return new StreamingSession<TestEvent, string>({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        signal,
      });
    });
    return {
      factory,
      getPassedSignal: () => passedSignal,
    };
  },

  createSuccessWorkload(result: string) {
    return async function* (session: StreamingSession<TestEvent, string>) {
      return session.done(result);
    };
  },

  createErrorWorkload(error: Error) {
    return async function* () {
      throw error;
    };
  },

  createCancelableWorkload(abortScenario: AbortScenario, onCancel?: () => void) {
    return async function* (session: StreamingSession<TestEvent, string>) {
      yield session.emit({ type: 'start' } as Omit<TestEvent, 'metrics'>);

      await new Promise<void>((_, reject) => {
        const signal = abortScenario.signal;
        if (signal.aborted) {
          onCancel?.();
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => {
          onCancel?.();
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });

      return session.done('should-not-reach');
    };
  },

  createHookWorkload(hook: () => void, options?: { shouldFail?: boolean }) {
    return async function* (session: StreamingSession<TestEvent, string>) {
      session.onDone(hook);
      if (options?.shouldFail) {
        throw new Error('Intentional failure');
      }
      return session.done('result');
    };
  },
};

// ============================================================================
// Exports
// ============================================================================

/** All host configurations for parameterized testing */
export const allHostConfigs = [simpleHostConfig, streamingHostConfig] as const;
