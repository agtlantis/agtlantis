import { describe, it, expect } from 'vitest';
import {
  AgtlantisError,
  ProviderError,
  ExecutionError,
  ConfigurationError,
  FileError,
  ProviderErrorCode,
  ExecutionErrorCode,
  ConfigurationErrorCode,
  FileErrorCode,
} from './types';

describe('Error Classes', () => {
  describe('AgtlantisError', () => {
    it('should create error with message and code', () => {
      const error = new AgtlantisError('test message', {
        code: ProviderErrorCode.API_ERROR,
      });

      expect(error.message).toBe('test message');
      expect(error.name).toBe('AgtlantisError');
      expect(error.code).toBe(ProviderErrorCode.API_ERROR);
      expect(error).toBeInstanceOf(Error);
    });

    it('should support error chaining with cause', () => {
      const cause = new Error('original error');
      const error = new AgtlantisError('wrapped error', {
        code: ProviderErrorCode.API_ERROR,
        cause,
      });

      expect(error.message).toBe('wrapped error');
      expect(error.cause).toBe(cause);
    });

    it('should support context for debugging', () => {
      const error = new AgtlantisError('api failed', {
        code: ProviderErrorCode.API_ERROR,
        context: { endpoint: '/generate', statusCode: 500 },
      });

      expect(error.context).toEqual({ endpoint: '/generate', statusCode: 500 });
    });

    it('should serialize to JSON correctly', () => {
      const cause = new Error('network error');
      const error = new AgtlantisError('request failed', {
        code: ProviderErrorCode.API_ERROR,
        cause,
        context: { retries: 3 },
      });

      const json = error.toJSON();

      expect(json.name).toBe('AgtlantisError');
      expect(json.message).toBe('request failed');
      expect(json.code).toBe('API_ERROR');
      expect(json.isRetryable).toBe(false);
      expect(json.context).toEqual({ retries: 3 });
      expect(json.cause).toBe('network error');
      expect(json.stack).toBeDefined();
    });
  });

  describe('ProviderError', () => {
    it('should extend AgtlantisError', () => {
      const error = new ProviderError('provider failed');

      expect(error.name).toBe('ProviderError');
      expect(error).toBeInstanceOf(AgtlantisError);
      expect(error).toBeInstanceOf(Error);
    });

    it('should default to PROVIDER_ERROR code', () => {
      const error = new ProviderError('generic error');

      expect(error.code).toBe(ProviderErrorCode.PROVIDER_ERROR);
    });

    it('should accept specific error code', () => {
      const error = new ProviderError('rate limited', {
        code: ProviderErrorCode.RATE_LIMIT,
      });

      expect(error.code).toBe(ProviderErrorCode.RATE_LIMIT);
    });

    it('should support context', () => {
      const error = new ProviderError('api error', {
        code: ProviderErrorCode.API_ERROR,
        context: { statusCode: 429, retryAfter: 60 },
      });

      expect(error.context).toEqual({ statusCode: 429, retryAfter: 60 });
    });

    describe('static from()', () => {
      it('should wrap unknown error with code', () => {
        const original = new Error('something broke');
        const error = ProviderError.from(original, ProviderErrorCode.API_ERROR);

        expect(error.message).toBe('something broke');
        expect(error.code).toBe(ProviderErrorCode.API_ERROR);
        expect(error.cause).toBe(original);
      });

      it('should wrap non-Error values', () => {
        const error = ProviderError.from('string error', ProviderErrorCode.API_ERROR);

        expect(error.message).toBe('string error');
        expect(error.cause).toBeInstanceOf(Error);
      });

      it('should wrap errors as ProviderError', () => {
        const error = ProviderError.from(new Error('network fail'), ProviderErrorCode.TIMEOUT);

        expect(error).toBeInstanceOf(ProviderError);
        expect(error.code).toBe(ProviderErrorCode.TIMEOUT);
      });

      it('should return existing ProviderError unchanged', () => {
        const existing = new ProviderError('existing', {
          code: ProviderErrorCode.AUTH_ERROR,
        });
        const result = ProviderError.from(existing);

        expect(result).toBe(existing);
      });

      it('should include context when provided', () => {
        const error = ProviderError.from(new Error('fail'), ProviderErrorCode.API_ERROR, {
          model: 'gpt-4',
        });

        expect(error.context).toEqual({ model: 'gpt-4' });
      });
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
    describe('AgtlantisError', () => {
      it('should return false by default', () => {
        const error = new AgtlantisError('test', {
          code: ProviderErrorCode.API_ERROR,
        });

        expect(error.isRetryable).toBe(false);
      });
    });

    describe('ProviderError', () => {
      it('should return true for RATE_LIMIT code', () => {
        const error = new ProviderError('rate limited', {
          code: ProviderErrorCode.RATE_LIMIT,
        });

        expect(error.isRetryable).toBe(true);
      });

      it('should return true for TIMEOUT code', () => {
        const error = new ProviderError('timed out', {
          code: ProviderErrorCode.TIMEOUT,
        });

        expect(error.isRetryable).toBe(true);
      });

      it('should return false for AUTH_ERROR code', () => {
        const error = new ProviderError('auth failed', {
          code: ProviderErrorCode.AUTH_ERROR,
        });

        expect(error.isRetryable).toBe(false);
      });

      it('should return false for other codes', () => {
        const error = new ProviderError('generic', {
          code: ProviderErrorCode.PROVIDER_ERROR,
        });

        expect(error.isRetryable).toBe(false);
      });
    });
  });

  describe('Type-safe error handling', () => {
    it('should allow instanceof checks for specific error types', () => {
      const errors: Error[] = [
        new ProviderError('provider'),
        new ExecutionError('execution'),
        new ConfigurationError('config'),
        new FileError('file'),
      ];

      const providerErrors = errors.filter((e) => e instanceof ProviderError);
      const executionErrors = errors.filter((e) => e instanceof ExecutionError);
      const configErrors = errors.filter((e) => e instanceof ConfigurationError);
      const fileErrors = errors.filter((e) => e instanceof FileError);

      expect(providerErrors).toHaveLength(1);
      expect(executionErrors).toHaveLength(1);
      expect(configErrors).toHaveLength(1);
      expect(fileErrors).toHaveLength(1);
    });

    it('should allow code-based error handling', () => {
      const error = new ProviderError('rate limited', {
        code: ProviderErrorCode.RATE_LIMIT,
      });

      switch (error.code) {
        case ProviderErrorCode.RATE_LIMIT:
          expect(true).toBe(true);
          break;
        case ProviderErrorCode.TIMEOUT:
        case ProviderErrorCode.API_ERROR:
          expect(true).toBe(false);
          break;
      }
    });
  });
});
