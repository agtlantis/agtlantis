import type { LanguageModelUsage } from 'ai';
import type { ProviderType } from '@/pricing/types';

export type { ProviderType } from '@/pricing/types';

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
    reasoningTokens += usage.outputTokenDetails?.reasoningTokens ?? 0;
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
