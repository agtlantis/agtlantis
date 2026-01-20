import { defineConfig } from 'vitest/config'
import path from 'path'

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
  },
})
