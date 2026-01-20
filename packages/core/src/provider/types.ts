import type {
    GenerateTextParams,
    StreamTextParams,
    SessionSummary,
    ToolCallSummary,
} from '../session';
import type { StreamingExecution, SimpleExecution, ExecutionOptions, SessionEventInput } from '../execution';
import type { EventMetrics } from '@/observability';
import type { ProviderPricing } from '@/pricing';
import type { ToolSet } from 'ai';
import type { OutputSpec, GenerateTextResultTyped, StreamTextResultTyped } from '../session/types';

type DefaultOutput = OutputSpec<string, string>;

/** Result of uploading a file to a provider's file storage */
export interface UploadedFile {
    /** Unique identifier from the provider (used for deletion) */
    id: string;
    /** URI to reference the file in subsequent API calls */
    uri: string;
    /** MIME type of the uploaded file */
    mimeType: string;
    /** Display name or original filename */
    name: string;
    /**
     * Whether this file is an external URL reference (not uploaded to provider storage).
     * External files are not tracked for cleanup - they're passed directly to LLM.
     */
    isExternal?: boolean;
}

/** Provider-agnostic file manager interface for upload/delete operations */
export interface FileManager {
    upload(files: FilePart[]): Promise<UploadedFile[]>;
    delete(fileId: string): Promise<void>;
    clear(): Promise<void>;
    getUploadedFiles(): UploadedFile[];
}

export interface FilePartPath {
    type: 'file';
    source: 'path';
    path: string;
    mediaType?: string;
    filename?: string;
}

export interface FilePartData {
    type: 'file';
    source: 'data';
    data: Buffer | Uint8Array;
    mediaType: string;
    filename?: string;
}

export interface FilePartBase64 {
    type: 'file';
    source: 'base64';
    data: string;
    mediaType: string;
    filename?: string;
}

export interface FilePartUrl {
    type: 'file';
    source: 'url';
    url: string;
    mediaType?: string;
    filename?: string;
}

/** Union of all file part types. Use `source` to discriminate. */
export type FilePart = FilePartPath | FilePartData | FilePartBase64 | FilePartUrl;

export function isFilePart(v: unknown): v is FilePart {
    return (
        typeof v === 'object' &&
        v !== null &&
        (v as Record<string, unknown>).type === 'file' &&
        typeof (v as Record<string, unknown>).source === 'string'
    );
}

export function isFilePartPath(v: FilePart): v is FilePartPath {
    return v.source === 'path';
}

export function isFilePartData(v: FilePart): v is FilePartData {
    return v.source === 'data';
}

export function isFilePartBase64(v: FilePart): v is FilePartBase64 {
    return v.source === 'base64';
}

export function isFilePartUrl(v: FilePart): v is FilePartUrl {
    return v.source === 'url';
}

import type { Logger } from '@/observability/logger';

/** Provider interface with fluent configuration for AI model operations */
export interface Provider {
    withDefaultModel(modelId: string): Provider;
    withLogger(logger: Logger): Provider;
    withPricing(pricing: ProviderPricing): Provider;

    streamingExecution<TEvent extends { type: string; metrics: EventMetrics }, TResult>(
        generator: (
            session: StreamingSession<TEvent, TResult>
        ) => AsyncGenerator<TEvent, TEvent | Promise<TEvent>>,
        options?: ExecutionOptions
    ): StreamingExecution<TEvent, TResult>;

    /**
     * Execute a non-streaming function with the provider.
     * Returns immediately (sync) - execution starts in the background.
     *
     * Breaking change: Previously returned Promise<Execution<TResult>>.
     * Now returns SimpleExecution<TResult> directly (no await needed).
     *
     * @example
     * ```typescript
     * // Before (v1.x):
     * const execution = provider.simpleExecution(fn);
     *
     * // After (v2.x):
     * const execution = provider.simpleExecution(fn);
     * execution.cancel(); // Can cancel in-progress LLM calls
     * const result = await execution.toResult();
     * ```
     */
    simpleExecution<TResult>(
        fn: (session: SimpleSession) => Promise<TResult>,
        options?: ExecutionOptions
    ): SimpleExecution<TResult>;
}

/** Session interface for streaming executions with AI SDK wrappers and stream control */
export interface StreamingSession<TEvent extends { type: string; metrics: EventMetrics }, TResult> {
    generateText<TOOLS extends ToolSet = {}, OUTPUT extends OutputSpec = DefaultOutput>(
        params: GenerateTextParams<TOOLS, OUTPUT>
    ): Promise<GenerateTextResultTyped<TOOLS, OUTPUT>>;

    streamText<TOOLS extends ToolSet = {}, OUTPUT extends OutputSpec = DefaultOutput>(
        params: StreamTextParams<TOOLS, OUTPUT>
    ): StreamTextResultTyped<TOOLS, OUTPUT>;

    readonly fileManager: FileManager;

    /** Register cleanup function (LIFO order) */
    onDone(fn: () => Promise<void> | void): void;

    /** Emit intermediate event with auto-added metrics */
    emit(event: SessionEventInput<TEvent>): TEvent;

    /** Signal successful completion */
    done(data: TResult): Promise<TEvent>;

    /** Signal failure with optional partial result */
    fail(error: Error, data?: TResult): Promise<TEvent>;

    record(data: Record<string, unknown>): void;
    recordToolCall(summary: ToolCallSummary): void;
}

/** Session interface for non-streaming executions */
export interface SimpleSession {
    generateText<TOOLS extends ToolSet = {}, OUTPUT extends OutputSpec = DefaultOutput>(
        params: GenerateTextParams<TOOLS, OUTPUT>
    ): Promise<GenerateTextResultTyped<TOOLS, OUTPUT>>;

    streamText<TOOLS extends ToolSet = {}, OUTPUT extends OutputSpec = DefaultOutput>(
        params: StreamTextParams<TOOLS, OUTPUT>
    ): StreamTextResultTyped<TOOLS, OUTPUT>;

    readonly fileManager: FileManager;
    onDone(fn: () => Promise<void> | void): void;
    record(data: Record<string, unknown>): void;
    recordToolCall(summary: ToolCallSummary): void;
}
