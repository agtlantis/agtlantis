import { describe, expect, it } from 'vitest';
import {
  validateModelPricing,
  validatePricingConfig,
  validateProviderPricing,
} from './validator';

describe('validateModelPricing', () => {
  describe('valid pricing', () => {
    it('should accept valid positive prices', () => {
      expect(() =>
        validateModelPricing(
          { inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 },
          'test/model'
        )
      ).not.toThrow();
    });

    it('should accept zero prices (free tier)', () => {
      expect(() =>
        validateModelPricing(
          { inputPricePerMillion: 0, outputPricePerMillion: 0 },
          'test/model'
        )
      ).not.toThrow();
    });

    it('should accept valid cachedInputPricePerMillion', () => {
      expect(() =>
        validateModelPricing(
          {
            inputPricePerMillion: 2.5,
            outputPricePerMillion: 10.0,
            cachedInputPricePerMillion: 1.25,
          },
          'test/model'
        )
      ).not.toThrow();
    });

    it('should accept zero cachedInputPricePerMillion', () => {
      expect(() =>
        validateModelPricing(
          {
            inputPricePerMillion: 2.5,
            outputPricePerMillion: 10.0,
            cachedInputPricePerMillion: 0,
          },
          'test/model'
        )
      ).not.toThrow();
    });
  });

  describe('negative prices', () => {
    it('should throw on negative inputPricePerMillion', () => {
      expect(() =>
        validateModelPricing(
          { inputPricePerMillion: -1, outputPricePerMillion: 10.0 },
          'test/model'
        )
      ).toThrow('test/model: inputPricePerMillion cannot be negative');
    });

    it('should throw on negative outputPricePerMillion', () => {
      expect(() =>
        validateModelPricing(
          { inputPricePerMillion: 2.5, outputPricePerMillion: -5 },
          'test/model'
        )
      ).toThrow('test/model: outputPricePerMillion cannot be negative');
    });

    it('should throw on negative cachedInputPricePerMillion', () => {
      expect(() =>
        validateModelPricing(
          {
            inputPricePerMillion: 2.5,
            outputPricePerMillion: 10.0,
            cachedInputPricePerMillion: -0.5,
          },
          'test/model'
        )
      ).toThrow('test/model: cachedInputPricePerMillion cannot be negative');
    });
  });

  describe('non-finite values', () => {
    it('should throw on NaN inputPricePerMillion', () => {
      expect(() =>
        validateModelPricing(
          { inputPricePerMillion: NaN, outputPricePerMillion: 10.0 },
          'test/model'
        )
      ).toThrow('test/model: inputPricePerMillion must be a finite number');
    });

    it('should throw on NaN outputPricePerMillion', () => {
      expect(() =>
        validateModelPricing(
          { inputPricePerMillion: 2.5, outputPricePerMillion: NaN },
          'test/model'
        )
      ).toThrow('test/model: outputPricePerMillion must be a finite number');
    });

    it('should throw on Infinity inputPricePerMillion', () => {
      expect(() =>
        validateModelPricing(
          { inputPricePerMillion: Infinity, outputPricePerMillion: 10.0 },
          'test/model'
        )
      ).toThrow('test/model: inputPricePerMillion must be a finite number');
    });

    it('should throw on -Infinity outputPricePerMillion', () => {
      expect(() =>
        validateModelPricing(
          { inputPricePerMillion: 2.5, outputPricePerMillion: -Infinity },
          'test/model'
        )
      ).toThrow('test/model: outputPricePerMillion must be a finite number');
    });

    it('should throw on NaN cachedInputPricePerMillion', () => {
      expect(() =>
        validateModelPricing(
          {
            inputPricePerMillion: 2.5,
            outputPricePerMillion: 10.0,
            cachedInputPricePerMillion: NaN,
          },
          'test/model'
        )
      ).toThrow('test/model: cachedInputPricePerMillion must be a finite number');
    });
  });

  describe('context in error messages', () => {
    it('should include context in error message', () => {
      expect(() =>
        validateModelPricing(
          { inputPricePerMillion: -1, outputPricePerMillion: 10.0 },
          'google/gemini-2.5-flash'
        )
      ).toThrow('google/gemini-2.5-flash: inputPricePerMillion cannot be negative');
    });
  });
});

