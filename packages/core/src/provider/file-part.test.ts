import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isFilePart,
  isFilePartPath,
  isFilePartData,
  isFilePartBase64,
  isFilePartUrl,
  type FilePart,
  type FilePartPath,
  type FilePartData,
  type FilePartBase64,
  type FilePartUrl,
} from './types';
import {
  scanForFileParts,
  resolveFilePart,
  resolveFilePartsInInput,
  getFilePartDisplayInfo,
  getFilePartsDisplayInfo,
  inferMimeType,
} from './file-part';
import { FileErrorCode } from '../errors';

// ============================================================================
// Test Fixtures - Factory Functions for DRY
// ============================================================================

/** Creates a path-based FilePart for testing */
function createPathFilePart(overrides?: Partial<FilePartPath>): FilePartPath {
  return {
    type: 'file',
    source: 'path',
    path: './test.pdf',
    ...overrides,
  };
}

/** Creates a data-based FilePart for testing */
function createDataFilePart(overrides?: Partial<FilePartData>): FilePartData {
  return {
    type: 'file',
    source: 'data',
    data: Buffer.from('test content'),
    mediaType: 'text/plain',
    ...overrides,
  };
}

/** Creates a base64-based FilePart for testing */
function createBase64FilePart(overrides?: Partial<FilePartBase64>): FilePartBase64 {
  return {
    type: 'file',
    source: 'base64',
    data: Buffer.from('test').toString('base64'), // 'dGVzdA=='
    mediaType: 'text/plain',
    ...overrides,
  };
}

