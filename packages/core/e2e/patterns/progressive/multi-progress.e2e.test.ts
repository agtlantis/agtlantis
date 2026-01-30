import { describe, it, expect } from 'vitest';
import { defineProgressivePattern } from '@/patterns/progressive';
import {
  describeEachProvider,
  createTestProvider,
  E2E_CONFIG,
} from '@e2e/helpers';
import {
  multiStageProgressSchema,
  multiStageResultSchema,
  type MultiStageProgress,
  type MultiStageResult,
} from './fixtures/schemas';

const pattern = defineProgressivePattern({
  progressSchema: multiStageProgressSchema,
  resultSchema: multiStageResultSchema,
});

describeEachProvider('Progressive Pattern - Multi-Stage', (providerType) => {
  it(
    'should handle discriminatedUnion progress schemas',
    async ({ task }) => {
      const provider = createTestProvider(providerType, { task });
      const progressEvents: MultiStageProgress[] = [];
      let result: MultiStageResult | null = null;

      const execution = provider.streamingExecution<
        { type: 'progress'; data: MultiStageProgress; metrics: any },
        MultiStageResult
      >(async function* (session) {
        yield* pattern.runInSession(session, {
          system: `You are a research assistant. IMPORTANT: Follow these steps EXACTLY in order:

Step 1: Call reportProgress with { stage: "thinking", thought: "..." }
Step 2: Call reportProgress with { stage: "researching", topic: "TypeScript", sources: ["docs"] }
Step 3: Call reportProgress with { stage: "writing", section: "intro", progress: 100 }
Step 4: Call submitResult with { title: "...", summary: "...", keyPoints: ["point1"] }

You MUST call reportProgress exactly 3 times (once per stage), then call submitResult once. Do not skip steps.`,
          messages: [
            {
              role: 'user',
              content: 'Tell me about TypeScript briefly.',
            },
          ],
        });
      });

      for await (const event of execution.stream()) {
        if (event.type === 'progress' && 'data' in event) {
          progressEvents.push(event.data as MultiStageProgress);
        } else if (event.type === 'complete' && 'data' in event) {
          result = event.data as MultiStageResult;
        }
      }

      expect(result).not.toBeNull();
      expect(typeof result!.title).toBe('string');
      expect(typeof result!.summary).toBe('string');
      expect(Array.isArray(result!.keyPoints)).toBe(true);

      for (const progress of progressEvents) {
        expect(['thinking', 'researching', 'writing']).toContain(progress.stage);

        switch (progress.stage) {
          case 'thinking':
            expect(typeof progress.thought).toBe('string');
            break;
          case 'researching':
            expect(typeof progress.topic).toBe('string');
            expect(Array.isArray(progress.sources)).toBe(true);
            break;
          case 'writing':
            expect(typeof progress.section).toBe('string');
            expect(typeof progress.progress).toBe('number');
            break;
        }
      }
    },
    E2E_CONFIG.progressiveTimeout,
  );
});
