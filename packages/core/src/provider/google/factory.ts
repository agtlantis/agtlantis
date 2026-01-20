import type { LanguageModel } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { Provider } from '../types';
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

class GoogleProvider extends BaseProvider {
    private readonly google: ReturnType<typeof createGoogleGenerativeAI>;

    constructor(
        private readonly apiKey: string,
        private readonly defaultModelId: string | null,
        private readonly logger: Logger,
        private readonly safetySettings?: SafetySetting[],
        private readonly pricingConfig?: ProviderPricing
    ) {
        super();
        this.google = createGoogleGenerativeAI({ apiKey });
    }

    withDefaultModel(modelId: string): Provider {
        return new GoogleProvider(
            this.apiKey,
            modelId,
            this.logger,
            this.safetySettings,
            this.pricingConfig
        );
    }

    withLogger(newLogger: Logger): Provider {
        return new GoogleProvider(
            this.apiKey,
            this.defaultModelId,
            newLogger,
            this.safetySettings,
            this.pricingConfig
        );
    }

    withPricing(pricing: ProviderPricing): Provider {
        validateProviderPricing(pricing, 'google');
        return new GoogleProvider(
            this.apiKey,
            this.defaultModelId,
            this.logger,
            this.safetySettings,
            pricing
        );
    }

    private getSessionConfig() {
        return {
            defaultLanguageModel: this.defaultModelId
                ? this.createModel(this.defaultModelId)
                : null,
            modelFactory: (modelId: string) => this.createModel(modelId),
            providerType: 'google' as const,
            providerPricing: this.pricingConfig,
            fileManager: new GoogleFileManager(this.apiKey),
            logger: this.logger,
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

export function createGoogleProvider(config: GoogleProviderConfig): Provider {
    return new GoogleProvider(
        config.apiKey,
        null, // No default model - must be set with withDefaultModel()
        noopLogger,
        config.safetySettings
    );
}
