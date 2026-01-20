import type { EvalTokenUsage } from '@/core/types'
import {
  calculateCostFromUsage,
  type ProviderType,
  type ProviderPricing,
} from '@agtlantis/core'
import type { LanguageModelUsage } from 'ai'

function toLanguageModelUsage(usage: EvalTokenUsage): LanguageModelUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  } as LanguageModelUsage
}

/** Cost breakdown by component (Agent, Judge, Improver) */
export interface CostBreakdown {
  agent?: number
  judge?: number
  improver?: number
  total?: number
}

/** Cost summary aggregated across all test results */
export interface CostSummary {
  total: number
  byComponent: {
    agent: number
    judge: number
    improver?: number
  }
}

export interface MetricsWithCost {
  latencyMs: number
  tokenUsage: EvalTokenUsage
  costBreakdown: CostBreakdown
}

/** Test result with cost breakdown, returned by addCostsToResults() */
export interface TestResultWithCost<TInput, TOutput> {
  testCase: {
    id?: string
    input: TInput
    tags?: string[]
    description?: string
    expectedOutput?: unknown
  }
  output: TOutput
  metrics: MetricsWithCost
  error?: Error
  verdicts: Array<{
    criterionId: string
    score: number
    reasoning: string
    passed: boolean
  }>
  overallScore: number
  passed: boolean
}

/** Pricing configuration for eval */
export interface EvalPricingConfig {
  /** Provider-specific pricing overrides. Key is provider name (e.g., 'google', 'openai'), value is model pricing. */
  providerPricing?: Partial<Record<ProviderType, ProviderPricing>>
}

/** Maps eval's provider names to core's provider names (eval uses 'gemini', core uses 'google') */
const PROVIDER_MAPPING: Record<string, ProviderType> = {
  gemini: 'google',
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
}

function detectProvider(model: string | undefined): ProviderType {
  if (!model) return 'google' // default

  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) {
    return 'openai'
  }
  if (model.startsWith('gemini-')) {
    return 'google'
  }
  if (model.startsWith('claude-')) {
    return 'anthropic'
  }

  return 'google'
}

function normalizeProvider(provider: string | undefined): ProviderType {
  if (!provider) return 'google'
  return PROVIDER_MAPPING[provider] ?? provider
}

/** Minimal result interface compatible with TestResultWithVerdict and TestResultWithIteration */
interface ResultForCostCalculation<TInput, TOutput> {
  testCase: {
    id?: string
    input: TInput
    tags?: string[]
    description?: string
    expectedOutput?: unknown
  }
  output: TOutput
  metrics: {
    latencyMs: number
    tokenUsage: EvalTokenUsage
  }
  error?: Error
  verdicts: Array<{
    criterionId: string
    score: number
    reasoning: string
    passed: boolean
  }>
  overallScore: number
  passed: boolean
  agentMetadata?: {
    tokenUsage?: EvalTokenUsage
    model?: string
    provider?: string
  }
  judgeMetadata?: {
    tokenUsage?: EvalTokenUsage
    model?: string
    provider?: string
  }
}

interface ReportForCostCalculation<TInput, TOutput> {
  results: ResultForCostCalculation<TInput, TOutput>[]
}

function calculateComponentCost(
  tokenUsage: EvalTokenUsage | undefined,
  model: string | undefined,
  provider: string | undefined,
  config?: EvalPricingConfig
): number | undefined {
  if (!tokenUsage) return undefined

  const normalizedProvider = provider
    ? normalizeProvider(provider)
    : detectProvider(model)

  // Get the pricing for this specific provider from the config
  const providerPricing = config?.providerPricing?.[normalizedProvider]

  const result = calculateCostFromUsage(
    toLanguageModelUsage(tokenUsage),
    model ?? 'unknown',
    normalizedProvider,
    providerPricing
  )

  return result.total
}

function buildCostBreakdown(costs: {
  agent?: number
  judge?: number
  improver?: number
}): CostBreakdown {
  const total =
    (costs.agent ?? 0) + (costs.judge ?? 0) + (costs.improver ?? 0)

  return {
    ...costs,
    total: total > 0 ? total : undefined,
  }
}

export function calculateResultCost<TInput, TOutput>(
  result: ResultForCostCalculation<TInput, TOutput>,
  config?: EvalPricingConfig
): CostBreakdown {
  const agentCost = calculateComponentCost(
    result.metrics.tokenUsage,
    result.agentMetadata?.model,
    result.agentMetadata?.provider,
    config
  )

  const judgeCost = result.judgeMetadata?.tokenUsage
    ? calculateComponentCost(
        result.judgeMetadata.tokenUsage,
        result.judgeMetadata.model,
        result.judgeMetadata.provider,
        config
      )
    : undefined

  return buildCostBreakdown({
    agent: agentCost,
    judge: judgeCost,
  })
}

export function calculateReportCosts<TInput, TOutput>(
  report: ReportForCostCalculation<TInput, TOutput>,
  config?: EvalPricingConfig
): CostSummary {
  let totalAgent = 0
  let totalJudge = 0

  for (const result of report.results) {
    const breakdown = calculateResultCost(result, config)
    totalAgent += breakdown.agent ?? 0
    totalJudge += breakdown.judge ?? 0
  }

  return {
    total: totalAgent + totalJudge,
    byComponent: {
      agent: totalAgent,
      judge: totalJudge,
    },
  }
}

/** Add cost breakdown to each result. Returns new array (does not mutate original). */
export function addCostsToResults<TInput, TOutput>(
  results: ResultForCostCalculation<TInput, TOutput>[],
  config?: EvalPricingConfig
): TestResultWithCost<TInput, TOutput>[] {
  return results.map((result) => {
    const costBreakdown = calculateResultCost(result, config)

    const metricsWithCost: MetricsWithCost = {
      latencyMs: result.metrics.latencyMs,
      tokenUsage: result.metrics.tokenUsage,
      costBreakdown,
    }

    return {
      testCase: result.testCase,
      output: result.output,
      metrics: metricsWithCost,
      error: result.error,
      verdicts: result.verdicts,
      overallScore: result.overallScore,
      passed: result.passed,
    }
  })
}
