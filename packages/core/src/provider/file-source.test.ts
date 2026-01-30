import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileErrorCode } from '../errors';
import {
    getFileSourceDisplayInfo,
    getFileSourcesDisplayInfo,
    inferMediaType,
    resolveFileSource,
    resolveFileSourcesInInput,
    scanForFileSources,
} from './file-source';
import {
    type FileSource,
    type FileSourceBase64,
    type FileSourceData,
    type FileSourcePath,
    type FileSourceUrl,
    isFileSource,
    isFileSourceBase64,
    isFileSourceData,
    isFileSourcePath,
    isFileSourceUrl,
} from './types';

// ============================================================================
// Test Fixtures - Factory Functions for DRY
// ============================================================================

/** Creates a path-based FileSource for testing */
function createPathFileSource(overrides?: Partial<FileSourcePath>): FileSourcePath {
    return {
        source: 'path',
        path: './test.pdf',
        ...overrides,
    };
}

/** Creates a data-based FileSource for testing */
function createDataFileSource(overrides?: Partial<FileSourceData>): FileSourceData {
    return {
        source: 'data',
        data: Buffer.from('test content'),
        mediaType: 'text/plain',
        ...overrides,
    };
}

/** Creates a base64-based FileSource for testing */
function createBase64FileSource(overrides?: Partial<FileSourceBase64>): FileSourceBase64 {
    return {
        source: 'base64',
        data: Buffer.from('test').toString('base64'), // 'dGVzdA=='
        mediaType: 'text/plain',
        ...overrides,
    };
}

/** Creates a URL-based FileSource for testing */
function createUrlFileSource(overrides?: Partial<FileSourceUrl>): FileSourceUrl {
    return {
        source: 'url',
        url: 'https://example.com/test.png',
        ...overrides,
    };
}

// ============================================================================
// Test Constants - Meaningful Names for Magic Numbers
// ============================================================================

/** Size limit for testing TOO_LARGE error (100 bytes) */
const SMALL_SIZE_LIMIT = 100;

/** Content that exceeds SMALL_SIZE_LIMIT */
const CONTENT_EXCEEDING_LIMIT = 'x'.repeat(1000);

/** Size for base64 display info test (~768 bytes decoded) */
const BASE64_TEST_DATA = 'x'.repeat(1024);

/** Buffer size for data display info test (2KB) */
const BUFFER_TEST_SIZE = 2048;

