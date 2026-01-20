import type { Task } from 'vitest';
import { createOpenAIProvider } from '@/provider/openai/factory';
import { createGoogleProvider } from '@/provider/google/factory';
import { createLogger } from '@/observability/logger';
import type { Provider } from '@/provider/types';
import type { Logger, EventMetrics } from '@/observability';
import { E2E_CONFIG, type ProviderType } from './env';
import { recordCostMeta } from './cost-meta';

const INVALID_API_KEY = 'invalid-api-key-for-testing';

// Used by streaming patterns (e.g., progressive pattern) for type-safe logging
interface StreamingEvent {
  type: string;
  data?: unknown;
  metrics?: EventMetrics;
}

// Extended error structure for ExecutionError context logging
interface ExecutionErrorLike extends Error {
  context?: Record<string, unknown>;
  cause?: Error;
}

export interface CreateTestProviderOptions {
  logging?: boolean;
  /** Vitest task for cost tracking. Pass from test context: `({ task }) => ...` */
  task?: Task;
}

interface ProviderConfig {
  apiKey: string | undefined;
  model: string;
}

function getProviderConfig(type: ProviderType): ProviderConfig {
  switch (type) {
    case 'openai':
      return E2E_CONFIG.openai;
    case 'google':
      return E2E_CONFIG.google;
  }
}

function createProviderWithApiKey(
  type: ProviderType,
  apiKey: string,
): Provider {
  switch (type) {
    case 'openai':
      return createOpenAIProvider({ apiKey }).withDefaultModel(
        E2E_CONFIG.openai.model,
      );
    case 'google':
      return createGoogleProvider({ apiKey }).withDefaultModel(
        E2E_CONFIG.google.model,
      );
  }
}

export interface CreateTestLoggerOptions {
  /** Vitest task for cost tracking */
  task?: Task;
}

export function createTestLogger(options?: CreateTestLoggerOptions): Logger {
  const { task } = options ?? {};

  return createLogger({
    onLLMCallStart(event) {
      console.log(`\n[LLM Start] ${event.callType} -> ${event.modelId}`);
      if (event.request.system) {
        console.log(`   System: ${event.request.system.slice(0, 100)}...`);
      }
    },
    onLLMCallEnd(event) {
      const usage = event.response.usage;
      console.log(
        `[LLM End] ${event.callType} | tokens: ${usage?.inputTokens ?? '?'}->${usage?.outputTokens ?? '?'}`,
      );
    },
    onExecutionStart() {
      console.log('\n--- Execution Start ---');
    },
    onExecutionEmit(event) {
      const streamEvent = event.event as StreamingEvent;
      const metricsStr = streamEvent.metrics
        ? ` [+${streamEvent.metrics.deltaMs}ms, total ${streamEvent.metrics.elapsedMs}ms]`
        : '';
      console.log(
        `[Emit] ${streamEvent.type}${metricsStr}:`,
        JSON.stringify(streamEvent.data ?? {}, null, 2),
      );
    },
    onExecutionDone(event) {
      console.log(`\n[Done] duration: ${event.duration}ms`);
      console.log('   Result:', JSON.stringify(event.data, null, 2));

      // Record cost to test meta for CostReporter
      if (task && E2E_CONFIG.showCosts) {
        recordCostMeta(task, event.summary);
      }
    },
    onExecutionError(event) {
      const error = event.error as ExecutionErrorLike;
      console.log(`\n[Error] ${error.message}`);
      if (error.context) {
        console.log('   Context:', JSON.stringify(error.context, null, 2));
      }
      if (error.cause?.message) {
        console.log('   Cause:', error.cause.message);
      }
    },
  });
}

export function createTestProvider(
  type: ProviderType,
  options: CreateTestProviderOptions = {},
): Provider {
  const { logging = E2E_CONFIG.logging, task } = options;
  const config = getProviderConfig(type);

  if (!config.apiKey) {
    throw new Error(`${type.toUpperCase()}_API_KEY is not set`);
  }

  let provider = createProviderWithApiKey(type, config.apiKey);

  if (logging) {
    provider = provider.withLogger(createTestLogger({ task }));
  }

  return provider;
}

export function createInvalidTestProvider(type: ProviderType): Provider {
  return createProviderWithApiKey(type, INVALID_API_KEY);
}
