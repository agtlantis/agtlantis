import type { LanguageModelUsage } from 'ai';
import type { SessionSummary } from '../session/types';

/**
 * Logger interface for observability.
 * All methods are optional - implement only the events you care about.
 *
 * @example
 * ```typescript
 * const myLogger: Logger = {
 *   onLLMCallEnd(event) {
 *     console.log(`${event.modelId}: ${event.response.duration}ms`);
 *   },
 *   onExecutionDone(event) {
 *     console.log('Total duration:', event.duration);
 *   },
 * };
 * ```
 */
export interface Logger {
  onLLMCallStart?(event: LLMCallStartEvent): void;
  onLLMCallEnd?(event: LLMCallEndEvent): void;
  onExecutionStart?(event: ExecutionStartEvent): void;
  onExecutionEmit?<TEvent>(event: ExecutionEmitEvent<TEvent>): void;
  onExecutionDone?<TResult>(event: ExecutionDoneEvent<TResult>): void;
  onExecutionError?<TResult>(event: ExecutionErrorEvent<TResult>): void;
  log?(level: LogLevel, message: string, data?: Record<string, unknown>): void;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LLMCallLogType = 'generateText' | 'streamText';

/**
 * Event emitted when an LLM call starts.
 *
 * @example
 * ```typescript
 * logger.onLLMCallStart?.({
 *   type: 'llm_call_start',
 *   callType: 'generateText',
 *   modelId: 'gemini-2.5-flash',
 *   timestamp: Date.now(),
 *   request: { params: { prompt: 'Hello' } },
 * });
 * ```
 */
export interface LLMCallStartEvent {
  type: 'llm_call_start';
  callType: LLMCallLogType;
  modelId: string;
  timestamp: number;
  request: {
    params: Record<string, unknown>;
  };
}

/**
 * Event emitted when an LLM call ends (success or error).
 *
 * @example Success case:
 * ```typescript
 * logger.onLLMCallEnd?.({
 *   type: 'llm_call_end',
 *   callType: 'generateText',
 *   modelId: 'gemini-2.5-flash',
 *   timestamp: Date.now(),
 *   response: {
 *     duration: 1500,
 *     usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
 *     raw: result,
 *   },
 * });
 * ```
 *
 * @example Error case:
 * ```typescript
 * logger.onLLMCallEnd?.({
 *   type: 'llm_call_end',
 *   callType: 'streamText',
 *   modelId: 'gpt-4o',
 *   timestamp: Date.now(),
 *   response: {
 *     duration: 500,
 *     error: new Error('Rate limit exceeded'),
 *     raw: null,
 *   },
 * });
 * ```
 */
export interface LLMCallEndEvent {
  type: 'llm_call_end';
  callType: LLMCallLogType;
  modelId: string;
  timestamp: number;
  response: {
    duration: number;
    usage?: LanguageModelUsage;
    raw: unknown;
    error?: Error;
  };
}

export interface ExecutionStartEvent {
  type: 'execution_start';
  timestamp: number;
}

/**
 * Event emitted for each intermediate event during execution.
 * @typeParam TEvent - The type of the emitted event (includes metrics)
 */
export interface ExecutionEmitEvent<TEvent = unknown> {
  type: 'execution_emit';
  event: TEvent;
}

/**
 * Event emitted when execution completes successfully.
 * @typeParam TResult - The type of the execution result
 */
export interface ExecutionDoneEvent<TResult = unknown> {
  type: 'execution_done';
  timestamp: number;
  duration: number;
  data: TResult;
  summary: SessionSummary;
}

/**
 * Event emitted when execution fails with an error.
 * @typeParam TResult - The type of partial result data (if available)
 */
export interface ExecutionErrorEvent<TResult = unknown> {
  type: 'execution_error';
  timestamp: number;
  duration: number;
  error: Error;
  data?: TResult;
  summary?: SessionSummary;
}

/**
 * No-op logger (default when no logger provided).
 *
 * @example
 * ```typescript
 * const provider = createGoogleProvider({
 *   apiKey: 'xxx',
 *   logger: noopLogger,
 * });
 * ```
 */
export const noopLogger: Logger = {};

/**
 * Helper to create a logger with only the handlers you need.
 *
 * @example
 * ```typescript
 * const metricsLogger = createLogger({
 *   onLLMCallEnd(event) {
 *     metrics.recordLatency(event.response.duration);
 *   },
 *   onExecutionDone(event) {
 *     metrics.recordTokens(event.summary.totalLLMUsage.totalTokens);
 *   },
 * });
 * ```
 */
export function createLogger(handlers: Partial<Logger>): Logger {
  return handlers;
}
