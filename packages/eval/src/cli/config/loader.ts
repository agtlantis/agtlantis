import { existsSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { bundleRequire } from 'bundle-require'
import fg from 'fast-glob'
import { validateConfig, type ValidatedEvalConfig } from './schema.js'
import type { EvalConfig } from './types.js'

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly code: ConfigErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ConfigError'
  }
}

export type ConfigErrorCode =
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_LOAD_ERROR'
  | 'CONFIG_NO_DEFAULT_EXPORT'
  | 'CONFIG_VALIDATION_ERROR'
  | 'CONFIG_NO_INCLUDE_PATTERN'

export const DEFAULT_CONFIG_FILE = 'agent-eval.config.ts'

export const SUPPORTED_EXTENSIONS = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs']

export function resolveConfigPath(
  configPath: string = DEFAULT_CONFIG_FILE,
  cwd: string = process.cwd()
): string {
  return resolve(cwd, configPath)
}

export async function loadConfig(configPath: string): Promise<EvalConfig> {
  const absolutePath = resolve(process.cwd(), configPath)

  if (!existsSync(absolutePath)) {
    throw new ConfigError(
      `Config file not found: ${configPath}\n\n` +
        `Create an ${DEFAULT_CONFIG_FILE} file or specify a path:\n` +
        `  npx agent-eval run ./path/to/config.ts`,
      'CONFIG_NOT_FOUND',
      { path: absolutePath }
    )
  }

  const ext = extname(absolutePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new ConfigError(
      `Unsupported config file extension: ${ext}\n` +
        `Supported extensions: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      'CONFIG_LOAD_ERROR',
      { path: absolutePath, extension: ext }
    )
  }

  let mod: { default?: EvalConfig } | EvalConfig

  try {
    if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
      const result = await bundleRequire({
        filepath: absolutePath,
        format: 'esm',
        esbuildOptions: { sourcemap: 'inline' },
      })
      mod = result.mod
    } else {
      const fileUrl = pathToFileURL(absolutePath).href
      mod = await import(fileUrl)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ConfigError(
      `Failed to load config file: ${configPath}\n\n` +
        `Error: ${message}\n\n` +
        `Make sure the file is valid TypeScript/JavaScript and has no syntax errors.`,
      'CONFIG_LOAD_ERROR',
      { path: absolutePath, originalError: message }
    )
  }

  const config = 'default' in mod ? mod.default : mod

  if (!config || typeof config !== 'object') {
    throw new ConfigError(
      `Config file must export a default configuration object.\n\n` +
        `Example:\n` +
        `  import { defineConfig } from '@agtlantis/eval'\n` +
        `  export default defineConfig({ ... })`,
      'CONFIG_NO_DEFAULT_EXPORT',
      { path: absolutePath }
    )
  }

  try {
    validateConfig(config)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ConfigError(
      message,
      'CONFIG_VALIDATION_ERROR',
      { path: absolutePath }
    )
  }

  return config as EvalConfig
}

export async function loadConfigWithDefaults(
  configPath?: string,
  cwd?: string
): Promise<EvalConfig> {
  const resolvedPath = resolveConfigPath(configPath, cwd)
  return loadConfig(resolvedPath)
}

export interface DiscoverOptions {
  /** Override config include patterns (CLI --include) */
  include?: string[]
  /** Base directory for glob patterns (defaults to process.cwd()) */
  cwd?: string
  /** Ignore patterns (default excludes node_modules) */
  ignore?: string[]
}

/** Discover YAML eval files matching glob patterns. CLI patterns override config. */
export async function discoverEvalFiles(
  config: Pick<EvalConfig, 'include'>,
  options: DiscoverOptions = {}
): Promise<string[]> {
  const patterns = options.include ?? config.include

  if (!patterns || patterns.length === 0) {
    throw new ConfigError(
      'No include patterns specified.\n\n' +
        'Add an include field to your config:\n' +
        "  include: ['evals/**/*.eval.yaml']\n\n" +
        'Or use the --include CLI option:\n' +
        '  npx agent-eval --include "evals/**/*.eval.yaml"',
      'CONFIG_NO_INCLUDE_PATTERN'
    )
  }

  const cwd = options.cwd ?? process.cwd()
  const ignore = options.ignore ?? ['**/node_modules/**']

  const files = await fg(patterns, {
    absolute: true,
    cwd,
    ignore,
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    unique: true,
    suppressErrors: false,
  })

  return files.sort()
}
