/**
 * Built-in pricing tables (USD per million tokens).
 *
 * These are the default prices for common models. They can be overridden
 * using `configurePricing()` (global) or `Provider.withPricing()` (per-provider).
 *
 * Last updated: January 2025
 *
 * @module pricing/defaults
 */

import type { ModelPricing, PricingConfig, ProviderPricing } from './types';

/**
 * OpenAI model pricing.
 * @see https://openai.com/pricing
 */
export const OPENAI_PRICING: ProviderPricing = {
  'gpt-4o': { inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 },
  'gpt-4o-mini': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
  'gpt-4-turbo': { inputPricePerMillion: 10.0, outputPricePerMillion: 30.0 },
  'gpt-4-turbo-preview': {
    inputPricePerMillion: 10.0,
    outputPricePerMillion: 30.0,
  },
  'gpt-4': { inputPricePerMillion: 30.0, outputPricePerMillion: 60.0 },
  'gpt-4-32k': { inputPricePerMillion: 60.0, outputPricePerMillion: 120.0 },
  'gpt-3.5-turbo': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
  'gpt-3.5-turbo-16k': {
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 4.0,
  },
  'o1': { inputPricePerMillion: 15.0, outputPricePerMillion: 60.0 },
  'o1-mini': { inputPricePerMillion: 3.0, outputPricePerMillion: 12.0 },
  'o1-preview': { inputPricePerMillion: 15.0, outputPricePerMillion: 60.0 },
  'o3': { inputPricePerMillion: 20.0, outputPricePerMillion: 80.0 },
  'o3-mini': { inputPricePerMillion: 4.0, outputPricePerMillion: 16.0 },
};

/**
 * Google Gemini model pricing.
 * @see https://ai.google.dev/gemini-api/docs/pricing
 */
export const GOOGLE_PRICING: ProviderPricing = {
  'gemini-2.5-flash': {
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    cachedInputPricePerMillion: 0.0375,
  },
  'gemini-2.5-flash-lite': {
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.3,
    cachedInputPricePerMillion: 0.01875,
  },
  'gemini-2.5-pro': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10.0,
    cachedInputPricePerMillion: 0.3125,
  },
  'gemini-2.0-flash': {
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.4,
    cachedInputPricePerMillion: 0.025,
  },
  'gemini-2.0-flash-lite': {
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.3,
    cachedInputPricePerMillion: 0.01875,
  },
  'gemini-1.5-pro': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.0,
    cachedInputPricePerMillion: 0.3125,
  },
  'gemini-1.5-flash': {
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.3,
    cachedInputPricePerMillion: 0.01875,
  },
  'gemini-1.5-flash-8b': {
    inputPricePerMillion: 0.0375,
    outputPricePerMillion: 0.15,
    cachedInputPricePerMillion: 0.01,
  },
  'gemini-pro': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
};

/**
 * Anthropic Claude model pricing.
 * @see https://www.anthropic.com/pricing
 */
export const ANTHROPIC_PRICING: ProviderPricing = {
  'claude-opus-4-5-20250514': {
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 75.0,
    cachedInputPricePerMillion: 1.875,
  },
  'claude-sonnet-4-20250514': {
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cachedInputPricePerMillion: 0.375,
  },
  'claude-3-5-sonnet-20241022': {
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cachedInputPricePerMillion: 0.375,
  },
  'claude-3-5-haiku-20241022': {
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 4.0,
    cachedInputPricePerMillion: 0.1,
  },
  'claude-3-opus-20240229': {
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 75.0,
    cachedInputPricePerMillion: 1.875,
  },
  'claude-3-sonnet-20240229': {
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cachedInputPricePerMillion: 0.375,
  },
  'claude-3-haiku-20240307': {
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    cachedInputPricePerMillion: 0.03,
  },
};

export const DEFAULT_PRICING_CONFIG: Required<PricingConfig> = {
  providers: {
    openai: OPENAI_PRICING,
    google: GOOGLE_PRICING,
    anthropic: ANTHROPIC_PRICING,
  },
  fallback: {
    inputPricePerMillion: 1.0,
    outputPricePerMillion: 5.0,
  },
};

export const DEFAULT_FALLBACK_PRICING: ModelPricing = {
  inputPricePerMillion: 1.0,
  outputPricePerMillion: 5.0,
};
