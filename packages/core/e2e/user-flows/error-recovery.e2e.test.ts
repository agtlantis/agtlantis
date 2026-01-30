import { describe, it, expect } from 'vitest';
import {
  describeEachProvider,
  createInvalidTestProvider,
  E2E_CONFIG,
} from '@e2e/helpers';
import { createLogger } from '@/observability/logger';
import { ExecutionError, ExecutionErrorCode } from '@/errors';
import type { ExecutionErrorEvent } from '@/observability';

describeEachProvider('Error Recovery', (providerType) => {
  describe('Provider Error', () => {
    it(
      'should throw error with proper structure for invalid API key',
      async () => {
        const invalidProvider = createInvalidTestProvider(providerType);

        const execution = invalidProvider.simpleExecution(async (session) => {
          return session.generateText({ prompt: 'Hello' });
        });

        const result = await execution.result();

        expect(result.status).toBe('failed');
        if (result.status === 'failed') {
          expect(result.error).toBeInstanceOf(Error);
          expect(result.error.name).toBeTruthy();
          expect(result.error.message).toBeTruthy();

          const message = result.error.message.toLowerCase();
          const isAuthError =
            message.includes('api key') ||
            message.includes('invalid') ||
            message.includes('auth') ||
            message.includes('unauthorized') ||
            message.includes('401');
          expect(isAuthError).toBe(true);
        }
      },
      E2E_CONFIG.timeout,
    );

    it(
      'should capture error via onExecutionError in streaming mode',
      async () => {
        let errorEvent: ExecutionErrorEvent | null = null;

        const logger = createLogger({
          onExecutionError: (event) => {
            errorEvent = event;
          },
        });

        const invalidProvider =
          createInvalidTestProvider(providerType).withLogger(logger);

        const execution = invalidProvider.streamingExecution<
          { type: string; error?: Error },
          string
        >(async function* (session) {
          const result = await session.generateText({ prompt: 'Hello' });
          return session.done(result.text);
        });

        const events: Array<{ type: string; error?: Error }> = [];
        for await (const event of execution.stream()) {
          events.push(event);
        }

        expect(events.length).toBeGreaterThan(0);

        const lastEvent = events[events.length - 1];
        expect(lastEvent.type).toBe('error');
        expect(lastEvent.error).toBeInstanceOf(Error);

        expect(errorEvent).not.toBeNull();
        expect(errorEvent!.type).toBe('execution_error');
        expect(errorEvent!.error).toBeInstanceOf(Error);
      },
      E2E_CONFIG.timeout,
    );
  });

  describe('Cleanup on Error', () => {
    it(
      'should call onExecutionError even when execution fails',
      async () => {
        let executionStarted = false;
        let executionErrored = false;
        let errorDuration = -1;

        const logger = createLogger({
          onExecutionStart: () => {
            executionStarted = true;
          },
          onExecutionError: (event) => {
            executionErrored = true;
            errorDuration = event.duration;
          },
        });

        const invalidProvider =
          createInvalidTestProvider(providerType).withLogger(logger);

        const execution = invalidProvider.streamingExecution<
          { type: string },
          string
        >(async function* (session) {
          const result = await session.generateText({ prompt: 'Hello' });
          return session.done(result.text);
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _event of execution.stream()) {
          // Consume stream to trigger execution lifecycle
        }

        expect(executionStarted).toBe(true);
        expect(executionErrored).toBe(true);
        expect(errorDuration).toBeGreaterThanOrEqual(0);
      },
      E2E_CONFIG.timeout,
    );
  });
});

describe('Error Recovery - Error Class API', () => {
  describe('ExecutionError', () => {
    it('should wrap errors with ExecutionError.from() preserving context', () => {
      const originalError = new Error('Something went wrong');

      const executionError = ExecutionError.from(
        originalError,
        ExecutionErrorCode.EXECUTION_ERROR,
        { operation: 'test', attempt: 1 },
      );

      expect(executionError).toBeInstanceOf(ExecutionError);
      expect(executionError.name).toBe('ExecutionError');
      expect(executionError.code).toBe(ExecutionErrorCode.EXECUTION_ERROR);
      expect(executionError.message).toBe('Something went wrong');
      expect(executionError.cause).toBe(originalError);
      expect(executionError.context).toEqual({ operation: 'test', attempt: 1 });
    });

    it('should preserve existing ExecutionError when using from()', () => {
      const existingError = new ExecutionError('Stream failed', {
        code: ExecutionErrorCode.STREAM_ERROR,
        context: { streamId: 'abc123' },
      });

      const wrapped = ExecutionError.from(
        existingError,
        ExecutionErrorCode.EXECUTION_ERROR,
        { extra: 'ignored' },
      );

      expect(wrapped).toBe(existingError);
      expect(wrapped.code).toBe(ExecutionErrorCode.STREAM_ERROR);
      expect(wrapped.context).toEqual({ streamId: 'abc123' });
    });
  });

});
