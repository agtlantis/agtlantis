import { z } from 'zod';

export const simpleProgressSchema = z.object({
  status: z.string(),
  message: z.string(),
});

export const simpleResultSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
});

export type SimpleProgress = z.infer<typeof simpleProgressSchema>;
export type SimpleResult = z.infer<typeof simpleResultSchema>;

export const multiStageProgressSchema = z.discriminatedUnion('stage', [
  z.object({
    stage: z.literal('thinking'),
    thought: z.string(),
  }),
  z.object({
    stage: z.literal('researching'),
    topic: z.string(),
    sources: z.array(z.string()),
  }),
  z.object({
    stage: z.literal('writing'),
    section: z.string(),
    progress: z.number().min(0).max(100),
  }),
]);

export const multiStageResultSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
});

export type MultiStageProgress = z.infer<typeof multiStageProgressSchema>;
export type MultiStageResult = z.infer<typeof multiStageResultSchema>;

export const minimalProgressSchema = z.object({
  step: z.number(),
});

export const minimalResultSchema = z.object({
  done: z.boolean(),
});

export type MinimalProgress = z.infer<typeof minimalProgressSchema>;
export type MinimalResult = z.infer<typeof minimalResultSchema>;

export const complexProgressSchema = z.discriminatedUnion('phase', [
  z.object({
    phase: z.literal('scanning'),
    currentPage: z.number(),
    totalPages: z.number(),
    status: z.string(),
  }),
  z.object({
    phase: z.literal('extracting'),
    entityType: z.enum([
      'person',
      'organization',
      'date',
      'location',
      'concept',
    ]),
    entities: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    phase: z.literal('analyzing'),
    aspect: z.string(),
    finding: z.string(),
    importance: z.enum(['low', 'medium', 'high', 'critical']),
  }),
  z.object({
    phase: z.literal('summarizing'),
    section: z.string(),
    progress: z.number().min(0).max(100),
  }),
]);

export const complexResultSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyEntities: z.object({
    people: z.array(z.string()),
    organizations: z.array(z.string()),
    dates: z.array(z.string()),
  }),
  findings: z.array(
    z.object({
      aspect: z.string(),
      description: z.string(),
      importance: z.enum(['low', 'medium', 'high', 'critical']),
    }),
  ),
  recommendations: z.array(z.string()),
  overallAssessment: z.enum(['positive', 'neutral', 'negative', 'mixed']),
});

export type ComplexProgress = z.infer<typeof complexProgressSchema>;
export type ComplexResult = z.infer<typeof complexResultSchema>;
