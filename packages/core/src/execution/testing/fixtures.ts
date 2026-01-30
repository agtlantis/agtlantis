import { vi } from 'vitest';
import type { LanguageModel, LanguageModelUsage } from 'ai';
import type { EventMetrics } from '@/observability';
import type { FileManager } from '@/provider/types';
import type { Logger } from '@/observability/logger';
import { SimpleSession } from '../../session/simple-session';
import { StreamingSession } from '../../session/streaming-session';
import type { MockLogger } from './helpers';

// ============================================================================
// Constants
// ============================================================================

export const TEST_PROVIDER_TYPE = 'google' as const;

export interface TestEvent {
  type: string;
  metrics: EventMetrics;
  message?: string;
  data?: string;
  summary?: unknown;
  error?: Error;
}

// ============================================================================
// Mock Factories
// ============================================================================

export function createMockModel(): LanguageModel {
  return {
    specificationVersion: 'v1',
    provider: 'test-provider',
    modelId: 'test-model',
    defaultObjectGenerationMode: 'json',
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  } as unknown as LanguageModel;
}

export function createMockFileManager(): FileManager {
  return {
    upload: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    getUploadedFiles: vi.fn().mockReturnValue([]),
  };
}

export function createMockLogger(): MockLogger {
  return {
    onLLMCallStart: vi.fn(),
    onLLMCallEnd: vi.fn(),
    onExecutionStart: vi.fn(),
    onExecutionEmit: vi.fn(),
    onExecutionDone: vi.fn(),
    onExecutionError: vi.fn(),
  } as MockLogger;
}

export function createMockUsage(
  overrides: Partial<LanguageModelUsage> = {}
): LanguageModelUsage {
  return {
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    inputTokenDetails: {
      noCacheTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokenDetails: {
      textTokens: 50,
      reasoningTokens: 0,
    },
    ...overrides,
  };
}

// ============================================================================
// Session Factories
// ============================================================================

export function createSimpleSessionFactory(
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

export function createStreamingSessionFactory<
  TEvent extends { type: string; metrics: EventMetrics } = TestEvent,
  TResult = string,
>(): () => StreamingSession<TEvent, TResult> {
  return () =>
    new StreamingSession<TEvent, TResult>({
      defaultLanguageModel: createMockModel(),
      providerType: TEST_PROVIDER_TYPE,
      fileManager: createMockFileManager(),
    });
}

export function createStreamingSessionFactoryWithSignal<
  TEvent extends { type: string; metrics: EventMetrics } = TestEvent,
  TResult = string,
>(
  onSignalCapture?: (signal: AbortSignal | undefined) => void
): (signal?: AbortSignal) => StreamingSession<TEvent, TResult> {
  return (signal?: AbortSignal) => {
    onSignalCapture?.(signal);
    return new StreamingSession<TEvent, TResult>({
      defaultLanguageModel: createMockModel(),
      providerType: TEST_PROVIDER_TYPE,
      fileManager: createMockFileManager(),
      signal,
    });
  };
}

// ============================================================================
// Utilities
// ============================================================================

export async function collectEvents<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const events: T[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

/**
 * Creates a controllable promise for testing async flows
 */
export function createControllablePromise<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ============================================================================
// Re-export Test Helpers
// ============================================================================

export {
  // Types
  type MockLogger,
  // Result assertions
  expectSuccessResult,
  expectFailedResult,
  expectCanceledResult,
  expectStreamingSuccessResult,
  // Abort/Signal helpers
  createAbortScenario,
  createAlreadyAbortedSignal,
  type AbortScenario,
  // Generator helpers
  createSimpleGenerator,
  createErrorGenerator,
  createCancelableGenerator,
  createCancelableFunction,
  createDelayedGenerator,
  // Race condition & concurrency helpers
  createSlowGenerator,
  collectStreamAsync,
  createNeverEndingGenerator,
  // Logger helpers
  verifyLoggerSequence,
  createOrderTrackingLogger,
} from './helpers';
