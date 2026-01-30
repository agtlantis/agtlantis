import path from 'node:path';

import { GoogleGenAI } from '@google/genai';
import type { FilePart, ImagePart } from 'ai';

import { FileError, FileErrorCode } from '../../errors';
import { computeFileSourceHash } from '../hash';
import type { FileCache, FileManager, FileManagerOptions, FileSource, UploadedFile } from '../types';

interface GoogleFileUploadResponse {
    name?: string;
    uri?: string;
    mimeType?: string;
}

function assertValidUploadResponse(
    response: GoogleFileUploadResponse,
    context: Record<string, unknown>
): asserts response is Required<GoogleFileUploadResponse> {
    if (!response.name || !response.uri || !response.mimeType) {
        throw new FileError('Invalid upload response from Google API: missing required fields', {
            code: FileErrorCode.UPLOAD_ERROR,
            context: {
                ...context,
                hasName: !!response.name,
                hasUri: !!response.uri,
                hasMediaType: !!response.mimeType,
            },
        });
    }
}

function isImageMediaType(mediaType: string): boolean {
    return mediaType.startsWith('image/');
}

function createPart(uri: string, mediaType: string): FilePart | ImagePart {
    const url = new URL(uri);
    if (isImageMediaType(mediaType)) {
        return { type: 'image', image: url, mediaType: mediaType };
    }
    return { type: 'file', data: url, mediaType: mediaType };
}

/** Google GenAI File API implementation with automatic session cleanup */
export class GoogleFileManager implements FileManager {
    private uploadedFiles: UploadedFile[] = [];
    private client: GoogleGenAI;
    private cache: FileCache | null;

    constructor(apiKey: string, options?: FileManagerOptions) {
        this.client = new GoogleGenAI({ apiKey });
        this.cache = options?.cache ?? null;
    }

    private async uploadOne(fileSource: FileSource, index: number, hash: string): Promise<UploadedFile> {
        if (this.cache) {
            const cached = this.cache.get(hash);
            if (cached) return cached;
        }

        if (fileSource.source === 'url') {
            const mediaType = fileSource.mediaType ?? 'application/octet-stream';
            const result: UploadedFile = {
                id: null,
                part: createPart(fileSource.url, mediaType),
            };
            if (this.cache) {
                this.cache.set(hash, result);
            }
            return result;
        }

        if (fileSource.source === 'path') {
            const fullPath = path.isAbsolute(fileSource.path)
                ? fileSource.path
                : path.resolve(process.cwd(), fileSource.path);

            try {
                const uploaded = await this.client.files.upload({
                    file: fullPath,
                    config: {
                        mimeType: fileSource.mediaType,
                        displayName: fileSource.filename ?? path.basename(fileSource.path),
                    },
                });

                assertValidUploadResponse(uploaded, {
                    source: 'path',
                    path: fileSource.path,
                });

                const result: UploadedFile = {
                    id: uploaded.name,
                    part: createPart(uploaded.uri, uploaded.mimeType),
                };
                if (this.cache) {
                    this.cache.set(hash, result);
                }
                return result;
            } catch (error) {
                if (error instanceof FileError) throw error;
                throw FileError.from(error, FileErrorCode.UPLOAD_ERROR, {
                    source: 'path',
                    path: fileSource.path,
                    mediaType: fileSource.mediaType,
                });
            }
        }

        const buffer =
            fileSource.source === 'base64'
                ? Buffer.from(fileSource.data, 'base64')
                : fileSource.data;

        const arrayBuffer = buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
        ) as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: fileSource.mediaType });

        try {
            const uploaded = await this.client.files.upload({
                file: blob,
                config: {
                    mimeType: fileSource.mediaType,
                    displayName: fileSource.filename ?? `upload-${Date.now()}-${index}`,
                },
            });

            assertValidUploadResponse(uploaded, {
                source: fileSource.source,
                mediaType: fileSource.mediaType,
            });

            const result: UploadedFile = {
                id: uploaded.name,
                part: createPart(uploaded.uri, uploaded.mimeType),
            };
            if (this.cache) {
                this.cache.set(hash, result);
            }
            return result;
        } catch (error) {
            if (error instanceof FileError) throw error;
            throw FileError.from(error, FileErrorCode.UPLOAD_ERROR, {
                source: fileSource.source,
                mediaType: fileSource.mediaType,
                filename: fileSource.filename,
            });
        }
    }

    async upload(files: FileSource[]): Promise<UploadedFile[]> {
        const hashes = await Promise.all(files.map((file) => computeFileSourceHash(file)));

        const results = await Promise.allSettled(
            files.map((file, i) => this.uploadOne(file, i, hashes[i]))
        );

        const successful: Array<{ file: UploadedFile; hash: string }> = [];
        const failed: PromiseRejectedResult[] = [];

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === 'fulfilled') {
                successful.push({ file: result.value, hash: hashes[i] });
            } else {
                failed.push(result);
            }
        }

        if (failed.length > 0) {
            await Promise.all(
                successful
                    .filter(({ file }) => file.id !== null)
                    .map(async ({ file, hash }) => {
                        await this.client.files.delete({ name: file.id! }).catch(() => {});
                        if (this.cache) {
                            this.cache.delete(hash);
                        }
                    })
            );

            const firstError = failed[0].reason;
            throw new FileError(
                `Failed to upload ${failed.length} file(s): ${firstError instanceof Error ? firstError.message : String(firstError)}`,
                {
                    code: FileErrorCode.UPLOAD_ERROR,
                    cause: firstError instanceof Error ? firstError : undefined,
                    context: {
                        totalFiles: files.length,
                        failedCount: failed.length,
                        successCount: successful.length,
                    },
                }
            );
        }

        this.uploadedFiles.push(...successful.filter(({ file }) => file.id !== null).map(({ file }) => file));
        return successful.map(({ file }) => file);
    }

    async delete(fileId: string): Promise<void> {
        try {
            await this.client.files.delete({ name: fileId });
            this.uploadedFiles = this.uploadedFiles.filter((f) => f.id !== fileId);
        } catch (error) {
            throw FileError.from(error, FileErrorCode.DELETE_ERROR, {
                fileId,
            });
        }
    }

    async clear(): Promise<void> {
        await Promise.all(
            this.uploadedFiles
                .filter((f) => f.id !== null)
                .map((f) => this.delete(f.id!).catch(() => {}))
        );
        this.uploadedFiles = [];
    }

    getUploadedFiles(): UploadedFile[] {
        return [...this.uploadedFiles];
    }
}
