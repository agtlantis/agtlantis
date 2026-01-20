# API Reference

> Complete API documentation for @agtlantis/eval

## Overview

This section provides comprehensive API documentation for the `@agtlantis/eval` package. Whether you're building evaluation suites, creating custom judges, or implementing improvement cycles, you'll find detailed reference information for every module.

The eval package is designed with a modular architecture, allowing you to use only the components you need. Each module can be used independently or combined for complete evaluation workflows.

---

## Modules

| Module | Description |
|--------|-------------|
| [Eval Suite](./eval-suite.md) | Core evaluation suite for testing agents with configurable judges and improvers |
| [Judge](./judge.md) | Judge creation and evaluation criteria for scoring agent outputs |
| [Test Case](./test-case.md) | Test case creation helpers and collection management with fluent API |
| [Multi-Turn](./multi-turn.md) | Multi-turn conversation testing, AI user simulation, and iteration support |
| [Improver](./improver.md) | Prompt improvement suggestions and automated improvement cycles |
| [Reporter](./reporter.md) | Report generation, comparison, and cost calculation utilities |
| [Execution](./execution.md) | Low-level execution utilities for custom test orchestration |
| [Adapters](./adapters.md) | Adapter functions for integrating external agents and report workflows |
| [Errors](./errors.md) | Error handling, error codes, and core type definitions |

---

## Quick Links

**Getting Started**
- [Quick Start Guide](../guides/quick-start.md) - Get up and running in 5 minutes
- [Architecture Overview](../architecture/overview.md) - Understand the core abstractions

**Common Tasks**
- [Creating an Eval Suite](./eval-suite.md#createevalsuite) - Set up your first evaluation
- [Defining Criteria](./judge.md#built-in-criteria) - Use built-in or custom criteria
- [Running Multi-Turn Tests](./multi-turn.md) - Test conversational agents
- [Improvement Cycles](./improver.md#improvement-cycle) - Automate prompt refinement

**Advanced**
- [Custom Execution](./execution.md) - Fine-grained control over test execution
- [Cost Tracking](./reporter.md#pricing--cost-calculation) - Monitor evaluation costs
- [Error Handling](./errors.md) - Handle and debug evaluation errors

---

## Import Patterns

```typescript
// Main package exports
import {
  createEvalSuite,
  createJudge,
  createImprover,
  testCase,
  testCases,
  TestCaseCollection,
  accuracy,
  relevance,
  consistency,
} from '@agtlantis/eval'

// Provider integration (from @agtlantis/core)
import {
  createOpenAIProvider,
  createGoogleProvider,
} from '@agtlantis/core'

// Testing utilities
import { mock, MockProvider } from '@agtlantis/eval'
// or: import { mock, MockProvider } from '@agtlantis/core/testing'
```

---

## See Also

- [Architecture Overview](../architecture/overview.md) - How the components fit together
- [@agtlantis/core API](../../core/docs/api/README.md) - Provider and execution APIs
