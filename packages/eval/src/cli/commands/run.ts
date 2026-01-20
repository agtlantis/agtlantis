import { loadConfigWithDefaults, ConfigError, discoverEvalFiles } from '../config/index.js'
import {
  loadYamlEvalFiles,
  convertToTestCases,
  type YamlConversionContext,
  type DiscoveredEvalFile,
} from '../yaml/index.js'
import { loadEnvFile } from '../utils/env.js'
import { initializeProviders, type Providers } from '../utils/provider-factory.js'
import { printSummary, printError, printProgress, printBanner } from '../output/console.js'
import { generateReport } from '../output/report.js'
import type { RunCommandOptions } from '../index.js'
import type {
  EvalConfig,
  CLITestCase,
  CLISingleTurnTestCase,
  CLIMultiTurnTestCase,
} from '../config/types.js'
import type { EvalReport } from '@/reporter/types'
import {
  createEvalSuite,
  createJudge,
  createImprover,
  executeMultiTurnTestCase,
  type EvalTestResult,
  type MultiTurnTestCase,
  type Suggestion,
} from '../../index.js'
import type { Provider } from '@agtlantis/core'
import { isMultiTurnConfig } from '../config/types.js'

export async function runCommand(
  configPath: string | undefined,
  options: RunCommandOptions
): Promise<void> {
  const startTime = Date.now()

  try {
    printBanner()

    printProgress('Loading environment...')
    await loadEnvFile(options.envFile)

    printProgress('Loading configuration...')
    const config = await loadConfigWithDefaults(configPath)

    printProgress('Initializing providers...')
    const { mainProvider, judgeProvider, improverProvider } = initializeProviders(config, options)

    const judge = createJudge({
      provider: judgeProvider,
      prompt: config.judge.prompt,
      criteria: config.judge.criteria,
      passThreshold: config.judge.passThreshold,
    })

    const improver = config.improver
      ? createImprover({
          provider: improverProvider,
          prompt: config.improver.prompt,
        })
      : undefined

    const concurrency = options.concurrency
      ? parseInt(options.concurrency, 10)
      : config.run?.concurrency ?? 1
    const iterations = options.iterations
      ? parseInt(options.iterations, 10)
      : config.run?.iterations ?? 1
    const verbose = options.verbose ?? config.output?.verbose ?? false

    const allReports: EvalReport<unknown, unknown>[] = []

    const includePatterns = options.include ?? config.include

    if (includePatterns && includePatterns.length > 0) {
      const yamlReports = await runYamlTests({
        config,
        options,
        includePatterns,
        mainProvider,
        judge,
        improver,
        concurrency,
        iterations,
      })
      allReports.push(...yamlReports)
    }

    if (config.testCases && config.testCases.length > 0) {
      const inlineReports = await runInlineTests({
        config,
        options,
        judge,
        improver,
        concurrency,
        iterations,
      })
      allReports.push(...inlineReports)
    }

    const report = mergeReports(allReports, resolvePromptVersion(config))

    if (report.summary.totalTests === 0) {
      printError(
        new Error(
          'No test cases to run after filtering.\n' +
            (options.tags ? `  Tags filter: ${options.tags.join(', ')}\n` : '') +
            (options.agent ? `  Agent filter: ${options.agent}\n` : '')
        )
      )
      process.exit(1)
    }

    const duration = Date.now() - startTime
    printSummary(report, { verbose, duration })

    if (options.report !== false) {
      const outputPath = await generateReport(report, {
        dir: config.output?.dir,
        filename: options.output ?? config.output?.filename,
      })
      console.log(`\nReport saved to: ${outputPath}`)
    }

    const hasFailures = report.summary.failed > 0
    process.exit(hasFailures ? 1 : 0)
  } catch (error) {
    printError(error instanceof Error ? error : new Error(String(error)))
    process.exit(1)
  }
}

