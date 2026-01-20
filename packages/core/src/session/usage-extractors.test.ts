import { describe, expect, it } from 'vitest';
import type { LanguageModelUsage } from 'ai';
import { createZeroUsage, detectProviderType, mergeUsages } from './usage-extractors';
import { createTestUsage } from './test-utils';

describe('mergeUsages', () => {
  describe('empty array', () => {
    it('should return zero usage for empty array', () => {
      const result = mergeUsages([]);

      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
      expect(result.totalTokens).toBe(0);
    });

    it('should include zero token details for empty array', () => {
      const result = mergeUsages([]);

      expect(result.inputTokenDetails).toEqual({
        noCacheTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      expect(result.outputTokenDetails).toEqual({
        textTokens: 0,
        reasoningTokens: 0,
      });
    });
  });

  describe('single usage', () => {
    it('should pass through single usage values', () => {
      const usage = createTestUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      const result = mergeUsages([usage]);

      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.totalTokens).toBe(150);
    });

    it('should provide zero token details when source has none', () => {
      const usage = createTestUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      const result = mergeUsages([usage]);

      expect(result.inputTokenDetails).toEqual({
        noCacheTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      expect(result.outputTokenDetails).toEqual({
        textTokens: 0,
        reasoningTokens: 0,
      });
    });

    it('should include token details from single usage', () => {
      const usage: LanguageModelUsage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputTokenDetails: {
          noCacheTokens: 80,
          cacheReadTokens: 20,
          cacheWriteTokens: 10,
        },
        outputTokenDetails: {
          textTokens: 40,
          reasoningTokens: 10,
        },
      };

      const result = mergeUsages([usage]);

      expect(result.inputTokenDetails).toEqual({
        noCacheTokens: 80,
        cacheReadTokens: 20,
        cacheWriteTokens: 10,
      });
      expect(result.outputTokenDetails).toEqual({
        textTokens: 40,
        reasoningTokens: 10,
      });
    });
  });

  describe('multiple usages', () => {
    it('should sum core token counts correctly', () => {
      const usages = [
        createTestUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
        createTestUsage({ inputTokens: 200, outputTokens: 100, totalTokens: 300 }),
        createTestUsage({ inputTokens: 50, outputTokens: 25, totalTokens: 75 }),
      ];

      const result = mergeUsages(usages);

      expect(result.inputTokens).toBe(350);
      expect(result.outputTokens).toBe(175);
      expect(result.totalTokens).toBe(525);
    });

    it('should sum input token details correctly', () => {
      const usages = [
        createTestUsage({
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          inputTokenDetails: {
            noCacheTokens: 80,
            cacheReadTokens: 20,
            cacheWriteTokens: 0,
          },
        }),
        createTestUsage({
          inputTokens: 200,
          outputTokens: 100,
          totalTokens: 300,
          inputTokenDetails: {
            noCacheTokens: 150,
            cacheReadTokens: 50,
            cacheWriteTokens: 30,
          },
        }),
      ];

      const result = mergeUsages(usages);

      expect(result.inputTokenDetails).toEqual({
        noCacheTokens: 230,
        cacheReadTokens: 70,
        cacheWriteTokens: 30,
      });
    });

    it('should sum output token details correctly', () => {
      const usages = [
        createTestUsage({
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          outputTokenDetails: {
            textTokens: 40,
            reasoningTokens: 10,
          },
        }),
        createTestUsage({
          inputTokens: 200,
          outputTokens: 100,
          totalTokens: 300,
          outputTokenDetails: {
            textTokens: 80,
            reasoningTokens: 20,
          },
        }),
      ];

      const result = mergeUsages(usages);

      expect(result.outputTokenDetails).toEqual({
        textTokens: 120,
        reasoningTokens: 30,
      });
    });
  });

  describe('undefined handling', () => {
    it('should treat undefined core tokens as 0', () => {
      const usages = [
        createTestUsage({ inputTokens: 100, outputTokens: 0, totalTokens: 100 }),
        createTestUsage({ inputTokens: 0, outputTokens: 50, totalTokens: 50 }),
      ];

      const result = mergeUsages(usages);

      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.totalTokens).toBe(150);
    });

    it('should treat missing inputTokenDetails as zero', () => {
      const usages = [
        createTestUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
        createTestUsage({
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          inputTokenDetails: {
            cacheReadTokens: 20,
            noCacheTokens: 0,
            cacheWriteTokens: 0,
          },
        }),
      ];

      const result = mergeUsages(usages);

      expect(result.inputTokenDetails).toEqual({
        noCacheTokens: 0,
        cacheReadTokens: 20,
        cacheWriteTokens: 0,
      });
    });

    it('should treat missing outputTokenDetails as zero', () => {
      const usages = [
        createTestUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
        createTestUsage({
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          outputTokenDetails: {
            textTokens: 40,
            reasoningTokens: 0,
          },
        }),
      ];

      const result = mergeUsages(usages);

      expect(result.outputTokenDetails).toEqual({
        textTokens: 40,
        reasoningTokens: 0,
      });
    });
  });
});

describe('createZeroUsage', () => {
  it('should return zero values for all fields', () => {
    const result = createZeroUsage();

    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.totalTokens).toBe(0);
    expect(result.inputTokenDetails).toEqual({
      noCacheTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(result.outputTokenDetails).toEqual({
      textTokens: 0,
      reasoningTokens: 0,
    });
  });

  it('should return new object each time', () => {
    const result1 = createZeroUsage();
    const result2 = createZeroUsage();

    expect(result1).not.toBe(result2);
    expect(result1.inputTokenDetails).not.toBe(result2.inputTokenDetails);
  });
});

describe('detectProviderType', () => {
  describe('OpenAI models', () => {
    it('should detect gpt-4o as openai', () => {
      expect(detectProviderType('gpt-4o')).toBe('openai');
    });

    it('should detect gpt-4o-mini as openai', () => {
      expect(detectProviderType('gpt-4o-mini')).toBe('openai');
    });

    it('should detect gpt-3.5-turbo as openai', () => {
      expect(detectProviderType('gpt-3.5-turbo')).toBe('openai');
    });

    it('should detect o1-preview as openai', () => {
      expect(detectProviderType('o1-preview')).toBe('openai');
    });

    it('should detect o1-mini as openai', () => {
      expect(detectProviderType('o1-mini')).toBe('openai');
    });

    it('should detect o3-mini as openai', () => {
      expect(detectProviderType('o3-mini')).toBe('openai');
    });

    it('should detect exact o1 model name as openai', () => {
      expect(detectProviderType('o1')).toBe('openai');
    });

    it('should detect exact o3 model name as openai', () => {
      expect(detectProviderType('o3')).toBe('openai');
    });

    it('should be case-insensitive for OpenAI', () => {
      expect(detectProviderType('GPT-4o')).toBe('openai');
      expect(detectProviderType('O1-Preview')).toBe('openai');
    });

    it('should NOT detect o1abc as openai (strict pattern matching)', () => {
      expect(detectProviderType('o1abc')).toBeUndefined();
    });

    it('should NOT detect o3xyz as openai (strict pattern matching)', () => {
      expect(detectProviderType('o3xyz')).toBeUndefined();
    });
  });

  describe('Google models', () => {
    it('should detect gemini-2.5-flash as google', () => {
      expect(detectProviderType('gemini-2.5-flash')).toBe('google');
    });

    it('should detect gemini-1.5-pro as google', () => {
      expect(detectProviderType('gemini-1.5-pro')).toBe('google');
    });

    it('should detect gemini-2.0-flash-exp as google', () => {
      expect(detectProviderType('gemini-2.0-flash-exp')).toBe('google');
    });

    it('should be case-insensitive for Google', () => {
      expect(detectProviderType('Gemini-2.5-Flash')).toBe('google');
      expect(detectProviderType('GEMINI-1.5-PRO')).toBe('google');
    });
  });

  describe('Anthropic models', () => {
    it('should detect claude-3-5-sonnet as anthropic', () => {
      expect(detectProviderType('claude-3-5-sonnet')).toBe('anthropic');
    });

    it('should detect claude-3-5-sonnet-20241022 as anthropic', () => {
      expect(detectProviderType('claude-3-5-sonnet-20241022')).toBe('anthropic');
    });

    it('should detect claude-3-opus as anthropic', () => {
      expect(detectProviderType('claude-3-opus')).toBe('anthropic');
    });

    it('should detect claude-3-haiku as anthropic', () => {
      expect(detectProviderType('claude-3-haiku')).toBe('anthropic');
    });

    it('should be case-insensitive for Anthropic', () => {
      expect(detectProviderType('Claude-3-5-Sonnet')).toBe('anthropic');
      expect(detectProviderType('CLAUDE-3-OPUS')).toBe('anthropic');
    });
  });

  describe('unknown models', () => {
    it('should return undefined for unknown model', () => {
      expect(detectProviderType('unknown-model')).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(detectProviderType('')).toBeUndefined();
    });

    it('should return undefined for mistral models', () => {
      expect(detectProviderType('mistral-large')).toBeUndefined();
    });

    it('should return undefined for llama models', () => {
      expect(detectProviderType('llama-3-70b')).toBeUndefined();
    });
  });
});
