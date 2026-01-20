import {
  createOpenAIProvider,
  createGoogleProvider,
  type Provider,
} from '@agtlantis/core'
import { mock } from '@agtlantis/core/testing'
import { ConfigError } from '../config/index.js'
import type { EvalConfig } from '../config/types.js'
import { CLI_DEFAULTS } from '../constants.js'
import { printProgress } from '../output/console.js'

/**
 * Get API key from environment variable based on provider type.
 */
export function getApiKeyFromEnv(provider: 'openai' | 'gemini' | 'google'): string | undefined {
  if (provider === 'openai') {
    return process.env.OPENAI_API_KEY
  }
  // Both 'gemini' (legacy eval config) and 'google' (core provider) use the same env var
  return process.env.GOOGLE_API_KEY
}

/**
 * Create a Provider instance from EvalConfig.
 *
 * @throws {ConfigError} If API key is not found
 */
export function createProviderFromConfig(config: EvalConfig): Provider {
  const { llm } = config
  const apiKey = llm.apiKey ?? getApiKeyFromEnv(llm.provider)

  if (!apiKey) {
    const envVar = llm.provider === 'openai' ? 'OPENAI_API_KEY' : 'GOOGLE_API_KEY'
    throw new ConfigError(
      `API key not found for ${llm.provider}.\n\n` +
        `Set the ${envVar} environment variable or provide apiKey in config.`,
      'CONFIG_VALIDATION_ERROR'
    )
  }

  if (llm.provider === 'openai') {
    return createOpenAIProvider({
      apiKey,
    }).withDefaultModel(llm.defaultModel ?? 'gpt-4o-mini')
  }

  // Note: eval config uses 'gemini' but core uses 'google' provider
  return createGoogleProvider({
    apiKey,
  }).withDefaultModel(llm.defaultModel ?? 'gemini-1.5-flash')
}

/**
 * Provider instances for evaluation.
 */
export interface Providers {
  mainProvider: Provider
  judgeProvider: Provider
  improverProvider: Provider
}

/**
 * Options for provider initialization (minimal interface for type compatibility).
 */
export interface InitializeProvidersOptions {
  mock?: boolean
}

/**
 * Initialize providers for evaluation.
 * Creates mock providers in test mode, or real providers from config.
 */
export function initializeProviders(
  config: EvalConfig,
  options: InitializeProvidersOptions
): Providers {
  if (options.mock) {
    printProgress('Using mock Provider (--mock mode)')

    const mockVerdicts = config.judge.criteria.map((criterion) => ({
      criterionId: criterion.id,
      score: CLI_DEFAULTS.MOCK_DEFAULT_SCORE,
      reasoning: 'Mock evaluation - test mode',
      passed: true,
    }))

    const mockProvider = mock.provider(mock.json({ verdicts: mockVerdicts }))

    return { mainProvider: mockProvider, judgeProvider: mockProvider, improverProvider: mockProvider }
  }

  const mainProvider = createProviderFromConfig(config)
  const judgeProvider = config.judge.llm
    ? createProviderFromConfig({ ...config, llm: config.judge.llm })
    : mainProvider
  const improverProvider = config.improver?.llm
    ? createProviderFromConfig({ ...config, llm: config.improver.llm })
    : mainProvider

  return { mainProvider, judgeProvider, improverProvider }
}
