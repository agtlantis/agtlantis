import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileError, FileErrorCode } from '../../errors';
import type { FileCache, FileSource, UploadedFile } from '../types';
import { GoogleFileManager } from './file-manager';

// Mock hash computation to avoid file system access in tests
vi.mock('../hash', () => ({
    computeFileSourceHash: vi.fn().mockImplementation(async (source) => {
        if (source.hash) return source.hash;
        if (source.source === 'url') return `url-hash-${source.url}`;
        if (source.source === 'path') return `path-hash-${source.path}`;
        if (source.source === 'data') return `data-hash-${Buffer.from(source.data).toString('hex').slice(0, 16)}`;
        if (source.source === 'base64') return `base64-hash-${source.data.slice(0, 16)}`;
        return 'unknown-hash';
    }),
}));

// Mock @google/genai (Vitest 4.x requires function keyword for constructor mocks)
vi.mock('@google/genai', () => ({
    GoogleGenAI: vi.fn(function () {
        return {
            files: {
                upload: vi.fn(),
                delete: vi.fn(),
            },
        };
    }),
}));

describe('GoogleFileManager', () => {
    let fileManager: GoogleFileManager;
    let mockUpload: ReturnType<typeof vi.fn>;
    let mockDelete: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();

        // Create new instance with mocked client
        fileManager = new GoogleFileManager('test-api-key');

        // Get mock functions from the mocked client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = (fileManager as any).client;
        mockUpload = client.files.upload;
        mockDelete = client.files.delete;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('upload', () => {
        it('should upload path source files', async () => {
            const mockResponse = {
                name: 'files/abc123',
                uri: 'https://storage.example.com/abc123',
                mimeType: 'application/pdf',
            };
            mockUpload.mockResolvedValue(mockResponse);

            const files: FileSource[] = [
                {
                    source: 'path',
                    path: '/test/doc.pdf',
                    mediaType: 'application/pdf',
                },
            ];

            const result = await fileManager.upload(files);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('files/abc123');
            expect(result[0].part.type).toBe('file');
            expect((result[0].part as { data: URL }).data.href).toBe(
                'https://storage.example.com/abc123'
            );
            expect(result[0].part.mediaType).toBe('application/pdf');
            expect(mockUpload).toHaveBeenCalledOnce();
        });

        it('should handle URL source without uploading', async () => {
            const files: FileSource[] = [
                {
                    source: 'url',
                    url: 'https://example.com/file.pdf',
                    mediaType: 'application/pdf',
                    filename: 'remote-file.pdf',
                },
            ];

            const result = await fileManager.upload(files);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBeNull();
            expect(result[0].part.type).toBe('file');
            expect((result[0].part as { data: URL }).data.href).toBe(
                'https://example.com/file.pdf'
            );
            expect(result[0].part.mediaType).toBe('application/pdf');
            expect(mockUpload).not.toHaveBeenCalled();
        });

        it('should upload data source files', async () => {
            const mockResponse = {
                name: 'files/data123',
                uri: 'https://storage.example.com/data123',
                mimeType: 'text/plain',
            };
            mockUpload.mockResolvedValue(mockResponse);

            const files: FileSource[] = [
                {
                    source: 'data',
                    data: Buffer.from('test content'),
                    mediaType: 'text/plain',
                },
            ];

            const result = await fileManager.upload(files);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('files/data123');
            expect(mockUpload).toHaveBeenCalledOnce();
        });

        it('should upload base64 source files as ImagePart for images', async () => {
            const mockResponse = {
                name: 'files/base64-123',
                uri: 'https://storage.example.com/base64-123',
                mimeType: 'image/png',
            };
            mockUpload.mockResolvedValue(mockResponse);

            const files: FileSource[] = [
                {
                    source: 'base64',
                    data: Buffer.from('test image data').toString('base64'),
                    mediaType: 'image/png',
                },
            ];

            const result = await fileManager.upload(files);

            expect(result).toHaveLength(1);
            expect(result[0].part.type).toBe('image');
            expect(result[0].part.mediaType).toBe('image/png');
            expect(mockUpload).toHaveBeenCalledOnce();
        });

        it('should upload multiple files in parallel', async () => {
            mockUpload
                .mockResolvedValueOnce({
                    name: 'files/1',
                    uri: 'https://storage.example.com/1',
                    mimeType: 'text/plain',
                })
                .mockResolvedValueOnce({
                    name: 'files/2',
                    uri: 'https://storage.example.com/2',
                    mimeType: 'text/plain',
                });

            const files: FileSource[] = [
                { source: 'path', path: '/test/file1.txt' },
                { source: 'path', path: '/test/file2.txt' },
            ];

            const result = await fileManager.upload(files);

            expect(result).toHaveLength(2);
            expect(mockUpload).toHaveBeenCalledTimes(2);
        });

        it('should throw FileError on upload failure', async () => {
            mockUpload.mockRejectedValue(new Error('Network error'));

            const files: FileSource[] = [{ source: 'path', path: '/test/doc.pdf' }];

            await expect(fileManager.upload(files)).rejects.toThrow(FileError);
            await expect(fileManager.upload(files)).rejects.toMatchObject({
                code: FileErrorCode.UPLOAD_ERROR,
            });
        });

        it('should rollback successful uploads on partial failure', async () => {
            mockUpload
                .mockResolvedValueOnce({
                    name: 'files/success1',
                    uri: 'https://storage.example.com/1',
                    mimeType: 'text/plain',
                })
                .mockRejectedValueOnce(new Error('Second file failed'));

            mockDelete.mockResolvedValue(undefined);

            const files: FileSource[] = [
                { source: 'path', path: '/test/file1.txt' },
                { source: 'path', path: '/test/file2.txt' },
            ];

            await expect(fileManager.upload(files)).rejects.toThrow(FileError);

            // Should have attempted to delete the successful upload
            expect(mockDelete).toHaveBeenCalledWith({ name: 'files/success1' });
        });

        it('should not track URL sources in uploadedFiles', async () => {
            const files: FileSource[] = [{ source: 'url', url: 'https://example.com/file.pdf' }];

            await fileManager.upload(files);

            // URL sources should not be tracked (they're external with id: null)
            expect(fileManager.getUploadedFiles()).toHaveLength(0);
        });

        it('should track non-URL uploads in uploadedFiles', async () => {
            mockUpload.mockResolvedValue({
                name: 'files/tracked',
                uri: 'https://storage.example.com/tracked',
                mimeType: 'text/plain',
            });

            const files: FileSource[] = [{ source: 'path', path: '/test/file.txt' }];

            await fileManager.upload(files);

            expect(fileManager.getUploadedFiles()).toHaveLength(1);
            expect(fileManager.getUploadedFiles()[0].id).toBe('files/tracked');
        });
    });

    describe('delete', () => {
        it('should delete a file by ID', async () => {
            // First upload a file
            mockUpload.mockResolvedValue({
                name: 'files/to-delete',
                uri: 'https://storage.example.com/to-delete',
                mimeType: 'text/plain',
            });
            mockDelete.mockResolvedValue(undefined);

            await fileManager.upload([{ source: 'path', path: '/test/file.txt' }]);

            expect(fileManager.getUploadedFiles()).toHaveLength(1);

            await fileManager.delete('files/to-delete');

            expect(mockDelete).toHaveBeenCalledWith({ name: 'files/to-delete' });
            expect(fileManager.getUploadedFiles()).toHaveLength(0);
        });

        it('should throw FileError on delete failure', async () => {
            mockDelete.mockRejectedValue(new Error('Delete failed'));

            await expect(fileManager.delete('files/nonexistent')).rejects.toThrow(FileError);
            await expect(fileManager.delete('files/nonexistent')).rejects.toMatchObject({
                code: FileErrorCode.DELETE_ERROR,
            });
        });
    });

    describe('clear', () => {
        it('should clear all uploaded files', async () => {
            // Upload some files
            mockUpload
                .mockResolvedValueOnce({
                    name: 'files/1',
                    uri: 'https://storage.example.com/1',
                    mimeType: 'text/plain',
                })
                .mockResolvedValueOnce({
                    name: 'files/2',
                    uri: 'https://storage.example.com/2',
                    mimeType: 'text/plain',
                });
            mockDelete.mockResolvedValue(undefined);

            await fileManager.upload([
                { source: 'path', path: '/test/file1.txt' },
                { source: 'path', path: '/test/file2.txt' },
            ]);

            expect(fileManager.getUploadedFiles()).toHaveLength(2);

            await fileManager.clear();

            expect(fileManager.getUploadedFiles()).toHaveLength(0);
            expect(mockDelete).toHaveBeenCalledTimes(2);
        });

        it('should silently ignore delete errors during clear', async () => {
            mockUpload.mockResolvedValue({
                name: 'files/error',
                uri: 'https://storage.example.com/error',
                mimeType: 'text/plain',
            });
            mockDelete.mockRejectedValue(new Error('Delete failed'));

            await fileManager.upload([{ source: 'path', path: '/test/file.txt' }]);

            // Should not throw
            await expect(fileManager.clear()).resolves.toBeUndefined();
            expect(fileManager.getUploadedFiles()).toHaveLength(0);
        });
    });

    describe('getUploadedFiles', () => {
        it('should return empty array initially', () => {
            expect(fileManager.getUploadedFiles()).toEqual([]);
        });

        it('should return a copy (not mutable reference)', async () => {
            mockUpload.mockResolvedValue({
                name: 'files/test',
                uri: 'https://storage.example.com/test',
                mimeType: 'text/plain',
            });

            await fileManager.upload([{ source: 'path', path: '/test/file.txt' }]);

            const files1 = fileManager.getUploadedFiles();
            const files2 = fileManager.getUploadedFiles();

            expect(files1).not.toBe(files2);
            expect(files1).toEqual(files2);
        });
    });

    describe('error context', () => {
        it('should include context in upload errors', async () => {
            mockUpload.mockRejectedValue(new Error('Upload failed'));

            const files: FileSource[] = [
                {
                    source: 'path',
                    path: '/test/doc.pdf',
                    mediaType: 'application/pdf',
                },
            ];

            try {
                await fileManager.upload(files);
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(FileError);
                const fileError = error as FileError;
                expect(fileError.context?.totalFiles).toBe(1);
                expect(fileError.context?.failedCount).toBe(1);
            }
        });
    });

    describe('response validation', () => {
        it('should throw FileError when response is missing required fields', async () => {
            // Response with missing uri
            mockUpload.mockResolvedValue({
                name: 'files/test',
                mimeType: 'text/plain',
                // uri is missing
            });

            const files: FileSource[] = [{ source: 'path', path: '/test/file.txt' }];

            try {
                await fileManager.upload(files);
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(FileError);
                const fileError = error as FileError;
                expect(fileError.code).toBe(FileErrorCode.UPLOAD_ERROR);
                // The original validation error is chained as cause
                expect(fileError.cause).toBeInstanceOf(FileError);
                const causeError = fileError.cause as FileError;
                expect(causeError.message).toContain('missing required fields');
                expect(causeError.context?.hasUri).toBe(false);
            }
        });

        it('should throw FileError when response name is missing', async () => {
            mockUpload.mockResolvedValue({
                uri: 'https://storage.example.com/test',
                mimeType: 'text/plain',
                // name is missing
            });

            const files: FileSource[] = [
                {
                    source: 'data',
                    data: Buffer.from('test'),
                    mediaType: 'text/plain',
                },
            ];

            try {
                await fileManager.upload(files);
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(FileError);
                const fileError = error as FileError;
                // The original validation error is chained as cause
                expect(fileError.cause).toBeInstanceOf(FileError);
                const causeError = fileError.cause as FileError;
                expect(causeError.context?.hasName).toBe(false);
            }
        });
    });

    describe('empty input', () => {
        it('should handle empty files array', async () => {
            const result = await fileManager.upload([]);
            expect(result).toEqual([]);
            expect(mockUpload).not.toHaveBeenCalled();
        });
    });

    describe('cache integration', () => {
        let mockCache: FileCache;
        let cacheStore: Map<string, UploadedFile>;

        beforeEach(() => {
            cacheStore = new Map();
            mockCache = {
                get: vi.fn((hash: string) => cacheStore.get(hash) ?? null),
                set: vi.fn((hash: string, file: UploadedFile) => {
                    cacheStore.set(hash, file);
                }),
                delete: vi.fn((hash: string) => {
                    cacheStore.delete(hash);
                }),
                clear: vi.fn(() => {
                    cacheStore.clear();
                }),
            };
        });

        it('should skip upload when cache hit', async () => {
            const cachedFile: UploadedFile = {
                id: 'files/cached',
                part: { type: 'file', data: new URL('https://cached.example.com'), mediaType: 'text/plain' },
            };
            // Use the mocked hash format: data-hash-{hex prefix}
            const testData = Buffer.from('Hello');
            const mockHash = `data-hash-${testData.toString('hex').slice(0, 16)}`;
            cacheStore.set(mockHash, cachedFile);

            const fileManagerWithCache = new GoogleFileManager('test-api-key', { cache: mockCache });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (fileManagerWithCache as any).client = { files: { upload: mockUpload, delete: mockDelete } };

            const files: FileSource[] = [
                {
                    source: 'data',
                    data: Buffer.from('Hello'),
                    mediaType: 'text/plain',
                },
            ];

            const result = await fileManagerWithCache.upload(files);

            expect(result).toHaveLength(1);
            expect(result[0]).toBe(cachedFile);
            expect(mockUpload).not.toHaveBeenCalled();
            expect(mockCache.get).toHaveBeenCalled();
        });

        it('should save to cache after successful upload', async () => {
            const mockResponse = {
                name: 'files/new123',
                uri: 'https://storage.example.com/new123',
                mimeType: 'text/plain',
            };
            mockUpload.mockResolvedValue(mockResponse);

            const fileManagerWithCache = new GoogleFileManager('test-api-key', { cache: mockCache });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (fileManagerWithCache as any).client = { files: { upload: mockUpload, delete: mockDelete } };

            const files: FileSource[] = [
                {
                    source: 'data',
                    data: Buffer.from('new content'),
                    mediaType: 'text/plain',
                },
            ];

            await fileManagerWithCache.upload(files);

            expect(mockCache.set).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ id: 'files/new123' })
            );
            expect(cacheStore.size).toBe(1);
        });

        it('should delete from cache on rollback', async () => {
            mockUpload
                .mockResolvedValueOnce({
                    name: 'files/success1',
                    uri: 'https://storage.example.com/1',
                    mimeType: 'text/plain',
                })
                .mockRejectedValueOnce(new Error('Second file failed'));
            mockDelete.mockResolvedValue(undefined);

            const fileManagerWithCache = new GoogleFileManager('test-api-key', { cache: mockCache });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (fileManagerWithCache as any).client = { files: { upload: mockUpload, delete: mockDelete } };

            const files: FileSource[] = [
                { source: 'data', data: Buffer.from('content1'), mediaType: 'text/plain' },
                { source: 'data', data: Buffer.from('content2'), mediaType: 'text/plain' },
            ];

            await expect(fileManagerWithCache.upload(files)).rejects.toThrow(FileError);

            expect(mockCache.delete).toHaveBeenCalled();
        });

        it('should delete correct cache entries on rollback with 3 files (middle fails)', async () => {
            mockUpload
                .mockResolvedValueOnce({
                    name: 'files/success0',
                    uri: 'https://storage.example.com/0',
                    mimeType: 'text/plain',
                })
                .mockRejectedValueOnce(new Error('Middle file failed'))
                .mockResolvedValueOnce({
                    name: 'files/success2',
                    uri: 'https://storage.example.com/2',
                    mimeType: 'text/plain',
                });
            mockDelete.mockResolvedValue(undefined);

            const deletedHashes: string[] = [];
            const trackingCache: FileCache = {
                get: () => null,
                set: () => {},
                delete: (hash: string) => {
                    deletedHashes.push(hash);
                },
                clear: () => {},
            };

            const fileManagerWithCache = new GoogleFileManager('test-api-key', {
                cache: trackingCache,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (fileManagerWithCache as any).client = { files: { upload: mockUpload, delete: mockDelete } };

            const files: FileSource[] = [
                { source: 'data', data: Buffer.from('content0'), mediaType: 'text/plain', hash: 'hash0' },
                { source: 'data', data: Buffer.from('content1'), mediaType: 'text/plain', hash: 'hash1' },
                { source: 'data', data: Buffer.from('content2'), mediaType: 'text/plain', hash: 'hash2' },
            ];

            await expect(fileManagerWithCache.upload(files)).rejects.toThrow(FileError);

            // Should delete hashes for successful uploads (file0 and file2), NOT for failed file1
            expect(deletedHashes).toHaveLength(2);
            expect(deletedHashes).toContain('hash0');
            expect(deletedHashes).toContain('hash2');
            expect(deletedHashes).not.toContain('hash1');
        });

        it('should work without cache (backward compatibility)', async () => {
            const mockResponse = {
                name: 'files/compat',
                uri: 'https://storage.example.com/compat',
                mimeType: 'text/plain',
            };
            mockUpload.mockResolvedValue(mockResponse);

            const fileManagerNoCache = new GoogleFileManager('test-api-key');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (fileManagerNoCache as any).client = { files: { upload: mockUpload, delete: mockDelete } };

            const files: FileSource[] = [
                {
                    source: 'data',
                    data: Buffer.from('test'),
                    mediaType: 'text/plain',
                },
            ];

            const result = await fileManagerNoCache.upload(files);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('files/compat');
        });

        it('should cache URL sources', async () => {
            const fileManagerWithCache = new GoogleFileManager('test-api-key', { cache: mockCache });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (fileManagerWithCache as any).client = { files: { upload: mockUpload, delete: mockDelete } };

            const files: FileSource[] = [
                {
                    source: 'url',
                    url: 'https://example.com/image.png',
                    mediaType: 'image/png',
                },
            ];

            await fileManagerWithCache.upload(files);

            expect(mockCache.set).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ id: null })
            );
            expect(mockUpload).not.toHaveBeenCalled();
        });

        it('should use user-provided hash', async () => {
            const userProvidedHash = 'user-custom-hash-abc123';
            const cachedFile: UploadedFile = {
                id: 'files/user-cached',
                part: { type: 'file', data: new URL('https://user-cached.example.com'), mediaType: 'text/plain' },
            };
            cacheStore.set(userProvidedHash, cachedFile);

            const fileManagerWithCache = new GoogleFileManager('test-api-key', { cache: mockCache });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (fileManagerWithCache as any).client = { files: { upload: mockUpload, delete: mockDelete } };

            const files: FileSource[] = [
                {
                    source: 'data',
                    data: Buffer.from('any content'),
                    mediaType: 'text/plain',
                    hash: userProvidedHash,
                },
            ];

            const result = await fileManagerWithCache.upload(files);

            expect(result[0]).toBe(cachedFile);
            expect(mockUpload).not.toHaveBeenCalled();
        });
    });
});
