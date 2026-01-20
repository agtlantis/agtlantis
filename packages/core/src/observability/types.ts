import type { LanguageModelUsage } from 'ai';

/**
 * Timing metrics attached to each streaming event.
 * Enables performance monitoring and latency debugging.
 *
 * @example
 * ```typescript
 * const event = {
 *   type: 'progress',
 *   message: 'Processing...',
 *   metrics: {
 *     timestamp: Date.now(),
 *     elapsedMs: 150,
 *     deltaMs: 50,
 *   },
 * };
 * ```
 */
export interface EventMetrics {
    timestamp: number;
    elapsedMs: number;
    deltaMs: number;
}

export type { LanguageModelUsage } from 'ai';

/**
 * Metadata collected during agent execution.
 * Available after execution completes via `getSummary()`.
 *
 * @example
 * ```typescript
 * const metadata: ExecutionMetadata = {
 *   duration: 1250,
 *   usage: {
 *     inputTokens: 500,
 *     outputTokens: 200,
 *     totalTokens: 700,
 *   },
 * };
 * ```
 */
export interface ExecutionMetadata {
    duration: number;
    languageModelUsage?: LanguageModelUsage;
    [key: string]: unknown;
}
