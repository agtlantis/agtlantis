import { describe, it, expect } from 'vitest';
import { defineProgressivePattern } from '@/patterns/progressive';
import {
  describeEachProvider,
  createTestProvider,
  E2E_CONFIG,
} from '@e2e/helpers';
import {
  minimalProgressSchema,
  minimalResultSchema,
  type MinimalProgress,
  type MinimalResult,
} from './fixtures/schemas';

const pattern = defineProgressivePattern({
  progressSchema: minimalProgressSchema,
  resultSchema: minimalResultSchema,
});

describeEachProvider('Progressive Pattern - Edge Cases', (providerType) => {
  it(
    'should handle direct result without progress events',
    async ({ task }) => {
      const provider = createTestProvider(providerType, { task });
      let result: MinimalResult | null = null;
      let progressCount = 0;

      const execution = provider.streamingExecution<
        { type: 'progress'; data: MinimalProgress; metrics: any },
        MinimalResult
      >(async function* (session) {
        yield* pattern.runInSession(session, {
          system:
            'You are a simple assistant. Skip reportProgress entirely and call submitResult immediately with { done: true }.',
          messages: [{ role: 'user', content: 'Just say done.' }],
        });
      });

      for await (const event of execution.stream()) {
        if (event.type === 'progress') {
          progressCount++;
        } else if (event.type === 'complete' && 'data' in event) {
          result = event.data as MinimalResult;
        }
      }

      expect(result).not.toBeNull();
      expect(typeof result!.done).toBe('boolean');
    },
    E2E_CONFIG.progressiveTimeout,
  );

  it(
    'should complete with minimal tool calls',
    async ({ task }) => {
      const provider = createTestProvider(providerType, { task });
      let completed = false;

      const execution = provider.streamingExecution<
        { type: 'progress'; data: MinimalProgress; metrics: any },
        MinimalResult
      >(async function* (session) {
        yield* pattern.runInSession(session, {
          system:
            'Call reportProgress once with { step: 1 }, then call submitResult with { done: true }. Do exactly these two tool calls, nothing more.',
          messages: [{ role: 'user', content: 'Go.' }],
        });
      });

      for await (const event of execution.stream()) {
        if (event.type === 'complete') {
          completed = true;
        }
      }

      expect(completed).toBe(true);
    },
    E2E_CONFIG.progressiveTimeout,
  );
});
