import cac from 'cac'
import { runCommand } from './commands/run.js'
import { improveCommand, type ImproveCommandOptions } from './commands/improve.js'
import { rollbackCommand, type RollbackCommandOptions } from './commands/rollback.js'

const VERSION = '0.1.0'
const cli = cac('agent-eval')

cli
  .command('run [config]', 'Run evaluation suite')
  .option('-o, --output <path>', 'Output path for markdown report')
  .option('-e, --env-file <path>', 'Path to env file', { default: '.env' })
  .option('-v, --verbose', 'Enable verbose output')
  .option('-c, --concurrency <n>', 'Concurrency level')
  .option('-i, --iterations <n>', 'Number of iterations per test')
  .option('--no-report', 'Skip saving markdown report')
  .option('--mock', 'Use mock LLM for testing (no API calls)')
  .option('--include <pattern>', 'Glob patterns for YAML files (can be repeated)')
  .option('--tags <tag>', 'Filter test cases by tags, OR logic (can be repeated)')
  .option('--agent <name>', 'Filter to specific agent name')
  .action(async (configPath: string | undefined, options: RunCommandOptions) => {
    try {
      await runCommand(configPath, options)
    } catch {
      process.exit(1)
    }
  })

// improve command - Run improvement cycle
cli
  .command('improve [config]', 'Run improvement cycle on prompts')
  .option('-e, --env-file <path>', 'Path to env file', { default: '.env' })
  .option('--history <path>', 'Path to save history JSON')
  .option('--target-score <n>', 'Target score to reach (0-100)')
  .option('--max-rounds <n>', 'Maximum improvement rounds')
  .option('--max-cost <usd>', 'Maximum cost in USD')
  .option('--stale-rounds <n>', 'Stop after N rounds without improvement')
  .option('--resume <path>', 'Resume from existing history file')
  .option('-c, --concurrency <n>', 'Concurrency level')
  .option('-i, --iterations <n>', 'Iterations per test')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--mock', 'Use mock LLM for testing (no API calls)')
  .action(async (configPath: string | undefined, options: ImproveCommandOptions) => {
    try {
      await improveCommand(configPath, options)
    } catch {
      process.exit(1)
    }
  })

// rollback command - Extract prompt from history
cli
  .command('rollback <history>', 'Extract prompt from improvement history')
  .option('-r, --round <n>', 'Round number to extract (1, 2, ...)')
  .option('--initial', 'Extract the initial prompt (before any improvements)')
  .option('-o, --output <path>', 'Output file path')
  .option('-f, --format <type>', 'Output format: json or ts', { default: 'json' })
  .action(async (historyPath: string, options: RollbackCommandOptions) => {
    try {
      await rollbackCommand(historyPath, options)
    } catch {
      process.exit(1)
    }
  })

cli.help()
cli.version(VERSION)
cli.parse()

export interface RunCommandOptions {
  output?: string
  envFile: string
  verbose?: boolean
  concurrency?: string
  iterations?: string
  report?: boolean // --no-report sets this to false
  mock?: boolean // Use mock LLM for testing
  // YAML discovery options
  include?: string[] // Multiple --include flags collected by CAC
  tags?: string[] // Multiple --tags flags collected by CAC
  agent?: string // Single agent name filter
}
