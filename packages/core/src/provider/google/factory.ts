import type { LanguageModel } from 'ai';
import { createGoogleGenerativeAI, type GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import type { Logger } from '@/observability/logger';
import { noopLogger } from '@/observability/logger';
import type { EventMetrics } from '@/observability';
import type { ProviderPricing } from '@/pricing';
import { validateProviderPricing } from '@/pricing';
import { GoogleFileManager } from './file-manager';
import { SimpleSession } from '@/session/simple-session';
import { StreamingSession } from '@/session/streaming-session';
import { BaseProvider } from '../base-provider';

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

export class GoogleProvider extends BaseProvider {
    private readonly google: ReturnType<typeof createGoogleGenerativeAI>;

    constructor(
        private readonly apiKey: string,
        private readonly defaultModelId: string | null,
        private readonly logger: Logger,
        private readonly safetySettings?: SafetySetting[],
        private readonly pricingConfig?: ProviderPricing,
        private readonly defaultOptions?: GoogleGenerativeAIProviderOptions,
        private readonly searchEnabled: boolean = false,
        private readonly urlContextEnabled: boolean = false,
    ) {
        super();
        this.google = createGoogleGenerativeAI({ apiKey });
    }

    withDefaultModel(modelId: string): GoogleProvider {
        return new GoogleProvider(
            this.apiKey,
            modelId,
            this.logger,
            this.safetySettings,
            this.pricingConfig,
            this.defaultOptions,
            this.searchEnabled,
            this.urlContextEnabled,
        );
    }

    withLogger(newLogger: Logger): GoogleProvider {
        return new GoogleProvider(
            this.apiKey,
            this.defaultModelId,
            newLogger,
            this.safetySettings,
            this.pricingConfig,
            this.defaultOptions,
            this.searchEnabled,
            this.urlContextEnabled,
        );
    }

    withPricing(pricing: ProviderPricing): GoogleProvider {
        validateProviderPricing(pricing, 'google');
        return new GoogleProvider(
            this.apiKey,
            this.defaultModelId,
            this.logger,
            this.safetySettings,
            pricing,
            this.defaultOptions,
            this.searchEnabled,
            this.urlContextEnabled,
        );
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
        return new GoogleProvider(
            this.apiKey,
            this.defaultModelId,
            this.logger,
            this.safetySettings,
            this.pricingConfig,
            options,
            this.searchEnabled,
            this.urlContextEnabled,
        );
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
        return new GoogleProvider(
            this.apiKey,
            this.defaultModelId,
            this.logger,
            this.safetySettings,
            this.pricingConfig,
            this.defaultOptions,
            true,
            this.urlContextEnabled,
        );
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
        return new GoogleProvider(
            this.apiKey,
            this.defaultModelId,
            this.logger,
            this.safetySettings,
            this.pricingConfig,
            this.defaultOptions,
            this.searchEnabled,
            true,
        );
    }

    private getSessionConfig() {
        // Build default tools based on enabled grounding features
        const defaultTools = {
            ...(this.searchEnabled && { google_search: this.google.tools.googleSearch({}) }),
            ...(this.urlContextEnabled && { url_context: this.google.tools.urlContext({}) }),
        };
        const hasDefaultTools = this.searchEnabled || this.urlContextEnabled;

        return {
            defaultLanguageModel: this.defaultModelId
                ? this.createModel(this.defaultModelId)
                : null,
            modelFactory: (modelId: string) => this.createModel(modelId),
            providerType: 'google' as const,
            providerPricing: this.pricingConfig,
            fileManager: new GoogleFileManager(this.apiKey),
            logger: this.logger,
            defaultProviderOptions: this.defaultOptions
                ? { google: this.defaultOptions }
                : undefined,
            defaultTools: hasDefaultTools ? defaultTools : undefined,
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

    /**
     * Type assertion needed because @ai-sdk/google's type signature doesn't
     * include the second parameter, but it's supported at runtime.
     */
    private createModel(modelId: string): LanguageModel {
        if (this.safetySettings) {
            return (
                this.google as (
                    id: string,
                    opts?: { safetySettings?: SafetySetting[] }
                ) => LanguageModel
            )(modelId, { safetySettings: this.safetySettings });
        }
        return this.google(modelId);
    }
}

export function createGoogleProvider(config: GoogleProviderConfig): GoogleProvider {
    return new GoogleProvider(
        config.apiKey,
        null, // No default model - must be set with withDefaultModel()
        noopLogger,
        config.safetySettings
    );
}

// Re-export provider options type for consumers
export type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
