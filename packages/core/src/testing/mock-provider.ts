/**
 * MockProvider - Test provider for @agtlantis/core.
 *
 * Extends BaseProvider to provide mock LLM responses with call tracking.
 * Use `mock.provider()` factory for convenient creation.
 *
 * @example
 * ```typescript
 * import { mock } from '@agtlantis/core/testing';
 *
 * const provider = mock.provider(mock.text('Hello!'));
 * const execution = provider.simpleExecution(async (session) => {
 *   const { text } = await session.generateText({ prompt: 'Say hi' });
 *   return text;
 * });
 *
 * expect(await execution.toResult()).toBe('Hello!');
 * expect(provider.getCalls()).toHaveLength(1);
 * ```
 */

import type { LanguageModel } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import type { EventMetrics } from '@/observability';
import type { Logger } from '@/observability/logger';
import { noopLogger } from '@/observability/logger';
import type { ProviderPricing } from '@/pricing';
import { BaseProvider } from '@/provider/base-provider';
import { SimpleSession } from '@/session/simple-session';
import { StreamingSession } from '@/session/streaming-session';
import { NoOpFileManager } from '@/provider/noop-file-manager';
import type { FileManager } from '@/provider/types';

export type ModelFactory = (modelId: string) => MockLanguageModelV3;

export interface MockProviderConfig {
    model?: MockLanguageModelV3;
    modelFactory?: ModelFactory;
    fileManager?: FileManager;
    logger?: Logger;
    providerType?: string;
}

export interface MockCall {
    modelId: string;
    type: 'generate' | 'stream';
    timestamp: number;
    params: unknown;
}

export class MockProvider extends BaseProvider {
    private readonly calls: MockCall[] = [];
    private readonly modelSource: MockLanguageModelV3 | ModelFactory;
    private readonly fileManagerInstance: FileManager;
    private readonly loggerInstance: Logger;
    private readonly defaultModelId: string | null;
    private readonly pricingConfig?: ProviderPricing;
    private readonly providerTypeId: string;

    constructor(config: MockProviderConfig) {
        super();

        if (!config.model && !config.modelFactory) {
            throw new Error('MockProvider requires either model or modelFactory');
        }

        this.modelSource = config.modelFactory ?? config.model!;
        this.fileManagerInstance = config.fileManager ?? new NoOpFileManager();
        this.loggerInstance = config.logger ?? noopLogger;
        this.defaultModelId = null;
        this.providerTypeId = config.providerType ?? 'mock';
    }

    /**
     * Creates instance for fluent API without calling constructor.
     * Shares calls array between fluent instances for tracking.
     */
    private static createWithConfig(
        modelSource: MockLanguageModelV3 | ModelFactory,
        fileManager: FileManager,
        logger: Logger,
        defaultModelId: string | null,
        pricingConfig: ProviderPricing | undefined,
        providerType: string,
        existingCalls: MockCall[]
    ): MockProvider {
        const provider = Object.create(MockProvider.prototype) as MockProvider;

        Object.assign(provider, {
            modelSource,
            fileManagerInstance: fileManager,
            loggerInstance: logger,
            defaultModelId,
            pricingConfig,
            providerTypeId: providerType,
            calls: existingCalls,
        });

        return provider;
    }

    getCalls(): MockCall[] {
        return [...this.calls];
    }

    clearCalls(): void {
        this.calls.length = 0;
    }

    withDefaultModel(modelId: string): MockProvider {
        return MockProvider.createWithConfig(
            this.modelSource,
            this.fileManagerInstance,
            this.loggerInstance,
            modelId,
            this.pricingConfig,
            this.providerTypeId,
            this.calls
        );
    }

    withLogger(logger: Logger): MockProvider {
        return MockProvider.createWithConfig(
            this.modelSource,
            this.fileManagerInstance,
            logger,
            this.defaultModelId,
            this.pricingConfig,
            this.providerTypeId,
            this.calls
        );
    }

    withPricing(pricing: ProviderPricing): MockProvider {
        return MockProvider.createWithConfig(
            this.modelSource,
            this.fileManagerInstance,
            this.loggerInstance,
            this.defaultModelId,
            pricing,
            this.providerTypeId,
            this.calls
        );
    }

    /**
     * Mock implementation - returns same provider since mocks don't use provider options.
     */
    withDefaultOptions(_options: Record<string, unknown>): MockProvider {
        return this;
    }

    protected createSimpleSession(signal?: AbortSignal): SimpleSession {
        return new SimpleSession({ ...this.buildSessionConfig(), signal });
    }

    protected createStreamingSession<
        TEvent extends { type: string; metrics: EventMetrics },
        TResult,
    >(signal?: AbortSignal): StreamingSession<TEvent, TResult> {
        return new StreamingSession<TEvent, TResult>({ ...this.buildSessionConfig(), signal });
    }

    private buildSessionConfig() {
        const effectiveModelId = this.defaultModelId ?? 'default';
        return {
            defaultLanguageModel: this.createTrackingModel(effectiveModelId),
            modelFactory: (modelId: string) => this.createTrackingModel(modelId),
            providerType: this.providerTypeId,
            providerPricing: this.pricingConfig,
            fileManager: this.fileManagerInstance,
            logger: this.loggerInstance,
        };
    }

    private getBaseModel(modelId: string): MockLanguageModelV3 {
        if (typeof this.modelSource === 'function') {
            return this.modelSource(modelId);
        }
        return this.modelSource;
    }

    private createTrackingModel(modelId: string): LanguageModel {
        const baseModel = this.getBaseModel(modelId);
        const calls = this.calls;

        return {
            ...baseModel,
            specificationVersion: baseModel.specificationVersion,
            provider: baseModel.provider,
            modelId: baseModel.modelId,
            supportedUrls: baseModel.supportedUrls,

            doGenerate: async (params) => {
                calls.push({
                    modelId,
                    type: 'generate',
                    timestamp: Date.now(),
                    params,
                });
                return baseModel.doGenerate(params);
            },

            doStream: async (params) => {
                calls.push({
                    modelId,
                    type: 'stream',
                    timestamp: Date.now(),
                    params,
                });
                return baseModel.doStream(params);
            },
        } as LanguageModel;
    }
}

export function createMockProvider(
    configOrModel: MockProviderConfig | MockLanguageModelV3 | ModelFactory
): MockProvider {
    if (typeof configOrModel === 'function') {
        return new MockProvider({ modelFactory: configOrModel });
    }

    if (configOrModel instanceof MockLanguageModelV3) {
        return new MockProvider({ model: configOrModel });
    }

    return new MockProvider(configOrModel);
}
