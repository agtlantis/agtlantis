import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { LanguageModelUsage } from 'ai';
import {
  getModelPricing,
  calculateCost,
  calculateCostFromUsage,
  calculateTotalCost,
} from './calculator';
import { configurePricing, resetPricingConfig } from './config';
import {
  GOOGLE_PRICING,
  OPENAI_PRICING,
  ANTHROPIC_PRICING,
  DEFAULT_FALLBACK_PRICING,
} from './defaults';

function createMockUsage(
  overrides: Partial<LanguageModelUsage> = {}
): LanguageModelUsage {
  return {
    inputTokens: overrides.inputTokens ?? 1000,
    outputTokens: overrides.outputTokens ?? 500,
    totalTokens:
      overrides.totalTokens ??
      (overrides.inputTokens ?? 1000) + (overrides.outputTokens ?? 500),
    inputTokenDetails: {
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
      noCacheTokens: undefined,
      ...overrides.inputTokenDetails,
    },
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: undefined,
      ...overrides.outputTokenDetails,
    },
  };
}

describe('getModelPricing', () => {
  beforeEach(() => {
    resetPricingConfig();
  });

  afterEach(() => {
    resetPricingConfig();
  });

  describe('built-in defaults', () => {
    it('should return Google pricing for known Google model', () => {
      const pricing = getModelPricing('gemini-2.5-flash', 'google');
      expect(pricing).toEqual(GOOGLE_PRICING['gemini-2.5-flash']);
    });

    it('should return OpenAI pricing for known OpenAI model', () => {
      const pricing = getModelPricing('gpt-4o', 'openai');
      expect(pricing).toEqual(OPENAI_PRICING['gpt-4o']);
    });

    it('should return Anthropic pricing for known Anthropic model', () => {
      const pricing = getModelPricing('claude-3-5-sonnet-20241022', 'anthropic');
      expect(pricing).toEqual(ANTHROPIC_PRICING['claude-3-5-sonnet-20241022']);
    });

    it('should return fallback pricing for unknown model', () => {
      const pricing = getModelPricing('unknown-model', 'google');
      expect(pricing).toEqual(DEFAULT_FALLBACK_PRICING);
    });
  });

  describe('global config override', () => {
    it('should use global config when set', () => {
      const customPricing = {
        inputPricePerMillion: 0.99,
        outputPricePerMillion: 2.99,
      };

      configurePricing({
        providers: {
          google: {
            'gemini-2.5-flash': customPricing,
          },
        },
      });

      const pricing = getModelPricing('gemini-2.5-flash', 'google');
      expect(pricing).toEqual(customPricing);
    });

    it('should use global fallback when model not found', () => {
      const customFallback = {
        inputPricePerMillion: 2.0,
        outputPricePerMillion: 8.0,
      };

      configurePricing({
        fallback: customFallback,
      });

      const pricing = getModelPricing('unknown-model', 'google');
      expect(pricing).toEqual(customFallback);
    });

    it('should fall back to built-in defaults for unlisted models', () => {
      configurePricing({
        providers: {
          google: {
            'gemini-2.5-flash': {
              inputPricePerMillion: 0.99,
              outputPricePerMillion: 2.99,
            },
          },
        },
      });

      const pricing = getModelPricing('gemini-2.5-pro', 'google');
      expect(pricing).toEqual(GOOGLE_PRICING['gemini-2.5-pro']);
    });
  });

  describe('provider-level override', () => {
    it('should use provider-level pricing when specified', () => {
      const providerPricing = {
        'gemini-2.5-flash': {
          inputPricePerMillion: 0.5,
          outputPricePerMillion: 2.0,
        },
      };

      const pricing = getModelPricing(
        'gemini-2.5-flash',
        'google',
        providerPricing
      );
      expect(pricing).toEqual(providerPricing['gemini-2.5-flash']);
    });

    it('should prioritize provider-level over global config', () => {
      const globalPricing = {
        inputPricePerMillion: 0.99,
        outputPricePerMillion: 2.99,
      };
      const providerPricing = {
        'gemini-2.5-flash': {
          inputPricePerMillion: 0.5,
          outputPricePerMillion: 2.0,
        },
      };

      configurePricing({
        providers: {
          google: {
            'gemini-2.5-flash': globalPricing,
          },
        },
      });

      const pricing = getModelPricing(
        'gemini-2.5-flash',
        'google',
        providerPricing
      );
      expect(pricing).toEqual(providerPricing['gemini-2.5-flash']);
    });
  });
});