describe('validateProviderPricing', () => {
  describe('valid pricing', () => {
    it('should accept empty pricing object', () => {
      expect(() => validateProviderPricing({})).not.toThrow();
    });

    it('should accept valid provider pricing', () => {
      expect(() =>
        validateProviderPricing(
          {
            'gemini-2.5-flash': {
              inputPricePerMillion: 0.3,
              outputPricePerMillion: 2.5,
            },
            'gemini-2.5-pro': {
              inputPricePerMillion: 1.25,
              outputPricePerMillion: 10.0,
            },
          },
          'google'
        )
      ).not.toThrow();
    });

    it('should accept single model pricing', () => {
      expect(() =>
        validateProviderPricing(
          {
            'gpt-4o': { inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 },
          },
          'openai'
        )
      ).not.toThrow();
    });
  });

  describe('invalid pricing', () => {
    it('should throw on invalid model pricing with provider context', () => {
      expect(() =>
        validateProviderPricing(
          {
            'gpt-4o': { inputPricePerMillion: -1, outputPricePerMillion: 10.0 },
          },
          'openai'
        )
      ).toThrow('openai/gpt-4o: inputPricePerMillion cannot be negative');
    });

    it('should throw on invalid model pricing without provider context', () => {
      expect(() =>
        validateProviderPricing({
          'gpt-4o': { inputPricePerMillion: -1, outputPricePerMillion: 10.0 },
        })
      ).toThrow('gpt-4o: inputPricePerMillion cannot be negative');
    });

    it('should fail on first invalid model', () => {
      expect(() =>
        validateProviderPricing(
          {
            'model-a': { inputPricePerMillion: 1.0, outputPricePerMillion: 2.0 },
            'model-b': { inputPricePerMillion: -1, outputPricePerMillion: 2.0 },
            'model-c': { inputPricePerMillion: 1.0, outputPricePerMillion: 2.0 },
          },
          'test'
        )
      ).toThrow('test/model-b: inputPricePerMillion cannot be negative');
    });
  });
});

describe('validatePricingConfig', () => {
  describe('valid config', () => {
    it('should accept empty config', () => {
      expect(() => validatePricingConfig({})).not.toThrow();
    });

    it('should accept config with only providers', () => {
      expect(() =>
        validatePricingConfig({
          providers: {
            google: {
              'gemini-2.5-flash': {
                inputPricePerMillion: 0.3,
                outputPricePerMillion: 2.5,
              },
            },
          },
        })
      ).not.toThrow();
    });

    it('should accept config with only fallback', () => {
      expect(() =>
        validatePricingConfig({
          fallback: { inputPricePerMillion: 1.0, outputPricePerMillion: 5.0 },
        })
      ).not.toThrow();
    });

    it('should accept config with multiple providers', () => {
      expect(() =>
        validatePricingConfig({
          providers: {
            google: {
              'gemini-2.5-flash': {
                inputPricePerMillion: 0.3,
                outputPricePerMillion: 2.5,
              },
            },
            openai: {
              'gpt-4o': {
                inputPricePerMillion: 2.5,
                outputPricePerMillion: 10.0,
              },
            },
            anthropic: {
              'claude-3-5-sonnet': {
                inputPricePerMillion: 3.0,
                outputPricePerMillion: 15.0,
              },
            },
          },
          fallback: { inputPricePerMillion: 1.0, outputPricePerMillion: 5.0 },
        })
      ).not.toThrow();
    });
  });

  describe('invalid provider pricing', () => {
    it('should throw on invalid google pricing', () => {
      expect(() =>
        validatePricingConfig({
          providers: {
            google: {
              'gemini-2.5-flash': {
                inputPricePerMillion: -0.3,
                outputPricePerMillion: 2.5,
              },
            },
          },
        })
      ).toThrow('google/gemini-2.5-flash: inputPricePerMillion cannot be negative');
    });

    it('should throw on invalid openai pricing', () => {
      expect(() =>
        validatePricingConfig({
          providers: {
            openai: {
              'gpt-4o': { inputPricePerMillion: 2.5, outputPricePerMillion: NaN },
            },
          },
        })
      ).toThrow('openai/gpt-4o: outputPricePerMillion must be a finite number');
    });

    it('should throw on invalid anthropic pricing', () => {
      expect(() =>
        validatePricingConfig({
          providers: {
            anthropic: {
              'claude-3-5-sonnet': {
                inputPricePerMillion: Infinity,
                outputPricePerMillion: 15.0,
              },
            },
          },
        })
      ).toThrow(
        'anthropic/claude-3-5-sonnet: inputPricePerMillion must be a finite number'
      );
    });
  });

  describe('invalid fallback pricing', () => {
    it('should throw on invalid fallback pricing', () => {
      expect(() =>
        validatePricingConfig({
          fallback: { inputPricePerMillion: -1.0, outputPricePerMillion: 5.0 },
        })
      ).toThrow('fallback: inputPricePerMillion cannot be negative');
    });

    it('should throw on NaN fallback pricing', () => {
      expect(() =>
        validatePricingConfig({
          fallback: { inputPricePerMillion: 1.0, outputPricePerMillion: NaN },
        })
      ).toThrow('fallback: outputPricePerMillion must be a finite number');
    });
  });
});
