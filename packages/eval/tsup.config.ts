import { defineConfig } from 'tsup'

export default defineConfig([
  // 1. Main library (existing build)
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
  },
  // 2. CLI entry point (separate build)
  {
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'],
    dts: false,
    clean: false,
    splitting: false,
    sourcemap: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
    // Bundle cac but keep bundle-require external (it uses dynamic requires)
    noExternal: ['cac'],
  },
])