interface YamlTestsParams {
  config: EvalConfig
  options: RunCommandOptions
  includePatterns: string[]
  mainProvider: Provider
  judge: ReturnType<typeof createJudge>
  improver: ReturnType<typeof createImprover> | undefined
  concurrency: number
  iterations: number
}

async function runYamlTests(params: YamlTestsParams): Promise<EvalReport<unknown, unknown>[]> {
  const { config, options, includePatterns, mainProvider, judge, improver, concurrency, iterations } =
    params
  const reports: EvalReport<unknown, unknown>[] = []

  printProgress('Discovering YAML eval files...')
  const filePaths = await discoverEvalFiles(config, { include: includePatterns })

  if (filePaths.length === 0) {
    printProgress('No YAML files found matching patterns')
    return reports
  }

  printProgress(`Discovered ${filePaths.length} YAML file(s)`)
  const yamlFiles = await loadYamlEvalFiles(filePaths)

  const filteredFiles = options.agent
    ? yamlFiles.filter((f) => f.content.agent === options.agent)
    : yamlFiles

  if (options.agent && filteredFiles.length === 0) {
    const availableAgents = [...new Set(yamlFiles.map((f) => f.content.agent))]
    throw new ConfigError(
      `No YAML files found for agent "${options.agent}".\n` +
        `Available agents: ${availableAgents.join(', ')}`,
      'CONFIG_VALIDATION_ERROR'
    )
  }

  const yamlByAgent = groupYamlByAgent(filteredFiles)

  for (const [agentName, agentFiles] of yamlByAgent) {
    printProgress(`Running tests for agent: ${agentName}`)

    const agent = lookupAgent(config, agentName)

    // buildInput uses default { message: response } format
    // Future: Could be customized per-agent in config.agents registry
    const yamlContext: YamlConversionContext<unknown, unknown> = {
      provider: mainProvider,
      buildInput: (response, _ctx) => ({ message: response }),
    }

    const yamlTestCases: CLITestCase<unknown, unknown>[] = []
    for (const file of agentFiles) {
      const cases = convertToTestCases(file.content, yamlContext)
      yamlTestCases.push(...(cases as CLITestCase<unknown, unknown>[]))
    }

    const filteredCases = filterByTags(yamlTestCases, options.tags)

    if (filteredCases.length === 0) {
      printProgress(`  No matching tests after tag filter for ${agentName}`)
      continue
    }

    const { singleTurnCases, multiTurnCases } = splitTestCases(filteredCases)

    const suite = createEvalSuite({
      agent,
      judge,
      improver,
      agentDescription: resolveAgentDescription(config, agent),
    })

    if (singleTurnCases.length > 0) {
      printProgress(`  Running ${singleTurnCases.length} single-turn test(s)...`)
      const report = await suite.run(singleTurnCases, {
        concurrency,
        iterations,
        stopOnFirstFailure: config.run?.stopOnFirstFailure,
      })
      reports.push(report)
    }

    if (multiTurnCases.length > 0) {
      printProgress(`  Running ${multiTurnCases.length} multi-turn test(s)...`)
      const multiTurnResults = await runMultiTurnCases(multiTurnCases, {
        agent,
        judge,
        agentDescription: resolveAgentDescription(config, agent),
      })

      const multiTurnReport = createMultiTurnReport(multiTurnResults, { ...config, agent })
      reports.push(multiTurnReport)
    }
  }

  return reports
}

interface InlineTestsParams {
  config: EvalConfig
  options: RunCommandOptions
  judge: ReturnType<typeof createJudge>
  improver: ReturnType<typeof createImprover> | undefined
  concurrency: number
  iterations: number
}

