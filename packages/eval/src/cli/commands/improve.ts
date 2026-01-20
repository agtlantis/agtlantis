import { loadConfigWithDefaults, ConfigError } from '../config/index.js'
import { loadEnvFile } from '../utils/env.js'
import { initializeProviders } from '../utils/provider-factory.js'
import { printBanner, printProgress, printError } from '../output/console.js'
import { printImprovementSummary, printRoundProgress } from '../output/improve-report.js'
import type { EvalConfig } from '../config/types.js'
import {
  createJudge,
  createImprover,
  type AgentPrompt,
  type EvalAgent,
} from '../../index.js'
import type { Provider } from '@agtlantis/core'
import {
  runImprovementCycleAuto,
  resumeSession,
  deserializePrompt,
  targetScore,
  maxRounds,
  maxCost,
  noImprovement,
  type CycleTerminationCondition,
  type ImprovementCycleConfig,
} from '../../improvement-cycle/index.js'

export interface ImproveCommandOptions {
  envFile: string
  history?: string
  targetScore?: string
  maxRounds?: string
  maxCost?: string
  staleRounds?: string
  resume?: string
  concurrency?: string
  iterations?: string
  verbose?: boolean
  mock?: boolean
}

export async function improveCommand(
  configPath: string | undefined,
  options: ImproveCommandOptions
): Promise<void> {
  const startTime = Date.now()

  try {
    printBanner()

    validateImproveOptions(options)

    printProgress('Loading environment...')
    await loadEnvFile(options.envFile)

    printProgress('Loading configuration...')
    const config = await loadConfigWithDefaults(configPath)

    printProgress('Initializing providers...')
    const { mainProvider, judgeProvider, improverProvider } = initializeProviders(config, options)

    const conditions = buildTerminationConditions(options)

    if (conditions.length === 0) {
      throw new Error(
        'At least one termination condition is required.\n' +
          'Use --target-score, --max-rounds, --max-cost, or --stale-rounds'
      )
    }

    const judge = createJudge({
      provider: judgeProvider,
      prompt: config.judge.prompt,
      criteria: config.judge.criteria,
      passThreshold: config.judge.passThreshold,
    })

    if (!config.improver) {
      throw new Error(
        'Improver configuration is required for improvement cycles.\n' +
          'Add an `improver` section to your config file.'
      )
    }

    const improver = createImprover({
      provider: improverProvider,
      prompt: config.improver.prompt,
    })

    if (options.resume) {
      await runResumeMode(
        options,
        config,
        conditions,
        judge,
        improver,
        mainProvider,
        startTime
      )
    } else {
      await runFreshMode(
        options,
        config,
        conditions,
        judge,
        improver,
        mainProvider,
        startTime
      )
    }
  } catch (error) {
    printError(error instanceof Error ? error : new Error(String(error)))
    process.exit(1)
  }
}

function validateImproveOptions(options: ImproveCommandOptions): void {
  if (!options.history && !options.resume) {
    throw new Error(
      '--history <path> is required to save improvement history.\n' +
        'Or use --resume <path> to continue from existing history.'
    )
  }
}

function buildTerminationConditions(
  options: ImproveCommandOptions
): CycleTerminationCondition[] {
  const conditions: CycleTerminationCondition[] = []

  if (options.targetScore) {
    const score = parseInt(options.targetScore, 10)
    if (isNaN(score) || score < 0 || score > 100) {
      throw new Error(`Invalid target score: ${options.targetScore}. Must be 0-100.`)
    }
    conditions.push(targetScore(score))
  }

  if (options.maxRounds) {
    const rounds = parseInt(options.maxRounds, 10)
    if (isNaN(rounds) || rounds < 1) {
      throw new Error(`Invalid max rounds: ${options.maxRounds}. Must be >= 1.`)
    }
    conditions.push(maxRounds(rounds))
  }

  if (options.maxCost) {
    const cost = parseFloat(options.maxCost)
    if (isNaN(cost) || cost <= 0) {
      throw new Error(`Invalid max cost: ${options.maxCost}. Must be > 0.`)
    }
    conditions.push(maxCost(cost))
  }

  if (options.staleRounds) {
    const rounds = parseInt(options.staleRounds, 10)
    if (isNaN(rounds) || rounds < 1) {
      throw new Error(`Invalid stale-rounds: ${options.staleRounds}. Must be >= 1.`)
    }
    conditions.push(noImprovement(rounds))
  }

  return conditions
}

