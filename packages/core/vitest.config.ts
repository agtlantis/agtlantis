import path from 'path';
import { defineConfig } from 'vitest/config';
import { CostReporter } from './e2e/reporters/cost-reporter';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@e2e': path.resolve(__dirname, './e2e'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'e2e/**/*.test.ts'],
    setupFiles: ['./e2e/setup.ts'],
    // E2E tests may be flaky due to LLM API variability - retry on failure
    retry: 2,
    // Conditionally add CostReporter when E2E_SHOW_COSTS is enabled
    reporters:
      process.env.E2E_SHOW_COSTS === 'true'
        ? ['default', new CostReporter()]
        : ['default'],
  },
});