async function runInlineTests(params: InlineTestsParams): Promise<EvalReport<unknown, unknown>[]> {
  const { config, options, judge, improver, concurrency, iterations } = params
  const reports: EvalReport<unknown, unknown>[] = []

  const filteredInline = filterByTags(config.testCases!, options.tags)

  if (filteredInline.length === 0) {
    return reports
  }

  const { singleTurnCases, multiTurnCases } = splitTestCases(filteredInline)

  if (singleTurnCases.length > 0) {
    printProgress(`Running ${singleTurnCases.length} inline single-turn test(s)...`)

    const suite = createEvalSuite({
      agent: config.agent,
      judge,
      improver,
      agentDescription: resolveAgentDescription(config, config.agent),
    })

    const report = await suite.run(singleTurnCases, {
      concurrency,
      iterations,
      stopOnFirstFailure: config.run?.stopOnFirstFailure,
    })
    reports.push(report)
  }

  if (multiTurnCases.length > 0) {
    printProgress(`Running ${multiTurnCases.length} inline multi-turn test(s)...`)

    const multiTurnResults = await runMultiTurnCases(multiTurnCases, {
      agent: config.agent,
      judge,
      agentDescription: resolveAgentDescription(config, config.agent),
    })

    const multiTurnReport = createMultiTurnReport(multiTurnResults, config)
    reports.push(multiTurnReport)
  }

  return reports
}

interface MultiTurnExecutionContext {
  agent: import('../../index.js').EvalAgent<unknown, unknown>
  judge: ReturnType<typeof createJudge>
  agentDescription: string
}

async function runMultiTurnCases(
  testCases: CLIMultiTurnTestCase<unknown, unknown>[],
  context: MultiTurnExecutionContext
): Promise<EvalTestResult<unknown, unknown>[]> {
  const results: EvalTestResult<unknown, unknown>[] = []

  for (const testCase of testCases) {
    const result = await executeMultiTurnTestCase(
      testCase as MultiTurnTestCase<unknown, unknown>,
      context
    )
    results.push(result as EvalTestResult<unknown, unknown>)
  }

  return results
}

function createMultiTurnReport(
  results: EvalTestResult<unknown, unknown>[],
  config: EvalConfig
): EvalReport<unknown, unknown> {
  const totalTests = results.length
  const passed = results.filter((r) => r.passed).length
  const failed = totalTests - passed
  const avgScore =
    totalTests > 0 ? results.reduce((sum, r) => sum + r.overallScore, 0) / totalTests : 0
  const totalLatency = results.reduce((sum, r) => sum + r.metrics.latencyMs, 0)
  const totalTokens = results.reduce((sum, r) => sum + r.metrics.tokenUsage.totalTokens, 0)

  return {
    summary: {
      totalTests,
      passed,
      failed,
      avgScore,
      metrics: {
        avgLatencyMs: totalTests > 0 ? totalLatency / totalTests : 0,
        totalTokens,
        totalEstimatedCost: 0,
      },
    },
    results,
    suggestions: [],
    generatedAt: new Date(),
    promptVersion: resolvePromptVersion(config),
  }
}

function groupYamlByAgent(
  files: DiscoveredEvalFile[]
): Map<string, DiscoveredEvalFile[]> {
  const groups = new Map<string, DiscoveredEvalFile[]>()

  for (const file of files) {
    const agentName = file.content.agent
    if (!groups.has(agentName)) {
      groups.set(agentName, [])
    }
    groups.get(agentName)!.push(file)
  }

  return groups
}

function lookupAgent(
  config: EvalConfig,
  agentName: string
): import('../../index.js').EvalAgent<unknown, unknown> {
  if (!config.agents || !(agentName in config.agents)) {
    const available = config.agents ? Object.keys(config.agents) : []
    throw new ConfigError(
      `Agent "${agentName}" not found in config.agents registry.\n` +
        `Available agents: ${available.length > 0 ? available.join(', ') : '(none)'}`,
      'CONFIG_VALIDATION_ERROR'
    )
  }
  return config.agents[agentName]
}

