import type { LanguageModel } from 'ai';
import { createGoogleGenerativeAI, type GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import type { Logger } from '@/observability/logger';
import { noopLogger } from '@/observability/logger';
import type { ProviderPricing } from '@/pricing';
import { validateProviderPricing } from '@/pricing';
import type { GenerationOptions } from '@/session';
import { GoogleFileManager } from './file-manager';
import { SimpleSession } from '@/session/simple-session';
import { StreamingSession } from '@/session/streaming-session';
import { BaseProvider } from '../base-provider';
import type { FileCache } from '../types';
import { InMemoryFileCache } from '../file-cache';

export type HarmCategory =
    | 'HARM_CATEGORY_HATE_SPEECH'
    | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
    | 'HARM_CATEGORY_DANGEROUS_CONTENT'
    | 'HARM_CATEGORY_HARASSMENT'
    | 'HARM_CATEGORY_CIVIC_INTEGRITY';

export type HarmBlockThreshold =
    | 'BLOCK_NONE'
    | 'BLOCK_ONLY_HIGH'
    | 'BLOCK_MEDIUM_AND_ABOVE'
    | 'BLOCK_LOW_AND_ABOVE'
    | 'OFF';

export interface SafetySetting {
    category: HarmCategory;
    threshold: HarmBlockThreshold;
}

export interface GoogleProviderConfig {
    apiKey: string;
    safetySettings?: SafetySetting[];
}

interface GoogleProviderState {
    apiKey: string;
    defaultModelId: string | null;
    logger: Logger;
    safetySettings?: SafetySetting[];
    pricingConfig?: ProviderPricing;
    defaultOptions?: GoogleGenerativeAIProviderOptions;
    searchEnabled: boolean;
    urlContextEnabled: boolean;
    fileCache?: FileCache;
    defaultGenOptions?: GenerationOptions;
}

export class GoogleProvider extends BaseProvider {
    private readonly google: ReturnType<typeof createGoogleGenerativeAI>;

    constructor(private readonly config: GoogleProviderState) {
        super();
        this.google = createGoogleGenerativeAI({ apiKey: config.apiKey });
    }

    withDefaultModel(modelId: string): GoogleProvider {
        return new GoogleProvider({ ...this.config, defaultModelId: modelId });
    }

    withLogger(newLogger: Logger): GoogleProvider {
        return new GoogleProvider({ ...this.config, logger: newLogger });
    }

    withPricing(pricing: ProviderPricing): GoogleProvider {
        validateProviderPricing(pricing, 'google');
        return new GoogleProvider({ ...this.config, pricingConfig: pricing });
    }

    /**
     * Set default provider-specific options for all LLM calls.
     * These options will be deep-merged with per-call providerOptions.
     *
     * @example
     * ```typescript
     * createGoogleProvider({ apiKey: 'xxx' })
     *   .withDefaultModel('gemini-2.0-flash-thinking-exp')
     *   .withDefaultOptions({
     *     thinkingConfig: { includeThoughts: true, thinkingLevel: 'low' }
     *   })
     * ```
     */
    withDefaultOptions(options: GoogleGenerativeAIProviderOptions): GoogleProvider {
        return new GoogleProvider({ ...this.config, defaultOptions: options });
    }

    withDefaultGenerationOptions(options: GenerationOptions): GoogleProvider {
        return new GoogleProvider({ ...this.config, defaultGenOptions: options });
    }

    /**
     * Enable Google Search grounding for all LLM calls.
     * Allows the model to access real-time web information.
     *
     * @example
     * ```typescript
     * createGoogleProvider({ apiKey: 'xxx' })
     *   .withDefaultModel('gemini-2.5-flash')
     *   .withSearchEnabled()
     * ```
     */
    withSearchEnabled(): GoogleProvider {
        return new GoogleProvider({ ...this.config, searchEnabled: true });
    }

    /**
     * Enable URL Context grounding for all LLM calls.
     * Allows the model to retrieve and use content from URLs in the prompt.
     *
     * @example
     * ```typescript
     * createGoogleProvider({ apiKey: 'xxx' })
     *   .withDefaultModel('gemini-2.5-flash')
     *   .withUrlContextEnabled()
     * ```
     */
    withUrlContextEnabled(): GoogleProvider {
        return new GoogleProvider({ ...this.config, urlContextEnabled: true });
    }

    /**
     * Set a file cache for reusing uploaded files across sessions.
     * If no cache is provided, creates a new InMemoryFileCache.
     *
     * @example
     * ```typescript
     * // Use default InMemoryFileCache
     * createGoogleProvider({ apiKey: 'xxx' })
     *   .withFileCache()
     *
     * // Use custom cache with TTL
     * const cache = new InMemoryFileCache({ defaultTTL: 3600000 });
     * createGoogleProvider({ apiKey: 'xxx' })
     *   .withFileCache(cache)
     * ```
     */
    withFileCache(cache?: FileCache): GoogleProvider {
        return new GoogleProvider({ ...this.config, fileCache: cache ?? new InMemoryFileCache() });
    }

    private getSessionConfig() {
        const { searchEnabled, urlContextEnabled } = this.config;

        const defaultTools = {
            ...(searchEnabled && { google_search: this.google.tools.googleSearch({}) }),
            ...(urlContextEnabled && { url_context: this.google.tools.urlContext({}) }),
        };
        const hasDefaultTools = searchEnabled || urlContextEnabled;

        return {
            defaultLanguageModel: this.config.defaultModelId
                ? this.createModel(this.config.defaultModelId)
                : null,
            modelFactory: (modelId: string) => this.createModel(modelId),
            providerType: 'google' as const,
            providerPricing: this.config.pricingConfig,
            fileManager: new GoogleFileManager(this.config.apiKey, { cache: this.config.fileCache }),
            logger: this.config.logger,
            defaultProviderOptions: this.config.defaultOptions
                ? { google: this.config.defaultOptions }
                : undefined,
            defaultTools: hasDefaultTools ? defaultTools : undefined,
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

    /**
     * Type assertion needed because @ai-sdk/google's type signature doesn't
     * include the second parameter, but it's supported at runtime.
     */
    private createModel(modelId: string): LanguageModel {
        if (this.config.safetySettings) {
            return (
                this.google as (
                    id: string,
                    opts?: { safetySettings?: SafetySetting[] }
                ) => LanguageModel
            )(modelId, { safetySettings: this.config.safetySettings });
        }
        return this.google(modelId);
    }
}

export function createGoogleProvider(config: GoogleProviderConfig): GoogleProvider {
    return new GoogleProvider({
        apiKey: config.apiKey,
        defaultModelId: null,
        logger: noopLogger,
        safetySettings: config.safetySettings,
        searchEnabled: false,
        urlContextEnabled: false,
    });
}

// Re-export provider options type for consumers
export type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
