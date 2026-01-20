import type { Task } from 'vitest';
import type { SessionSummary } from '@/session/types';

/**
 * Cost metadata recorded per test for aggregation by CostReporter.
 * Stored in `task.meta.cost` via `recordCostMeta()`.
 */
export interface CostMeta {
  /** Total cost in USD (LLM + additional costs) */
  totalCost: number;
  /** LLM-only cost in USD */
  llmCost: number;
  /** Number of LLM API calls */
  llmCallCount: number;
  /** Cost breakdown by model (e.g., { "google/gemini-2.5-flash": 0.001 }) */
  costByModel: Record<string, number>;
  /** Token usage totals */
  totalTokens: {
    input: number;
    output: number;
  };
}

/**
 * Records cost data from SessionSummary to test metadata.
 * Called in Logger.onExecutionDone when cost tracking is enabled.
 *
 * @param task - Vitest task from test context
 * @param summary - SessionSummary containing cost data
 */
export function recordCostMeta(task: Task, summary: SessionSummary): void {
  const existingCost = getCostMeta(task.meta);

  // Accumulate costs if test has multiple executions
  const cost: CostMeta = existingCost
    ? {
        totalCost: existingCost.totalCost + summary.totalCost,
        llmCost: existingCost.llmCost + summary.llmCost,
        llmCallCount: existingCost.llmCallCount + summary.llmCallCount,
        costByModel: mergeCostByModel(
          existingCost.costByModel,
          summary.costByModel
        ),
        totalTokens: {
          input:
            existingCost.totalTokens.input +
            (summary.totalLLMUsage.inputTokens ?? 0),
          output:
            existingCost.totalTokens.output +
            (summary.totalLLMUsage.outputTokens ?? 0),
        },
      }
    : {
        totalCost: summary.totalCost,
        llmCost: summary.llmCost,
        llmCallCount: summary.llmCallCount,
        costByModel: { ...summary.costByModel },
        totalTokens: {
          input: summary.totalLLMUsage.inputTokens ?? 0,
          output: summary.totalLLMUsage.outputTokens ?? 0,
        },
      };

  task.meta.cost = cost;
}

/**
 * Retrieves cost metadata from test metadata.
 *
 * @param meta - Test metadata object
 * @returns CostMeta if present, undefined otherwise
 */
export function getCostMeta(meta: Record<string, unknown>): CostMeta | undefined {
  return meta.cost as CostMeta | undefined;
}

function mergeCostByModel(
  existing: Record<string, number>,
  incoming: Readonly<Record<string, number>>
): Record<string, number> {
  const merged = { ...existing };
  for (const [model, cost] of Object.entries(incoming)) {
    merged[model] = (merged[model] ?? 0) + cost;
  }
  return merged;
}