/** Filters test cases by tags using OR logic. Returns all if no tags specified. */
function filterByTags<T extends { tags?: string[] }>(
  testCases: T[],
  tags: string[] | undefined
): T[] {
  if (!tags || tags.length === 0) {
    return testCases
  }

  return testCases.filter((tc) => {
    if (!tc.tags || tc.tags.length === 0) {
      return false
    }
    return tc.tags.some((tag) => tags.includes(tag))
  })
}

function splitTestCases(
  testCases: CLITestCase<unknown, unknown>[]
): {
  singleTurnCases: CLISingleTurnTestCase<unknown>[]
  multiTurnCases: CLIMultiTurnTestCase<unknown, unknown>[]
} {
  const singleTurnCases: CLISingleTurnTestCase<unknown>[] = []
  const multiTurnCases: CLIMultiTurnTestCase<unknown, unknown>[] = []

  for (const testCase of testCases) {
    if (isMultiTurnConfig(testCase)) {
      multiTurnCases.push(testCase)
    } else {
      singleTurnCases.push(testCase as CLISingleTurnTestCase<unknown>)
    }
  }

  return { singleTurnCases, multiTurnCases }
}

function resolveAgentDescription(
  config: EvalConfig,
  agent: import('../../index.js').EvalAgent<unknown, unknown>
): string {
  return config.agentDescription ?? agent.config.description ?? ''
}

/** Priority: config.agent > first agent in registry > 'unknown' */
function resolvePromptVersion(config: EvalConfig): string {
  if (config.agent?.prompt?.version) {
    return config.agent.prompt.version
  }

  if (config.agents) {
    const firstAgent = Object.values(config.agents)[0]
    if (firstAgent?.prompt?.version) {
      return firstAgent.prompt.version
    }
  }

  return 'unknown'
}

function mergeReports(
  reports: EvalReport<unknown, unknown>[],
  promptVersion: string
): EvalReport<unknown, unknown> {
  if (reports.length === 0) {
    return createEmptyReport(promptVersion)
  }

  if (reports.length === 1) {
    return reports[0]
  }

  const allResults: EvalTestResult<unknown, unknown>[] = []
  const suggestionMap = new Map<string, Suggestion>()
  let totalTests = 0
  let passed = 0
  let failed = 0
  let totalScore = 0
  let totalLatency = 0
  let totalTokens = 0
  let totalCost = 0

  for (const report of reports) {
    allResults.push(...report.results)
    deduplicateSuggestions(report.suggestions, suggestionMap)
    totalTests += report.summary.totalTests
    passed += report.summary.passed
    failed += report.summary.failed
    totalScore += report.summary.avgScore * report.summary.totalTests
    totalLatency += report.summary.metrics.avgLatencyMs * report.summary.totalTests
    totalTokens += report.summary.metrics.totalTokens
    totalCost += report.summary.metrics.totalEstimatedCost ?? 0
  }

  return {
    summary: {
      totalTests,
      passed,
      failed,
      avgScore: totalTests > 0 ? totalScore / totalTests : 0,
      metrics: {
        avgLatencyMs: totalTests > 0 ? totalLatency / totalTests : 0,
        totalTokens,
        totalEstimatedCost: totalCost,
      },
    },
    results: allResults,
    suggestions: [...suggestionMap.values()],
    generatedAt: new Date(),
    promptVersion,
  }
}

function createEmptyReport(promptVersion: string): EvalReport<unknown, unknown> {
  return {
    summary: {
      totalTests: 0,
      passed: 0,
      failed: 0,
      avgScore: 0,
      metrics: {
        avgLatencyMs: 0,
        totalTokens: 0,
        totalEstimatedCost: 0,
      },
    },
    results: [],
    suggestions: [],
    generatedAt: new Date(),
    promptVersion,
  }
}

function deduplicateSuggestions(
  suggestions: Suggestion[],
  map: Map<string, Suggestion>
): void {
  for (const suggestion of suggestions) {
    const key = `${suggestion.type}:${suggestion.suggestedValue}`
    if (!map.has(key)) {
      map.set(key, suggestion)
    }
  }
}