describe('calculateCost', () => {
  beforeEach(() => {
    resetPricingConfig();
  });

  afterEach(() => {
    resetPricingConfig();
  });

  it('should calculate cost for basic usage', () => {
    const result = calculateCost({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      model: 'gemini-2.5-flash',
      provider: 'google',
    });

    expect(result.inputCost).toBeCloseTo(0.15, 6);
    expect(result.outputCost).toBeCloseTo(0.6, 6);
    expect(result.cachedInputCost).toBe(0);
    expect(result.total).toBeCloseTo(0.75, 6);
  });

  it('should calculate cost with cached tokens', () => {
    const result = calculateCost({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cachedInputTokens: 400_000,
      model: 'gemini-2.5-flash',
      provider: 'google',
    });

    expect(result.inputCost).toBeCloseTo(0.09, 6);
    expect(result.cachedInputCost).toBeCloseTo(0.015, 6);
    expect(result.outputCost).toBeCloseTo(0.3, 6);
    expect(result.total).toBeCloseTo(0.405, 6);
  });

  it('should use regular input price when cached price not defined', () => {
    const result = calculateCost({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cachedInputTokens: 200_000,
      model: 'gpt-4o',
      provider: 'openai',
    });

    expect(result.inputCost).toBeCloseTo(2.0, 6);
    expect(result.cachedInputCost).toBeCloseTo(0.5, 6);
    expect(result.outputCost).toBeCloseTo(5.0, 6);
    expect(result.total).toBeCloseTo(7.5, 6);
  });

  it('should handle zero tokens', () => {
    const result = calculateCost({
      inputTokens: 0,
      outputTokens: 0,
      model: 'gemini-2.5-flash',
      provider: 'google',
    });

    expect(result.total).toBe(0);
    expect(result.inputCost).toBe(0);
    expect(result.outputCost).toBe(0);
    expect(result.cachedInputCost).toBe(0);
  });

  it('should use fallback pricing for unknown model', () => {
    const result = calculateCost({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      model: 'unknown-model',
      provider: 'google',
    });

    expect(result.inputCost).toBeCloseTo(1.0, 6);
    expect(result.outputCost).toBeCloseTo(5.0, 6);
    expect(result.total).toBeCloseTo(6.0, 6);
  });

  it('should use provider-level pricing override', () => {
    const providerPricing = {
      'custom-model': {
        inputPricePerMillion: 0.1,
        outputPricePerMillion: 0.5,
      },
    };

    const result = calculateCost(
      {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        model: 'custom-model',
        provider: 'google',
      },
      providerPricing
    );

    expect(result.inputCost).toBeCloseTo(0.1, 6);
    expect(result.outputCost).toBeCloseTo(0.5, 6);
    expect(result.total).toBeCloseTo(0.6, 6);
  });
});

describe('calculateCostFromUsage', () => {
  beforeEach(() => {
    resetPricingConfig();
  });

  afterEach(() => {
    resetPricingConfig();
  });

  it('should calculate cost from LanguageModelUsage', () => {
    const usage = createMockUsage({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    });

    const result = calculateCostFromUsage(usage, 'gemini-2.5-flash', 'google');

    expect(result.inputCost).toBeCloseTo(0.15, 6);
    expect(result.outputCost).toBeCloseTo(0.3, 6);
  });

  it('should extract cached tokens from inputTokenDetails', () => {
    const usage = createMockUsage({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      inputTokenDetails: {
        cacheReadTokens: 400_000,
        cacheWriteTokens: undefined,
        noCacheTokens: undefined,
      },
    });

    const result = calculateCostFromUsage(usage, 'gemini-2.5-flash', 'google');

    expect(result.inputCost).toBeCloseTo(0.09, 6);
    expect(result.cachedInputCost).toBeCloseTo(0.015, 6);
  });

  it('should handle undefined cacheReadTokens', () => {
    const usage = createMockUsage({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      inputTokenDetails: {
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
        noCacheTokens: undefined,
      },
    });

    const result = calculateCostFromUsage(usage, 'gemini-2.5-flash', 'google');

    expect(result.cachedInputCost).toBe(0);
  });
});

