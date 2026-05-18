import type { LanguageModelUsage } from 'ai';
import type { ProviderType } from '../pricing/types.js';
import { isRecord } from '../utils/is-record.js';

export type { ProviderType } from '../pricing/types.js';

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readRawUsageNumber(usage: LanguageModelUsage, keys: string[]): number | undefined {
  const raw = usage.raw;
  if (!isRecord(raw)) {
    return undefined;
  }

  let current: unknown = raw;
  for (const key of keys) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }

  return readNumber(current);
}

export function extractReasoningTokens(usage: LanguageModelUsage): number {
  const explicit =
    readNumber(usage.outputTokenDetails?.reasoningTokens) ??
    readNumber(usage.reasoningTokens) ??
    readRawUsageNumber(usage, ['output_token_details', 'reasoning_tokens']) ??
    readRawUsageNumber(usage, ['output_tokens_details', 'reasoning_tokens']) ??
    readRawUsageNumber(usage, ['reasoning_tokens']);

  if (explicit !== undefined) {
    return explicit;
  }

  const outputTokens = readNumber(usage.outputTokens);
  const textTokens = readNumber(usage.outputTokenDetails?.textTokens);
  if (outputTokens !== undefined && textTokens !== undefined && outputTokens >= textTokens) {
    return outputTokens - textTokens;
  }

  return 0;
}

export function normalizeUsageForProvider(
  usage: LanguageModelUsage,
  providerType: ProviderType
): LanguageModelUsage {
  if (providerType !== 'anthropic') {
    return usage;
  }

  return {
    ...usage,
    outputTokenDetails: {
      textTokens: usage.outputTokenDetails?.textTokens,
      reasoningTokens: extractReasoningTokens(usage),
    },
  };
}

export function mergeUsages(usages: LanguageModelUsage[]): LanguageModelUsage {
  if (usages.length === 0) {
    return createZeroUsage();
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let noCacheTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let textTokens = 0;
  let reasoningTokens = 0;

  for (const usage of usages) {
    inputTokens += usage.inputTokens ?? 0;
    outputTokens += usage.outputTokens ?? 0;
    totalTokens += usage.totalTokens ?? 0;

    noCacheTokens += usage.inputTokenDetails?.noCacheTokens ?? 0;
    cacheReadTokens += usage.inputTokenDetails?.cacheReadTokens ?? 0;
    cacheWriteTokens += usage.inputTokenDetails?.cacheWriteTokens ?? 0;

    textTokens += usage.outputTokenDetails?.textTokens ?? 0;
    reasoningTokens += extractReasoningTokens(usage);
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    inputTokenDetails: {
      noCacheTokens,
      cacheReadTokens,
      cacheWriteTokens,
    },
    outputTokenDetails: {
      textTokens,
      reasoningTokens,
    },
  };
}

export function createZeroUsage(): LanguageModelUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputTokenDetails: {
      noCacheTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokenDetails: {
      textTokens: 0,
      reasoningTokens: 0,
    },
  };
}

export function detectProviderType(modelId: string): ProviderType | undefined {
  const lowerModel = modelId.toLowerCase();

  if (
    lowerModel.startsWith('gpt-') ||
    lowerModel === 'o1' ||
    lowerModel.startsWith('o1-') ||
    lowerModel === 'o3' ||
    lowerModel.startsWith('o3-')
  ) {
    return 'openai';
  }

  if (lowerModel.startsWith('gemini')) {
    return 'google';
  }

  if (lowerModel.startsWith('claude')) {
    return 'anthropic';
  }

  return undefined;
}
