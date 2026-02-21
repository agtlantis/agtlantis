import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LanguageModel, LanguageModelUsage } from 'ai';
import { SimpleSession } from './simple-session';
import { SessionSummary, type ToolCallSummary } from './types';
import {
  createMockModel,
  createMockFileManager,
  createMockLogger,
  createMockUsage,
  TEST_PROVIDER_TYPE,
} from './test-utils';

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));
import { generateText, streamText } from 'ai';

const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
const mockStreamText = streamText as ReturnType<typeof vi.fn>;

describe('SimpleSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a session with required options', () => {
      const model = createMockModel();
      const fileManager = createMockFileManager();

      const session = new SimpleSession({
        defaultLanguageModel: model,
        providerType: TEST_PROVIDER_TYPE,
        fileManager,
      });

      expect(session).toBeDefined();
      expect(session.fileManager).toBe(fileManager);
    });

    it('should use noopLogger when logger not provided', () => {
      const model = createMockModel();
      const fileManager = createMockFileManager();

      const session = new SimpleSession({
        defaultLanguageModel: model,
        providerType: TEST_PROVIDER_TYPE,
        fileManager,
      });

      expect(session).toBeDefined();
    });

    it('should accept custom startTime', async () => {
      vi.useFakeTimers();
      const customStartTime = 1000000;
      vi.setSystemTime(customStartTime + 5000);

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        startTime: customStartTime,
      });

      const summary = await session.getSummary();
      expect(summary.totalDuration).toBe(5000);
    });
  });

  describe('generateText', () => {
    it('should call AI SDK generateText with injected model', async () => {
      const model = createMockModel();
      const mockResult = {
        text: 'Hello, world!',
        usage: createMockUsage(),
      };
      mockGenerateText.mockResolvedValue(mockResult);

      const session = new SimpleSession({
        defaultLanguageModel: model,
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      const result = await session.generateText({ prompt: 'Hi' });

      expect(mockGenerateText).toHaveBeenCalledWith({
        prompt: 'Hi',
        model,
      });
      expect(result.text).toBe('Hello, world!');
    });

    it('should record LLM call with timing and usage', async () => {
      vi.useFakeTimers();
      const startTime = 1000000;
      vi.setSystemTime(startTime);

      const mockUsage = createMockUsage({ inputTokens: 200, outputTokens: 100, totalTokens: 300 });
      mockGenerateText.mockImplementation(async () => {
        vi.advanceTimersByTime(500);
        return { text: 'response', usage: mockUsage };
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      const summary = await session.getSummary();

      expect(summary.llmCallCount).toBe(1);
      expect(summary.llmCalls[0]).toMatchObject({
        startTime: startTime,
        endTime: startTime + 500,
        duration: 500,
        type: 'generateText',
      });
      expect(summary.llmCalls[0].usage.inputTokens).toBe(200);
    });

    it('should use zero usage when AI SDK returns undefined', async () => {
      mockGenerateText.mockResolvedValue({ text: 'response', usage: undefined });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      const summary = await session.getSummary();

      expect(summary.llmCalls[0].usage.inputTokens).toBe(0);
      expect(summary.llmCalls[0].usage.totalTokens).toBe(0);
    });
  });

  describe('streamText', () => {
    it('should call AI SDK streamText with injected model', () => {
      const model = createMockModel();
      const mockResult = {
        textStream: (async function* () {
          yield 'Hello';
        })(),
        usage: Promise.resolve(createMockUsage()),
      };
      mockStreamText.mockReturnValue(mockResult);

      const session = new SimpleSession({
        defaultLanguageModel: model,
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      const result = session.streamText({ prompt: 'Hi' });

      expect(mockStreamText).toHaveBeenCalledWith({
        prompt: 'Hi',
        model,
      });
      expect(result).toBe(mockResult);
    });

    it('should track usage when streaming completes', async () => {
      vi.useFakeTimers();
      const startTime = 1000000;
      vi.setSystemTime(startTime);

      let resolveUsage: (usage: LanguageModelUsage) => void;
      const usagePromise = new Promise<LanguageModelUsage>((resolve) => {
        resolveUsage = resolve;
      });

      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield 'Hello';
        })(),
        usage: usagePromise,
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.streamText({ prompt: 'test' });

      vi.advanceTimersByTime(1000);
      resolveUsage!(createMockUsage({ inputTokens: 150, outputTokens: 75, totalTokens: 225 }));

      await usagePromise;
      const summary = await session.getSummary();

      expect(summary.llmCallCount).toBe(1);
      expect(summary.llmCalls[0].type).toBe('streamText');
      expect(summary.llmCalls[0].usage.inputTokens).toBe(150);
    });
  });

  describe('Logger integration', () => {
    it('should call onLLMCallStart before generateText', async () => {
      const logger = createMockLogger();
      mockGenerateText.mockResolvedValue({ text: 'response', usage: createMockUsage() });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        logger,
      });

      await session.generateText({ prompt: 'test' });

      expect(logger.onLLMCallStart).toHaveBeenCalledTimes(1);
      expect(logger.onLLMCallStart).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'llm_call_start',
          callType: 'generateText',
          modelId: 'test-model',
        })
      );
    });

    it('should call onLLMCallEnd after generateText success', async () => {
      const logger = createMockLogger();
      const mockUsage = createMockUsage();
      mockGenerateText.mockResolvedValue({ text: 'response', usage: mockUsage });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        logger,
      });

      await session.generateText({ prompt: 'test' });

      expect(logger.onLLMCallEnd).toHaveBeenCalledTimes(1);
      expect(logger.onLLMCallEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'llm_call_end',
          callType: 'generateText',
          modelId: 'test-model',
          response: expect.objectContaining({
            usage: mockUsage,
          }),
        })
      );
    });

    it('should call onLLMCallEnd after generateText error', async () => {
      const logger = createMockLogger();
      const error = new Error('API Error');
      mockGenerateText.mockRejectedValue(error);

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        logger,
      });

      await expect(session.generateText({ prompt: 'test' })).rejects.toThrow('API Error');

      expect(logger.onLLMCallEnd).toHaveBeenCalledTimes(1);
      expect(logger.onLLMCallEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'llm_call_end',
          callType: 'generateText',
          response: expect.objectContaining({
            error,
          }),
        })
      );
    });

    it('should call onLLMCallStart for streamText', () => {
      const logger = createMockLogger();
      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield 'data';
        })(),
        usage: Promise.resolve(createMockUsage()),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        logger,
      });

      session.streamText({ prompt: 'test' });

      expect(logger.onLLMCallStart).toHaveBeenCalledTimes(1);
      expect(logger.onLLMCallStart).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'llm_call_start',
          callType: 'streamText',
          modelId: 'test-model',
        })
      );
    });

    it('should call onLLMCallEnd when streamText usage resolves', async () => {
      const logger = createMockLogger();
      const mockUsage = createMockUsage();
      let resolveUsage: (usage: LanguageModelUsage) => void;
      const usagePromise = new Promise<LanguageModelUsage>((resolve) => {
        resolveUsage = resolve;
      });

      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield 'data';
        })(),
        usage: usagePromise,
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        logger,
      });

      session.streamText({ prompt: 'test' });

      expect(logger.onLLMCallEnd).not.toHaveBeenCalled();

      resolveUsage!(mockUsage);
      await usagePromise;

      expect(logger.onLLMCallEnd).toHaveBeenCalledTimes(1);
      expect(logger.onLLMCallEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'llm_call_end',
          callType: 'streamText',
          response: expect.objectContaining({
            usage: mockUsage,
          }),
        })
      );
    });
  });

  describe('fileManager', () => {
    it('should return the file manager', () => {
      const fileManager = createMockFileManager();

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager,
      });

      expect(session.fileManager).toBe(fileManager);
    });
  });

  describe('record', () => {
    it('should record arbitrary custom data', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.record({ key: 'value', nested: { data: 123 } });

      const summary = await session.getSummary();

      expect(summary.customRecords).toHaveLength(1);
      expect(summary.customRecords[0]).toEqual({ key: 'value', nested: { data: 123 } });
    });

    it('should accumulate multiple custom records', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.record({ step: 1 });
      session.record({ step: 2 });
      session.record({ step: 3 });

      const summary = await session.getSummary();

      expect(summary.customRecords).toHaveLength(3);
    });
  });

  describe('recordToolCall', () => {
    it('should record a successful tool call', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      const toolCall: ToolCallSummary = {
        name: 'search',
        duration: 150,
        success: true,
      };
      session.recordToolCall(toolCall);

      const summary = await session.getSummary();

      expect(summary.toolCalls).toHaveLength(1);
      expect(summary.toolCalls[0]).toEqual(toolCall);
    });

    it('should record a failed tool call with error', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.recordToolCall({
        name: 'database_query',
        duration: 50,
        success: false,
        error: 'Connection timeout',
      });

      const summary = await session.getSummary();

      expect(summary.toolCalls[0].success).toBe(false);
      expect(summary.toolCalls[0].error).toBe('Connection timeout');
    });
  });

  describe('onDone', () => {
    it('should register a cleanup function', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      const cleanup = vi.fn();
      session.onDone(cleanup);

      await session.runOnDoneHooks();

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should execute hooks in LIFO order', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      const order: number[] = [];
      session.onDone(() => { order.push(1); });
      session.onDone(() => { order.push(2); });
      session.onDone(() => { order.push(3); });

      await session.runOnDoneHooks();

      expect(order).toEqual([3, 2, 1]);
    });

    it('should continue running hooks even if one throws', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const hook1 = vi.fn();
      const hook2 = vi.fn().mockRejectedValue(new Error('Hook error'));
      const hook3 = vi.fn();

      session.onDone(hook3);
      session.onDone(hook2);
      session.onDone(hook1);

      await session.runOnDoneHooks();

      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
      expect(hook3).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle async hooks', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      const order: number[] = [];

      session.onDone(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(1);
      });
      session.onDone(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(2);
      });

      await session.runOnDoneHooks();

      expect(order).toEqual([2, 1]);
    });
  });

  describe('getSummary', () => {
    it('should return zero usage for empty session', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      const summary = await session.getSummary();

      expect(summary.llmCallCount).toBe(0);
      expect(summary.llmCalls).toEqual([]);
      expect(summary.toolCalls).toEqual([]);
      expect(summary.customRecords).toEqual([]);
      expect(summary.totalLLMUsage.inputTokens).toBe(0);
      expect(summary.totalLLMUsage.totalTokens).toBe(0);
    });

    it('should calculate totalDuration from session start', async () => {
      vi.useFakeTimers();
      const startTime = 1000000;
      vi.setSystemTime(startTime);

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      vi.advanceTimersByTime(5000);

      const summary = await session.getSummary();

      expect(summary.totalDuration).toBe(5000);
    });

    it('should wait for pending streaming usage', async () => {
      let resolveUsage: (usage: LanguageModelUsage | undefined) => void;
      const usagePromise = new Promise<LanguageModelUsage | undefined>((resolve) => {
        resolveUsage = resolve;
      });

      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield 'data';
        })(),
        usage: usagePromise,
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.streamText({ prompt: 'test' });

      const summaryPromise = session.getSummary();

      resolveUsage!(createMockUsage({ inputTokens: 50, outputTokens: 25, totalTokens: 75 }));

      const summary = await summaryPromise;

      expect(summary.llmCallCount).toBe(1);
      expect(summary.totalLLMUsage.inputTokens).toBe(50);
    });

    it('should aggregate usage from multiple calls', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
      });

      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield 'data';
        })(),
        usage: Promise.resolve(
          createMockUsage({ inputTokens: 200, outputTokens: 100, totalTokens: 300 })
        ),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test1' });
      session.streamText({ prompt: 'test2' });

      const summary = await session.getSummary();

      expect(summary.llmCallCount).toBe(2);
      expect(summary.totalLLMUsage.inputTokens).toBe(300);
      expect(summary.totalLLMUsage.outputTokens).toBe(150);
      expect(summary.totalLLMUsage.totalTokens).toBe(450);
    });

    it('should return immutable frozen arrays', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.recordToolCall({ name: 'tool1', success: true });
      session.record({ data: 'test' });

      const summary = await session.getSummary();

      // Arrays should be frozen (immutable)
      expect(Object.isFrozen(summary.toolCalls)).toBe(true);
      expect(Object.isFrozen(summary.customRecords)).toBe(true);
      expect(Object.isFrozen(summary.llmCalls)).toBe(true);

      // Attempting to modify should fail silently (or throw in strict mode)
      expect(() => {
        (summary.toolCalls as ToolCallSummary[]).push({ name: 'tool2', success: true });
      }).toThrow();
    });
  });

  describe('LLMCallRecord model and provider fields', () => {
    it('should record model field correctly in generateText', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage(),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      const summary = await session.getSummary();

      expect(summary.llmCalls[0].model).toBe('test-model');
      expect(summary.llmCalls[0].provider).toBe(TEST_PROVIDER_TYPE);
    });

    it('should record model field correctly in streamText', async () => {
      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield 'data';
        })(),
        usage: Promise.resolve(createMockUsage()),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.streamText({ prompt: 'test' });
      const summary = await session.getSummary();

      expect(summary.llmCalls[0].model).toBe('test-model');
      expect(summary.llmCalls[0].provider).toBe(TEST_PROVIDER_TYPE);
    });

    it('should use per-call model when specified in generateText', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage(),
      });

      const customModel = {
        specificationVersion: 'v1',
        provider: 'test-provider',
        modelId: 'custom-model-id',
        defaultObjectGenerationMode: 'json',
        doGenerate: vi.fn(),
        doStream: vi.fn(),
      } as unknown as LanguageModel;

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        modelFactory: () => customModel,
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test', model: 'custom-model-id' });
      const summary = await session.getSummary();

      expect(summary.llmCalls[0].model).toBe('custom-model-id');
    });

    it('should record provider correctly for openai', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage(),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: 'openai',
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      const summary = await session.getSummary();

      expect(summary.llmCalls[0].provider).toBe('openai');
    });
  });

  describe('recordLLMCall', () => {
    it('should record LLM call with default type "manual"', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.recordLLMCall({
        startTime: 1000,
        endTime: 2000,
        duration: 1000,
        usage: createMockUsage(),
        model: 'external-model',
        provider: 'anthropic',
      });

      const summary = await session.getSummary();

      expect(summary.llmCalls).toHaveLength(1);
      expect(summary.llmCalls[0].type).toBe('manual');
      expect(summary.llmCalls[0].model).toBe('external-model');
      expect(summary.llmCalls[0].provider).toBe('anthropic');
    });

    it('should use specified type when provided', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.recordLLMCall({
        startTime: 1000,
        endTime: 2000,
        duration: 1000,
        usage: createMockUsage(),
        model: 'gpt-4o',
        provider: 'openai',
        type: 'generateText',
      });

      const summary = await session.getSummary();

      expect(summary.llmCalls[0].type).toBe('generateText');
    });

    it('should include recorded LLM calls in total usage', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      session.recordLLMCall({
        startTime: 1000,
        endTime: 2000,
        duration: 1000,
        usage: createMockUsage({ inputTokens: 200, outputTokens: 100, totalTokens: 300 }),
        model: 'external-model',
        provider: 'anthropic',
      });

      const summary = await session.getSummary();

      expect(summary.llmCallCount).toBe(2);
      expect(summary.totalLLMUsage.inputTokens).toBe(300);
      expect(summary.totalLLMUsage.outputTokens).toBe(150);
    });
  });

  describe('cost tracking in summary', () => {
    it('should return zero cost for empty session', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      const summary = await session.getSummary();

      expect(summary.totalCost).toBe(0);
      expect(summary.costByModel).toEqual({});
    });

    it('should calculate cost for single LLM call', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage({
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        }),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: 'google',
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      const summary = await session.getSummary();

      expect(summary.totalCost).toBeGreaterThan(0);
      expect(summary.costByModel).toHaveProperty('google/test-model');
      expect(summary.costByModel['google/test-model']).toBe(summary.totalCost);
    });

    it('should aggregate costs from multiple LLM calls', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage({
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        }),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: 'google',
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test1' });
      await session.generateText({ prompt: 'test2' });

      const summary = await session.getSummary();

      expect(summary.llmCallCount).toBe(2);
      expect(summary.totalCost).toBeGreaterThan(0);
      expect(Object.keys(summary.costByModel)).toHaveLength(1);
    });

    it('should group costs by provider/model in costByModel', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage({
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        }),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: 'google',
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });

      session.recordLLMCall({
        startTime: 1000,
        endTime: 2000,
        duration: 1000,
        usage: createMockUsage({
          inputTokens: 2000,
          outputTokens: 1000,
          totalTokens: 3000,
        }),
        model: 'gpt-4o',
        provider: 'openai',
      });

      const summary = await session.getSummary();

      expect(summary.llmCallCount).toBe(2);
      expect(Object.keys(summary.costByModel)).toHaveLength(2);
      expect(summary.costByModel).toHaveProperty('google/test-model');
      expect(summary.costByModel).toHaveProperty('openai/gpt-4o');
      expect(summary.totalCost).toBeCloseTo(
        summary.costByModel['google/test-model'] +
          summary.costByModel['openai/gpt-4o'],
        6
      );
    });

    it('should use key format provider/model', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage({
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        }),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: 'anthropic',
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      const summary = await session.getSummary();

      const keys = Object.keys(summary.costByModel);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toBe('anthropic/test-model');
    });

    it('should use providerPricing for cost calculation when provided', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage({
          inputTokens: 1000000,
          outputTokens: 500000,
          totalTokens: 1500000,
        }),
      });

      const customPricing = {
        'test-model': {
          inputPricePerMillion: 10,
          outputPricePerMillion: 20,
        },
      };

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: 'google',
        providerPricing: customPricing,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      const summary = await session.getSummary();

      expect(summary.totalCost).toBeCloseTo(20, 4);
    });

    it('should override global pricing with providerPricing', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage({
          inputTokens: 1000000,
          outputTokens: 1000000,
          totalTokens: 2000000,
        }),
      });

      const customPricing = {
        'test-model': {
          inputPricePerMillion: 0.001,
          outputPricePerMillion: 0.001,
        },
      };

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: 'google',
        providerPricing: customPricing,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      const summary = await session.getSummary();

      expect(summary.totalCost).toBeCloseTo(0.002, 6);
    });

    it('should support cachedInputPricePerMillion in providerPricing', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: {
          inputTokens: 1000000,
          outputTokens: 0,
          totalTokens: 1000000,
          inputTokenDetails: {
            noCacheTokens: 0,
            cacheReadTokens: 1000000,
            cacheWriteTokens: 0,
          },
        },
      });

      const customPricing = {
        'test-model': {
          inputPricePerMillion: 10,
          outputPricePerMillion: 20,
          cachedInputPricePerMillion: 2,
        },
      };

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: 'google',
        providerPricing: customPricing,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      const summary = await session.getSummary();

      expect(summary.totalCost).toBeCloseTo(2, 4);
    });
  });

  describe('additional cost tracking', () => {
    it('should record single additional cost', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.recordAdditionalCost({
        type: 'search_grounding',
        cost: 0.05,
        label: 'Google Search',
      });

      const summary = await session.getSummary();

      expect(summary.additionalCosts).toHaveLength(1);
      expect(summary.additionalCosts[0].type).toBe('search_grounding');
      expect(summary.additionalCosts[0].cost).toBe(0.05);
      expect(summary.additionalCosts[0].label).toBe('Google Search');
      expect(summary.additionalCosts[0].timestamp).toBeDefined();
    });

    it('should accumulate multiple additional costs', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.recordAdditionalCost({ type: 'search', cost: 0.05 });
      session.recordAdditionalCost({ type: 'image_gen', cost: 0.02 });
      session.recordAdditionalCost({ type: 'search', cost: 0.03 });

      const summary = await session.getSummary();

      expect(summary.additionalCosts).toHaveLength(3);
      expect(summary.totalAdditionalCost).toBeCloseTo(0.1, 6);
    });

    it('should include additional costs in totalCost', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage({
          inputTokens: 1000000,
          outputTokens: 500000,
          totalTokens: 1500000,
        }),
      });

      const customPricing = {
        'test-model': {
          inputPricePerMillion: 1,
          outputPricePerMillion: 2,
        },
      };

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: 'google',
        providerPricing: customPricing,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      session.recordAdditionalCost({ type: 'search', cost: 0.5 });

      const summary = await session.getSummary();

      // LLM cost: 1*1 + 2*0.5 = 2
      expect(summary.llmCost).toBeCloseTo(2, 4);
      expect(summary.totalAdditionalCost).toBeCloseTo(0.5, 4);
      expect(summary.totalCost).toBeCloseTo(2.5, 4);
    });
  });

  describe('metadata tracking', () => {
    it('should set single key-value metadata', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.setMetadata('userId', 'user123');
      session.setMetadata('requestId', 'req456');

      const summary = await session.getSummary();

      expect(summary.metadata).toEqual({
        userId: 'user123',
        requestId: 'req456',
      });
    });

    it('should merge object metadata', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.setMetadata({ userId: 'user123', version: '1.0' });
      session.setMetadata({ requestId: 'req456' });

      const summary = await session.getSummary();

      expect(summary.metadata).toEqual({
        userId: 'user123',
        version: '1.0',
        requestId: 'req456',
      });
    });

    it('should overwrite existing metadata keys', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.setMetadata('key', 'value1');
      session.setMetadata('key', 'value2');

      const summary = await session.getSummary();

      expect(summary.metadata).toEqual({ key: 'value2' });
    });
  });

  describe('SessionSummary Value Object', () => {
    it('should be an instance of SessionSummary class', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      const summary = await session.getSummary();

      expect(summary).toBeInstanceOf(SessionSummary);
    });

    it('should have frozen metadata', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      session.setMetadata('key', 'value');
      const summary = await session.getSummary();

      expect(Object.isFrozen(summary.metadata)).toBe(true);
    });

    it('should have frozen costByModel', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage(),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      const summary = await session.getSummary();

      expect(Object.isFrozen(summary.costByModel)).toBe(true);
    });

    it('should serialize to JSON with toJSON()', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'response',
        usage: createMockUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });
      session.setMetadata('userId', 'user123');
      session.recordAdditionalCost({ type: 'search', cost: 0.05 });

      const summary = await session.getSummary();
      const json = summary.toJSON();

      expect(json.llmCallCount).toBe(1);
      expect(json.metadata).toEqual({ userId: 'user123' });
      expect(json.additionalCosts).toHaveLength(1);
      expect(json.totalCost).toBe(json.llmCost + json.totalAdditionalCost);
      // JSON should be a plain object, not frozen
      expect(Object.isFrozen(json)).toBe(false);
    });
  });

  describe('defaultGenerationOptions', () => {
    it('should apply defaults to generateText when set', async () => {
      mockGenerateText.mockResolvedValue({ text: 'response', usage: createMockUsage() });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        defaultGenerationOptions: { maxOutputTokens: 65536, temperature: 0.7 },
      });

      await session.generateText({ prompt: 'test' });

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          maxOutputTokens: 65536,
          temperature: 0.7,
          prompt: 'test',
        })
      );
    });

    it('should apply defaults to streamText when set', () => {
      mockStreamText.mockReturnValue({
        textStream: (async function* () { yield 'data'; })(),
        usage: Promise.resolve(createMockUsage()),
      });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        defaultGenerationOptions: { maxOutputTokens: 8192, topP: 0.9 },
      });

      session.streamText({ prompt: 'test' });

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          maxOutputTokens: 8192,
          topP: 0.9,
          prompt: 'test',
        })
      );
    });

    it('should allow per-call override of defaults', async () => {
      mockGenerateText.mockResolvedValue({ text: 'response', usage: createMockUsage() });

      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        defaultGenerationOptions: { maxOutputTokens: 65536, temperature: 0.7 },
      });

      await session.generateText({ prompt: 'test', temperature: 0.2 });

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          maxOutputTokens: 65536,
          temperature: 0.2,
        })
      );
    });

    it('should not affect calls when not set', async () => {
      mockGenerateText.mockResolvedValue({ text: 'response', usage: createMockUsage() });
      const model = createMockModel();

      const session = new SimpleSession({
        defaultLanguageModel: model,
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
      });

      await session.generateText({ prompt: 'test' });

      expect(mockGenerateText).toHaveBeenCalledWith({
        prompt: 'test',
        model,
      });
    });
  });

  describe('notifyExecutionStart', () => {
    it('should call Logger.onExecutionStart', () => {
      const logger = createMockLogger();
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        logger,
      });

      session.notifyExecutionStart();

      expect(logger.onExecutionStart).toHaveBeenCalledTimes(1);
      expect(logger.onExecutionStart).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'execution_start',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should not throw if logger has no onExecutionStart', () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        // no logger
      });

      expect(() => session.notifyExecutionStart()).not.toThrow();
    });
  });

  describe('notifyExecutionDone', () => {
    it('should call Logger.onExecutionDone with data and summary', async () => {
      const logger = createMockLogger();
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        logger,
      });

      const startTime = Date.now() - 1000;
      const data = { result: 'test-result' };

      await session.notifyExecutionDone(data, startTime);

      expect(logger.onExecutionDone).toHaveBeenCalledTimes(1);
      expect(logger.onExecutionDone).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'execution_done',
          timestamp: expect.any(Number),
          duration: expect.any(Number),
          data,
          summary: expect.any(SessionSummary),
        })
      );

      const callArg = logger.onExecutionDone.mock.calls[0][0];
      expect(callArg.duration).toBeGreaterThanOrEqual(1000);
    });

    it('should not throw if logger has no onExecutionDone', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        // no logger
      });

      await expect(
        session.notifyExecutionDone({ result: 'test' }, Date.now())
      ).resolves.not.toThrow();
    });
  });

  describe('notifyExecutionError', () => {
    it('should call Logger.onExecutionError with error and summary', async () => {
      const logger = createMockLogger();
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        logger,
      });

      const startTime = Date.now() - 500;
      const error = new Error('Test error');

      await session.notifyExecutionError(error, startTime);

      expect(logger.onExecutionError).toHaveBeenCalledTimes(1);
      expect(logger.onExecutionError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'execution_error',
          timestamp: expect.any(Number),
          duration: expect.any(Number),
          error,
          summary: expect.any(SessionSummary),
        })
      );

      const callArg = logger.onExecutionError.mock.calls[0][0];
      expect(callArg.duration).toBeGreaterThanOrEqual(500);
    });

    it('should not throw if logger has no onExecutionError', async () => {
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        // no logger
      });

      await expect(
        session.notifyExecutionError(new Error('Test'), Date.now())
      ).resolves.not.toThrow();
    });

    it('should handle getSummary failure gracefully', async () => {
      const logger = createMockLogger();
      const session = new SimpleSession({
        defaultLanguageModel: createMockModel(),
        providerType: TEST_PROVIDER_TYPE,
        fileManager: createMockFileManager(),
        logger,
      });

      // Mock getSummary to throw
      vi.spyOn(session, 'getSummary').mockRejectedValue(new Error('Summary error'));

      const error = new Error('Test error');
      await session.notifyExecutionError(error, Date.now());

      expect(logger.onExecutionError).toHaveBeenCalledTimes(1);
      expect(logger.onExecutionError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'execution_error',
          error,
          summary: undefined,
        })
      );
    });
  });
});