function createAgentFactory<TInput, TOutput>(
  baseAgent: EvalAgent<TInput, TOutput>
): (prompt: AgentPrompt<TInput>) => EvalAgent<TInput, TOutput> {
  return (prompt: AgentPrompt<TInput>) => ({
    ...baseAgent,
    prompt,
  })
}

async function runFreshMode(
  options: ImproveCommandOptions,
  config: EvalConfig,
  conditions: CycleTerminationCondition[],
  judge: ReturnType<typeof createJudge>,
  improver: ReturnType<typeof createImprover>,
  _mainProvider: Provider,
  startTime: number
): Promise<void> {
  printProgress('Starting improvement cycle...')

  const testCases = config.testCases ?? []

  if (testCases.length === 0) {
    throw new Error(
      'No test cases found. Add testCases to your config or use include patterns.'
    )
  }

  const cycleConfig: ImprovementCycleConfig<unknown, unknown> = {
    createAgent: createAgentFactory(config.agent),
    initialPrompt: config.agent.prompt,
    testCases,
    judge,
    improver,
    terminateWhen: conditions,
    options: {
      pricingConfig: config.pricing,
      agentDescription: config.agentDescription,
      history: options.history
        ? {
            path: options.history,
            autoSave: true,
          }
        : undefined,
      runOptions: {
        concurrency: options.concurrency
          ? parseInt(options.concurrency, 10)
          : config.run?.concurrency,
        iterations: options.iterations
          ? parseInt(options.iterations, 10)
          : config.run?.iterations,
      },
    },
  }

  printProgress(`Running with ${testCases.length} test case(s)...`)
  printProgress(`Termination: ${formatConditions(conditions)}`)
  console.log()

  const result = await runImprovementCycleAuto(cycleConfig)

  const duration = Date.now() - startTime
  printImprovementSummary(result, { verbose: options.verbose, duration })

  if (options.history) {
    console.log(`\nHistory saved to: ${options.history}`)
  }

  process.exit(0)
}

async function runResumeMode(
  options: ImproveCommandOptions,
  config: EvalConfig,
  conditions: CycleTerminationCondition[],
  judge: ReturnType<typeof createJudge>,
  improver: ReturnType<typeof createImprover>,
  _mainProvider: Provider,
  startTime: number
): Promise<void> {
  printProgress(`Resuming from ${options.resume}...`)

  const session = await resumeSession(options.resume!, { autoSave: true })
  const currentPrompt = deserializePrompt(session.history.currentPrompt)

  printProgress(`Resumed session ${session.sessionId}`)
  printProgress(`Continuing from round ${session.history.rounds.length + 1}`)

  const testCases = config.testCases ?? []

  if (testCases.length === 0) {
    throw new Error(
      'No test cases found. Add testCases to your config or use include patterns.'
    )
  }

  const cycleConfig: ImprovementCycleConfig<unknown, unknown> = {
    createAgent: createAgentFactory(config.agent),
    initialPrompt: currentPrompt,
    testCases,
    judge,
    improver,
    terminateWhen: conditions,
    options: {
      pricingConfig: config.pricing,
      agentDescription: config.agentDescription,
      history: {
        path: options.resume!,
        autoSave: true,
      },
      session, // Pass the resumed session to preserve session ID and accumulated state
      runOptions: {
        concurrency: options.concurrency
          ? parseInt(options.concurrency, 10)
          : config.run?.concurrency,
        iterations: options.iterations
          ? parseInt(options.iterations, 10)
          : config.run?.iterations,
      },
    },
  }

  printProgress(`Running with ${testCases.length} test case(s)...`)
  printProgress(`Termination: ${formatConditions(conditions)}`)
  console.log()

  const result = await runImprovementCycleAuto(cycleConfig)

  const duration = Date.now() - startTime
  printImprovementSummary(result, { verbose: options.verbose, duration })

  console.log(`\nHistory saved to: ${options.resume}`)

  process.exit(0)
}

function formatConditions(conditions: CycleTerminationCondition[]): string {
  return conditions
    .map((c) => {
      switch (c.type) {
        case 'targetScore':
          return `score >= ${c.threshold}`
        case 'maxRounds':
          return `max ${c.count} rounds`
        case 'maxCost':
          return `max $${c.maxUSD}`
        case 'noImprovement':
          return `no improvement for ${c.consecutiveRounds} rounds`
        case 'custom':
          return c.description ?? 'custom condition'
      }
    })
    .join(' OR ')
}
