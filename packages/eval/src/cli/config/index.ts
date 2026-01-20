// Types
export {
  type EvalConfig,
  type LLMConfig,
  type CLIJudgeConfig,
  type CLIImproverConfig,
  type OutputConfig,
  type RunConfig,
  type CLITestCase,
  type CLISingleTurnTestCase,
  type CLIMultiTurnTestCase,
  defineConfig,
  isMultiTurnConfig,
} from './types.js'

// Schema validation
export {
  evalConfigSchema,
  llmConfigSchema,
  judgeConfigSchema,
  criterionSchema,
  testCaseSchema,
  validateConfig,
  validateConfigPartial,
  type ValidatedEvalConfig,
  type ValidatedLLMConfig,
  type ValidatedJudgeConfig,
} from './schema.js'

// Config loader
export {
  loadConfig,
  loadConfigWithDefaults,
  resolveConfigPath,
  discoverEvalFiles,
  ConfigError,
  type ConfigErrorCode,
  type DiscoverOptions,
  DEFAULT_CONFIG_FILE,
  SUPPORTED_EXTENSIONS,
} from './loader.js'
