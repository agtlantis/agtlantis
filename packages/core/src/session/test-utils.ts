import { vi } from 'vitest';
import type { LanguageModel, LanguageModelUsage } from 'ai';
import type { Logger } from '@/observability/logger';
import type { FileManager } from '@/provider/types';

export const TEST_PROVIDER_TYPE = 'google' as const;

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

export type MockLogger = Logger & {
  onLLMCallStart: ReturnType<typeof vi.fn>;
  onLLMCallEnd: ReturnType<typeof vi.fn>;
  onExecutionStart: ReturnType<typeof vi.fn>;
  onExecutionEmit: ReturnType<typeof vi.fn>;
  onExecutionDone: ReturnType<typeof vi.fn>;
  onExecutionError: ReturnType<typeof vi.fn>;
};

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

export function createMockUsage(overrides: Partial<LanguageModelUsage> = {}): LanguageModelUsage {
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

export function createTestUsage(partial: Partial<LanguageModelUsage>): LanguageModelUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputTokenDetails: {
      noCacheTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokenDetails: {
      textTokens: 0,
      reasoningTokens: 0,
    },
    ...partial,
  };
}
