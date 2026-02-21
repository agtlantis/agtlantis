/**
 * Session module types for @agtlantis/core.
 * Provides interfaces for tracking LLM calls, tool calls, and session summaries.
 */

import type {
  CallSettings,
  LanguageModelUsage,
  generateText as aiGenerateText,
  streamText as aiStreamText,
  generateObject as aiGenerateObject,
  GenerateTextResult,
  StreamTextResult,
  ToolSet,
} from 'ai';

import type { ExecutionMetadata } from '@/observability/types';
import type { ProviderType } from '@/pricing/types';
import { createZeroUsage } from './usage-extractors';

/**
 * Standard AI SDK generation parameters that can be set as defaults at the Provider level.
 * Per-call parameters override these defaults via simple spread merge.
 */
export type GenerationOptions = Pick<
    CallSettings,
    | 'maxOutputTokens'
    | 'temperature'
    | 'topP'
    | 'topK'
    | 'presencePenalty'
    | 'frequencyPenalty'
    | 'stopSequences'
    | 'seed'
>;

/**
 * Structural interface matching AI SDK's internal Output<OUTPUT, PARTIAL>.
 *
 * AI SDK exports `output as Output` (runtime value), not the interface directly.
 * We define this compatible interface to enable structural typing.
 *
 * CRITICAL: Method signatures MUST exactly match AI SDK's internal interface
 * for generic type inference to work.
 *
 * @see AI SDK source: node_modules/ai/dist/index.d.ts lines 572-596
 */
export interface OutputSpec<OUTPUT = unknown, PARTIAL = unknown> {
  responseFormat: PromiseLike<unknown>;

  parseCompleteOutput(
    options: { text: string },
    context: { response: unknown; usage: unknown; finishReason: unknown }
  ): Promise<OUTPUT>;

  parsePartialOutput(options: { text: string }): Promise<{ partial: PARTIAL } | undefined>;
}

export type DefaultOutput = OutputSpec<string, string>;

export type InferOutputComplete<T> = T extends OutputSpec<infer O, unknown> ? O : string;

export type GenerateTextResultTyped<
  TOOLS extends ToolSet,
  OUTPUT extends OutputSpec,
> = Awaited<ReturnType<typeof aiGenerateText<TOOLS>>> & {
  output: InferOutputComplete<OUTPUT> | undefined;
};

export type StreamTextResultTyped<
  TOOLS extends ToolSet,
  OUTPUT extends OutputSpec,
> = ReturnType<typeof aiStreamText<TOOLS>> & {
  output: Promise<InferOutputComplete<OUTPUT> | undefined>;
};

/**
 * Parameters for session.generateText().
 * Mirrors AI SDK's generateText() with 'model' excluded (injected by session).
 */
export type GenerateTextParams<
  TOOLS extends ToolSet = {},
  OUTPUT extends OutputSpec = DefaultOutput,
> = Omit<Parameters<typeof aiGenerateText<TOOLS>>[0], 'model' | 'output'> & {
  model?: string;
  output?: OUTPUT;
};

export type { GenerateTextResult };

/**
 * Parameters for session.streamText().
 * Mirrors AI SDK's streamText() with 'model' excluded (injected by session).
 */
export type StreamTextParams<
  TOOLS extends ToolSet = {},
  OUTPUT extends OutputSpec = DefaultOutput,
> = Omit<Parameters<typeof aiStreamText<TOOLS>>[0], 'model' | 'output'> & {
  model?: string;
  output?: OUTPUT;
};

export type { StreamTextResult };

/**
 * @deprecated Use generateText with Output.object instead
 */
export type GenerateObjectParams = Omit<Parameters<typeof aiGenerateObject>[0], 'model'>;

export type { ToolSet };

export interface ToolCallSummary {
  name: string;
  duration?: number;
  success: boolean;
  error?: string;
}

export type LLMCallType = 'generateText' | 'streamText' | 'generateObject' | 'manual';

export interface LLMCallRecord {
  startTime: number;
  endTime: number;
  duration: number;
  usage: LanguageModelUsage;
  type: LLMCallType;
  model: string;
  provider: ProviderType;
}

/**
 * Aggregated summary of all activity within an execution session.
 * Used for cost tracking, performance analysis, and metadata reporting.
 */
