import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { FileError, FileErrorCode } from '../../errors/index.js';
import { BaseFileManager } from '../base-file-manager.js';
import { bufferToBlob, isImageMediaType } from '../file-utils.js';
import { createAnthropicFileIdMarker } from './middleware.js';

import type { FilePart, ImagePart } from 'ai';
import type { FileManagerOptions, FileSource, FileSourceUrl, UploadedFile } from '../types.js';

export const ANTHROPIC_FILES_API_BETA = 'files-api-2025-04-14';
export const ANTHROPIC_API_VERSION = '2023-06-01';
// Default soft cap for inline (base64) attachments before routing through the Files API.
// Mirrors Anthropic's documented PDF/image inline guidance (~5MB request payload) — tune per workload.
export const DEFAULT_ANTHROPIC_INLINE_MAX_BYTES = 5 * 1024 * 1024;

export type AnthropicFileManagerStrategy = 'auto' | 'inline-only' | 'files-api-only';

export interface AnthropicFileManagerOptions extends FileManagerOptions {
    baseURL?: string;
    version?: string;
    filesBeta?: string;
    strategy?: AnthropicFileManagerStrategy;
    inlineMaxBytes?: number;
    fetch?: typeof fetch;
}

interface FilesAPIResponse {
    id?: string;
}

interface ResolvedFile {
    bytes: Uint8Array;
    blob: Blob;
    filename: string;
    mediaType: string;
}

async function resolveFile(source: Exclude<FileSource, FileSourceUrl>, index: number): Promise<ResolvedFile> {
    const mediaType = source.mediaType ?? 'application/octet-stream';

    switch (source.source) {
        case 'path': {
            const fullPath = path.isAbsolute(source.path)
                ? source.path
                : path.resolve(process.cwd(), source.path);
            const bytes = await readFile(fullPath);
            return {
                bytes,
                blob: bufferToBlob(bytes, mediaType),
                filename: source.filename ?? path.basename(source.path),
                mediaType,
            };
        }
        case 'data': {
            const bytes = source.data;
            return {
                bytes,
                blob: bufferToBlob(bytes, mediaType),
                filename: source.filename ?? `upload-${Date.now()}-${index}`,
                mediaType,
            };
        }
        case 'base64': {
            const bytes = Buffer.from(source.data, 'base64');
            return {
                bytes,
                blob: bufferToBlob(bytes, mediaType),
                filename: source.filename ?? `upload-${Date.now()}-${index}`,
                mediaType,
            };
        }
    }
}

function createInlinePart(file: ResolvedFile): FilePart | ImagePart {
    if (isImageMediaType(file.mediaType)) {
        return {
            type: 'image',
            image: file.bytes,
            mediaType: file.mediaType,
        };
    }

    return {
        type: 'file',
        data: file.bytes,
        mediaType: file.mediaType,
        filename: file.filename,
    };
}

function createFileIdPart(fileId: string, file: ResolvedFile): FilePart {
    return {
        type: 'file',
        data: createAnthropicFileIdMarker(fileId),
        mediaType: file.mediaType,
        filename: file.filename,
    };
}

function shouldUseInline(file: ResolvedFile, strategy: AnthropicFileManagerStrategy, inlineMaxBytes: number): boolean {
    switch (strategy) {
        case 'inline-only':
            return true;
        case 'files-api-only':
            return false;
        case 'auto':
            return file.bytes.byteLength <= inlineMaxBytes;
    }
}

export class AnthropicFileManager extends BaseFileManager {
    private readonly apiKey: string;
    private readonly baseURL: string;
    private readonly version: string;
    private readonly filesBeta: string;
    private readonly strategy: AnthropicFileManagerStrategy;
    private readonly inlineMaxBytes: number;
    private readonly fetchImpl: typeof fetch;

    constructor(apiKey: string, options?: AnthropicFileManagerOptions) {
        super(options);
        this.apiKey = apiKey;
        this.baseURL = options?.baseURL ?? 'https://api.anthropic.com/v1';
        this.version = options?.version ?? ANTHROPIC_API_VERSION;
        this.filesBeta = options?.filesBeta ?? ANTHROPIC_FILES_API_BETA;
        this.strategy = options?.strategy ?? 'auto';
        this.inlineMaxBytes = options?.inlineMaxBytes ?? DEFAULT_ANTHROPIC_INLINE_MAX_BYTES;
        this.fetchImpl = options?.fetch ?? fetch;
    }

    private buildHeaders(): Record<string, string> {
        return {
            'x-api-key': this.apiKey,
            'anthropic-version': this.version,
            'anthropic-beta': this.filesBeta,
        };
    }

    private async uploadToFilesAPI(file: ResolvedFile): Promise<string> {
        const formData = new FormData();
        formData.append('file', file.blob, file.filename);

        const response = await this.fetchImpl(`${this.baseURL}/files`, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: formData,
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new FileError(`Anthropic Files API upload failed: ${response.status} ${response.statusText}`, {
                code: FileErrorCode.UPLOAD_ERROR,
                context: {
                    status: response.status,
                    body,
                    filename: file.filename,
                    mediaType: file.mediaType,
                },
            });
        }

        const data = (await response.json()) as FilesAPIResponse;
        if (!data.id) {
            throw new FileError('Anthropic Files API upload failed: missing file id', {
                code: FileErrorCode.UPLOAD_ERROR,
                context: {
                    filename: file.filename,
                    mediaType: file.mediaType,
                    response: data,
                },
            });
        }

        return data.id;
    }

    protected async uploadToProvider(
        source: Exclude<FileSource, FileSourceUrl>,
        index: number
    ): Promise<UploadedFile> {
        try {
            const file = await resolveFile(source, index);

            if (shouldUseInline(file, this.strategy, this.inlineMaxBytes)) {
                return {
                    id: null,
                    part: createInlinePart(file),
                };
            }

            const fileId = await this.uploadToFilesAPI(file);
            return {
                id: fileId,
                part: createFileIdPart(fileId, file),
            };
        } catch (error) {
            if (error instanceof FileError) throw error;
            throw FileError.from(error, FileErrorCode.UPLOAD_ERROR, {
                source: source.source,
                mediaType: source.mediaType ?? 'application/octet-stream',
                index,
            });
        }
    }

    protected async deleteFromProvider(fileId: string): Promise<void> {
        const response = await this.fetchImpl(`${this.baseURL}/files/${fileId}`, {
            method: 'DELETE',
            headers: this.buildHeaders(),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new FileError(`Anthropic Files API delete failed: ${response.status}`, {
                code: FileErrorCode.DELETE_ERROR,
                context: { fileId, status: response.status, body },
            });
        }
    }
}
