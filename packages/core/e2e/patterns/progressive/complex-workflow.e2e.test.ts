import { describe, it, expect } from 'vitest';
import { defineProgressivePattern } from '@/patterns/progressive';
import {
  describeEachProvider,
  createTestProvider,
  E2E_CONFIG,
} from '@e2e/helpers';
import {
  complexProgressSchema,
  complexResultSchema,
  type ComplexProgress,
  type ComplexResult,
} from './fixtures/schemas';

const pattern = defineProgressivePattern({
  progressSchema: complexProgressSchema,
  resultSchema: complexResultSchema,
});

const TEST_DOCUMENT = `
# Q3 2024 Business Report - TechCorp Inc.

## Executive Summary
TechCorp Inc. achieved significant growth in Q3 2024. Revenue increased by 23% compared to Q2.
CEO John Smith announced expansion plans for the Asian market.

## Key Metrics
- Revenue: $45M (up from $36.5M)
- Active Users: 2.3M (up 15%)
- Employee Count: 450 (up from 380)

## Strategic Initiatives
1. Partnership with GlobalTech announced on September 15, 2024
2. New Tokyo office opening planned for Q1 2025
3. AI-powered product line launch scheduled for November 2024

## Risks and Challenges
- Supply chain disruptions in European markets
- Increased competition from StartupXYZ
- Regulatory changes in data privacy (GDPR updates)

## Recommendations
- Accelerate Asian market entry
- Invest in supply chain diversification
- Strengthen data privacy compliance team
`;

describeEachProvider(
  'Progressive Pattern - Complex Workflow',
  (providerType) => {
    it(
      'should process multi-phase document analysis',
      async ({ task }) => {
        const provider = createTestProvider(providerType, { task });

        const progressByPhase: Record<string, ComplexProgress[]> = {
          scanning: [],
          extracting: [],
          analyzing: [],
          summarizing: [],
        };
        let result: ComplexResult | null = null;

        const execution = provider.streamingExecution<
          { type: 'progress'; data: ComplexProgress; metrics: any },
          ComplexResult
        >(async function* (session) {
          yield* pattern.runInSession(session, {
            system: `You are a professional business document analyst.

Your task is to analyze the provided document through multiple phases using tool calls:

1. **Scanning Phase**: Call reportProgress with { phase: "scanning", currentPage: N, totalPages: M, status: "..." }
2. **Extracting Phase**: Call reportProgress with { phase: "extracting", entityType: "person"|"organization"|"date", entities: [...], confidence: 0.8 }
3. **Analyzing Phase**: Call reportProgress with { phase: "analyzing", aspect: "...", finding: "...", importance: "high"|"medium"|"low" }
4. **Summarizing Phase**: Call reportProgress with { phase: "summarizing", section: "...", progress: 0-100 }

After calling reportProgress multiple times for different phases, call submitResult with the complete analysis.

IMPORTANT: Call reportProgress for EACH phase before submitting the final result.`,
            messages: [
              {
                role: 'user',
                content: `Please analyze this business document:\n\n${TEST_DOCUMENT}`,
              },
            ],
          });
        });

        for await (const event of execution.stream()) {
          if (event.type === 'progress' && 'data' in event) {
            const progress = event.data as ComplexProgress;
            progressByPhase[progress.phase]?.push(progress);
          } else if (event.type === 'complete' && 'data' in event) {
            result = event.data as ComplexResult;
          }
        }

        expect(result).not.toBeNull();
        expect(result!.title).toBeTruthy();
        expect(result!.summary).toBeTruthy();

        expect(result!.keyEntities).toBeDefined();
        expect(Array.isArray(result!.keyEntities.people)).toBe(true);
        expect(Array.isArray(result!.keyEntities.organizations)).toBe(true);
        expect(Array.isArray(result!.findings)).toBe(true);
        expect(Array.isArray(result!.recommendations)).toBe(true);
        expect(['positive', 'neutral', 'negative', 'mixed']).toContain(
          result!.overallAssessment,
        );

        for (const scanEvent of progressByPhase.scanning) {
          expect(scanEvent.phase).toBe('scanning');
          expect(typeof scanEvent.currentPage).toBe('number');
          expect(typeof scanEvent.totalPages).toBe('number');
        }

        for (const extractEvent of progressByPhase.extracting) {
          expect(extractEvent.phase).toBe('extracting');
          expect([
            'person',
            'organization',
            'date',
            'location',
            'concept',
          ]).toContain(extractEvent.entityType);
          expect(Array.isArray(extractEvent.entities)).toBe(true);
        }

        for (const analyzeEvent of progressByPhase.analyzing) {
          expect(analyzeEvent.phase).toBe('analyzing');
          expect(typeof analyzeEvent.finding).toBe('string');
          expect(['low', 'medium', 'high', 'critical']).toContain(
            analyzeEvent.importance,
          );
        }

        for (const summarizeEvent of progressByPhase.summarizing) {
          expect(summarizeEvent.phase).toBe('summarizing');
          expect(typeof summarizeEvent.progress).toBe('number');
        }
      },
      E2E_CONFIG.progressiveTimeout * 2,
    );
  },
);
