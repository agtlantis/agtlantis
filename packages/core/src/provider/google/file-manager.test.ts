import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleFileManager } from './file-manager';
import { FileError, FileErrorCode } from '../../errors';
import type { FilePart } from '../types';

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

      const files: FilePart[] = [
        { type: 'file', source: 'path', path: '/test/doc.pdf', mediaType: 'application/pdf' },
      ];

      const result = await fileManager.upload(files);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'files/abc123',
        uri: 'https://storage.example.com/abc123',
        mimeType: 'application/pdf',
        name: 'files/abc123',
      });
      expect(mockUpload).toHaveBeenCalledOnce();
    });

    it('should handle URL source without uploading', async () => {
      const files: FilePart[] = [
        {
          type: 'file',
          source: 'url',
          url: 'https://example.com/file.pdf',
          mediaType: 'application/pdf',
          filename: 'remote-file.pdf',
        },
      ];

      const result = await fileManager.upload(files);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'https://example.com/file.pdf',
        uri: 'https://example.com/file.pdf',
        mimeType: 'application/pdf',
        name: 'remote-file.pdf',
        isExternal: true,
      });
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it('should upload data source files', async () => {
      const mockResponse = {
        name: 'files/data123',
        uri: 'https://storage.example.com/data123',
        mimeType: 'text/plain',
      };
      mockUpload.mockResolvedValue(mockResponse);

      const files: FilePart[] = [
        {
          type: 'file',
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

    it('should upload base64 source files', async () => {
      const mockResponse = {
        name: 'files/base64-123',
        uri: 'https://storage.example.com/base64-123',
        mimeType: 'image/png',
      };
      mockUpload.mockResolvedValue(mockResponse);

      const files: FilePart[] = [
        {
          type: 'file',
          source: 'base64',
          data: Buffer.from('test image data').toString('base64'),
          mediaType: 'image/png',
        },
      ];

      const result = await fileManager.upload(files);

      expect(result).toHaveLength(1);
      expect(result[0].mimeType).toBe('image/png');
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

      const files: FilePart[] = [
        { type: 'file', source: 'path', path: '/test/file1.txt' },
        { type: 'file', source: 'path', path: '/test/file2.txt' },
      ];

      const result = await fileManager.upload(files);

      expect(result).toHaveLength(2);
      expect(mockUpload).toHaveBeenCalledTimes(2);
    });

    it('should throw FileError on upload failure', async () => {
      mockUpload.mockRejectedValue(new Error('Network error'));

      const files: FilePart[] = [
        { type: 'file', source: 'path', path: '/test/doc.pdf' },
      ];

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

      const files: FilePart[] = [
        { type: 'file', source: 'path', path: '/test/file1.txt' },
        { type: 'file', source: 'path', path: '/test/file2.txt' },
      ];

      await expect(fileManager.upload(files)).rejects.toThrow(FileError);

      // Should have attempted to delete the successful upload
      expect(mockDelete).toHaveBeenCalledWith({ name: 'files/success1' });
    });

    it('should not track URL sources in uploadedFiles', async () => {
      const files: FilePart[] = [
        { type: 'file', source: 'url', url: 'https://example.com/file.pdf' },
      ];

      await fileManager.upload(files);

      // URL sources should not be tracked (they're external)
      expect(fileManager.getUploadedFiles()).toHaveLength(0);
    });

    it('should track non-URL uploads in uploadedFiles', async () => {
      mockUpload.mockResolvedValue({
        name: 'files/tracked',
        uri: 'https://storage.example.com/tracked',
        mimeType: 'text/plain',
      });

      const files: FilePart[] = [
        { type: 'file', source: 'path', path: '/test/file.txt' },
      ];

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

      await fileManager.upload([
        { type: 'file', source: 'path', path: '/test/file.txt' },
      ]);

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
        { type: 'file', source: 'path', path: '/test/file1.txt' },
        { type: 'file', source: 'path', path: '/test/file2.txt' },
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

      await fileManager.upload([
        { type: 'file', source: 'path', path: '/test/file.txt' },
      ]);

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

      await fileManager.upload([
        { type: 'file', source: 'path', path: '/test/file.txt' },
      ]);

      const files1 = fileManager.getUploadedFiles();
      const files2 = fileManager.getUploadedFiles();

      expect(files1).not.toBe(files2);
      expect(files1).toEqual(files2);
    });
  });

  describe('error context', () => {
    it('should include context in upload errors', async () => {
      mockUpload.mockRejectedValue(new Error('Upload failed'));

      const files: FilePart[] = [
        { type: 'file', source: 'path', path: '/test/doc.pdf', mediaType: 'application/pdf' },
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

      const files: FilePart[] = [
        { type: 'file', source: 'path', path: '/test/file.txt' },
      ];

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

      const files: FilePart[] = [
        { type: 'file', source: 'data', data: Buffer.from('test'), mediaType: 'text/plain' },
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
});
