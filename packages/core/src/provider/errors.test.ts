import { describe, expect, it } from 'vitest';

import {
  AuthenticationError,
  ModelNotFoundError,
  RateLimitError,
  TimeoutError,
} from './errors';
import { ProviderError, ProviderErrorCode } from '../errors';

describe('RateLimitError', () => {
  it('should create error with retryAfter', () => {
    const error = new RateLimitError(60);

    expect(error.message).toBe('Rate limit exceeded. Retry after 60 seconds.');
    expect(error.code).toBe(ProviderErrorCode.RATE_LIMIT);
    expect(error.name).toBe('RateLimitError');
    expect(error.retryAfter).toBe(60);
    expect(error.isRetryable).toBe(true);
  });

  it('should create error without retryAfter', () => {
    const error = new RateLimitError();

    expect(error.message).toBe('Rate limit exceeded');
    expect(error.retryAfter).toBeUndefined();
  });

  it('should include limit and remaining in context', () => {
    const error = new RateLimitError(60, { limit: 100, remaining: 0 });

    expect(error.limit).toBe(100);
    expect(error.remaining).toBe(0);
    expect(error.context).toMatchObject({
      retryAfter: 60,
      limit: 100,
      remaining: 0,
    });
  });

  it('should extend ProviderError', () => {
    const error = new RateLimitError(60);
    expect(error).toBeInstanceOf(ProviderError);
  });
});

describe('TimeoutError', () => {
  it('should create error with timeout and operation', () => {
    const error = new TimeoutError(30000, 'streamText');

    expect(error.message).toBe("Operation 'streamText' timed out after 30000ms");
    expect(error.code).toBe(ProviderErrorCode.TIMEOUT);
    expect(error.name).toBe('TimeoutError');
    expect(error.timeout).toBe(30000);
    expect(error.operation).toBe('streamText');
    expect(error.isRetryable).toBe(true);
  });

  it('should create error without operation', () => {
    const error = new TimeoutError(5000);

    expect(error.message).toBe('Operation timed out after 5000ms');
    expect(error.operation).toBeUndefined();
  });

  it('should include timeout and operation in context', () => {
    const error = new TimeoutError(10000, 'generateText');

    expect(error.context).toMatchObject({
      timeout: 10000,
      operation: 'generateText',
    });
  });

  it('should extend ProviderError', () => {
    const error = new TimeoutError(5000);
    expect(error).toBeInstanceOf(ProviderError);
  });
});

describe('AuthenticationError', () => {
  it('should create error with reason', () => {
    const error = new AuthenticationError('Invalid API key');

    expect(error.message).toBe('Authentication failed: Invalid API key');
    expect(error.code).toBe(ProviderErrorCode.AUTH_ERROR);
    expect(error.name).toBe('AuthenticationError');
    expect(error.reason).toBe('Invalid API key');
    expect(error.isRetryable).toBe(false);
  });

  it('should create error without reason', () => {
    const error = new AuthenticationError();

    expect(error.message).toBe('Authentication failed');
    expect(error.reason).toBeUndefined();
  });

  it('should include provider in context', () => {
    const error = new AuthenticationError('Expired', { provider: 'openai' });

    expect(error.provider).toBe('openai');
    expect(error.context).toMatchObject({
      reason: 'Expired',
      provider: 'openai',
    });
  });

  it('should extend ProviderError', () => {
    const error = new AuthenticationError('Invalid');
    expect(error).toBeInstanceOf(ProviderError);
  });
});

describe('ModelNotFoundError', () => {
  it('should create error with model', () => {
    const error = new ModelNotFoundError('gpt-5-turbo');

    expect(error.message).toBe("Model 'gpt-5-turbo' not found");
    expect(error.code).toBe(ProviderErrorCode.INVALID_MODEL);
    expect(error.name).toBe('ModelNotFoundError');
    expect(error.model).toBe('gpt-5-turbo');
    expect(error.isRetryable).toBe(false);
  });

  it('should include provider and availableModels', () => {
    const error = new ModelNotFoundError('invalid', {
      provider: 'openai',
      availableModels: ['gpt-4', 'gpt-3.5-turbo'],
    });

    expect(error.provider).toBe('openai');
    expect(error.availableModels).toEqual(['gpt-4', 'gpt-3.5-turbo']);
  });

  it('should include model in context', () => {
    const error = new ModelNotFoundError('unknown-model', { provider: 'google' });

    expect(error.context).toMatchObject({
      model: 'unknown-model',
      provider: 'google',
    });
  });

  it('should extend ProviderError', () => {
    const error = new ModelNotFoundError('invalid');
    expect(error).toBeInstanceOf(ProviderError);
  });
});
