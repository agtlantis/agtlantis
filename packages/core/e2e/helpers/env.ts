function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60000;
const DEFAULT_PROGRESSIVE_TIMEOUT_MS = 180000;
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_GOOGLE_MODEL = 'gemini-1.5-flash';

export const E2E_CONFIG = {
  isEnabled: parseBoolean(process.env.REAL_AI_ENABLED),
  logging: parseBoolean(process.env.E2E_LOGGING, true),
  showCosts: parseBoolean(process.env.E2E_SHOW_COSTS),

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    get isAvailable() {
      return Boolean(E2E_CONFIG.isEnabled && this.apiKey);
    },
  },

  google: {
    apiKey: process.env.GOOGLE_API_KEY,
    model: process.env.GOOGLE_MODEL || DEFAULT_GOOGLE_MODEL,
    get isAvailable() {
      return Boolean(E2E_CONFIG.isEnabled && this.apiKey);
    },
  },

  timeout: DEFAULT_REQUEST_TIMEOUT_MS,
  progressiveTimeout: DEFAULT_PROGRESSIVE_TIMEOUT_MS,
} as const;

export type ProviderType = 'openai' | 'google';
