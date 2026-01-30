import { describe, it, expect } from 'vitest';
import {
  AgtlantisError,
  ExecutionError,
  ConfigurationError,
  FileError,
  ExecutionErrorCode,
  ConfigurationErrorCode,
  FileErrorCode,
} from './types';

describe('Error Classes', () => {
  describe('AgtlantisError', () => {
    it('should create error with message and code', () => {
      const error = new AgtlantisError('test message', {
        code: ExecutionErrorCode.EXECUTION_ERROR,
      });

      expect(error.message).toBe('test message');
      expect(error.name).toBe('AgtlantisError');
      expect(error.code).toBe(ExecutionErrorCode.EXECUTION_ERROR);
      expect(error).toBeInstanceOf(Error);
    });

    it('should support error chaining with cause', () => {
      const cause = new Error('original error');
      const error = new AgtlantisError('wrapped error', {
        code: ExecutionErrorCode.STREAM_ERROR,
        cause,
      });

      expect(error.message).toBe('wrapped error');
      expect(error.cause).toBe(cause);
    });

    it('should support context for debugging', () => {
      const error = new AgtlantisError('api failed', {
        code: ExecutionErrorCode.EXECUTION_ERROR,
        context: { endpoint: '/generate', statusCode: 500 },
      });

      expect(error.context).toEqual({ endpoint: '/generate', statusCode: 500 });
    });

    it('should serialize to JSON correctly', () => {
      const cause = new Error('network error');
      const error = new AgtlantisError('request failed', {
        code: ExecutionErrorCode.STREAM_ERROR,
        cause,
        context: { retries: 3 },
      });

      const json = error.toJSON();

      expect(json.name).toBe('AgtlantisError');
      expect(json.message).toBe('request failed');
      expect(json.code).toBe('STREAM_ERROR');
      expect(json.isRetryable).toBe(false);
      expect(json.context).toEqual({ retries: 3 });
      expect(json.cause).toBe('network error');
      expect(json.stack).toBeDefined();
    });
  });

  describe('ExecutionError', () => {
    it('should extend AgtlantisError', () => {
      const error = new ExecutionError('execution failed');

      expect(error.name).toBe('ExecutionError');
      expect(error).toBeInstanceOf(AgtlantisError);
    });

    it('should default to EXECUTION_ERROR code', () => {
      const error = new ExecutionError('generic error');

      expect(error.code).toBe(ExecutionErrorCode.EXECUTION_ERROR);
    });

    it('should accept specific error code', () => {
      const error = new ExecutionError('stream broken', {
        code: ExecutionErrorCode.STREAM_ERROR,
      });

      expect(error.code).toBe(ExecutionErrorCode.STREAM_ERROR);
    });

    it('should handle cancellation', () => {
      const error = new ExecutionError('user cancelled', {
        code: ExecutionErrorCode.CANCELLED,
        context: { elapsedMs: 5000 },
      });

      expect(error.code).toBe(ExecutionErrorCode.CANCELLED);
      expect(error.context).toEqual({ elapsedMs: 5000 });
    });

    describe('static from()', () => {
      it('should wrap errors as ExecutionError', () => {
        const error = ExecutionError.from(new Error('stream fail'), ExecutionErrorCode.STREAM_ERROR, {
          lastEvent: 'progress',
        });

        expect(error).toBeInstanceOf(ExecutionError);
        expect(error.code).toBe(ExecutionErrorCode.STREAM_ERROR);
        expect(error.context).toEqual({ lastEvent: 'progress' });
      });

      it('should return existing ExecutionError unchanged', () => {
        const existing = new ExecutionError('existing', {
          code: ExecutionErrorCode.CANCELLED,
        });
        const result = ExecutionError.from(existing);

        expect(result).toBe(existing);
      });
    });
  });

  describe('ConfigurationError', () => {
    it('should extend AgtlantisError', () => {
      const error = new ConfigurationError('config invalid');

      expect(error.name).toBe('ConfigurationError');
      expect(error).toBeInstanceOf(AgtlantisError);
    });

    it('should default to CONFIG_ERROR code', () => {
      const error = new ConfigurationError('generic error');

      expect(error.code).toBe(ConfigurationErrorCode.CONFIG_ERROR);
    });

    it('should handle missing API key', () => {
      const error = new ConfigurationError('GOOGLE_API_KEY not set', {
        code: ConfigurationErrorCode.MISSING_API_KEY,
        context: { envVar: 'GOOGLE_API_KEY' },
      });

      expect(error.code).toBe(ConfigurationErrorCode.MISSING_API_KEY);
      expect(error.context).toEqual({ envVar: 'GOOGLE_API_KEY' });
    });

    describe('static from()', () => {
      it('should wrap errors as ConfigurationError', () => {
        const error = ConfigurationError.from(new Error('invalid'), ConfigurationErrorCode.INVALID_CONFIG);

        expect(error).toBeInstanceOf(ConfigurationError);
        expect(error.code).toBe(ConfigurationErrorCode.INVALID_CONFIG);
      });

      it('should return existing ConfigurationError unchanged', () => {
        const existing = new ConfigurationError('existing', {
          code: ConfigurationErrorCode.MISSING_REQUIRED,
        });
        const result = ConfigurationError.from(existing);

        expect(result).toBe(existing);
      });
    });
  });

  describe('FileError', () => {
    it('should extend AgtlantisError', () => {
      const error = new FileError('file operation failed');

      expect(error.name).toBe('FileError');
      expect(error).toBeInstanceOf(AgtlantisError);
    });

    it('should default to FILE_ERROR code', () => {
      const error = new FileError('generic error');

      expect(error.code).toBe(FileErrorCode.FILE_ERROR);
    });

    it('should handle upload errors', () => {
      const error = new FileError('upload failed', {
        code: FileErrorCode.UPLOAD_ERROR,
        context: { filename: 'document.pdf', size: 10_000_000 },
      });

      expect(error.code).toBe(FileErrorCode.UPLOAD_ERROR);
      expect(error.context).toEqual({ filename: 'document.pdf', size: 10_000_000 });
    });

    it('should handle file too large', () => {
      const error = new FileError('file exceeds 50MB limit', {
        code: FileErrorCode.TOO_LARGE,
        context: { maxSize: 50_000_000, actualSize: 100_000_000 },
      });

      expect(error.code).toBe(FileErrorCode.TOO_LARGE);
    });

    describe('static from()', () => {
      it('should wrap errors as FileError', () => {
        const error = FileError.from(new Error('not found'), FileErrorCode.NOT_FOUND, {
          path: '/tmp/missing.txt',
        });

        expect(error).toBeInstanceOf(FileError);
        expect(error.code).toBe(FileErrorCode.NOT_FOUND);
        expect(error.context).toEqual({ path: '/tmp/missing.txt' });
      });

      it('should return existing FileError unchanged', () => {
        const existing = new FileError('existing', {
          code: FileErrorCode.DELETE_ERROR,
        });
        const result = FileError.from(existing);

        expect(result).toBe(existing);
      });
    });
  });

  describe('isRetryable', () => {
    it('should return false by default for all error types', () => {
      const errors = [
        new AgtlantisError('test', { code: ExecutionErrorCode.EXECUTION_ERROR }),
        new ExecutionError('test'),
        new ConfigurationError('test'),
        new FileError('test'),
      ];

      for (const error of errors) {
        expect(error.isRetryable).toBe(false);
      }
    });
  });

  describe('Type-safe error handling', () => {
    it('should allow instanceof checks for specific error types', () => {
      const errors: Error[] = [
        new ExecutionError('execution'),
        new ConfigurationError('config'),
        new FileError('file'),
      ];

      const executionErrors = errors.filter((e) => e instanceof ExecutionError);
      const configErrors = errors.filter((e) => e instanceof ConfigurationError);
      const fileErrors = errors.filter((e) => e instanceof FileError);

      expect(executionErrors).toHaveLength(1);
      expect(configErrors).toHaveLength(1);
      expect(fileErrors).toHaveLength(1);
    });

    it('should allow code-based error handling', () => {
      const error = new ExecutionError('stream failed', {
        code: ExecutionErrorCode.STREAM_ERROR,
      });

      switch (error.code) {
        case ExecutionErrorCode.STREAM_ERROR:
          expect(true).toBe(true);
          break;
        case ExecutionErrorCode.CANCELLED:
        case ExecutionErrorCode.EXECUTION_ERROR:
          expect(true).toBe(false);
          break;
      }
    });
  });
});
