import type { FilePart, ImagePart, ToolSet } from 'ai';

import type {
    EmittableEventInput,
    ExecutionOptions,
    SimpleExecution,
    StreamingExecution,
} from '@/execution';
import type { EventMetrics } from '@/observability';
import type { Logger } from '@/observability/logger';
import type { ProviderPricing } from '@/pricing';
import { SimpleSession, StreamingSession } from '@/session';
import type {
    GenerateTextParams,
    GenerateTextResultTyped,
    OutputSpec,
    StreamTextParams,
    StreamTextResultTyped,
    ToolCallSummary,
} from '@/session';

type DefaultOutput = OutputSpec<string, string>;

/** Result of uploading a file to a provider's file storage */
export interface UploadedFile {
    /** Unique identifier from the provider (used for deletion, null for external URLs) */
    id: string | null;
    /** AI SDK part ready for use in prompts */
    part: FilePart | ImagePart;
}

/** Provider-agnostic file manager interface for upload/delete operations */
export interface FileManager {
    upload(files: FileSource[]): Promise<UploadedFile[]>;
    delete(fileId: string): Promise<void>;
    clear(): Promise<void>;
    getUploadedFiles(): UploadedFile[];
}

/** Cache for uploaded files to prevent duplicate uploads */
export interface FileCache {
    get(hash: string): UploadedFile | null;
    set(hash: string, file: UploadedFile, ttl?: number): void;
    delete(hash: string): void;
    clear(): void;
}

export interface FileManagerOptions {
    cache?: FileCache;
}

export interface FileSourcePath {
    source: 'path';
    path: string;
    mediaType?: string;
    filename?: string;
    hash?: string;
}

export interface FileSourceData {
    source: 'data';
    data: Buffer | Uint8Array;
    mediaType: string;
    filename?: string;
    hash?: string;
}

export interface FileSourceBase64 {
    source: 'base64';
    data: string;
    mediaType: string;
    filename?: string;
    hash?: string;
}

export interface FileSourceUrl {
    source: 'url';
    url: string;
    mediaType?: string;
    filename?: string;
    hash?: string;
}

/** Union of all file part types. Use `source` to discriminate. */
export type FileSource = FileSourcePath | FileSourceData | FileSourceBase64 | FileSourceUrl;

const FILE_SOURCE_TYPES = new Set(['path', 'data', 'base64', 'url']);

export function isFileSource(v: unknown): v is FileSource {
    return (
        typeof v === 'object' &&
        v !== null &&
        FILE_SOURCE_TYPES.has((v as Record<string, unknown>).source as string)
    );
}

export function isFileSourcePath(v: FileSource): v is FileSourcePath {
    return v.source === 'path';
}

export function isFileSourceData(v: FileSource): v is FileSourceData {
    return v.source === 'data';
}

export function isFileSourceBase64(v: FileSource): v is FileSourceBase64 {
    return v.source === 'base64';
}

export function isFileSourceUrl(v: FileSource): v is FileSourceUrl {
    return v.source === 'url';
}

/** Provider interface with fluent configuration for AI model operations */
export interface Provider {
    withDefaultModel(modelId: string): Provider;
    withLogger(logger: Logger): Provider;
    withPricing(pricing: ProviderPricing): Provider;
    /**
     * Set default provider-specific options for all LLM calls.
     * These options will be deep-merged with per-call providerOptions.
     * The actual options type depends on the provider (Google, OpenAI, etc.).
     */
    withDefaultOptions(options: Record<string, unknown>): Provider;

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