export interface AdditionalCost {
  type: string;
  cost: number;
  label?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Internal data structure for SessionSummary constructor.
 */
interface SessionSummaryData {
  totalLLMUsage: LanguageModelUsage;
  llmCalls: LLMCallRecord[];
  toolCalls: ToolCallSummary[];
  customRecords: Record<string, unknown>[];
  llmCost: number;
  additionalCosts: AdditionalCost[];
  metadata: Record<string, unknown>;
  costByModel: Record<string, number>;
}

/**
 * Aggregated summary of all activity within an execution session.
 * Used for cost tracking, performance analysis, and metadata reporting.
 *
 * This is an immutable Value Object. All mutation methods return new instances.
 */
export class SessionSummary {
  readonly totalLLMUsage: LanguageModelUsage;
  readonly llmCallCount: number;
  readonly llmCalls: readonly LLMCallRecord[];
  readonly toolCalls: readonly ToolCallSummary[];
  readonly customRecords: readonly Record<string, unknown>[];
  readonly llmCost: number;
  readonly additionalCosts: readonly AdditionalCost[];
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Cost breakdown by model. Key format: `${provider}/${model}` */
  readonly costByModel: Readonly<Record<string, number>>;

  private readonly startTime: number;

  private constructor(data: SessionSummaryData, startTime: number) {
    this.startTime = startTime;
    this.totalLLMUsage = data.totalLLMUsage;
    this.llmCallCount = data.llmCalls.length;
    this.llmCalls = Object.freeze([...data.llmCalls]);
    this.toolCalls = Object.freeze([...data.toolCalls]);
    this.customRecords = Object.freeze([...data.customRecords]);
    this.llmCost = data.llmCost;
    this.additionalCosts = Object.freeze([...data.additionalCosts]);
    this.metadata = Object.freeze({ ...data.metadata });
    this.costByModel = Object.freeze({ ...data.costByModel });
  }

