import { FileError, FileErrorCode } from '../errors/index.js';
import { createPartFromURI } from './file-utils.js';
import { computeFileSourceHash } from './hash.js';
import type { FileCache, FileManager, FileManagerOptions, FileSource, FileSourceUrl, UploadedFile } from './types.js';

export abstract class BaseFileManager implements FileManager {
    private uploadedFiles: UploadedFile[] = [];
    private readonly cache: FileCache | null;

    constructor(options?: FileManagerOptions) {
        this.cache = options?.cache ?? null;
    }

    protected abstract uploadToProvider(
        source: Exclude<FileSource, FileSourceUrl>,
        index: number
    ): Promise<UploadedFile>;

    protected abstract deleteFromProvider(fileId: string): Promise<void>;

    private async processOne(source: FileSource, index: number, hash: string): Promise<UploadedFile> {
        if (this.cache) {
            const cached = this.cache.get(hash);
            if (cached) return cached;
        }

        if (source.source === 'url') {
            const mediaType = source.mediaType ?? 'application/octet-stream';
            const result: UploadedFile = {
                id: null,
                part: createPartFromURI(source.url, mediaType),
            };
            if (this.cache) {
                this.cache.set(hash, result);
            }
            return result;
        }

        const result = await this.uploadToProvider(source, index);
        if (this.cache) {
            this.cache.set(hash, result);
        }
        return result;
    }

    async upload(files: FileSource[]): Promise<UploadedFile[]> {
        const hashes = await Promise.all(files.map((file) => computeFileSourceHash(file)));

        const results = await Promise.allSettled(
            files.map((file, i) => this.processOne(file, i, hashes[i]))
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
                        await this.deleteFromProvider(file.id!).catch(() => {});
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
            await this.deleteFromProvider(fileId);
            this.uploadedFiles = this.uploadedFiles.filter((f) => f.id !== fileId);
        } catch (error) {
            if (error instanceof FileError) throw error;
            throw FileError.from(error, FileErrorCode.DELETE_ERROR, { fileId });
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
