import { describe, it, expect } from 'vitest';
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

// ============================================================================
// FilePart Type Guards
// ============================================================================

describe('FilePart type guards', () => {
  describe('isFilePart', () => {
    it('should return true for valid path FilePart', () => {
      const part: FilePartPath = {
        type: 'file',
        source: 'path',
        path: '/path/to/file.pdf',
      };
      expect(isFilePart(part)).toBe(true);
    });

    it('should return true for valid data FilePart', () => {
      const part: FilePartData = {
        type: 'file',
        source: 'data',
        data: Buffer.from('test'),
        mediaType: 'text/plain',
      };
      expect(isFilePart(part)).toBe(true);
    });

    it('should return true for valid base64 FilePart', () => {
      const part: FilePartBase64 = {
        type: 'file',
        source: 'base64',
        data: 'dGVzdA==',
        mediaType: 'text/plain',
      };
      expect(isFilePart(part)).toBe(true);
    });

    it('should return true for valid url FilePart', () => {
      const part: FilePartUrl = {
        type: 'file',
        source: 'url',
        url: 'https://example.com/file.pdf',
      };
      expect(isFilePart(part)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isFilePart(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isFilePart(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isFilePart('string')).toBe(false);
      expect(isFilePart(123)).toBe(false);
    });

    it('should return false for object without type field', () => {
      expect(isFilePart({ source: 'path', path: '/test' })).toBe(false);
    });

    it('should return false for object with wrong type', () => {
      expect(isFilePart({ type: 'text', source: 'path', path: '/test' })).toBe(false);
    });

    it('should return false for object without source', () => {
      expect(isFilePart({ type: 'file', path: '/test' })).toBe(false);
    });
  });

  describe('isFilePartPath', () => {
    it('should return true for path source', () => {
      const part: FilePart = { type: 'file', source: 'path', path: '/test.pdf' };
      expect(isFilePartPath(part)).toBe(true);
    });

    it('should return false for non-path sources', () => {
      const dataPart: FilePart = {
        type: 'file',
        source: 'data',
        data: Buffer.from(''),
        mediaType: 'text/plain',
      };
      expect(isFilePartPath(dataPart)).toBe(false);
    });
  });

  describe('isFilePartData', () => {
    it('should return true for data source', () => {
      const part: FilePart = {
        type: 'file',
        source: 'data',
        data: Buffer.from('test'),
        mediaType: 'text/plain',
      };
      expect(isFilePartData(part)).toBe(true);
    });

    it('should return false for non-data sources', () => {
      const pathPart: FilePart = { type: 'file', source: 'path', path: '/test.pdf' };
      expect(isFilePartData(pathPart)).toBe(false);
    });
  });

  describe('isFilePartBase64', () => {
    it('should return true for base64 source', () => {
      const part: FilePart = {
        type: 'file',
        source: 'base64',
        data: 'dGVzdA==',
        mediaType: 'text/plain',
      };
      expect(isFilePartBase64(part)).toBe(true);
    });

    it('should return false for non-base64 sources', () => {
      const pathPart: FilePart = { type: 'file', source: 'path', path: '/test.pdf' };
      expect(isFilePartBase64(pathPart)).toBe(false);
    });
  });

  describe('isFilePartUrl', () => {
    it('should return true for url source', () => {
      const part: FilePart = {
        type: 'file',
        source: 'url',
        url: 'https://example.com/file.pdf',
      };
      expect(isFilePartUrl(part)).toBe(true);
    });

    it('should return false for non-url sources', () => {
      const pathPart: FilePart = { type: 'file', source: 'path', path: '/test.pdf' };
      expect(isFilePartUrl(pathPart)).toBe(false);
    });
  });
});
