import { describe, it } from 'vitest';
import { E2E_CONFIG, type ProviderType } from './env.js';

type DescribeFn = (name: string, fn: () => void) => void;
type ItFn = (name: string, fn: () => unknown, timeout?: number) => void;

export const describeE2E: DescribeFn = E2E_CONFIG.isEnabled ? describe : describe.skip;
export const describeOpenAI: DescribeFn = E2E_CONFIG.openai.isAvailable
  ? describe
  : describe.skip;
export const describeGoogle: DescribeFn = E2E_CONFIG.google.isAvailable
  ? describe
  : describe.skip;
export const describeAnthropic: DescribeFn = E2E_CONFIG.anthropic.isAvailable
  ? describe
  : describe.skip;
export const itE2E: ItFn = E2E_CONFIG.isEnabled ? it : it.skip;

export const availableProviders: ProviderType[] = [
  ...(E2E_CONFIG.openai.isAvailable ? (['openai'] as const) : []),
  ...(E2E_CONFIG.google.isAvailable ? (['google'] as const) : []),
];

/**
 * @example
 * describeEachProvider('Progressive Pattern', (providerType) => {
 *   it('should stream progress events', async ({ task }) => {
 *     const provider = createTestProvider(providerType, { task });
 *     // ...test code (cost tracking enabled via task)
 *   });
 * });
 */
export function describeEachProvider(
  name: string,
  fn: (providerType: ProviderType) => void,
): void {
  if (!E2E_CONFIG.isEnabled || availableProviders.length === 0) {
    describe.skip(name, () => {
      it.skip('no providers available', () => {});
    });
    return;
  }

  describe(name, () => {
    for (const providerType of availableProviders) {
      describe(`[${providerType}]`, () => {
        fn(providerType);
      });
    }
  });
}
