import { createOpenAI, type OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import type { FileCache } from '../types';
import type { Logger } from '@/observability/logger';
import { noopLogger } from '@/observability/logger';
import type { EventMetrics } from '@/observability';
import type { ProviderPricing } from '@/pricing';
import { validateProviderPricing } from '@/pricing';
import { NoOpFileManager } from '../noop-file-manager';
import { SimpleSession } from '@/session/simple-session';
import { StreamingSession } from '@/session/streaming-session';
import { BaseProvider } from '../base-provider';

export interface OpenAIProviderConfig {
    apiKey: string;
    baseURL?: string;
    organization?: string;
}

class OpenAIProvider extends BaseProvider {
    private readonly openai: ReturnType<typeof createOpenAI>;

    constructor(
        private readonly apiKey: string,
        private readonly defaultModelId: string | null,
        private readonly logger: Logger,
        private readonly baseURL?: string,
        private readonly organization?: string,
        private readonly pricingConfig?: ProviderPricing,
        private readonly defaultOptions?: OpenAIChatLanguageModelOptions,
        private readonly fileCache?: FileCache,
    ) {
        super();
        this.openai = createOpenAI({
            apiKey,
            baseURL,
            organization,
        });
    }

    withDefaultModel(modelId: string): OpenAIProvider {
        return new OpenAIProvider(
            this.apiKey,
            modelId,
            this.logger,
            this.baseURL,
            this.organization,
            this.pricingConfig,
            this.defaultOptions,
            this.fileCache,
        );
    }

    withLogger(newLogger: Logger): OpenAIProvider {
        return new OpenAIProvider(
            this.apiKey,
            this.defaultModelId,
            newLogger,
            this.baseURL,
            this.organization,
            this.pricingConfig,
            this.defaultOptions,
            this.fileCache,
        );
    }

    withPricing(pricing: ProviderPricing): OpenAIProvider {
        validateProviderPricing(pricing, 'openai');
        return new OpenAIProvider(
            this.apiKey,
            this.defaultModelId,
            this.logger,
            this.baseURL,
            this.organization,
            pricing,
            this.defaultOptions,
            this.fileCache,
        );
    }

    /**
     * Set default provider-specific options for all LLM calls.
     * These options will be deep-merged with per-call providerOptions.
     *
     * @example
     * ```typescript
     * createOpenAIProvider({ apiKey: 'xxx' })
     *   .withDefaultModel('gpt-4o')
     *   .withDefaultOptions({
     *     reasoningEffort: 'high',
     *     parallelToolCalls: true,
     *   })
     * ```
     */
    withDefaultOptions(options: OpenAIChatLanguageModelOptions): OpenAIProvider {
        return new OpenAIProvider(
            this.apiKey,
            this.defaultModelId,
            this.logger,
            this.baseURL,
            this.organization,
            this.pricingConfig,
            options,
            this.fileCache,
        );
    }

    /**
     * Set a file cache for API consistency with GoogleProvider.
     * Note: OpenAI does not support file caching, so this is a no-op.
     *
     * @example
     * ```typescript
     * createOpenAIProvider({ apiKey: 'xxx' })
     *   .withFileCache()
     * ```
     */
    withFileCache(cache?: FileCache): OpenAIProvider {
        return new OpenAIProvider(
            this.apiKey,
            this.defaultModelId,
            this.logger,
            this.baseURL,
            this.organization,
            this.pricingConfig,
            this.defaultOptions,
            cache,
        );
    }

    private getSessionConfig() {
        return {
            defaultLanguageModel: this.defaultModelId ? this.openai(this.defaultModelId) : null,
            modelFactory: (modelId: string) => this.openai(modelId),
            providerType: 'openai' as const,
            providerPricing: this.pricingConfig,
            fileManager: new NoOpFileManager(),
            logger: this.logger,
            defaultProviderOptions: this.defaultOptions
                ? { openai: this.defaultOptions }
                : undefined,
        };
    }

    protected createStreamingSession<
        TEvent extends { type: string; metrics: EventMetrics },
        TResult,
    >(signal?: AbortSignal): StreamingSession<TEvent, TResult> {
        return new StreamingSession<TEvent, TResult>({ ...this.getSessionConfig(), signal });
    }

    protected createSimpleSession(signal?: AbortSignal): SimpleSession {
        return new SimpleSession({ ...this.getSessionConfig(), signal });
    }
}

export function createOpenAIProvider(config: OpenAIProviderConfig): OpenAIProvider {
    return new OpenAIProvider(
        config.apiKey,
        null, // No default model - must be set with withDefaultModel()
        noopLogger,
        config.baseURL,
        config.organization
    );
}

// Re-export provider options type for consumers
export type { OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