describe('file-part', () => {
    // ============================================================================
    // Type Guards
    // ============================================================================

    describe('isFileSource', () => {
        it('should identify FileSourcePath', () => {
            const part: FileSourcePath = { source: 'path', path: './test.pdf' };
            expect(isFileSource(part)).toBe(true);
        });

        it('should identify FileSourceData', () => {
            const part: FileSourceData = {
                source: 'data',
                data: Buffer.from('test'),
                mediaType: 'text/plain',
            };
            expect(isFileSource(part)).toBe(true);
        });

        it('should identify FileSourceBase64', () => {
            const part: FileSourceBase64 = {
                source: 'base64',
                data: 'dGVzdA==',
                mediaType: 'text/plain',
            };
            expect(isFileSource(part)).toBe(true);
        });

        it('should identify FileSourceUrl', () => {
            const part: FileSourceUrl = {
                source: 'url',
                url: 'https://example.com/test.png',
            };
            expect(isFileSource(part)).toBe(true);
        });

        it('should reject non-FileSource objects', () => {
            expect(isFileSource({ source: 'invalid', data: 'x' })).toBe(false);
            expect(isFileSource({ path: '/test' })).toBe(false); // missing source
            expect(isFileSource(null)).toBe(false);
            expect(isFileSource(undefined)).toBe(false);
            expect(isFileSource('string')).toBe(false);
            expect(isFileSource(123)).toBe(false);
        });
    });

    describe('isFileSourcePath', () => {
        it('should identify path source', () => {
            const part: FileSource = { source: 'path', path: './test.pdf' };
            expect(isFileSourcePath(part)).toBe(true);
        });

        it('should reject non-path sources', () => {
            const part: FileSource = { source: 'url', url: 'https://example.com' };
            expect(isFileSourcePath(part)).toBe(false);
        });
    });

    describe('isFileSourceData', () => {
        it('should identify data source', () => {
            const part: FileSource = {
                source: 'data',
                data: Buffer.from('x'),
                mediaType: 'text/plain',
            };
            expect(isFileSourceData(part)).toBe(true);
        });
    });

    describe('isFileSourceBase64', () => {
        it('should identify base64 source', () => {
            const part: FileSource = {
                source: 'base64',
                data: 'dGVzdA==',
                mediaType: 'text/plain',
            };
            expect(isFileSourceBase64(part)).toBe(true);
        });
    });

    describe('isFileSourceUrl', () => {
        it('should identify url source', () => {
            const part: FileSource = { source: 'url', url: 'https://example.com' };
            expect(isFileSourceUrl(part)).toBe(true);
        });
    });

    // ============================================================================
    // MIME Type Inference
    // ============================================================================

    describe('inferMediaType', () => {
        it('should infer common MIME types', () => {
            expect(inferMediaType('./test.pdf')).toBe('application/pdf');
            expect(inferMediaType('./test.png')).toBe('image/png');
            expect(inferMediaType('./test.jpg')).toBe('image/jpeg');
            expect(inferMediaType('./test.jpeg')).toBe('image/jpeg');
            expect(inferMediaType('./test.json')).toBe('application/json');
            expect(inferMediaType('./test.html')).toBe('text/html');
            expect(inferMediaType('./test.txt')).toBe('text/plain');
        });

        it('should be case-insensitive', () => {
            expect(inferMediaType('./test.PDF')).toBe('application/pdf');
            expect(inferMediaType('./test.PNG')).toBe('image/png');
        });

        it('should return undefined for unknown extensions', () => {
            expect(inferMediaType('./test.xyz')).toBeUndefined();
            expect(inferMediaType('./test')).toBeUndefined();
        });
    });

    // ============================================================================
    // Scanner
    // ============================================================================

    describe('scanForFileSources', () => {
        it('should find a single FileSource at root', () => {
            const input: FileSource = { source: 'path', path: './test.pdf' };
            const found = scanForFileSources(input);

            expect(found).toHaveLength(1);
            expect(found[0].part).toEqual(input);
            expect(found[0].path).toEqual([]);
        });

        it('should find FileSource in nested object', () => {
            const input = {
                prompt: 'Analyze',
                file: { source: 'path', path: './test.pdf' } as FileSource,
            };
            const found = scanForFileSources(input);

            expect(found).toHaveLength(1);
            expect(found[0].path).toEqual(['file']);
        });

        it('should find FileSources in array', () => {
            const input = {
                files: [
                    { source: 'path', path: './a.pdf' },
                    { source: 'path', path: './b.pdf' },
                ] as FileSource[],
            };
            const found = scanForFileSources(input);

            expect(found).toHaveLength(2);
            expect(found[0].path).toEqual(['files', 0]);
            expect(found[1].path).toEqual(['files', 1]);
        });

        it('should find deeply nested FileSources', () => {
            const input = {
                level1: {
                    level2: {
                        level3: { source: 'path', path: './deep.pdf' } as FileSource,
                    },
                },
            };
            const found = scanForFileSources(input);

            expect(found).toHaveLength(1);
            expect(found[0].path).toEqual(['level1', 'level2', 'level3']);
        });

        it('should find mixed content', () => {
            const input = {
                prompt: 'Analyze these',
                mainFile: { source: 'path', path: './main.pdf' } as FileSource,
                extras: [
                    {
                        source: 'url',
                        url: 'https://example.com/img.png',
                    } as FileSource,
                    {
                        source: 'base64',
                        data: 'dGVzdA==',
                        mediaType: 'text/plain',
                    } as FileSource,
                ],
            };
            const found = scanForFileSources(input);

            expect(found).toHaveLength(3);
        });

        it('should return empty array for non-FileSource input', () => {
            expect(scanForFileSources({ prompt: 'Hello' })).toEqual([]);
            expect(scanForFileSources('string')).toEqual([]);
            expect(scanForFileSources(123)).toEqual([]);
            expect(scanForFileSources(null)).toEqual([]);
            expect(scanForFileSources(undefined)).toEqual([]);
        });

        it('should skip Buffer and URL objects', () => {
            const input = {
                buffer: Buffer.from('test'),
                url: new URL('https://example.com'),
                file: { source: 'path', path: './test.pdf' } as FileSource,
            };
            const found = scanForFileSources(input);

            expect(found).toHaveLength(1);
            expect(found[0].path).toEqual(['file']);
        });
    });

    // ============================================================================
    // Resolver
    // ============================================================================

    describe('resolveFileSource', () => {
        let tempDir: string;

        beforeEach(async () => {
            tempDir = join(tmpdir(), `file-part-test-${Date.now()}`);
            await mkdir(tempDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(tempDir, { recursive: true, force: true });
        });

        it('should resolve path-based FileSource', async () => {
            const content = 'Hello, World!';
            const filePath = join(tempDir, 'test.txt');
            await writeFile(filePath, content);

            const part: FileSourcePath = { source: 'path', path: filePath };
            const resolved = await resolveFileSource(part);

            expect(isFileSourceData(resolved)).toBe(true);
            if (isFileSourceData(resolved)) {
                expect(Buffer.isBuffer(resolved.data)).toBe(true);
                expect((resolved.data as Buffer).toString()).toBe(content);
            }
            expect(resolved.mediaType).toBe('text/plain');
            expect(resolved.filename).toBe('test.txt');
        });

        it('should resolve path with custom mediaType', async () => {
            const filePath = join(tempDir, 'data');
            await writeFile(filePath, 'binary');

            const part: FileSourcePath = {
                source: 'path',
                path: filePath,
                mediaType: 'application/custom',
            };
            const resolved = await resolveFileSource(part);

            expect(resolved.mediaType).toBe('application/custom');
        });

        it('should resolve path with custom filename', async () => {
            const filePath = join(tempDir, 'test.txt');
            await writeFile(filePath, 'content');

            const part: FileSourcePath = {
                source: 'path',
                path: filePath,
                filename: 'custom.txt',
            };
            const resolved = await resolveFileSource(part);

            expect(resolved.filename).toBe('custom.txt');
        });

        it('should resolve relative path with basePath', async () => {
            const content = 'Relative content';
            const filePath = join(tempDir, 'relative.txt');
            await writeFile(filePath, content);

            const part: FileSourcePath = { source: 'path', path: 'relative.txt' };
            const resolved = await resolveFileSource(part, { basePath: tempDir });

            expect(isFileSourceData(resolved)).toBe(true);
            if (isFileSourceData(resolved)) {
                expect((resolved.data as Buffer).toString()).toBe(content);
            }
        });

        it('should throw for non-existent file', async () => {
            const part: FileSourcePath = {
                source: 'path',
                path: '/nonexistent/file.txt',
            };

            await expect(resolveFileSource(part)).rejects.toMatchObject({
                code: FileErrorCode.NOT_FOUND,
            });
        });

        it('should throw for file exceeding maxSize', async () => {
            const filePath = join(tempDir, 'large.txt');
            await writeFile(filePath, CONTENT_EXCEEDING_LIMIT);

            const part = createPathFileSource({ path: filePath });

            await expect(
                resolveFileSource(part, { maxSize: SMALL_SIZE_LIMIT })
            ).rejects.toMatchObject({
                code: FileErrorCode.TOO_LARGE,
            });
        });

        it('should return data-based FileSource unchanged', async () => {
            const buffer = Buffer.from('test data');
            const part: FileSourceData = {
                source: 'data',
                data: buffer,
                mediaType: 'text/plain',
            };
            const resolved = await resolveFileSource(part);

            expect(resolved).toBe(part);
            expect(isFileSourceData(resolved)).toBe(true);
        });

        it('should return data-based FileSource with Uint8Array unchanged', async () => {
            const uint8 = new Uint8Array([116, 101, 115, 116]); // 'test'
            const part: FileSourceData = {
                source: 'data',
                data: uint8,
                mediaType: 'text/plain',
            };
            const resolved = await resolveFileSource(part);

            expect(resolved).toBe(part);
            expect(isFileSourceData(resolved)).toBe(true);
        });

        it('should return base64-based FileSource unchanged', async () => {
            const base64 = Buffer.from('Hello').toString('base64');
            const part: FileSourceBase64 = {
                source: 'base64',
                data: base64,
                mediaType: 'text/plain',
            };
            const resolved = await resolveFileSource(part);

            expect(resolved).toBe(part);
            expect(isFileSourceBase64(resolved)).toBe(true);
            expect(resolved.mediaType).toBe('text/plain');
        });

        it('should return url-based FileSource unchanged', async () => {
            const part: FileSourceUrl = {
                source: 'url',
                url: 'https://example.com/image.png',
            };
            const resolved = await resolveFileSource(part);

            expect(resolved).toBe(part);
            expect(isFileSourceUrl(resolved)).toBe(true);
            if (isFileSourceUrl(resolved)) {
                expect(resolved.url).toBe('https://example.com/image.png');
            }
        });

        it('should preserve mediaType for url-based FileSource', async () => {
            const part: FileSourceUrl = {
                source: 'url',
                url: 'https://example.com/data',
                mediaType: 'application/custom',
            };
            const resolved = await resolveFileSource(part);

            expect(resolved).toBe(part);
            expect(resolved.mediaType).toBe('application/custom');
        });
    });

    // ============================================================================
    // Input Resolver
    // ============================================================================

    describe('resolveFileSourcesInInput', () => {
        let tempDir: string;

        beforeEach(async () => {
            tempDir = join(tmpdir(), `resolve-input-test-${Date.now()}`);
            await mkdir(tempDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(tempDir, { recursive: true, force: true });
        });

        it('should return input unchanged if no FileSources', async () => {
            const input = { prompt: 'Hello', count: 42 };
            const result = await resolveFileSourcesInInput(input);

            expect(result).toEqual(input);
        });

        it('should resolve single FileSource at root', async () => {
            const filePath = join(tempDir, 'test.txt');
            await writeFile(filePath, 'content');

            const input: FileSourcePath = { source: 'path', path: filePath };
            const result = await resolveFileSourcesInInput<FileSource>(input);

            expect(isFileSourceData(result)).toBe(true);
            if (isFileSourceData(result)) {
                expect(Buffer.isBuffer(result.data)).toBe(true);
            }
        });

        it('should resolve nested FileSource', async () => {
            const filePath = join(tempDir, 'nested.txt');
            await writeFile(filePath, 'nested content');

            const input = {
                prompt: 'Analyze',
                file: { source: 'path', path: filePath } as FileSource,
            };
            const result = await resolveFileSourcesInInput(input, { basePath: tempDir });

            expect(result.prompt).toBe('Analyze');
            expect((result.file as { data: Buffer }).data).toBeInstanceOf(Buffer);
        });

        it('should resolve multiple FileSources in array', async () => {
            const file1 = join(tempDir, 'a.txt');
            const file2 = join(tempDir, 'b.txt');
            await writeFile(file1, 'content a');
            await writeFile(file2, 'content b');

            const input = {
                files: [
                    { source: 'path', path: file1 },
                    { source: 'path', path: file2 },
                ] as FileSource[],
            };
            const result = await resolveFileSourcesInInput(input);

            expect(result.files).toHaveLength(2);
            expect(Buffer.isBuffer((result.files[0] as { data: Buffer }).data)).toBe(true);
            expect(Buffer.isBuffer((result.files[1] as { data: Buffer }).data)).toBe(true);
        });

        it('should not mutate original input', async () => {
            const filePath = join(tempDir, 'immutable.txt');
            await writeFile(filePath, 'content');

            const original = {
                file: { source: 'path', path: filePath } as FileSource,
            };
            const originalCopy = JSON.stringify(original);

            await resolveFileSourcesInInput(original);

            expect(JSON.stringify(original)).toBe(originalCopy);
        });

        it('should resolve in parallel for efficiency', async () => {
            // Create multiple files
            const files = await Promise.all(
                Array.from({ length: 5 }, async (_, i) => {
                    const filePath = join(tempDir, `file${i}.txt`);
                    await writeFile(filePath, `content ${i}`);
                    return filePath;
                })
            );

            const input = {
                files: files.map((p) => ({ source: 'path', path: p }) as FileSource),
            };

            const start = Date.now();
            await resolveFileSourcesInInput(input);
            const elapsed = Date.now() - start;

            // Parallel resolution should be fast (< 1s for 5 small files)
            expect(elapsed).toBeLessThan(1000);
        });
    });

    // ============================================================================
    // Display Info
    // ============================================================================

    describe('getFileSourceDisplayInfo', () => {
        it('should extract path info', () => {
            const part: FileSourcePath = {
                source: 'path',
                path: './fixtures/doc.pdf',
            };
            const info = getFileSourceDisplayInfo(part);

            expect(info.source).toBe('path');
            expect(info.description).toBe('./fixtures/doc.pdf');
            expect(info.mediaType).toBe('application/pdf');
            expect(info.filename).toBe('doc.pdf');
        });

        it('should extract url info', () => {
            const part: FileSourceUrl = {
                source: 'url',
                url: 'https://example.com/image.png',
            };
            const info = getFileSourceDisplayInfo(part);

            expect(info.source).toBe('url');
            expect(info.description).toBe('https://example.com/image.png');
        });

        it('should extract base64 info', () => {
            const part = createBase64FileSource({ data: BASE64_TEST_DATA });
            const info = getFileSourceDisplayInfo(part);

            expect(info.source).toBe('base64');
            expect(info.description).toMatch(/\[base64 data, ~\d+(\.\d+)?KB\]/);
            expect(info.mediaType).toBe('text/plain');
        });

        it('should extract data info', () => {
            const buffer = Buffer.alloc(BUFFER_TEST_SIZE);
            const part = createDataFileSource({
                data: buffer,
                mediaType: 'application/octet-stream',
            });
            const info = getFileSourceDisplayInfo(part);

            expect(info.source).toBe('data');
            expect(info.description).toMatch(/\[Buffer, \d+(\.\d+)?KB\]/);
        });
    });

    describe('getFileSourcesDisplayInfo', () => {
        it('should extract info for all FileSources in input', () => {
            const input = {
                prompt: 'Analyze',
                files: [
                    createPathFileSource({ path: './a.pdf' }),
                    createUrlFileSource({ url: 'https://example.com/b.png' }),
                ],
            };
            const infos = getFileSourcesDisplayInfo(input);

            expect(infos).toHaveLength(2);
            expect(infos[0].source).toBe('path');
            expect(infos[1].source).toBe('url');
        });

        it('should return empty array for no FileSources', () => {
            const input = { prompt: 'Hello' };
            const infos = getFileSourcesDisplayInfo(input);

            expect(infos).toEqual([]);
        });
    });
});
