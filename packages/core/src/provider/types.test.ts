import { describe, expect, it } from 'vitest';

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
// FileSource Type Guards
// ============================================================================

describe('FileSource type guards', () => {
    describe('isFileSource', () => {
        it('should return true for valid path FileSource', () => {
            const part: FileSourcePath = {
                source: 'path',
                path: '/path/to/file.pdf',
            };
            expect(isFileSource(part)).toBe(true);
        });

        it('should return true for valid data FileSource', () => {
            const part: FileSourceData = {
                source: 'data',
                data: Buffer.from('test'),
                mediaType: 'text/plain',
            };
            expect(isFileSource(part)).toBe(true);
        });

        it('should return true for valid base64 FileSource', () => {
            const part: FileSourceBase64 = {
                source: 'base64',
                data: 'dGVzdA==',
                mediaType: 'text/plain',
            };
            expect(isFileSource(part)).toBe(true);
        });

        it('should return true for valid url FileSource', () => {
            const part: FileSourceUrl = {
                source: 'url',
                url: 'https://example.com/file.pdf',
            };
            expect(isFileSource(part)).toBe(true);
        });

        it('should return false for null', () => {
            expect(isFileSource(null)).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(isFileSource(undefined)).toBe(false);
        });

        it('should return false for non-object', () => {
            expect(isFileSource('string')).toBe(false);
            expect(isFileSource(123)).toBe(false);
        });

        it('should return false for object with invalid source value', () => {
            expect(isFileSource({ source: 'invalid', path: '/test' })).toBe(false);
        });

        it('should return false for object without source', () => {
            expect(isFileSource({ path: '/test' })).toBe(false);
        });
    });

    describe('isFileSourcePath', () => {
        it('should return true for path source', () => {
            const part: FileSource = { source: 'path', path: '/test.pdf' };
            expect(isFileSourcePath(part)).toBe(true);
        });

        it('should return false for non-path sources', () => {
            const dataPart: FileSource = {
                source: 'data',
                data: Buffer.from(''),
                mediaType: 'text/plain',
            };
            expect(isFileSourcePath(dataPart)).toBe(false);
        });
    });

    describe('isFileSourceData', () => {
        it('should return true for data source', () => {
            const part: FileSource = {
                source: 'data',
                data: Buffer.from('test'),
                mediaType: 'text/plain',
            };
            expect(isFileSourceData(part)).toBe(true);
        });

        it('should return false for non-data sources', () => {
            const pathPart: FileSource = { source: 'path', path: '/test.pdf' };
            expect(isFileSourceData(pathPart)).toBe(false);
        });
    });

    describe('isFileSourceBase64', () => {
        it('should return true for base64 source', () => {
            const part: FileSource = {
                source: 'base64',
                data: 'dGVzdA==',
                mediaType: 'text/plain',
            };
            expect(isFileSourceBase64(part)).toBe(true);
        });

        it('should return false for non-base64 sources', () => {
            const pathPart: FileSource = { source: 'path', path: '/test.pdf' };
            expect(isFileSourceBase64(pathPart)).toBe(false);
        });
    });

    describe('isFileSourceUrl', () => {
        it('should return true for url source', () => {
            const part: FileSource = {
                source: 'url',
                url: 'https://example.com/file.pdf',
            };
            expect(isFileSourceUrl(part)).toBe(true);
        });

        it('should return false for non-url sources', () => {
            const pathPart: FileSource = { source: 'path', path: '/test.pdf' };
            expect(isFileSourceUrl(pathPart)).toBe(false);
        });
    });
});