describe('calculateTotalCost', () => {
  beforeEach(() => {
    resetPricingConfig();
  });

  afterEach(() => {
    resetPricingConfig();
  });

  it('should aggregate costs from multiple calls', () => {
    const calls = [
      {
        usage: createMockUsage({ inputTokens: 1000, outputTokens: 500 }),
        model: 'gemini-2.5-flash',
        provider: 'google' as const,
      },
      {
        usage: createMockUsage({ inputTokens: 2000, outputTokens: 1000 }),
        model: 'gemini-2.5-flash',
        provider: 'google' as const,
      },
    ];

    const result = calculateTotalCost(calls);

    expect(result.totalCost).toBeCloseTo(0.00135, 8);
    expect(result.costByModel['google/gemini-2.5-flash']).toBeCloseTo(
      0.00135,
      8
    );
  });

  it('should group costs by model', () => {
    const calls = [
      {
        usage: createMockUsage({ inputTokens: 1_000_000, outputTokens: 500_000 }),
        model: 'gemini-2.5-flash',
        provider: 'google' as const,
      },
      {
        usage: createMockUsage({ inputTokens: 1_000_000, outputTokens: 500_000 }),
        model: 'gpt-4o',
        provider: 'openai' as const,
      },
    ];

    const result = calculateTotalCost(calls);

    expect(result.costByModel['google/gemini-2.5-flash']).toBeCloseTo(0.45, 6);
    expect(result.costByModel['openai/gpt-4o']).toBeCloseTo(7.5, 6);
    expect(result.totalCost).toBeCloseTo(7.95, 6);
  });

  it('should handle empty calls array', () => {
    const result = calculateTotalCost([]);

    expect(result.totalCost).toBe(0);
    expect(result.costByModel).toEqual({});
  });

  it('should use provider-level pricing override', () => {
    const calls = [
      {
        usage: createMockUsage({ inputTokens: 1_000_000, outputTokens: 500_000 }),
        model: 'custom-model',
        provider: 'google' as const,
      },
    ];

    const providerPricing = {
      'custom-model': {
        inputPricePerMillion: 0.1,
        outputPricePerMillion: 0.5,
      },
    };

    const result = calculateTotalCost(calls, providerPricing);

    expect(result.totalCost).toBeCloseTo(0.35, 6);
  });
});

describe('calculateCost validation', () => {
  it('should throw on negative inputTokens', () => {
    expect(() =>
      calculateCost({
        inputTokens: -100,
        outputTokens: 50,
        model: 'gemini-2.5-flash',
        provider: 'google',
      })
    ).toThrow('Token counts must be non-negative');
  });

  it('should throw on negative outputTokens', () => {
    expect(() =>
      calculateCost({
        inputTokens: 100,
        outputTokens: -50,
        model: 'gemini-2.5-flash',
        provider: 'google',
      })
    ).toThrow('Token counts must be non-negative');
  });

  it('should throw on negative cachedInputTokens', () => {
    expect(() =>
      calculateCost({
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: -20,
        model: 'gemini-2.5-flash',
        provider: 'google',
      })
    ).toThrow('Token counts must be non-negative');
  });

  it('should throw when cachedInputTokens > inputTokens', () => {
    expect(() =>
      calculateCost({
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 200,
        model: 'gemini-2.5-flash',
        provider: 'google',
      })
    ).toThrow('cachedInputTokens cannot exceed inputTokens');
  });

  it('should throw on NaN inputTokens', () => {
    expect(() =>
      calculateCost({
        inputTokens: NaN,
        outputTokens: 50,
        model: 'gemini-2.5-flash',
        provider: 'google',
      })
    ).toThrow('Token counts must be finite numbers');
  });

  it('should throw on Infinity outputTokens', () => {
    expect(() =>
      calculateCost({
        inputTokens: 100,
        outputTokens: Infinity,
        model: 'gemini-2.5-flash',
        provider: 'google',
      })
    ).toThrow('Token counts must be finite numbers');
  });

  it('should accept zero cachedInputTokens equal to zero inputTokens', () => {
    const result = calculateCost({
      inputTokens: 0,
      outputTokens: 50,
      cachedInputTokens: 0,
      model: 'gemini-2.5-flash',
      provider: 'google',
    });

    expect(result.inputCost).toBe(0);
    expect(result.cachedInputCost).toBe(0);
  });

  it('should accept cachedInputTokens equal to inputTokens', () => {
    const result = calculateCost({
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 100,
      model: 'gemini-2.5-flash',
      provider: 'google',
    });

    expect(result.inputCost).toBe(0);
    expect(result.cachedInputCost).toBeGreaterThan(0);
  });
});
