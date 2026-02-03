/**
 * Test fixtures for execution module tests.
 * Provides mock factories and session factories for testing.
 *
 * These fixtures are framework-agnostic (no vitest/jest dependency).
 * Pass your own mock function (vi.fn, jest.fn, etc.) or use the noop default.
 */

import type { LanguageModel, LanguageModelUsage } from 'ai';

import type { EventMetrics } from '@/observability';
import type { FileManager } from '@/provider/types';
import type { Logger } from '@/observability/logger';
import { SimpleSession } from '../../session/simple-session';
import { StreamingSession } from '../../session/streaming-session';

// ============================================================================
// Types
// ============================================================================

export type MockFn = (...args: unknown[]) => unknown;
export type MockFnFactory = () => MockFn;

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
// Default noop mock factory
// ============================================================================

const noop: MockFn = () => {};
const noopFactory: MockFnFactory = () => noop;

function createNoopWithReturn<T>(value: T): MockFn {
  return () => value;
}

function createNoopAsync<T>(value: T): MockFn {
  return () => Promise.resolve(value);
}

// ============================================================================
// Mock Factories
// ============================================================================

export interface CreateMockModelOptions {
  mockFn?: MockFnFactory;
}

export function createMockModel(options: CreateMockModelOptions = {}): LanguageModel {
  const { mockFn = noopFactory } = options;
  return {
    specificationVersion: 'v1',
    provider: 'test-provider',
    modelId: 'test-model',
    defaultObjectGenerationMode: 'json',
    doGenerate: mockFn(),
    doStream: mockFn(),
  } as unknown as LanguageModel;
}

export interface CreateMockFileManagerOptions {
  mockFn?: MockFnFactory;
}

export function createMockFileManager(
  options: CreateMockFileManagerOptions = {}
): FileManager {
  const { mockFn } = options;

  if (mockFn) {
    return {
      upload: mockFn(),
      delete: mockFn(),
      clear: mockFn(),
      getUploadedFiles: mockFn(),
    } as FileManager;
  }

  // Default noop implementation with proper return values
  return {
    upload: createNoopAsync([]),
    delete: createNoopAsync(undefined),
    clear: createNoopAsync(undefined),
    getUploadedFiles: createNoopWithReturn([]),
  } as FileManager;
}

export interface CreateMockLoggerOptions {
  mockFn?: MockFnFactory;
}

export function createMockLogger(options: CreateMockLoggerOptions = {}): Logger {
  const { mockFn = noopFactory } = options;
  return {
    onLLMCallStart: mockFn(),
    onLLMCallEnd: mockFn(),
    onExecutionStart: mockFn(),
    onExecutionEmit: mockFn(),
    onExecutionDone: mockFn(),
    onExecutionError: mockFn(),
  };
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

export interface CreateSessionFactoryOptions {
  mockFn?: MockFnFactory;
  logger?: Logger;
}

export function createSimpleSessionFactory(
  options: CreateSessionFactoryOptions = {}
): (signal?: AbortSignal) => SimpleSession {
  const { mockFn, logger } = options;

  return (signal?: AbortSignal) =>
    new SimpleSession({
      defaultLanguageModel: createMockModel({ mockFn }),
      providerType: TEST_PROVIDER_TYPE,
      fileManager: createMockFileManager({ mockFn }),
      signal,
      logger,
    });
}

export function createStreamingSessionFactory<
  TEvent extends { type: string; metrics: EventMetrics } = TestEvent,
  TResult = string,
>(options: CreateSessionFactoryOptions = {}): () => StreamingSession<TEvent, TResult> {
  const { mockFn, logger } = options;

  return () =>
    new StreamingSession<TEvent, TResult>({
      defaultLanguageModel: createMockModel({ mockFn }),
      providerType: TEST_PROVIDER_TYPE,
      fileManager: createMockFileManager({ mockFn }),
      logger,
    });
}

export interface CreateStreamingSessionFactoryWithSignalOptions
  extends CreateSessionFactoryOptions {
  onSignalCapture?: (signal: AbortSignal | undefined) => void;
}

export function createStreamingSessionFactoryWithSignal<
  TEvent extends { type: string; metrics: EventMetrics } = TestEvent,
  TResult = string,
>(
  options: CreateStreamingSessionFactoryWithSignalOptions = {}
): (signal?: AbortSignal) => StreamingSession<TEvent, TResult> {
  const { mockFn, logger, onSignalCapture } = options;

  return (signal?: AbortSignal) => {
    onSignalCapture?.(signal);
    return new StreamingSession<TEvent, TResult>({
      defaultLanguageModel: createMockModel({ mockFn }),
      providerType: TEST_PROVIDER_TYPE,
      fileManager: createMockFileManager({ mockFn }),
      signal,
      logger,
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
  createOrderTrackingLogger,
  type LoggerEventType,
} from './helpers';
