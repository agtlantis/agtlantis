import { readFile } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileError, FileErrorCode } from '../../errors/index.js';
import type { FileCache, FileSource, UploadedFile } from '../types.js';
import { OpenAIFileManager } from './file-manager.js';

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn(),
}));

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

function createMockFetch(overrides?: Partial<Response>) {
    return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ id: 'file-abc123', object: 'file', filename: 'test.pdf', purpose: 'user_data' }),
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
        ...overrides,
    });
}

describe('OpenAIFileManager', () => {
    let fileManager: OpenAIFileManager;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockFetch = createMockFetch();
        vi.stubGlobal('fetch', mockFetch);
        fileManager = new OpenAIFileManager('test-api-key');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('upload - Files API (non-URL sources)', () => {
        it('should upload document path source and return FilePart', async () => {
            vi.mocked(readFile).mockResolvedValue(Buffer.from('pdf content'));

            const files: FileSource[] = [{
                source: 'path',
                path: '/test/doc.pdf',
                mediaType: 'application/pdf',
            }];

            const result = await fileManager.upload(files);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('file-abc123');
            expect(result[0].part.type).toBe('file');
            expect(result[0].part.mediaType).toBe('application/pdf');
            expect((result[0].part as { data: string }).data).toBe('file-abc123');
        });

        it('should upload document data source via Files API', async () => {
            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('doc content'),
                mediaType: 'application/pdf',
            }];

            const result = await fileManager.upload(files);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('file-abc123');
            expect(result[0].part.type).toBe('file');
        });

        it('should upload document base64 source via Files API', async () => {
            const files: FileSource[] = [{
                source: 'base64',
                data: Buffer.from('doc content').toString('base64'),
                mediaType: 'application/pdf',
            }];

            const result = await fileManager.upload(files);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('file-abc123');
        });

        it('should upload image path source and return FilePart', async () => {
            vi.mocked(readFile).mockResolvedValue(Buffer.from('fake image data'));

            const files: FileSource[] = [{
                source: 'path',
                path: '/test/photo.png',
                mediaType: 'image/png',
            }];

            const result = await fileManager.upload(files);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('file-abc123');
            expect(result[0].part.type).toBe('file');
            expect(result[0].part.mediaType).toBe('image/png');
            expect((result[0].part as { data: string }).data).toBe('file-abc123');
        });

        it('should upload image data source and return FilePart', async () => {
            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('image bytes'),
                mediaType: 'image/jpeg',
            }];

            const result = await fileManager.upload(files);

            expect(result[0].id).toBe('file-abc123');
            expect(result[0].part.type).toBe('file');
            expect(result[0].part.mediaType).toBe('image/jpeg');
        });

        it('should upload image base64 source and return FilePart', async () => {
            const base64Data = Buffer.from('image data').toString('base64');
            const files: FileSource[] = [{
                source: 'base64',
                data: base64Data,
                mediaType: 'image/png',
            }];

            const result = await fileManager.upload(files);

            expect(result[0].id).toBe('file-abc123');
            expect(result[0].part.type).toBe('file');
            expect((result[0].part as { data: string }).data).toBe('file-abc123');
        });

        it('should preserve actual mediaType for non-PDF documents', async () => {
            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('docx content'),
                mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            }];

            const result = await fileManager.upload(files);

            expect(result[0].part.mediaType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        });

        it('should preserve actual image mediaType in FilePart', async () => {
            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('gif data'),
                mediaType: 'image/gif',
            }];

            const result = await fileManager.upload(files);

            expect(result[0].part.type).toBe('file');
            expect(result[0].part.mediaType).toBe('image/gif');
        });

        it('should include Authorization header', async () => {
            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
            }];

            await fileManager.upload(files);

            const fetchCall = mockFetch.mock.calls[0];
            expect(fetchCall[1].headers.Authorization).toBe('Bearer test-api-key');
        });

        it('should include Organization header when configured', async () => {
            const fm = new OpenAIFileManager('test-key', { organization: 'org-test123' });

            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
            }];

            await fm.upload(files);

            const fetchCall = mockFetch.mock.calls[0];
            expect(fetchCall[1].headers['OpenAI-Organization']).toBe('org-test123');
        });

        it('should send purpose as user_data', async () => {
            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
            }];

            await fileManager.upload(files);

            const fetchCall = mockFetch.mock.calls[0];
            const formData = fetchCall[1].body as FormData;
            expect(formData.get('purpose')).toBe('user_data');
        });

        it('should use filename from source when provided', async () => {
            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
                filename: 'custom-name.pdf',
            }];

            const result = await fileManager.upload(files);

            expect((result[0].part as { filename?: string }).filename).toBe('custom-name.pdf');
        });

        it('should use basename for path sources', async () => {
            vi.mocked(readFile).mockResolvedValue(Buffer.from('content'));

            const files: FileSource[] = [{
                source: 'path',
                path: '/some/deep/dir/report.pdf',
                mediaType: 'application/pdf',
            }];

            const result = await fileManager.upload(files);

            expect((result[0].part as { filename?: string }).filename).toBe('report.pdf');
        });

        it('should use custom baseURL when configured', async () => {
            const fm = new OpenAIFileManager('test-key', { baseURL: 'https://custom.api.com/v1' });

            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
            }];

            await fm.upload(files);

            const fetchCall = mockFetch.mock.calls[0];
            expect(fetchCall[0]).toBe('https://custom.api.com/v1/files');
        });
    });

    describe('upload - URL sources (inline)', () => {
        it('should return FilePart with URL for document source without API call', async () => {
            const files: FileSource[] = [{
                source: 'url',
                url: 'https://example.com/document.pdf',
                mediaType: 'application/pdf',
            }];

            const result = await fileManager.upload(files);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBeNull();
            expect(result[0].part.type).toBe('file');
            expect(result[0].part.mediaType).toBe('application/pdf');
            expect((result[0].part as { data: URL }).data.href).toBe('https://example.com/document.pdf');
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should return ImagePart with URL for image source without API call', async () => {
            const files: FileSource[] = [{
                source: 'url',
                url: 'https://example.com/photo.jpg',
                mediaType: 'image/jpeg',
            }];

            const result = await fileManager.upload(files);

            expect(result[0].id).toBeNull();
            expect(result[0].part.type).toBe('image');
            expect((result[0].part as { image: URL }).image.href).toBe('https://example.com/photo.jpg');
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('upload - error handling', () => {
        it('should throw FileError when Files API fails', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: async () => 'server error',
            });

            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
            }];

            await expect(fileManager.upload(files)).rejects.toThrow(FileError);
            await expect(fileManager.upload(files)).rejects.toMatchObject({
                code: FileErrorCode.UPLOAD_ERROR,
            });
        });

        it('should rollback successful uploads on partial failure', async () => {
            let callCount = 0;
            mockFetch.mockImplementation(async (_url: string, options?: RequestInit) => {
                if (options?.method === 'DELETE') {
                    return { ok: true };
                }
                callCount++;
                if (callCount === 1) {
                    return {
                        ok: true,
                        json: async () => ({ id: 'file-success1' }),
                        text: async () => '',
                    };
                }
                return {
                    ok: false,
                    status: 500,
                    statusText: 'Error',
                    text: async () => 'upload failed',
                };
            });

            const files: FileSource[] = [
                { source: 'data', data: Buffer.from('content1'), mediaType: 'application/pdf' },
                { source: 'data', data: Buffer.from('content2'), mediaType: 'application/pdf' },
            ];

            await expect(fileManager.upload(files)).rejects.toThrow(FileError);

            const deleteCalls = mockFetch.mock.calls.filter(
                (call) => call[1]?.method === 'DELETE'
            );
            expect(deleteCalls).toHaveLength(1);
            expect(deleteCalls[0][0]).toContain('file-success1');
        });

    });

    describe('upload - cache', () => {
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
                id: 'file-cached',
                part: { type: 'file', data: 'file-cached', mediaType: 'application/pdf' },
            };
            const testData = Buffer.from('Hello');
            const mockHash = `data-hash-${testData.toString('hex').slice(0, 16)}`;
            cacheStore.set(mockHash, cachedFile);

            const fm = new OpenAIFileManager('test-key', { cache: mockCache });

            const files: FileSource[] = [{
                source: 'data',
                data: testData,
                mediaType: 'application/pdf',
            }];

            const result = await fm.upload(files);

            expect(result[0]).toBe(cachedFile);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should save to cache after successful upload', async () => {
            const fm = new OpenAIFileManager('test-key', { cache: mockCache });

            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('new content'),
                mediaType: 'application/pdf',
            }];

            await fm.upload(files);

            expect(mockCache.set).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ id: 'file-abc123' })
            );
        });

        it('should delete from cache on rollback', async () => {
            let callCount = 0;
            mockFetch.mockImplementation(async (_url: string, options?: RequestInit) => {
                if (options?.method === 'DELETE') return { ok: true };
                callCount++;
                if (callCount === 1) {
                    return {
                        ok: true,
                        json: async () => ({ id: 'file-success' }),
                        text: async () => '',
                    };
                }
                return { ok: false, status: 500, statusText: 'Error', text: async () => '' };
            });

            const fm = new OpenAIFileManager('test-key', { cache: mockCache });

            const files: FileSource[] = [
                { source: 'data', data: Buffer.from('c1'), mediaType: 'application/pdf' },
                { source: 'data', data: Buffer.from('c2'), mediaType: 'application/pdf' },
            ];

            await expect(fm.upload(files)).rejects.toThrow(FileError);
            expect(mockCache.delete).toHaveBeenCalled();
        });

        it('should cache image uploads', async () => {
            const fm = new OpenAIFileManager('test-key', { cache: mockCache });

            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('image data'),
                mediaType: 'image/png',
            }];

            await fm.upload(files);

            expect(mockCache.set).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ id: 'file-abc123' })
            );
        });

        it('should work without cache', async () => {
            const fm = new OpenAIFileManager('test-key');

            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
            }];

            const result = await fm.upload(files);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('file-abc123');
        });
    });

    describe('delete', () => {
        it('should call DELETE on Files API', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ id: 'file-to-delete' }),
                    text: async () => '',
                })
                .mockResolvedValueOnce({ ok: true });

            await fileManager.upload([{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
            }]);

            expect(fileManager.getUploadedFiles()).toHaveLength(1);

            await fileManager.delete('file-to-delete');

            const deleteCall = mockFetch.mock.calls.find(
                (call) => call[1]?.method === 'DELETE'
            );
            expect(deleteCall).toBeDefined();
            expect(deleteCall![0]).toContain('/files/file-to-delete');
            expect(fileManager.getUploadedFiles()).toHaveLength(0);
        });

        it('should throw FileError on delete failure', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            await expect(fileManager.delete('file-nonexistent')).rejects.toThrow(FileError);
            await expect(fileManager.delete('file-nonexistent')).rejects.toMatchObject({
                code: FileErrorCode.DELETE_ERROR,
            });
        });
    });

    describe('clear', () => {
        it('should delete all non-null id files', async () => {
            let uploadCount = 0;
            mockFetch.mockImplementation(async (_url: string, options?: RequestInit) => {
                if (options?.method === 'DELETE') return { ok: true };
                uploadCount++;
                return {
                    ok: true,
                    json: async () => ({ id: `file-${uploadCount}` }),
                    text: async () => '',
                };
            });

            await fileManager.upload([
                { source: 'data', data: Buffer.from('c1'), mediaType: 'application/pdf' },
                { source: 'data', data: Buffer.from('c2'), mediaType: 'application/pdf' },
            ]);

            expect(fileManager.getUploadedFiles()).toHaveLength(2);

            await fileManager.clear();

            expect(fileManager.getUploadedFiles()).toHaveLength(0);
            const deleteCalls = mockFetch.mock.calls.filter(
                (call) => call[1]?.method === 'DELETE'
            );
            expect(deleteCalls).toHaveLength(2);
        });

        it('should silently ignore delete errors during clear', async () => {
            mockFetch.mockImplementation(async (_url: string, options?: RequestInit) => {
                if (options?.method === 'DELETE') {
                    return { ok: false, status: 500, statusText: 'Error' };
                }
                return {
                    ok: true,
                    json: async () => ({ id: 'file-err' }),
                    text: async () => '',
                };
            });

            await fileManager.upload([{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
            }]);

            await expect(fileManager.clear()).resolves.toBeUndefined();
            expect(fileManager.getUploadedFiles()).toHaveLength(0);
        });
    });

    describe('getUploadedFiles', () => {
        it('should return empty array initially', () => {
            expect(fileManager.getUploadedFiles()).toEqual([]);
        });

        it('should return a defensive copy', async () => {
            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
            }];

            await fileManager.upload(files);

            const files1 = fileManager.getUploadedFiles();
            const files2 = fileManager.getUploadedFiles();

            expect(files1).not.toBe(files2);
            expect(files1).toEqual(files2);
        });

        it('should track image uploads via Files API', async () => {
            const files: FileSource[] = [{
                source: 'data',
                data: Buffer.from('image'),
                mediaType: 'image/png',
            }];

            await fileManager.upload(files);

            expect(fileManager.getUploadedFiles()).toHaveLength(1);
            expect(fileManager.getUploadedFiles()[0].id).toBe('file-abc123');
        });
    });

    describe('empty input', () => {
        it('should handle empty files array', async () => {
            const result = await fileManager.upload([]);
            expect(result).toEqual([]);
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });
});
