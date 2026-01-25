import type { LanguageModel, ToolSet } from 'ai';
import type { EventMetrics } from '@/observability';
import type { Logger } from '@/observability/logger';
import { noopLogger } from '@/observability/logger';
import type { FileManager } from '@/provider/types';
import type { ProviderType, ProviderPricing } from '@/pricing/types';
import type { SessionSummary } from './types';
import { SimpleSession } from './simple-session';
import type { SessionEventInput, EmittableEventInput } from '@/execution/types';

type ProviderOptions = Record<string, Record<string, unknown>>;

export interface StreamingSessionOptions {
  defaultLanguageModel?: LanguageModel | null;
  modelFactory?: (modelId: string) => LanguageModel;
  providerType: ProviderType;
  providerPricing?: ProviderPricing;
  fileManager: FileManager;
  logger?: Logger;
  startTime?: number;
  signal?: AbortSignal;
  defaultProviderOptions?: ProviderOptions;
  defaultTools?: ToolSet;
}

export class StreamingSession<
  TEvent extends { type: string; metrics: EventMetrics },
  TResult,
> extends SimpleSession {
  private lastEventTime: number;

  constructor(options: StreamingSessionOptions) {
    super({
      defaultLanguageModel: options.defaultLanguageModel,
      modelFactory: options.modelFactory,
      providerType: options.providerType,
      providerPricing: options.providerPricing,
      fileManager: options.fileManager,
      logger: options.logger,
      startTime: options.startTime,
      signal: options.signal,
      defaultProviderOptions: options.defaultProviderOptions,
      defaultTools: options.defaultTools,
    });

    this.lastEventTime = this._startTime;

    this._logger.onExecutionStart?.({
      type: 'execution_start',
      timestamp: Date.now(),
    });
  }

  /**
   * Emits a streaming event with automatically attached metrics.
   *
   * Reserved types ('complete', 'error') throw at runtime - use session.done()
   * or session.fail() instead.
   *
   * @param event - The event to emit (metrics will be added automatically)
   * @returns The complete event with metrics attached
   * @throws Error when attempting to emit reserved types ('complete', 'error')
   */
  emit(event: EmittableEventInput<TEvent>): TEvent {
    // Runtime check: prevent reserved types even when TypeScript is bypassed
    const eventType = (event as { type: string }).type;
    if (eventType === 'complete' || eventType === 'error') {
      throw new Error(
        `Cannot emit reserved type "${eventType}". ` +
        'Use session.done() for completion or session.fail() for errors.'
      );
    }

    return this.emitInternal(event as SessionEventInput<TEvent>);
  }

  /**
   * Internal emit method - bypasses reserved type check.
   * Used by done() and fail() to emit terminal events.
   */
  private emitInternal(event: SessionEventInput<TEvent>): TEvent {
    const metrics = this.createMetrics();
    const fullEvent = { ...event, metrics } as TEvent;

    this._logger.onExecutionEmit?.({
      type: 'execution_emit',
      event: fullEvent,
    });

    return fullEvent;
  }

  /**
   * Signals successful completion of the streaming execution.
   * Emits a 'complete' event with the result data and session summary.
   * Also triggers Logger.onExecutionDone for observability.
   * @param data - The final result data
   * @returns The complete event with data and summary
   */
  async done(data: TResult): Promise<TEvent> {
    const summary = await this.getSummary();

    this._logger.onExecutionDone?.({
      type: 'execution_done',
      timestamp: Date.now(),
      duration: summary.totalDuration,
      data,
      summary,
    });

    // Use emitInternal to bypass reserved type check (internal only)
    // Cast required: TypeScript can't know that TEvent includes a 'complete' variant
    return this.emitInternal({
      type: 'complete',
      data,
      summary,
    } as unknown as SessionEventInput<TEvent>);
  }

  /**
   * Signals that the streaming execution failed with an error.
   * Emits an 'error' event and triggers Logger.onExecutionError for observability.
   * Gracefully handles getSummary() failures - summary will be undefined if it fails.
   * @param error - The error that caused the failure
   * @param data - Optional partial result data (if any was produced before failure)
   * @returns The error event
   */
  async fail(error: Error, data?: TResult): Promise<TEvent> {
    let summary: SessionSummary | undefined;
    try {
      summary = await this.getSummary();
    } catch {
      // Ignore summary errors on failure path
    }

    this._logger.onExecutionError?.({
      type: 'execution_error',
      timestamp: Date.now(),
      duration: summary?.totalDuration ?? (Date.now() - this._startTime),
      error,
      data,
      summary,
    });

    const errorEvent: Record<string, unknown> = {
      type: 'error',
      error,
    };

    if (summary) {
      errorEvent.summary = summary;
    }

    if (data !== undefined) {
      errorEvent.data = data;
    }

    // Use emitInternal to bypass reserved type check (internal only)
    // Cast required: TypeScript can't know that TEvent includes an 'error' variant
    return this.emitInternal(errorEvent as unknown as SessionEventInput<TEvent>);
  }

  private createMetrics(): EventMetrics {
    const now = Date.now();
    const metrics: EventMetrics = {
      timestamp: now,
      elapsedMs: now - this._startTime,
      deltaMs: now - this.lastEventTime,
    };
    this.lastEventTime = now;
    return metrics;
  }
}

export interface StreamingSessionInternal<
  TEvent extends { type: string; metrics: EventMetrics },
  TResult,
> {
  generateText: SimpleSession['generateText'];
  streamText: SimpleSession['streamText'];
  fileManager: FileManager;
  onDone: SimpleSession['onDone'];
  record: SimpleSession['record'];
  recordToolCall: SimpleSession['recordToolCall'];

  emit(event: EmittableEventInput<TEvent>): TEvent;
  done(data: TResult): Promise<TEvent>;
  fail(error: Error, data?: TResult): Promise<TEvent>;

  runOnDoneHooks(): Promise<void>;
  getSummary(): Promise<SessionSummary>;
}

export interface CreateStreamingSessionOptions {
  defaultLanguageModel: LanguageModel;
  providerType: ProviderType;
  fileManager: FileManager;
  logger?: Logger;
  startTime?: number;
  signal?: AbortSignal;
}

export function createStreamingSession<
  TEvent extends { type: string; metrics: EventMetrics },
  TResult,
>(
  options: CreateStreamingSessionOptions
): StreamingSessionInternal<TEvent, TResult> {
  const session = new StreamingSession<TEvent, TResult>({
    defaultLanguageModel: options.defaultLanguageModel,
    providerType: options.providerType,
    fileManager: options.fileManager,
    logger: options.logger ?? noopLogger,
    startTime: options.startTime,
    signal: options.signal,
  });

  return session as unknown as StreamingSessionInternal<TEvent, TResult>;
}
