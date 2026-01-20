import { describe, it, expect } from 'vitest';
import type { EventMetrics, LanguageModelUsage, ExecutionMetadata } from './types';
import { createMockUsage } from '@/testing';

describe('Observability Types', () => {
  describe('EventMetrics', () => {
    it('should support first event with deltaMs of 0', () => {
      const firstEvent: EventMetrics = {
        timestamp: 1704067200000,
        elapsedMs: 0,
        deltaMs: 0,
      };

      expect(firstEvent.deltaMs).toBe(0);
      expect(firstEvent.elapsedMs).toBe(0);
    });

    it('should track elapsed and delta independently', () => {
      const events: EventMetrics[] = [
        { timestamp: 1000, elapsedMs: 0, deltaMs: 0 },
        { timestamp: 1100, elapsedMs: 100, deltaMs: 100 },
        { timestamp: 1300, elapsedMs: 300, deltaMs: 200 },
      ];

      expect(events[2].elapsedMs).toBe(300);
      expect(events[2].deltaMs).toBe(200);
    });
  });

  describe('LanguageModelUsage', () => {
    it('should have input, output, and total tokens', () => {
      const usage = createMockUsage({
        inputTokens: 500,
        outputTokens: 200,
        totalTokens: 700,
      });

      expect(usage.inputTokens).toBe(500);
      expect(usage.outputTokens).toBe(200);
      expect(usage.totalTokens).toBe(700);
    });

    it('should support detailed token breakdowns from AI SDK', () => {
      const usage = createMockUsage({
        inputTokens: 500,
        outputTokens: 200,
        totalTokens: 700,
        inputTokenDetails: {
          noCacheTokens: 300,
          cacheReadTokens: 200,
          cacheWriteTokens: undefined,
        },
        outputTokenDetails: {
          textTokens: 150,
          reasoningTokens: 50,
        },
      });

      expect(usage.inputTokenDetails.cacheReadTokens).toBe(200);
      expect(usage.outputTokenDetails.reasoningTokens).toBe(50);
    });
  });

  describe('ExecutionMetadata', () => {
    it('should require duration', () => {
      const metadata: ExecutionMetadata = {
        duration: 1250,
      };

      expect(metadata.duration).toBe(1250);
    });

    it('should allow optional languageModelUsage', () => {
      const withUsage: ExecutionMetadata = {
        duration: 1000,
        languageModelUsage: createMockUsage({
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        }),
      };

      const withoutUsage: ExecutionMetadata = {
        duration: 500,
      };

      expect(withUsage.languageModelUsage?.totalTokens).toBe(150);
      expect(withoutUsage.languageModelUsage).toBeUndefined();
    });

    it('should allow agent-specific custom fields via index signature', () => {
      const metadata: ExecutionMetadata = {
        duration: 1500,
        uploadedFileIds: ['file-123', 'file-456'],
        modelVersion: 'gemini-2.0-pro',
        finishReason: 'stop',
      };

      expect(metadata.uploadedFileIds).toEqual(['file-123', 'file-456']);
      expect(metadata.modelVersion).toBe('gemini-2.0-pro');
      expect(metadata.finishReason).toBe('stop');
    });

    it('should support error case without languageModelUsage', () => {
      const errorMetadata: ExecutionMetadata = {
        duration: 250,
        errorCode: 'STREAM_ERROR',
        lastEventType: 'progress',
      };

      expect(errorMetadata.languageModelUsage).toBeUndefined();
      expect(errorMetadata.errorCode).toBe('STREAM_ERROR');
    });
  });

  describe('Integration patterns', () => {
    it('should work with streaming events that include metrics', () => {
      interface StreamEvent {
        type: string;
        message?: string;
        metrics: EventMetrics;
      }

      const event: StreamEvent = {
        type: 'progress',
        message: 'Processing...',
        metrics: {
          timestamp: Date.now(),
          elapsedMs: 100,
          deltaMs: 100,
        },
      };

      expect(event.type).toBe('progress');
      expect(event.metrics.elapsedMs).toBe(100);
    });

    it('should work with execution result pattern', () => {
      interface ExecutionResult<T> {
        data: T;
        metadata: ExecutionMetadata;
      }

      const result: ExecutionResult<{ score: number }> = {
        data: { score: 85 },
        metadata: {
          duration: 2000,
          languageModelUsage: createMockUsage({
            inputTokens: 1000,
            outputTokens: 500,
            totalTokens: 1500,
          }),
        },
      };

      expect(result.data.score).toBe(85);
      expect(result.metadata.duration).toBe(2000);
    });
  });
});
