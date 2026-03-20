import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { FilePart } from 'ai';

import { FileError, FileErrorCode } from '../../errors/index.js';
import { BaseFileManager } from '../base-file-manager.js';
import { bufferToBlob } from '../file-utils.js';
import type { FileManagerOptions, FileSource, FileSourceUrl, UploadedFile } from '../types.js';

export interface OpenAIFileManagerOptions extends FileManagerOptions {
    baseURL?: string;
    organization?: string;
}

interface FilesAPIResponse {
    id: string;
}

async function resolveFileBlob(
    source: Exclude<FileSource, FileSourceUrl>
): Promise<{ blob: Blob; filename: string }> {
    switch (source.source) {
        case 'path': {
            const fullPath = path.isAbsolute(source.path)
                ? source.path
                : path.resolve(process.cwd(), source.path);
            const buffer = await readFile(fullPath);
            return {
                blob: bufferToBlob(buffer, source.mediaType),
                filename: source.filename ?? path.basename(source.path),
            };
        }
        case 'data': {
            return {
                blob: bufferToBlob(Buffer.from(source.data), source.mediaType),
                filename: source.filename ?? `upload-${Date.now()}`,
            };
        }
        case 'base64': {
            return {
                blob: bufferToBlob(Buffer.from(source.data, 'base64'), source.mediaType),
                filename: source.filename ?? `upload-${Date.now()}`,
            };
        }
    }
}

export class OpenAIFileManager extends BaseFileManager {
    private readonly apiKey: string;
    private readonly baseURL: string;
    private readonly organization: string | undefined;

    constructor(apiKey: string, options?: OpenAIFileManagerOptions) {
        super(options);
        this.apiKey = apiKey;
        this.baseURL = options?.baseURL ?? 'https://api.openai.com/v1';
        this.organization = options?.organization;
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.apiKey}`,
        };
        if (this.organization) {
            headers['OpenAI-Organization'] = this.organization;
        }
        return headers;
    }

    private async uploadToFilesAPI(blob: Blob, filename: string): Promise<string> {
        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('purpose', 'user_data');

        const response = await fetch(`${this.baseURL}/files`, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: formData,
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new FileError(`OpenAI Files API upload failed: ${response.status} ${response.statusText}`, {
                code: FileErrorCode.UPLOAD_ERROR,
                context: { status: response.status, body, filename },
            });
        }

        const data = (await response.json()) as FilesAPIResponse;
        return data.id;
    }

    protected async uploadToProvider(
        source: Exclude<FileSource, FileSourceUrl>,
        index: number
    ): Promise<UploadedFile> {
        const mediaType = source.mediaType ?? 'application/octet-stream';
        try {
            const { blob, filename } = await resolveFileBlob(source);
            const fileId = await this.uploadToFilesAPI(blob, filename);

            // Responses API (@ai-sdk/openai)는 mediaType으로 input_image vs input_file 라우팅.
            // file_id 경로에서 content encoding에는 영향 없음.
            const part: FilePart = {
                type: 'file',
                data: fileId,
                mediaType,
                filename,
            };

            return { id: fileId, part };
        } catch (error) {
            if (error instanceof FileError) throw error;
            throw FileError.from(error, FileErrorCode.UPLOAD_ERROR, {
                source: source.source,
                mediaType,
                index,
            });
        }
    }

    protected async deleteFromProvider(fileId: string): Promise<void> {
        const response = await fetch(`${this.baseURL}/files/${fileId}`, {
            method: 'DELETE',
            headers: this.buildHeaders(),
        });

        if (!response.ok) {
            throw new FileError(`OpenAI Files API delete failed: ${response.status}`, {
                code: FileErrorCode.DELETE_ERROR,
                context: { fileId, status: response.status },
            });
        }
    }
}
