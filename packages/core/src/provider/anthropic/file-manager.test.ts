import { readFile } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileError, FileErrorCode } from '../../errors/index.js';
import type { FileSource } from '../types.js';
import {
    ANTHROPIC_FILE_ID_MARKER_PREFIX,
    parseAnthropicFileIdMarker,
} from './middleware.js';
import {
    ANTHROPIC_API_VERSION,
    ANTHROPIC_FILES_API_BETA,
    AnthropicFileManager,
} from './file-manager.js';

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
        json: async () => ({ id: 'file_abc123', type: 'file', filename: 'test.pdf' }),
        text: async () => '',
        ...overrides,
    });
}

describe('AnthropicFileManager', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let fileManager: AnthropicFileManager;

    beforeEach(() => {
        mockFetch = createMockFetch();
        fileManager = new AnthropicFileManager('test-api-key', {
            fetch: mockFetch as unknown as typeof fetch,
            strategy: 'files-api-only',
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('upload - Files API', () => {
        it('uploads a PDF path source and returns a file_id marker part', async () => {
            vi.mocked(readFile).mockResolvedValue(Buffer.from('pdf content'));

            const result = await fileManager.upload([{
                source: 'path',
                path: '/test/doc.pdf',
                mediaType: 'application/pdf',
            }]);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('file_abc123');
            expect(result[0].part).toMatchObject({
                type: 'file',
                mediaType: 'application/pdf',
                filename: 'doc.pdf',
            });
            expect((result[0].part as { data: string }).data).toBe(`${ANTHROPIC_FILE_ID_MARKER_PREFIX}file_abc123`);
            expect(parseAnthropicFileIdMarker((result[0].part as { data: string }).data)).toBe('file_abc123');
        });

        it('sends Anthropic version and Files API beta headers', async () => {
            await fileManager.upload([{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
                filename: 'custom.pdf',
            }]);

            const [, init] = mockFetch.mock.calls[0];
            expect(init.headers).toMatchObject({
                'x-api-key': 'test-api-key',
                'anthropic-version': ANTHROPIC_API_VERSION,
                'anthropic-beta': ANTHROPIC_FILES_API_BETA,
            });
        });

        it('uses custom baseURL when configured', async () => {
            const manager = new AnthropicFileManager('test-key', {
                baseURL: 'https://proxy.example.com/v1',
                fetch: mockFetch as unknown as typeof fetch,
                strategy: 'files-api-only',
            });

            await manager.upload([{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'image/png',
            }]);

            expect(mockFetch.mock.calls[0][0]).toBe('https://proxy.example.com/v1/files');
        });

        it('throws FileError when the Files API upload fails', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: async () => 'server error',
            });

            await expect(fileManager.upload([{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
            }])).rejects.toMatchObject({
                code: FileErrorCode.UPLOAD_ERROR,
            });
        });

        it('throws FileError when the upload response has no id', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({ type: 'file' }),
                text: async () => '',
            });

            await expect(fileManager.upload([{
                source: 'data',
                data: Buffer.from('content'),
                mediaType: 'application/pdf',
            }])).rejects.toThrow(FileError);
        });
    });

    describe('upload - strategy', () => {
        it('returns an inline file part in inline-only mode', async () => {
            const manager = new AnthropicFileManager('test-key', {
                fetch: mockFetch as unknown as typeof fetch,
                strategy: 'inline-only',
            });

            const result = await manager.upload([{
                source: 'data',
                data: Buffer.from('small pdf'),
                mediaType: 'application/pdf',
                filename: 'small.pdf',
            }]);

            expect(result[0].id).toBeNull();
            expect(result[0].part).toMatchObject({
                type: 'file',
                mediaType: 'application/pdf',
                filename: 'small.pdf',
            });
            expect((result[0].part as { data: Uint8Array }).data).toBeInstanceOf(Buffer);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('returns an inline image part for image media types', async () => {
            const manager = new AnthropicFileManager('test-key', {
                fetch: mockFetch as unknown as typeof fetch,
                strategy: 'inline-only',
            });

            const result = await manager.upload([{
                source: 'data',
                data: Buffer.from('image bytes'),
                mediaType: 'image/png',
            }]);

            expect(result[0].id).toBeNull();
            expect(result[0].part.type).toBe('image');
            expect((result[0].part as { image: Uint8Array }).image).toBeInstanceOf(Buffer);
        });

        it('uses inline path below threshold in auto mode', async () => {
            const manager = new AnthropicFileManager('test-key', {
                fetch: mockFetch as unknown as typeof fetch,
                strategy: 'auto',
                inlineMaxBytes: 1024,
            });

            const result = await manager.upload([{
                source: 'data',
                data: Buffer.from('small'),
                mediaType: 'application/pdf',
            }]);

            expect(result[0].id).toBeNull();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('uses Files API above threshold in auto mode', async () => {
            const manager = new AnthropicFileManager('test-key', {
                fetch: mockFetch as unknown as typeof fetch,
                strategy: 'auto',
                inlineMaxBytes: 2,
            });

            const result = await manager.upload([{
                source: 'data',
                data: Buffer.from('large'),
                mediaType: 'application/pdf',
            }]);

            expect(result[0].id).toBe('file_abc123');
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('leaves URL sources to BaseFileManager without API calls', async () => {
            const files: FileSource[] = [{
                source: 'url',
                url: 'https://example.com/document.pdf',
                mediaType: 'application/pdf',
            }];

            const result = await fileManager.upload(files);

            expect(result[0].id).toBeNull();
            expect(result[0].part.type).toBe('file');
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('delete', () => {
        it('calls DELETE on the Files API', async () => {
            await fileManager.delete('file_delete_me');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.anthropic.com/v1/files/file_delete_me',
                expect.objectContaining({ method: 'DELETE' }),
            );
        });

        it('throws FileError on delete failure', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: async () => 'missing',
            });

            await expect(fileManager.delete('file_missing')).rejects.toMatchObject({
                code: FileErrorCode.DELETE_ERROR,
            });
        });
    });
});