  /**
   * Total duration from session start to now (computed dynamically).
   */
  get totalDuration(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Creates an empty SessionSummary.
   */
  static empty(startTime: number): SessionSummary {
    return new SessionSummary(
      {
        totalLLMUsage: createZeroUsage(),
        llmCalls: [],
        toolCalls: [],
        customRecords: [],
        llmCost: 0,
        additionalCosts: [],
        metadata: {},
        costByModel: {},
      },
      startTime
    );
  }

  /**
   * Creates a SessionSummary with custom data for testing purposes.
   * @internal For testing only - do not use in production code.
   */
  static forTest(data: Partial<SessionSummaryData> & { startTime?: number }): SessionSummary {
    const startTime = data.startTime ?? Date.now() - 1000;
    return new SessionSummary(
      {
        totalLLMUsage: data.totalLLMUsage ?? createZeroUsage(),
        llmCalls: data.llmCalls ?? [],
        toolCalls: data.toolCalls ?? [],
        customRecords: data.customRecords ?? [],
        llmCost: data.llmCost ?? 0,
        additionalCosts: data.additionalCosts ?? [],
        metadata: data.metadata ?? {},
        costByModel: data.costByModel ?? {},
      },
      startTime
    );
  }

  /**
   * Total cost of all additional (non-LLM) operations.
   */
  get totalAdditionalCost(): number {
    return this.additionalCosts.reduce((sum, c) => sum + c.cost, 0);
  }

  /**
   * Total cost including LLM and additional costs.
   */
  get totalCost(): number {
    return this.llmCost + this.totalAdditionalCost;
  }

  /**
   * Returns a new SessionSummary with an LLM call added.
   */
  withLLMCall(
    call: LLMCallRecord,
    newLlmCost: number,
    newCostByModel: Record<string, number>,
    newTotalUsage: LanguageModelUsage
  ): SessionSummary {
    return new SessionSummary(
      {
        totalLLMUsage: newTotalUsage,
        llmCalls: [...this.llmCalls, call],
        toolCalls: [...this.toolCalls],
        customRecords: [...this.customRecords],
        llmCost: newLlmCost,
        additionalCosts: [...this.additionalCosts],
        metadata: { ...this.metadata },
        costByModel: newCostByModel,
      },
      this.startTime
    );
  }

  /**
   * Returns a new SessionSummary with an additional cost recorded.
   */
  withAdditionalCost(cost: AdditionalCost): SessionSummary {
    return new SessionSummary(
      {
        totalLLMUsage: this.totalLLMUsage,
        llmCalls: [...this.llmCalls],
        toolCalls: [...this.toolCalls],
        customRecords: [...this.customRecords],
        llmCost: this.llmCost,
        additionalCosts: [...this.additionalCosts, cost],
        metadata: { ...this.metadata },
        costByModel: { ...this.costByModel },
      },
      this.startTime
    );
  }

  /**
   * Returns a new SessionSummary with metadata updated.
   */
  withMetadata(key: string, value: unknown): SessionSummary {
    return new SessionSummary(
      {
        totalLLMUsage: this.totalLLMUsage,
        llmCalls: [...this.llmCalls],
        toolCalls: [...this.toolCalls],
        customRecords: [...this.customRecords],
        llmCost: this.llmCost,
        additionalCosts: [...this.additionalCosts],
        metadata: { ...this.metadata, [key]: value },
        costByModel: { ...this.costByModel },
      },
      this.startTime
    );
  }

  /**
   * Returns a new SessionSummary with a tool call added.
   */
  withToolCall(call: ToolCallSummary): SessionSummary {
    return new SessionSummary(
      {
        totalLLMUsage: this.totalLLMUsage,
        llmCalls: [...this.llmCalls],
        toolCalls: [...this.toolCalls, call],
        customRecords: [...this.customRecords],
        llmCost: this.llmCost,
        additionalCosts: [...this.additionalCosts],
        metadata: { ...this.metadata },
        costByModel: { ...this.costByModel },
      },
      this.startTime
    );
  }

  /**
   * Returns a new SessionSummary with a custom record added.
   */
  withCustomRecord(record: Record<string, unknown>): SessionSummary {
    return new SessionSummary(
      {
        totalLLMUsage: this.totalLLMUsage,
        llmCalls: [...this.llmCalls],
        toolCalls: [...this.toolCalls],
        customRecords: [...this.customRecords, record],
        llmCost: this.llmCost,
        additionalCosts: [...this.additionalCosts],
        metadata: { ...this.metadata },
        costByModel: { ...this.costByModel },
      },
      this.startTime
    );
  }

  /**
   * Serializes to plain JSON object for database storage.
   */
  toJSON(): SessionSummaryJSON {
    return {
      totalDuration: this.totalDuration,
      totalLLMUsage: this.totalLLMUsage,
      llmCallCount: this.llmCallCount,
      llmCalls: [...this.llmCalls],
      toolCalls: [...this.toolCalls],
      customRecords: [...this.customRecords],
      llmCost: this.llmCost,
      additionalCosts: [...this.additionalCosts],
      metadata: { ...this.metadata },
      costByModel: { ...this.costByModel },
      totalCost: this.totalCost,
      totalAdditionalCost: this.totalAdditionalCost,
    };
  }
}

/**
 * JSON representation of SessionSummary for database storage.
 */
export interface SessionSummaryJSON {
  totalDuration: number;
  totalLLMUsage: LanguageModelUsage;
  llmCallCount: number;
  llmCalls: LLMCallRecord[];
  toolCalls: ToolCallSummary[];
  customRecords: Record<string, unknown>[];
  llmCost: number;
  additionalCosts: AdditionalCost[];
  metadata: Record<string, unknown>;
  costByModel: Record<string, number>;
  totalCost: number;
  totalAdditionalCost: number;
}

/**
 * Session for tracking LLM calls, tool calls, and custom records.
 * Provides AI SDK wrappers with auto-tracking and manual recording methods.
 */
export interface ExecutionSession {
  generateText(params: GenerateTextParams): Promise<Awaited<ReturnType<typeof aiGenerateText>>>;
  streamText(params: StreamTextParams): ReturnType<typeof aiStreamText>;
  generateObject<T>(
    params: GenerateObjectParams & { schema: import('zod').ZodType<T> }
  ): Promise<Awaited<ReturnType<typeof aiGenerateObject>>>;

  recordToolCall(summary: ToolCallSummary): void;
  recordLLMCall(record: Omit<LLMCallRecord, 'type'> & { type?: LLMCallType }): void;
  record(data: Record<string, unknown>): void;

  recordAdditionalCost(cost: Omit<AdditionalCost, 'timestamp'>): void;
  setMetadata(key: string, value: unknown): void;
  setMetadata(data: Record<string, unknown>): void;

  summary(): Promise<SessionSummary>;
}

/**
 * Metadata passed to done() and fail() in StreamGeneratorControl.
 * Union of SessionSummary and ExecutionMetadata for flexible usage.
 */
export type DoneMetadata = SessionSummary | ExecutionMetadata;
