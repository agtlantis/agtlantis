# CLI Guide

> Learn how to use the `agent-eval` CLI for streamlined evaluation workflows.

## Table of contents

- [What you'll learn](#what-youll-learn)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Basic usage](#basic-usage)
- [Commands](#commands)
  - [The run command](#the-run-command)
  - [The improve command](#the-improve-command)
  - [The rollback command](#the-rollback-command)
- [Configuration file](#configuration-file)
  - [Basic config](#basic-config)
  - [Full config](#full-config)
- [Environment variables](#environment-variables)
- [YAML-based test cases](#yaml-based-test-cases)
  - [Config with YAML files](#config-with-yaml-files)
  - [YAML file format](#yaml-file-format)
  - [Using both inline and YAML](#using-both-inline-and-yaml)
  - [Conditional requirement](#conditional-requirement)
- [Multi-turn tests in CLI](#multi-turn-tests-in-cli)
- [Understanding CLI output](#understanding-cli-output)
  - [Console output](#console-output)
  - [Markdown report](#markdown-report)
- [Exit codes](#exit-codes)
- [CI/CD integration](#cicd-integration)
  - [GitHub Actions](#github-actions)
  - [GitLab CI](#gitlab-ci)
- [Troubleshooting](#troubleshooting)
- [See also](#see-also)

---

## What You'll Learn

- How to install and run basic evaluations from the command line
- How to configure evaluations using TypeScript config files
- How to run improvement cycles and rollback prompts
- How to integrate evaluations into CI/CD pipelines

## Prerequisites

- `@agtlantis/eval` installed in your project
- An agent to evaluate
- API keys configured (OpenAI or Google)

## Installation

The CLI is included with the package:

```bash
npm install @agtlantis/eval
```

## Basic Usage

```bash
# Run with default config file (agent-eval.config.ts)
npx agent-eval run

# Run with custom config file
npx agent-eval run ./my-config.ts

# Run with options
npx agent-eval run -v -c 3 -i 5
```

## Commands

### The `run` Command

Run an evaluation using a configuration file.

```bash
npx agent-eval run [config]
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `config` | Path to config file | `agent-eval.config.ts` |

**Options:**

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--output <path>` | `-o` | Report output path | `./reports/eval-{timestamp}.md` |
| `--env-file <path>` | `-e` | Environment file path | `.env` |
| `--verbose` | `-v` | Enable verbose output | `false` |
| `--concurrency <n>` | `-c` | Concurrent test execution | `1` |
| `--iterations <n>` | `-i` | Iterations per test | `1` |
| `--no-report` | | Skip saving report | `false` |

**Examples:**

```bash
# Basic run
npx agent-eval run

# Custom config with verbose output
npx agent-eval run ./configs/qa-eval.ts -v

# Run with 3 concurrent tests, 5 iterations each
npx agent-eval run -c 3 -i 5

# Custom output path
npx agent-eval run -o ./reports/my-report.md

# Skip saving report (just show output)
npx agent-eval run --no-report

# Use custom .env file
npx agent-eval run -e .env.production
```

### The `improve` Command

Run an improvement cycle to iteratively enhance agent prompts.

```bash
npx agent-eval improve [config]
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `config` | Path to config file | `agent-eval.config.ts` |

**Options:**

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--history <path>` | | Path to save history JSON | Required* |
| `--resume <path>` | | Resume from existing history | Required* |
| `--target-score <n>` | | Stop when score reaches this value (0-100) | |
| `--max-rounds <n>` | | Maximum improvement rounds | |
| `--max-cost <usd>` | | Maximum cost in USD | |
| `--stale-rounds <n>` | | Stop after N rounds without improvement | |
| `--env-file <path>` | `-e` | Environment file path | `.env` |
| `--verbose` | `-v` | Enable verbose output | `false` |
| `--concurrency <n>` | `-c` | Concurrent test execution | `1` |
| `--iterations <n>` | `-i` | Iterations per test | `1` |
| `--mock` | | Use mock LLM (no API calls) | `false` |

*Either `--history` or `--resume` is required. At least one termination condition (`--target-score`, `--max-rounds`, `--max-cost`, or `--stale-rounds`) must be specified.

**Examples:**

```bash
# Start new improvement cycle with max 5 rounds
npx agent-eval improve --history ./history.json --max-rounds 5

# Stop when reaching 90% score or $0.50 cost
npx agent-eval improve --history ./history.json --target-score 90 --max-cost 0.50

# Resume from previous session
npx agent-eval improve --resume ./history.json --max-rounds 3

# Verbose output with custom env file
npx agent-eval improve --history ./history.json --max-rounds 3 -v -e .env.production
```

For more details on improvement cycles, see the [Improvement Cycle Guide](./improvement-cycle.md).

### The `rollback` Command

Extract a prompt snapshot from improvement history for restoration or review.

```bash
npx agent-eval rollback <history>
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `history` | Path to history JSON file |

**Options:**

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--initial` | | Extract the initial prompt (before any improvements) | |
| `--round <n>` | `-r` | Round number to extract (1, 2, ...) | |
| `--output <path>` | `-o` | Output file path | Required |
| `--format <type>` | `-f` | Output format: `json` or `ts` | `json` |

*Either `--initial` or `--round` is required (not both).

**Examples:**

```bash
# Extract the original prompt (before improvements)
npx agent-eval rollback ./history.json --initial --output ./original-prompt.json

# Extract prompt after round 2 improvements
npx agent-eval rollback ./history.json --round 2 --output ./round2-prompt.json

# Export as TypeScript file
npx agent-eval rollback ./history.json --initial --output ./prompt.ts --format ts
```

**Output Formats:**

JSON format (default):
```json
{
  "id": "my-agent",
  "version": "1.2.0",
  "system": "You are a helpful assistant...",
  "userTemplate": "User question: {{question}}"
}
```

TypeScript format (`--format ts`):
```typescript
import { compileTemplate } from 'agent-eval'
import type { AgentPrompt } from 'agent-eval'

export const prompt: AgentPrompt<YourInputType> = {
  id: 'my-agent',
  version: '1.2.0',
  system: `You are a helpful assistant...`,
  userTemplate: `User question: {{question}}`,
  buildUserPrompt: compileTemplate(`User question: {{question}}`),
}
```

## Configuration File

Create a TypeScript configuration file using `defineConfig`.

### Basic Config

```typescript
// agent-eval.config.ts
import { defineConfig, accuracy, relevance } from '@agtlantis/eval'
import { myAgent } from './src/agent'

export default defineConfig({
  // Required
  agent: myAgent,
  llm: {
    provider: 'openai',
    defaultModel: 'gpt-4o-mini',
  },
  judge: {
    criteria: [accuracy(), relevance()],
  },
  testCases: [
    { id: 'test-1', input: { question: 'What is TypeScript?' } },
  ],
})
```

### Full Config

```typescript
// agent-eval.config.ts
import {
  defineConfig,
  accuracy,
  relevance,
  consistency,
  schema,
} from '@agtlantis/eval'
import { z } from 'zod'
import { myAgent } from './src/agent'

const OutputSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
})

export default defineConfig({
  // Metadata
  name: 'Q&A Agent Evaluation',
  agentDescription: 'Agent that answers technical questions accurately',

  // Agent to evaluate
  agent: myAgent,

  // LLM configuration for Judge/Improver
  llm: {
    provider: 'openai',                    // 'openai' | 'gemini'
    apiKey: process.env.OPENAI_API_KEY,    // Optional, uses env var if not set
    defaultModel: 'gpt-4o-mini',
    reasoningEffort: 'medium',             // For o1-series models
  },

  // Judge configuration
  judge: {
    criteria: [
      accuracy({ weight: 2 }),
      relevance(),
      consistency(),
      schema({ schema: OutputSchema }),
    ],
    passThreshold: 75,
  },

  // Optional: Improver for suggestions
  improver: {
    enabled: true,
  },

  // Test cases
  testCases: [
    {
      id: 'typescript-basics',
      input: { question: 'What is TypeScript?' },
      description: 'Basic TypeScript question',
      tags: ['basics', 'typescript'],
    },
    {
      id: 'async-await',
      input: { question: 'Explain async/await in JavaScript' },
      tags: ['javascript', 'async'],
    },
  ],

  // Output configuration
  output: {
    dir: './reports',
    filename: 'eval-report.md',  // Optional custom filename
  },

  // Run configuration
  run: {
    concurrency: 3,
    iterations: 1,
    stopOnFirstFailure: false,
  },
})
```

## Environment Variables

The CLI automatically loads `.env` files. Supported variables:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `GOOGLE_API_KEY` | Google API key (for Gemini) |

Example `.env` file:

```bash
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AI...
```

Use `-e` to specify a different env file:

```bash
npx agent-eval run -e .env.production
```

## YAML-Based Test Cases

Instead of defining test cases inline in TypeScript, you can use YAML files.

### Config with YAML Files

```typescript
// agent-eval.config.ts
import { defineConfig, accuracy, relevance } from '@agtlantis/eval'
import { bookingAgent, qaAgent } from './src/agents'

export default defineConfig({
  // Agent registry - YAML files reference agents by name
  agents: {
    'booking-agent': bookingAgent,
    'qa-agent': qaAgent,
  },

  // Glob patterns to discover YAML files
  include: ['evals/**/*.eval.yaml'],

  // LLM and judge config (shared across all YAML files)
  llm: { provider: 'openai', defaultModel: 'gpt-4o-mini' },
  judge: { criteria: [accuracy(), relevance()] },
})
```

### YAML File Format

```yaml
# evals/booking.eval.yaml
agent: booking-agent
name: Booking Agent Evaluation

personas:
  friendly:
    name: Friendly Customer
    systemPrompt: |
      You are a friendly, cooperative customer.
      Answer the agent's questions clearly.

cases:
  - id: happy-path
    name: Friendly customer booking flow
    tags: [p0, multi-turn]
    input:
      message: I want to make a reservation
    persona: friendly
    multiTurn:
      maxTurns: 10
      onConditionMet: pass
```

### Using Both Inline and YAML

You can use both `testCases` and `include` together:

```typescript
export default defineConfig({
  agents: { 'booking-agent': bookingAgent },
  include: ['evals/**/*.eval.yaml'],  // YAML files
  testCases: [                        // Inline tests
    { id: 'smoke-test', input: { message: 'Hello' } },
  ],
  // ...
})
```

### Conditional Requirement

Either `testCases` or `include` must be provided:
- `testCases: [...]` alone - OK
- `include: ['...']` alone - OK
- Both together - OK
- Neither - validation error
- Empty arrays for both - validation error

## Multi-Turn Tests in CLI

```typescript
// agent-eval.config.ts
import {
  defineConfig,
  accuracy,
  fieldEquals,
  afterTurns,
  aiUser,
} from '@agtlantis/eval'

export default defineConfig({
  agent: bookingAgent,
  llm: { provider: 'openai', defaultModel: 'gpt-4o-mini' },
  judge: { criteria: [accuracy()] },

  testCases: [
    {
      id: 'booking-flow',
      input: { message: 'I want to make a reservation' },
      multiTurn: {
        followUpInputs: [
          { input: { message: 'Tomorrow at 7pm' } },
          { input: { message: '4 guests' } },
          { input: { message: 'Confirm please' } },
        ],
        terminateWhen: [
          fieldEquals('booking.status', 'confirmed'),
          afterTurns(10),
        ],
        onConditionMet: 'pass',
        onMaxTurnsReached: 'fail',
      },
    },
  ],
})
```

For more on multi-turn testing, see the [Multi-Turn Guide](./multi-turn-guide.md).

## Understanding CLI Output

### Console Output

With `--verbose`:

```
agent-eval Q&A Agent Evaluation
============================================================
   Config: agent-eval.config.ts
   Tests: 3
   Concurrency: 2
   Iterations: 1

Running: typescript-basics
   What is TypeScript?
------------------------------------------------------------
   PASSED (Score: 92.5)
   Latency: 1234ms | Tokens: 156

Running: async-await
   Explain async/await in JavaScript
------------------------------------------------------------
   PASSED (Score: 88.0)
   Latency: 1567ms | Tokens: 234

Running: react-hooks
   What are React hooks?
------------------------------------------------------------
   FAILED (Score: 65.0)
   Latency: 1123ms | Tokens: 189
   Reason: accuracy score below threshold

============================================================
Summary
============================================================
   Total:     3
   Passed:    2 (66.7%)
   Failed:    1
   Avg Score: 81.8
   Tokens:    579
   Latency:   1308ms (avg)

Report saved: ./reports/eval-2026-01-07-143022.md
```

### Markdown Report

The generated report includes:

1. **Summary** - Total tests, pass rate, average score
2. **Passed Tests** - Collapsed details for passing tests
3. **Failed Tests** - Expanded details with verdicts
4. **Iteration Statistics** - If iterations > 1
5. **Improvement Suggestions** - If improver enabled

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | All tests passed |
| `1` | Some tests failed |
| `2` | Configuration error |
| `3` | Runtime error |

Use exit codes in CI/CD:

```bash
npx agent-eval run || echo "Tests failed"
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Agent Evaluation
on: [push, pull_request]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npm run build

      - name: Run Agent Evaluation
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: npx agent-eval run -o ./reports/eval.md

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: evaluation-report
          path: ./reports/eval.md
```

### GitLab CI

```yaml
evaluate:
  stage: test
  script:
    - npm ci
    - npm run build
    - npx agent-eval run -o ./reports/eval.md
  artifacts:
    paths:
      - reports/
    reports:
      dotenv: reports/eval.md
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY
```

## Troubleshooting

### "Config file not found"

- Check the file exists at the specified path
- Ensure it's a `.ts` file (not `.js`)
- Use absolute path if relative path doesn't work

### "Cannot find module"

- Ensure dependencies are installed: `npm install`
- Check `tsconfig.json` paths are correct
- Try running `npm run build` first

### "API key not found"

- Set `OPENAI_API_KEY` environment variable
- Or specify in config: `llm: { apiKey: '...' }`
- Check `.env` file is in the correct directory

### "Test timeout"

- Increase timeout in your agent
- Reduce concurrency: `-c 1`
- Check network connectivity

### TypeScript Errors in Config

- Ensure `@agtlantis/eval` types are installed
- Check `tsconfig.json` includes the config file
- Use `defineConfig` for type safety

## See Also

- [Quick Start Guide](./quick-start.md) - Basic evaluation setup
- [Multi-Turn Guide](./multi-turn-guide.md) - Detailed multi-turn conversation testing
- [Improvement Cycle Guide](./improvement-cycle.md) - Iterative prompt improvement
