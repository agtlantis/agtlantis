import {
  generateText as aiGenerateText,
  streamText as aiStreamText,
} from 'ai';
import type {
  LanguageModel,
  LanguageModelUsage,
  ToolSet,
} from 'ai';
import merge from 'lodash/merge';
import type { Logger } from '@/observability/logger';
import { noopLogger } from '@/observability/logger';
import type { FileManager } from '@/provider/types';
import type { ProviderType, ProviderPricing } from '@/pricing/types';
import { calculateTotalCost } from '@/pricing/calculator';
import {
  SessionSummary,
  type DefaultOutput,
  type GenerateTextParams,
  type GenerateTextResultTyped,
  type StreamTextParams,
  type StreamTextResultTyped,
  type LLMCallRecord,
  type LLMCallType,
  type ToolCallSummary,
  type OutputSpec,
  type AdditionalCost,
} from './types';
import { mergeUsages, createZeroUsage } from './usage-extractors';

/**
 * Provider-specific options type.
 * Maps provider names (e.g., 'google', 'openai') to their option objects.
 */
type ProviderOptions = Record<string, Record<string, unknown>>;

export interface SimpleSessionOptions {
  defaultLanguageModel?: LanguageModel | null;
  modelFactory?: (modelId: string) => LanguageModel;
  providerType: ProviderType;
  providerPricing?: ProviderPricing;
  fileManager: FileManager;
  logger?: Logger;
  startTime?: number;
  /**
   * AbortSignal for cancelling AI SDK calls.
   * When aborted, ongoing generateText/streamText calls will be cancelled.
   */
  signal?: AbortSignal;
  /**
   * Default provider-specific options to apply to all LLM calls.
   * These will be deep-merged with per-call providerOptions (per-call takes precedence).
   */
  defaultProviderOptions?: ProviderOptions;
  /**
   * Default tools to apply to all LLM calls (e.g., google_search, url_context).
   * These will be merged with per-call tools (per-call takes precedence).
   */
  defaultTools?: ToolSet;
}

export class SimpleSession {
  private readonly defaultLanguageModel: LanguageModel | null;
  private readonly modelFactory: ((modelId: string) => LanguageModel) | null;
  private readonly providerType: ProviderType;
  private readonly providerPricing: ProviderPricing | undefined;
  private readonly defaultProviderOptions: ProviderOptions | undefined;
  private readonly defaultTools: ToolSet | undefined;
  private readonly _fileManager: FileManager;
  private readonly logger: Logger;
  private readonly sessionStartTime: number;
  private readonly signal?: AbortSignal;

  private summary!: SessionSummary;
  private readonly pendingUsagePromises: Promise<LanguageModelUsage | undefined>[] = [];

  private readonly onDoneFns: Array<() => Promise<void> | void> = [];

  constructor(options: SimpleSessionOptions) {
    this.defaultLanguageModel = options.defaultLanguageModel ?? null;
    this.modelFactory = options.modelFactory ?? null;
    this.providerType = options.providerType;
    this.providerPricing = options.providerPricing;
    this.defaultProviderOptions = options.defaultProviderOptions;
    this.defaultTools = options.defaultTools;
    this._fileManager = options.fileManager;
    this.logger = options.logger ?? noopLogger;
    this.sessionStartTime = options.startTime ?? Date.now();
    this.signal = options.signal;
    this.summary = SessionSummary.empty(this.sessionStartTime);
  }

  private getModel(requestedModelId?: string): LanguageModel {
    if (requestedModelId) {
      if (!this.modelFactory) {
        throw new Error(
          `Model '${requestedModelId}' requested but no modelFactory provided. ` +
          `Either use the default model or configure the provider with modelFactory.`
        );
      }
      return this.modelFactory(requestedModelId);
    }

    if (!this.defaultLanguageModel) {
      throw new Error(
        'No model specified and no default model set. ' +
        'Either specify a model in the call or configure the provider with withDefaultModel().'
      );
    }
    return this.defaultLanguageModel;
  }

  private extractModelId(model: LanguageModel): string {
    const modelWithId = model as unknown as { modelId?: string };
    if (!modelWithId.modelId) {
      console.warn(
        '[SimpleSession] Model does not have modelId property, using "unknown". ' +
          'This may affect cost tracking accuracy.'
      );
    }
    return modelWithId.modelId ?? 'unknown';
  }

