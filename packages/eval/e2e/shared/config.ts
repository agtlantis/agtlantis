/**
 * E2E Test Configuration
 *
 * Centralized configuration with environment variable overrides and defaults.
 *
 * Environment Variables:
 * - REAL_E2E: "true" to enable real LLM tests
 * - GOOGLE_API_KEY: Required when REAL_E2E=true
 * - E2E_MODEL: LLM model (default: "gemini-2.5-flash-lite")
 * - E2E_VERBOSE: "summary" | "detailed" | "full"
 * - E2E_REPORT_DIR: Report output directory
 * - E2E_TIMEOUT: Request timeout in ms
 */

import type { VerbosityLevel } from './types'

export interface E2EConfig {
  enabled: boolean
  googleApiKey: string | undefined
  verbose: VerbosityLevel | false
  reportDir: string
  defaultModel: string
  timeout: number
}

function parseVerbosity(value: string | undefined): VerbosityLevel | false {
  if (value === 'summary' || value === 'detailed' || value === 'full') {
    return value
  }
  return false
}

export const E2E_CONFIG: E2EConfig = {
  enabled: process.env.REAL_E2E === 'true',
  googleApiKey: process.env.GOOGLE_API_KEY,
  verbose: parseVerbosity(process.env.E2E_VERBOSE),
  reportDir: process.env.E2E_REPORT_DIR || 'test-output',
  defaultModel: process.env.E2E_MODEL || 'gemini-2.5-flash-lite',
  timeout: Number(process.env.E2E_TIMEOUT) || 60_000,
}

/** Validates required config. Throws if GOOGLE_API_KEY missing when enabled. */
export function validateE2EConfig(): void {
  if (E2E_CONFIG.enabled && !E2E_CONFIG.googleApiKey) {
    throw new Error(
      'GOOGLE_API_KEY is required when REAL_E2E=true.\n' +
        'Set it in .env.e2e or environment variables.',
    )
  }
}