/** Creates a URL-based FilePart for testing */
function createUrlFilePart(overrides?: Partial<FilePartUrl>): FilePartUrl {
  return {
    type: 'file',
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

  describe('isFilePart', () => {
    it('should identify FilePartPath', () => {
      const part: FilePartPath = { type: 'file', source: 'path', path: './test.pdf' };
      expect(isFilePart(part)).toBe(true);
    });

    it('should identify FilePartData', () => {
      const part: FilePartData = { type: 'file', source: 'data', data: Buffer.from('test'), mediaType: 'text/plain' };
      expect(isFilePart(part)).toBe(true);
    });

    it('should identify FilePartBase64', () => {
      const part: FilePartBase64 = { type: 'file', source: 'base64', data: 'dGVzdA==', mediaType: 'text/plain' };
      expect(isFilePart(part)).toBe(true);
    });

    it('should identify FilePartUrl', () => {
      const part: FilePartUrl = { type: 'file', source: 'url', url: 'https://example.com/test.png' };
      expect(isFilePart(part)).toBe(true);
    });

    it('should reject non-FilePart objects', () => {
      expect(isFilePart({ type: 'image', data: 'x' })).toBe(false);
      expect(isFilePart({ type: 'file' })).toBe(false); // missing source
      expect(isFilePart({ source: 'path' })).toBe(false); // missing type
      expect(isFilePart(null)).toBe(false);
      expect(isFilePart(undefined)).toBe(false);
      expect(isFilePart('string')).toBe(false);
      expect(isFilePart(123)).toBe(false);
    });
  });

  describe('isFilePartPath', () => {
    it('should identify path source', () => {
      const part: FilePart = { type: 'file', source: 'path', path: './test.pdf' };
      expect(isFilePartPath(part)).toBe(true);
    });

    it('should reject non-path sources', () => {
      const part: FilePart = { type: 'file', source: 'url', url: 'https://example.com' };
      expect(isFilePartPath(part)).toBe(false);
    });
  });

  describe('isFilePartData', () => {
    it('should identify data source', () => {
      const part: FilePart = { type: 'file', source: 'data', data: Buffer.from('x'), mediaType: 'text/plain' };
      expect(isFilePartData(part)).toBe(true);
    });
  });

  describe('isFilePartBase64', () => {
    it('should identify base64 source', () => {
      const part: FilePart = { type: 'file', source: 'base64', data: 'dGVzdA==', mediaType: 'text/plain' };
      expect(isFilePartBase64(part)).toBe(true);
    });
  });

  describe('isFilePartUrl', () => {
    it('should identify url source', () => {
      const part: FilePart = { type: 'file', source: 'url', url: 'https://example.com' };
      expect(isFilePartUrl(part)).toBe(true);
    });
  });

  // ============================================================================
  // MIME Type Inference
  // ============================================================================

  describe('inferMimeType', () => {
    it('should infer common MIME types', () => {
      expect(inferMimeType('./test.pdf')).toBe('application/pdf');
      expect(inferMimeType('./test.png')).toBe('image/png');
      expect(inferMimeType('./test.jpg')).toBe('image/jpeg');
      expect(inferMimeType('./test.jpeg')).toBe('image/jpeg');
      expect(inferMimeType('./test.json')).toBe('application/json');
      expect(inferMimeType('./test.html')).toBe('text/html');
      expect(inferMimeType('./test.txt')).toBe('text/plain');
    });

    it('should be case-insensitive', () => {
      expect(inferMimeType('./test.PDF')).toBe('application/pdf');
      expect(inferMimeType('./test.PNG')).toBe('image/png');
    });

    it('should return undefined for unknown extensions', () => {
      expect(inferMimeType('./test.xyz')).toBeUndefined();
      expect(inferMimeType('./test')).toBeUndefined();
    });
  });

  // ============================================================================
  // Scanner
  // ============================================================================

  describe('scanForFileParts', () => {
    it('should find a single FilePart at root', () => {
      const input: FilePart = { type: 'file', source: 'path', path: './test.pdf' };
      const found = scanForFileParts(input);

      expect(found).toHaveLength(1);
      expect(found[0].part).toEqual(input);
      expect(found[0].path).toEqual([]);
    });

    it('should find FilePart in nested object', () => {
      const input = {
        prompt: 'Analyze',
        file: { type: 'file', source: 'path', path: './test.pdf' } as FilePart,
      };
      const found = scanForFileParts(input);

      expect(found).toHaveLength(1);
      expect(found[0].path).toEqual(['file']);
    });

    it('should find FileParts in array', () => {
      const input = {
        files: [
          { type: 'file', source: 'path', path: './a.pdf' },
          { type: 'file', source: 'path', path: './b.pdf' },
        ] as FilePart[],
      };
      const found = scanForFileParts(input);

      expect(found).toHaveLength(2);
      expect(found[0].path).toEqual(['files', 0]);
      expect(found[1].path).toEqual(['files', 1]);
    });

    it('should find deeply nested FileParts', () => {
      const input = {
        level1: {
          level2: {
            level3: { type: 'file', source: 'path', path: './deep.pdf' } as FilePart,
          },
        },
      };
      const found = scanForFileParts(input);

      expect(found).toHaveLength(1);
      expect(found[0].path).toEqual(['level1', 'level2', 'level3']);
    });

    it('should find mixed content', () => {
      const input = {
        prompt: 'Analyze these',
        mainFile: { type: 'file', source: 'path', path: './main.pdf' } as FilePart,
        extras: [
          { type: 'file', source: 'url', url: 'https://example.com/img.png' } as FilePart,
          { type: 'file', source: 'base64', data: 'dGVzdA==', mediaType: 'text/plain' } as FilePart,
        ],
      };
      const found = scanForFileParts(input);

      expect(found).toHaveLength(3);
    });

    it('should return empty array for non-FilePart input', () => {
      expect(scanForFileParts({ prompt: 'Hello' })).toEqual([]);
      expect(scanForFileParts('string')).toEqual([]);
      expect(scanForFileParts(123)).toEqual([]);
      expect(scanForFileParts(null)).toEqual([]);
      expect(scanForFileParts(undefined)).toEqual([]);
    });

    it('should skip Buffer and URL objects', () => {
      const input = {
        buffer: Buffer.from('test'),
        url: new URL('https://example.com'),
        file: { type: 'file', source: 'path', path: './test.pdf' } as FilePart,
      };
      const found = scanForFileParts(input);

      expect(found).toHaveLength(1);
      expect(found[0].path).toEqual(['file']);
    });
  });

  // ============================================================================
  // Resolver
  // ============================================================================

  describe('resolveFilePart', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = join(tmpdir(), `file-part-test-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('should resolve path-based FilePart', async () => {
      const content = 'Hello, World!';
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, content);

      const part: FilePartPath = { type: 'file', source: 'path', path: filePath };
      const resolved = await resolveFilePart(part);

      expect(resolved.type).toBe('file');
      expect(isFilePartData(resolved)).toBe(true);
      if (isFilePartData(resolved)) {
        expect(Buffer.isBuffer(resolved.data)).toBe(true);
        expect((resolved.data as Buffer).toString()).toBe(content);
      }
      expect(resolved.mediaType).toBe('text/plain');
      expect(resolved.filename).toBe('test.txt');
    });

    it('should resolve path with custom mediaType', async () => {
      const filePath = join(tempDir, 'data');
      await writeFile(filePath, 'binary');

      const part: FilePartPath = { type: 'file', source: 'path', path: filePath, mediaType: 'application/custom' };
      const resolved = await resolveFilePart(part);

      expect(resolved.mediaType).toBe('application/custom');
    });

    it('should resolve path with custom filename', async () => {
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, 'content');

      const part: FilePartPath = { type: 'file', source: 'path', path: filePath, filename: 'custom.txt' };
      const resolved = await resolveFilePart(part);

      expect(resolved.filename).toBe('custom.txt');
    });

    it('should resolve relative path with basePath', async () => {
      const content = 'Relative content';
      const filePath = join(tempDir, 'relative.txt');
      await writeFile(filePath, content);

      const part: FilePartPath = { type: 'file', source: 'path', path: 'relative.txt' };
      const resolved = await resolveFilePart(part, { basePath: tempDir });

      expect(isFilePartData(resolved)).toBe(true);
      if (isFilePartData(resolved)) {
        expect((resolved.data as Buffer).toString()).toBe(content);
      }
    });

    it('should throw for non-existent file', async () => {
      const part: FilePartPath = { type: 'file', source: 'path', path: '/nonexistent/file.txt' };

      await expect(resolveFilePart(part)).rejects.toMatchObject({
        code: FileErrorCode.NOT_FOUND,
      });
    });

    it('should throw for file exceeding maxSize', async () => {
      const filePath = join(tempDir, 'large.txt');
      await writeFile(filePath, CONTENT_EXCEEDING_LIMIT);

      const part = createPathFilePart({ path: filePath });

      await expect(resolveFilePart(part, { maxSize: SMALL_SIZE_LIMIT })).rejects.toMatchObject({
        code: FileErrorCode.TOO_LARGE,
      });
    });

    it('should return data-based FilePart unchanged', async () => {
      const buffer = Buffer.from('test data');
      const part: FilePartData = { type: 'file', source: 'data', data: buffer, mediaType: 'text/plain' };
      const resolved = await resolveFilePart(part);

      expect(resolved).toBe(part);
      expect(isFilePartData(resolved)).toBe(true);
    });

    it('should return data-based FilePart with Uint8Array unchanged', async () => {
      const uint8 = new Uint8Array([116, 101, 115, 116]); // 'test'
      const part: FilePartData = { type: 'file', source: 'data', data: uint8, mediaType: 'text/plain' };
      const resolved = await resolveFilePart(part);

      expect(resolved).toBe(part);
      expect(isFilePartData(resolved)).toBe(true);
    });

    it('should return base64-based FilePart unchanged', async () => {
      const base64 = Buffer.from('Hello').toString('base64');
      const part: FilePartBase64 = { type: 'file', source: 'base64', data: base64, mediaType: 'text/plain' };
      const resolved = await resolveFilePart(part);

      expect(resolved).toBe(part);
      expect(isFilePartBase64(resolved)).toBe(true);
      expect(resolved.mediaType).toBe('text/plain');
    });

    it('should return url-based FilePart unchanged', async () => {
      const part: FilePartUrl = { type: 'file', source: 'url', url: 'https://example.com/image.png' };
      const resolved = await resolveFilePart(part);

      expect(resolved).toBe(part);
      expect(isFilePartUrl(resolved)).toBe(true);
      if (isFilePartUrl(resolved)) {
        expect(resolved.url).toBe('https://example.com/image.png');
      }
    });

    it('should preserve mediaType for url-based FilePart', async () => {
      const part: FilePartUrl = { type: 'file', source: 'url', url: 'https://example.com/data', mediaType: 'application/custom' };
      const resolved = await resolveFilePart(part);

      expect(resolved).toBe(part);
      expect(resolved.mediaType).toBe('application/custom');
    });
  });

  // ============================================================================
  // Input Resolver
  // ============================================================================

  describe('resolveFilePartsInInput', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = join(tmpdir(), `resolve-input-test-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('should return input unchanged if no FileParts', async () => {
      const input = { prompt: 'Hello', count: 42 };
      const result = await resolveFilePartsInInput(input);

      expect(result).toEqual(input);
    });

    it('should resolve single FilePart at root', async () => {
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, 'content');

      const input: FilePartPath = { type: 'file', source: 'path', path: filePath };
      const result = await resolveFilePartsInInput<FilePart>(input);

      expect(result.type).toBe('file');
      expect(isFilePartData(result)).toBe(true);
      if (isFilePartData(result)) {
        expect(Buffer.isBuffer(result.data)).toBe(true);
      }
    });

    it('should resolve nested FilePart', async () => {
      const filePath = join(tempDir, 'nested.txt');
      await writeFile(filePath, 'nested content');

      const input = {
        prompt: 'Analyze',
        file: { type: 'file', source: 'path', path: filePath } as FilePart,
      };
      const result = await resolveFilePartsInInput(input, { basePath: tempDir });

      expect(result.prompt).toBe('Analyze');
      expect((result.file as { data: Buffer }).data).toBeInstanceOf(Buffer);
    });

    it('should resolve multiple FileParts in array', async () => {
      const file1 = join(tempDir, 'a.txt');
      const file2 = join(tempDir, 'b.txt');
      await writeFile(file1, 'content a');
      await writeFile(file2, 'content b');

      const input = {
        files: [
          { type: 'file', source: 'path', path: file1 },
          { type: 'file', source: 'path', path: file2 },
        ] as FilePart[],
      };
      const result = await resolveFilePartsInInput(input);

      expect(result.files).toHaveLength(2);
      expect(Buffer.isBuffer((result.files[0] as { data: Buffer }).data)).toBe(true);
      expect(Buffer.isBuffer((result.files[1] as { data: Buffer }).data)).toBe(true);
    });

    it('should not mutate original input', async () => {
      const filePath = join(tempDir, 'immutable.txt');
      await writeFile(filePath, 'content');

      const original = {
        file: { type: 'file', source: 'path', path: filePath } as FilePart,
      };
      const originalCopy = JSON.stringify(original);

      await resolveFilePartsInInput(original);

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
        files: files.map((p) => ({ type: 'file', source: 'path', path: p }) as FilePart),
      };

      const start = Date.now();
      await resolveFilePartsInInput(input);
      const elapsed = Date.now() - start;

      // Parallel resolution should be fast (< 1s for 5 small files)
      expect(elapsed).toBeLessThan(1000);
    });
  });

  // ============================================================================
  // Display Info
  // ============================================================================

  describe('getFilePartDisplayInfo', () => {
    it('should extract path info', () => {
      const part: FilePartPath = { type: 'file', source: 'path', path: './fixtures/doc.pdf' };
      const info = getFilePartDisplayInfo(part);

      expect(info.source).toBe('path');
      expect(info.description).toBe('./fixtures/doc.pdf');
      expect(info.mediaType).toBe('application/pdf');
      expect(info.filename).toBe('doc.pdf');
    });

    it('should extract url info', () => {
      const part: FilePartUrl = { type: 'file', source: 'url', url: 'https://example.com/image.png' };
      const info = getFilePartDisplayInfo(part);

      expect(info.source).toBe('url');
      expect(info.description).toBe('https://example.com/image.png');
    });

    it('should extract base64 info', () => {
      const part = createBase64FilePart({ data: BASE64_TEST_DATA });
      const info = getFilePartDisplayInfo(part);

      expect(info.source).toBe('base64');
      expect(info.description).toMatch(/\[base64 data, ~\d+(\.\d+)?KB\]/);
      expect(info.mediaType).toBe('text/plain');
    });

    it('should extract data info', () => {
      const buffer = Buffer.alloc(BUFFER_TEST_SIZE);
      const part = createDataFilePart({ data: buffer, mediaType: 'application/octet-stream' });
      const info = getFilePartDisplayInfo(part);

      expect(info.source).toBe('data');
      expect(info.description).toMatch(/\[Buffer, \d+(\.\d+)?KB\]/);
    });
  });

  describe('getFilePartsDisplayInfo', () => {
    it('should extract info for all FileParts in input', () => {
      const input = {
        prompt: 'Analyze',
        files: [
          createPathFilePart({ path: './a.pdf' }),
          createUrlFilePart({ url: 'https://example.com/b.png' }),
        ],
      };
      const infos = getFilePartsDisplayInfo(input);

      expect(infos).toHaveLength(2);
      expect(infos[0].source).toBe('path');
      expect(infos[1].source).toBe('url');
    });

    it('should return empty array for no FileParts', () => {
      const input = { prompt: 'Hello' };
      const infos = getFilePartsDisplayInfo(input);

      expect(infos).toEqual([]);
    });
  });
});
