import type { Provider } from '@agtlantis/core';

import type { AgentPrompt, EvalTestResult, ImproverMetadata } from '@/core/types';

export interface AggregatedMetrics {
    avgLatencyMs: number;
    totalTokens: number;
    totalEstimatedCost?: number;
}

/**
 * Pure data interface - use utility functions for operations.
 *
 * @example
 * ```typescript
 * for (const suggestion of report.suggestions) {
 *   console.log(suggestionDiff(suggestion))
 *   console.log(suggestionPreview(suggestion))
 *   suggestion.approved = true
 * }
 *
 * const newPrompt = applyPromptSuggestions(agent.prompt, report.suggestions)
 * ```
 */
export interface Suggestion {
    type: 'system_prompt' | 'user_prompt' | 'parameters';
    priority: 'high' | 'medium' | 'low';
    currentValue: string;
    suggestedValue: string;
    reasoning: string;
    expectedImprovement: string;
    approved?: boolean;
    modified?: boolean;
}

export interface ImproveResult {
    suggestions: Suggestion[];
    metadata?: ImproverMetadata;
}

export interface ImproverContext {
    agentPrompt: AgentPrompt<any>;
    evaluatedResults: EvalTestResult<any, any>[];
    aggregatedMetrics: AggregatedMetrics;
}

export interface ImproverPrompt {
    id: string;
    version: string;
    system: string;
    renderUserPrompt: (context: ImproverContext) => string;
}

export interface ImproverConfig {
    provider: Provider;
    prompt?: ImproverPrompt;
    /** Model name for cost tracking (e.g., 'gpt-4o', 'gemini-2.5-flash') */
    model?: string;
}

export interface Improver {
    improve(
        agentPrompt: AgentPrompt<any>,
        results: EvalTestResult<any, any>[]
    ): Promise<ImproveResult>;
}
