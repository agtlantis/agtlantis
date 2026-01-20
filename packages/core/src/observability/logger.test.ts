import { describe, it, expect, vi } from 'vitest';
import type {
  Logger,
  LogLevel,
  LLMCallStartEvent,
  LLMCallEndEvent,
  ExecutionStartEvent,
  ExecutionEmitEvent,
  ExecutionDoneEvent,
  ExecutionErrorEvent,
} from './logger';
import { noopLogger, createLogger } from './logger';
import { createMockUsage, createMockSessionSummary } from '@/testing';

describe('Logger', () => {
  describe('Logger interface', () => {
    it('should allow empty object (all methods optional)', () => {
      const logger: Logger = {};

      expect(logger.onLLMCallStart).toBeUndefined();
      expect(logger.onLLMCallEnd).toBeUndefined();
      expect(logger.onExecutionStart).toBeUndefined();
      expect(logger.onExecutionEmit).toBeUndefined();
      expect(logger.onExecutionDone).toBeUndefined();
      expect(logger.onExecutionError).toBeUndefined();
      expect(logger.log).toBeUndefined();
    });

    it('should allow partial implementation', () => {
      const onLLMCallEnd = vi.fn();

      const logger: Logger = {
        onLLMCallEnd,
      };

      expect(logger.onLLMCallEnd).toBe(onLLMCallEnd);
      expect(logger.onLLMCallStart).toBeUndefined();
    });

    it('should allow full implementation', () => {
      const fullLogger: Logger = {
        onLLMCallStart: vi.fn(),
        onLLMCallEnd: vi.fn(),
        onExecutionStart: vi.fn(),
        onExecutionEmit: vi.fn(),
        onExecutionDone: vi.fn(),
        onExecutionError: vi.fn(),
        log: vi.fn(),
      };

      expect(fullLogger.onLLMCallStart).toBeDefined();
      expect(fullLogger.log).toBeDefined();
    });
  });

  describe('noopLogger', () => {
    it('should be an empty object', () => {
      expect(noopLogger).toEqual({});
    });

    it('should satisfy Logger interface', () => {
      const logger: Logger = noopLogger;
      expect(logger).toBeDefined();
    });

    it('should safely call optional methods with optional chaining', () => {
      const event: LLMCallStartEvent = {
        type: 'llm_call_start',
        callType: 'generateText',
        modelId: 'gpt-4',
        timestamp: Date.now(),
        request: { params: { prompt: 'test' } },
      };

      expect(() => noopLogger.onLLMCallStart?.(event)).not.toThrow();
    });
  });

  describe('createLogger', () => {
    it('should create logger with provided handlers', () => {
      const onLLMCallEnd = vi.fn();
      const onExecutionDone = vi.fn();

      const logger = createLogger({
        onLLMCallEnd,
        onExecutionDone,
      });

      expect(logger.onLLMCallEnd).toBe(onLLMCallEnd);
      expect(logger.onExecutionDone).toBe(onExecutionDone);
    });

    it('should return empty object when no handlers provided', () => {
      const logger = createLogger({});
      expect(logger).toEqual({});
    });

    it('should work with type-safe handlers', () => {
      const logger = createLogger({
        onLLMCallEnd(event) {
          expect(event.type).toBe('llm_call_end');
          expect(event.response.duration).toBeGreaterThanOrEqual(0);
        },
      });

      const event: LLMCallEndEvent = {
        type: 'llm_call_end',
        callType: 'generateText',
        modelId: 'gpt-4',
        timestamp: Date.now(),
        response: {
          duration: 100,
          usage: createMockUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
          raw: { text: 'Hello' },
        },
      };

      logger.onLLMCallEnd?.(event);
    });
  });

  describe('LLMCallStartEvent', () => {
    it('should have correct discriminator type', () => {
      const event: LLMCallStartEvent = {
        type: 'llm_call_start',
        callType: 'generateText',
        modelId: 'gemini-2.5-flash',
        timestamp: 1704067200000,
        request: {
          params: { prompt: 'Hello, world!' },
        },
      };

      expect(event.type).toBe('llm_call_start');
      expect(event.callType).toBe('generateText');
    });

    it('should support streamText call type', () => {
      const event: LLMCallStartEvent = {
        type: 'llm_call_start',
        callType: 'streamText',
        modelId: 'gpt-4o',
        timestamp: Date.now(),
        request: {
          params: { messages: [{ role: 'user', content: 'Hi' }] },
        },
      };

      expect(event.callType).toBe('streamText');
    });
  });

  describe('LLMCallEndEvent', () => {
    it('should have correct discriminator type', () => {
      const event: LLMCallEndEvent = {
        type: 'llm_call_end',
        callType: 'generateText',
        modelId: 'gemini-2.5-flash',
        timestamp: Date.now(),
        response: {
          duration: 1500,
          usage: createMockUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
          raw: { text: 'Response text' },
        },
      };

      expect(event.type).toBe('llm_call_end');
      expect(event.response.duration).toBe(1500);
    });

    it('should support error case', () => {
      const error = new Error('Rate limit exceeded');
      const event: LLMCallEndEvent = {
        type: 'llm_call_end',
        callType: 'streamText',
        modelId: 'gpt-4o',
        timestamp: Date.now(),
        response: {
          duration: 500,
          error,
          raw: null,
        },
      };

      expect(event.response.error).toBe(error);
      expect(event.response.usage).toBeUndefined();
    });
  });

  describe('ExecutionStartEvent', () => {
    it('should have correct discriminator type', () => {
      const event: ExecutionStartEvent = {
        type: 'execution_start',
        timestamp: Date.now(),
      };

      expect(event.type).toBe('execution_start');
    });
  });

  describe('ExecutionEmitEvent', () => {
    it('should wrap generic event', () => {
      interface MyEvent {
        type: 'progress';
        message: string;
        metrics: { timestamp: number; elapsedMs: number; deltaMs: number };
      }

      const innerEvent: MyEvent = {
        type: 'progress',
        message: 'Processing...',
        metrics: { timestamp: Date.now(), elapsedMs: 100, deltaMs: 100 },
      };

      const event: ExecutionEmitEvent<MyEvent> = {
        type: 'execution_emit',
        event: innerEvent,
      };

      expect(event.type).toBe('execution_emit');
      expect(event.event.type).toBe('progress');
      expect(event.event.metrics.elapsedMs).toBe(100);
    });
  });

  describe('ExecutionDoneEvent', () => {
    it('should include result data and session summary', () => {
      interface MyResult {
        score: number;
      }

      const summary = createMockSessionSummary({
        totalDuration: 2000,
        llmCallCount: 2,
      });

      const event: ExecutionDoneEvent<MyResult> = {
        type: 'execution_done',
        timestamp: Date.now(),
        duration: 2000,
        data: { score: 85 },
        summary,
      };

      expect(event.type).toBe('execution_done');
      expect(event.data.score).toBe(85);
      expect(event.summary.llmCallCount).toBe(2);
    });
  });

  describe('ExecutionErrorEvent', () => {
    it('should include error with optional data and summary', () => {
      const error = new Error('Processing failed');

      const event: ExecutionErrorEvent<{ partialScore: number }> = {
        type: 'execution_error',
        timestamp: Date.now(),
        duration: 1500,
        error,
        data: { partialScore: 50 },
        summary: createMockSessionSummary({ totalDuration: 1500 }),
      };

      expect(event.type).toBe('execution_error');
      expect(event.error.message).toBe('Processing failed');
      expect(event.data?.partialScore).toBe(50);
    });

    it('should work without optional fields', () => {
      const event: ExecutionErrorEvent = {
        type: 'execution_error',
        timestamp: Date.now(),
        duration: 500,
        error: new Error('Early failure'),
      };

      expect(event.data).toBeUndefined();
      expect(event.summary).toBeUndefined();
    });
  });

  describe('LogLevel', () => {
    it('should support all log levels', () => {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

      expect(levels).toContain('debug');
      expect(levels).toContain('info');
      expect(levels).toContain('warn');
      expect(levels).toContain('error');
    });

    it('should work with log() method', () => {
      const logFn = vi.fn();
      const logger = createLogger({ log: logFn });

      logger.log?.('info', 'Test message', { key: 'value' });

      expect(logFn).toHaveBeenCalledWith('info', 'Test message', { key: 'value' });
    });
  });

  describe('Integration patterns', () => {
    it('should work with metrics-collecting logger', () => {
      const metrics = {
        llmCalls: 0,
        totalDuration: 0,
      };

      const metricsLogger = createLogger({
        onLLMCallEnd() {
          metrics.llmCalls++;
        },
        onExecutionDone(event) {
          metrics.totalDuration = event.duration;
        },
      });

      metricsLogger.onLLMCallEnd?.({
        type: 'llm_call_end',
        callType: 'generateText',
        modelId: 'gpt-4',
        timestamp: Date.now(),
        response: { duration: 100, raw: {} },
      });

      metricsLogger.onExecutionDone?.({
        type: 'execution_done',
        timestamp: Date.now(),
        duration: 2000,
        data: { result: 'success' },
        summary: createMockSessionSummary({ totalDuration: 2000 }),
      });

      expect(metrics.llmCalls).toBe(1);
      expect(metrics.totalDuration).toBe(2000);
    });

    it('should work with console logging pattern', () => {
      const logs: string[] = [];

      const consoleLogger = createLogger({
        onLLMCallStart(event) {
          logs.push(`[START] ${event.modelId} ${event.callType}`);
        },
        onLLMCallEnd(event) {
          logs.push(`[END] ${event.modelId} ${event.response.duration}ms`);
        },
      });

      consoleLogger.onLLMCallStart?.({
        type: 'llm_call_start',
        callType: 'generateText',
        modelId: 'gemini-2.5-flash',
        timestamp: Date.now(),
        request: { params: {} },
      });

      consoleLogger.onLLMCallEnd?.({
        type: 'llm_call_end',
        callType: 'generateText',
        modelId: 'gemini-2.5-flash',
        timestamp: Date.now(),
        response: { duration: 1500, raw: {} },
      });

      expect(logs).toEqual([
        '[START] gemini-2.5-flash generateText',
        '[END] gemini-2.5-flash 1500ms',
      ]);
    });
  });
});