  async generateText<
    TOOLS extends ToolSet = {},
    OUTPUT extends OutputSpec = DefaultOutput,
  >(
    params: GenerateTextParams<TOOLS, OUTPUT>
  ): Promise<GenerateTextResultTyped<TOOLS, OUTPUT>> {
    const callStartTime = Date.now();
    const { model: requestedModel, providerOptions, tools, ...restParams } = params;
    const languageModel = this.getModel(requestedModel);
    const modelId = this.extractModelId(languageModel);

    // Deep merge default + per-call options (per-call takes precedence)
    const mergedProviderOptions = (this.defaultProviderOptions || providerOptions)
      ? merge({}, this.defaultProviderOptions ?? {}, providerOptions ?? {})
      : undefined;

    // Merge default tools with per-call tools (per-call takes precedence)
    const mergedTools = (this.defaultTools || tools)
      ? { ...this.defaultTools, ...tools }
      : undefined;

    this.logger.onLLMCallStart?.({
      type: 'llm_call_start',
      callType: 'generateText',
      modelId,
      timestamp: callStartTime,
      request: { params: restParams as Record<string, unknown> },
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await aiGenerateText({
        ...restParams,
        tools: mergedTools,
        providerOptions: mergedProviderOptions,
        model: languageModel,
        abortSignal: this.signal,
      } as any);
      const callEndTime = Date.now();

      const call: LLMCallRecord = {
        startTime: callStartTime,
        endTime: callEndTime,
        duration: callEndTime - callStartTime,
        usage: result.usage ?? createZeroUsage(),
        type: 'generateText',
        model: modelId,
        provider: this.providerType,
      };
      this.updateSummaryWithLLMCall(call);

      this.logger.onLLMCallEnd?.({
        type: 'llm_call_end',
        callType: 'generateText',
        modelId,
        timestamp: callEndTime,
        response: {
          duration: callEndTime - callStartTime,
          usage: result.usage,
          raw: result,
        },
      });

      return result as unknown as GenerateTextResultTyped<TOOLS, OUTPUT>;
    } catch (error) {
      const callEndTime = Date.now();

      this.logger.onLLMCallEnd?.({
        type: 'llm_call_end',
        callType: 'generateText',
        modelId,
        timestamp: callEndTime,
        response: {
          duration: callEndTime - callStartTime,
          raw: null,
          error: error instanceof Error ? error : new Error(String(error)),
        },
      });

      throw error;
    }
  }

  streamText<
    TOOLS extends ToolSet = {},
    OUTPUT extends OutputSpec = DefaultOutput,
  >(params: StreamTextParams<TOOLS, OUTPUT>): StreamTextResultTyped<TOOLS, OUTPUT> {
    const callStartTime = Date.now();
    const { model: requestedModel, providerOptions, tools, ...restParams } = params;
    const languageModel = this.getModel(requestedModel);
    const modelId = this.extractModelId(languageModel);

    // Deep merge default + per-call options (per-call takes precedence)
    const mergedProviderOptions = (this.defaultProviderOptions || providerOptions)
      ? merge({}, this.defaultProviderOptions ?? {}, providerOptions ?? {})
      : undefined;

    // Merge default tools with per-call tools (per-call takes precedence)
    const mergedTools = (this.defaultTools || tools)
      ? { ...this.defaultTools, ...tools }
      : undefined;

    this.logger.onLLMCallStart?.({
      type: 'llm_call_start',
      callType: 'streamText',
      modelId,
      timestamp: callStartTime,
      request: { params: restParams as Record<string, unknown> },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = aiStreamText({
      ...restParams,
      tools: mergedTools,
      providerOptions: mergedProviderOptions,
      model: languageModel,
      abortSignal: this.signal,
    } as any);

    const usagePromise = Promise.resolve(result.usage).then((usage) => {
      const callEndTime = Date.now();

      const call: LLMCallRecord = {
        startTime: callStartTime,
        endTime: callEndTime,
        duration: callEndTime - callStartTime,
        usage: usage ?? createZeroUsage(),
        type: 'streamText',
        model: modelId,
        provider: this.providerType,
      };
      this.updateSummaryWithLLMCall(call);

      this.logger.onLLMCallEnd?.({
        type: 'llm_call_end',
        callType: 'streamText',
        modelId,
        timestamp: callEndTime,
        response: {
          duration: callEndTime - callStartTime,
          usage,
          raw: result,
        },
      });

      return usage;
    });

    this.pendingUsagePromises.push(usagePromise);

    return result as unknown as StreamTextResultTyped<TOOLS, OUTPUT>;
  }

  get fileManager(): FileManager {
    return this._fileManager;
  }

  record(data: Record<string, unknown>): void {
    this.summary = this.summary.withCustomRecord(data);
  }

  recordToolCall(toolCallSummary: ToolCallSummary): void {
    this.summary = this.summary.withToolCall(toolCallSummary);
  }

  recordLLMCall(record: Omit<LLMCallRecord, 'type'> & { type?: LLMCallType }): void {
    const call: LLMCallRecord = {
      ...record,
      type: record.type ?? 'manual',
    };
    this.updateSummaryWithLLMCall(call);
  }

  recordAdditionalCost(cost: Omit<AdditionalCost, 'timestamp'>): void {
    this.summary = this.summary.withAdditionalCost({
      ...cost,
      timestamp: Date.now(),
    });
  }

  setMetadata(key: string, value: unknown): void;
  setMetadata(data: Record<string, unknown>): void;
  setMetadata(keyOrData: string | Record<string, unknown>, value?: unknown): void {
    if (typeof keyOrData === 'string') {
      this.summary = this.summary.withMetadata(keyOrData, value);
    } else {
      for (const [k, v] of Object.entries(keyOrData)) {
        this.summary = this.summary.withMetadata(k, v);
      }
    }
  }

  private updateSummaryWithLLMCall(call: LLMCallRecord): void {
    const newCalls = [...this.summary.llmCalls, call];
    const { totalCost: llmCost, costByModel } = calculateTotalCost(
      newCalls.map((c) => ({ usage: c.usage, model: c.model, provider: c.provider })),
      this.providerPricing
    );
    const newTotalUsage = mergeUsages(newCalls.map((c) => c.usage));

    this.summary = this.summary.withLLMCall(call, llmCost, costByModel, newTotalUsage);
  }

  onDone(fn: () => Promise<void> | void): void {
    this.onDoneFns.push(fn);
  }

  async runOnDoneHooks(): Promise<void> {
    const reversedHooks = [...this.onDoneFns].reverse();

    for (const fn of reversedHooks) {
      try {
        await fn();
      } catch (error) {
        console.error('[SimpleSession] onDone hook error:', error);
      }
    }
  }

  async getSummary(): Promise<SessionSummary> {
    await Promise.all(this.pendingUsagePromises);
    return this.summary;
  }

  /**
   * Notifies Logger of execution start.
   * @internal Called by SimpleExecutionHost - not intended for direct use.
   */
  notifyExecutionStart(): void {
    this._logger.onExecutionStart?.({
      type: 'execution_start',
      timestamp: Date.now(),
    });
  }

  /**
   * Notifies Logger of execution completion with result data and summary.
   * @param data - The execution result data
   * @param startTime - Execution start timestamp for duration calculation
   * @internal Called by SimpleExecutionHost - not intended for direct use.
   */
  async notifyExecutionDone<T>(data: T, startTime: number): Promise<void> {
    const summary = await this.getSummary();
    this._logger.onExecutionDone?.({
      type: 'execution_done',
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      data,
      summary,
    });
  }

  /**
   * Notifies Logger of execution error with error details and summary (if available).
   * Gracefully handles getSummary() failures - summary will be undefined if it fails.
   * @param error - The error that occurred
   * @param startTime - Execution start timestamp for duration calculation
   * @internal Called by SimpleExecutionHost - not intended for direct use.
   */
  async notifyExecutionError(error: Error, startTime: number): Promise<void> {
    let summary: SessionSummary | undefined;
    try {
      summary = await this.getSummary();
    } catch {
      // Ignore summary errors on failure path
    }
    this._logger.onExecutionError?.({
      type: 'execution_error',
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      error,
      summary,
    });
  }

  protected get _logger(): Logger {
    return this.logger;
  }

  protected get _startTime(): number {
    return this.sessionStartTime;
  }

  protected get _modelId(): string {
    if (!this.defaultLanguageModel) {
      return 'unknown';
    }
    return this.extractModelId(this.defaultLanguageModel);
  }
}
