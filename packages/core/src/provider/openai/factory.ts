import { createOpenAI, type OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import type { FileCache } from '../types';
import type { Logger } from '@/observability/logger';
import { noopLogger } from '@/observability/logger';
import type { ProviderPricing } from '@/pricing';
import { validateProviderPricing } from '@/pricing';
import type { GenerationOptions } from '@/session';
import { NoOpFileManager } from '../noop-file-manager';
import { SimpleSession } from '@/session/simple-session';
import { StreamingSession } from '@/session/streaming-session';
import { BaseProvider } from '../base-provider';

export interface OpenAIProviderConfig {
    apiKey: string;
    baseURL?: string;
    organization?: string;
}

interface OpenAIProviderState {
    apiKey: string;
    defaultModelId: string | null;
    logger: Logger;
    baseURL?: string;
    organization?: string;
    pricingConfig?: ProviderPricing;
    defaultOptions?: OpenAIChatLanguageModelOptions;
    fileCache?: FileCache;
    defaultGenOptions?: GenerationOptions;
}

class OpenAIProvider extends BaseProvider {
    private readonly openai: ReturnType<typeof createOpenAI>;

    constructor(private readonly config: OpenAIProviderState) {
        super();
        this.openai = createOpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
            organization: config.organization,
        });
    }

    withDefaultModel(modelId: string): OpenAIProvider {
        return new OpenAIProvider({ ...this.config, defaultModelId: modelId });
    }

    withLogger(newLogger: Logger): OpenAIProvider {
        return new OpenAIProvider({ ...this.config, logger: newLogger });
    }

    withPricing(pricing: ProviderPricing): OpenAIProvider {
        validateProviderPricing(pricing, 'openai');
        return new OpenAIProvider({ ...this.config, pricingConfig: pricing });
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
        return new OpenAIProvider({ ...this.config, defaultOptions: options });
    }

    withDefaultGenerationOptions(options: GenerationOptions): OpenAIProvider {
        return new OpenAIProvider({ ...this.config, defaultGenOptions: options });
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
        return new OpenAIProvider({ ...this.config, fileCache: cache });
    }

    private getSessionConfig() {
        return {
            defaultLanguageModel: this.config.defaultModelId
                ? this.openai(this.config.defaultModelId)
                : null,
            modelFactory: (modelId: string) => this.openai(modelId),
            providerType: 'openai' as const,
            providerPricing: this.config.pricingConfig,
            fileManager: new NoOpFileManager(),
            logger: this.config.logger,
            defaultProviderOptions: this.config.defaultOptions
                ? { openai: this.config.defaultOptions }
                : undefined,
            defaultGenerationOptions: this.config.defaultGenOptions,
        };
    }

    protected createStreamingSession<
        TEvent extends { type: string },
    >(signal?: AbortSignal): StreamingSession<TEvent> {
        return new StreamingSession<TEvent>({ ...this.getSessionConfig(), signal });
    }

    protected createSimpleSession(signal?: AbortSignal): SimpleSession {
        return new SimpleSession({ ...this.getSessionConfig(), signal });
    }
}

export function createOpenAIProvider(config: OpenAIProviderConfig): OpenAIProvider {
    return new OpenAIProvider({
        apiKey: config.apiKey,
        defaultModelId: null,
        logger: noopLogger,
        baseURL: config.baseURL,
        organization: config.organization,
    });
}

// Re-export provider options type for consumers
export type { OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
