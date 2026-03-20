import path from 'node:path';

import { GoogleGenAI } from '@google/genai';

import { FileError, FileErrorCode } from '../../errors/index.js';
import { BaseFileManager } from '../base-file-manager.js';
import { bufferToBlob, createPartFromURI } from '../file-utils.js';
import type { FileManagerOptions, FileSource, FileSourceUrl, UploadedFile } from '../types.js';

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

/** Google GenAI File API implementation with automatic session cleanup */
export class GoogleFileManager extends BaseFileManager {
    private client: GoogleGenAI;

    constructor(apiKey: string, options?: FileManagerOptions) {
        super(options);
        this.client = new GoogleGenAI({ apiKey });
    }

    protected async uploadToProvider(
        source: Exclude<FileSource, FileSourceUrl>,
        index: number
    ): Promise<UploadedFile> {
        if (source.source === 'path') {
            const fullPath = path.isAbsolute(source.path)
                ? source.path
                : path.resolve(process.cwd(), source.path);

            try {
                const uploaded = await this.client.files.upload({
                    file: fullPath,
                    config: {
                        mimeType: source.mediaType,
                        displayName: source.filename ?? path.basename(source.path),
                    },
                });

                assertValidUploadResponse(uploaded, {
                    source: 'path',
                    path: source.path,
                });

                return {
                    id: uploaded.name,
                    part: createPartFromURI(uploaded.uri, uploaded.mimeType),
                };
            } catch (error) {
                if (error instanceof FileError) throw error;
                throw FileError.from(error, FileErrorCode.UPLOAD_ERROR, {
                    source: 'path',
                    path: source.path,
                    mediaType: source.mediaType,
                });
            }
        }

        const buffer =
            source.source === 'base64'
                ? Buffer.from(source.data, 'base64')
                : source.data;

        const blob = bufferToBlob(buffer, source.mediaType);

        try {
            const uploaded = await this.client.files.upload({
                file: blob,
                config: {
                    mimeType: source.mediaType,
                    displayName: source.filename ?? `upload-${Date.now()}-${index}`,
                },
            });

            assertValidUploadResponse(uploaded, {
                source: source.source,
                mediaType: source.mediaType,
            });

            return {
                id: uploaded.name,
                part: createPartFromURI(uploaded.uri, uploaded.mimeType),
            };
        } catch (error) {
            if (error instanceof FileError) throw error;
            throw FileError.from(error, FileErrorCode.UPLOAD_ERROR, {
                source: source.source,
                mediaType: source.mediaType,
                filename: source.filename,
            });
        }
    }

    protected async deleteFromProvider(fileId: string): Promise<void> {
        await this.client.files.delete({ name: fileId });
    }
}
