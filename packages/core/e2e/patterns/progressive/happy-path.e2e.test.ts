import { describe, it, expect } from 'vitest';
import { defineProgressivePattern } from '@/patterns/progressive';
import {
  describeEachProvider,
  createTestProvider,
  E2E_CONFIG,
} from '@e2e/helpers';
import {
  simpleProgressSchema,
  simpleResultSchema,
  type SimpleProgress,
  type SimpleResult,
} from './fixtures/schemas';

const pattern = defineProgressivePattern({
  progressSchema: simpleProgressSchema,
  resultSchema: simpleResultSchema,
});

describeEachProvider('Progressive Pattern - Happy Path', (providerType) => {
  it(
    'should stream progress events and return a result',
    async ({ task }) => {
      const provider = createTestProvider(providerType, { task });
      const collectedEvents: Array<{ type: string; data?: unknown }> = [];

      const execution = provider.streamingExecution<
        { type: 'progress'; data: SimpleProgress; metrics: any },
        SimpleResult
      >(async function* (session) {
        yield* pattern.runInSession(session, {
          system: `You are a helpful assistant. IMPORTANT: Follow these steps EXACTLY:

Step 1: Call reportProgress with { status: "thinking", message: "calculating" }
Step 2: Call submitResult with { answer: "4", confidence: 1 }

You MUST call reportProgress once, then call submitResult once. Do not skip steps.`,
          messages: [{ role: 'user', content: 'What is 2 + 2? Be brief.' }],
        });
      });

      for await (const event of execution) {
        collectedEvents.push({
          type: event.type,
          data: 'data' in event ? event.data : undefined,
        });
      }

      expect(collectedEvents.length).toBeGreaterThanOrEqual(1);

      const lastEvent = collectedEvents[collectedEvents.length - 1];
      expect(lastEvent.type).toBe('complete');
      expect(lastEvent.data).toBeDefined();

      const result = lastEvent.data as SimpleResult;
      expect(typeof result.answer).toBe('string');
      expect(result.answer.length).toBeGreaterThan(0);
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    },
    E2E_CONFIG.progressiveTimeout,
  );

  it(
    'should emit progress events with correct structure',
    async ({ task }) => {
      const provider = createTestProvider(providerType, { task });
      const progressEvents: SimpleProgress[] = [];

      const execution = provider.streamingExecution<
        { type: 'progress'; data: SimpleProgress; metrics: any },
        SimpleResult
      >(async function* (session) {
        yield* pattern.runInSession(session, {
          system: `You are a helpful assistant. IMPORTANT: Follow these steps EXACTLY in order:

Step 1: Call reportProgress with { status: "counting", message: "1" }
Step 2: Call reportProgress with { status: "counting", message: "2, 3" }
Step 3: Call submitResult with { answer: "1, 2, 3", confidence: 1 }

You MUST call reportProgress exactly 2 times, then call submitResult once. Do not skip steps.`,
          messages: [{ role: 'user', content: 'Count from 1 to 3.' }],
        });
      });

      for await (const event of execution) {
        if (event.type === 'progress' && 'data' in event) {
          progressEvents.push(event.data as SimpleProgress);
        }
      }

      for (const progress of progressEvents) {
        expect(typeof progress.status).toBe('string');
        expect(typeof progress.message).toBe('string');
      }
    },
    E2E_CONFIG.progressiveTimeout,
  );
});
