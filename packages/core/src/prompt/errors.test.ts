import { describe, expect, it } from 'vitest';

import {
  PromptError,
  PromptErrorCode,
  PromptInvalidFormatError,
  PromptIOError,
  PromptNotFoundError,
  PromptTemplateError,
} from './errors';

describe('PromptError', () => {
  describe('constructor', () => {
    it('should create error with default code', () => {
      const error = new PromptError('Something went wrong');

      expect(error.message).toBe('Something went wrong');
      expect(error.code).toBe(PromptErrorCode.PROMPT_ERROR);
      expect(error.name).toBe('PromptError');
    });

    it('should create error with custom code', () => {
      const error = new PromptError('Not found', {
        code: PromptErrorCode.NOT_FOUND,
      });

      expect(error.code).toBe(PromptErrorCode.NOT_FOUND);
    });

    it('should include context', () => {
      const error = new PromptError('Error', {
        context: { promptId: 'test', version: '1.0.0' },
      });

      expect(error.context).toEqual({ promptId: 'test', version: '1.0.0' });
    });

    it('should include cause', () => {
      const cause = new Error('Original error');
      const error = new PromptError('Wrapped error', { cause });

      expect(error.cause).toBe(cause);
    });
  });

  describe('from', () => {
    it('should return same error if already PromptError', () => {
      const original = new PromptError('Original');
      const wrapped = PromptError.from(original);

      expect(wrapped).toBe(original);
    });

    it('should wrap Error instance', () => {
      const original = new Error('Original message');
      const wrapped = PromptError.from(original, PromptErrorCode.IO_ERROR);

      expect(wrapped).toBeInstanceOf(PromptError);
      expect(wrapped.message).toBe('Original message');
      expect(wrapped.code).toBe(PromptErrorCode.IO_ERROR);
      expect(wrapped.cause).toBe(original);
    });

    it('should wrap non-Error values', () => {
      const wrapped = PromptError.from('string error');

      expect(wrapped).toBeInstanceOf(PromptError);
      expect(wrapped.message).toBe('string error');
    });

    it('should include context when wrapping', () => {
      const wrapped = PromptError.from(
        new Error('error'),
        PromptErrorCode.PROMPT_ERROR,
        { key: 'value' }
      );

      expect(wrapped.context).toEqual({ key: 'value' });
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const cause = new Error('cause');
      const error = new PromptError('Test error', {
        code: PromptErrorCode.NOT_FOUND,
        cause,
        context: { id: 'test' },
      });

      const json = error.toJSON();

      expect(json.name).toBe('PromptError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe(PromptErrorCode.NOT_FOUND);
      expect(json.context).toEqual({ id: 'test' });
      expect(json.cause).toBe('cause');
      expect(json.stack).toBeDefined();
    });
  });
});

describe('PromptNotFoundError', () => {
  it('should create error for prompt without version', () => {
    const error = new PromptNotFoundError('greeting');

    expect(error.message).toBe("Prompt 'greeting' not found");
    expect(error.code).toBe(PromptErrorCode.NOT_FOUND);
    expect(error.name).toBe('PromptNotFoundError');
    expect(error.promptId).toBe('greeting');
    expect(error.version).toBeUndefined();
  });

  it('should create error for prompt with version', () => {
    const error = new PromptNotFoundError('greeting', '1.0.0');

    expect(error.message).toBe("Prompt 'greeting' version '1.0.0' not found");
    expect(error.promptId).toBe('greeting');
    expect(error.version).toBe('1.0.0');
  });

  it('should include additional context', () => {
    const error = new PromptNotFoundError('greeting', '1.0.0', {
      context: { directory: '/prompts' },
    });

    expect(error.context).toEqual({
      promptId: 'greeting',
      version: '1.0.0',
      directory: '/prompts',
    });
  });
});

describe('PromptInvalidFormatError', () => {
  it('should create error with details', () => {
    const error = new PromptInvalidFormatError('greeting', 'Missing field: system');

    expect(error.message).toBe("Invalid format for prompt 'greeting': Missing field: system");
    expect(error.code).toBe(PromptErrorCode.INVALID_FORMAT);
    expect(error.name).toBe('PromptInvalidFormatError');
    expect(error.promptId).toBe('greeting');
    expect(error.details).toBe('Missing field: system');
  });

  it('should include context', () => {
    const error = new PromptInvalidFormatError('greeting', 'Invalid YAML');

    expect(error.context).toEqual({
      promptId: 'greeting',
      details: 'Invalid YAML',
    });
  });
});

describe('PromptTemplateError', () => {
  it('should create error with details', () => {
    const error = new PromptTemplateError('greeting', 'Unexpected token');

    expect(error.message).toBe("Template compilation failed for prompt 'greeting': Unexpected token");
    expect(error.code).toBe(PromptErrorCode.TEMPLATE_ERROR);
    expect(error.name).toBe('PromptTemplateError');
    expect(error.promptId).toBe('greeting');
    expect(error.details).toBe('Unexpected token');
  });
});

describe('PromptIOError', () => {
  it('should create error for read operation', () => {
    const error = new PromptIOError('read', '/path/to/file.yaml');

    expect(error.message).toBe('Failed to read prompt file: /path/to/file.yaml');
    expect(error.code).toBe(PromptErrorCode.IO_ERROR);
    expect(error.name).toBe('PromptIOError');
    expect(error.operation).toBe('read');
    expect(error.path).toBe('/path/to/file.yaml');
  });

  it('should create error for write operation', () => {
    const error = new PromptIOError('write', '/path/to/file.yaml');

    expect(error.message).toBe('Failed to write prompt file: /path/to/file.yaml');
    expect(error.operation).toBe('write');
  });

  it('should create error for list operation', () => {
    const error = new PromptIOError('list', '/prompts');

    expect(error.message).toBe('Failed to list prompts in: /prompts');
    expect(error.operation).toBe('list');
  });

  it('should include cause', () => {
    const cause = new Error('ENOENT');
    const error = new PromptIOError('read', '/path', { cause });

    expect(error.cause).toBe(cause);
  });
});
