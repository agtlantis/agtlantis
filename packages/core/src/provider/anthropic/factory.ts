import { createAnthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import type { ToolSet } from 'ai';

import type { Logger } from '../../observability/logger.js';
import { noopLogger } from '../../observability/logger.js';
import type { ProviderPricing } from '../../pricing/index.js';
import { validateProviderPricing } from '../../pricing/index.js';
import {
    SimpleSession,
    StreamingSession,
    type GenerateTextParams,
    type GenerationOptions,
    type StreamTextParams,
} from '../../session/index.js';
import { BaseProvider } from '../base-provider.js';
import { InMemoryFileCache } from '../file-cache.js';
import type { FileCache } from '../types.js';
import {
    ANTHROPIC_FILES_API_BETA,
    AnthropicFileManager,
    type AnthropicFileManagerStrategy,
} from './file-manager.js';
import { rewriteFileIdMiddleware } from './middleware.js';
import { guardAnthropicOutput } from './schema-validator.js';
import { createAnthropicWebSearchTool, type AnthropicWebSearchToolOptions } from './tools.js';

export type AnthropicReasoningEffort = 'low' | 'medium' | 'high' | 'max';

export interface AnthropicProviderConfig {
    apiKey: string;
    baseURL?: string;
    headers?: Record<string, string>;
    fetch?: typeof fetch;
    filesBeta?: string;
    fileStrategy?: AnthropicFileManagerStrategy;
    inlineMaxBytes?: number;
}

interface AnthropicProviderState {
    apiKey: string;
    defaultModelId: string | null;
    logger: Logger;
    baseURL?: string;
    headers?: Record<string, string>;
    fetch?: typeof fetch;
    filesBeta: string;
    fileStrategy?: AnthropicFileManagerStrategy;
    inlineMaxBytes?: number;
    pricingConfig?: ProviderPricing;
    defaultOptions?: AnthropicLanguageModelOptions;
    fileCache?: FileCache;
    defaultGenOptions?: GenerationOptions;
    defaultTools?: ToolSet;
}

function withStructuredOutputDefault(
    options?: AnthropicLanguageModelOptions
): AnthropicLanguageModelOptions {
    return {
        structuredOutputMode: 'outputFormat',
        ...options,
    };
}

/**
 * Attach Anthropic's schema guard to a session by intercepting the structured
 * output parameter on `generateText` and `streamText`. This keeps Anthropic
 * provider behavior consistent with sibling providers (openai/google), which
 * instantiate the base SimpleSession/StreamingSession directly, while still
 * fail-fasting on schemas Anthropic's wire cannot accept.
 */
function applyAnthropicGuard<T extends SimpleSession>(session: T): T {
    const originalGenerateText = session.generateText.bind(session);
    const originalStreamText = session.streamText.bind(session);

    session.generateText = ((params: GenerateTextParams) => {
        if (params.output) {
            guardAnthropicOutput(params.output);
        }
        return originalGenerateText(params);
    }) as typeof session.generateText;

    session.streamText = ((params: StreamTextParams) => {
        if (params.output) {
            guardAnthropicOutput(params.output);
        }
        return originalStreamText(params);
    }) as typeof session.streamText;

    return session;
}

class AnthropicProvider extends BaseProvider {
    private readonly anthropic: ReturnType<typeof createAnthropic>;

    constructor(private readonly config: AnthropicProviderState) {
        super();
        const messagesFetch = rewriteFileIdMiddleware({
            fetch: config.fetch,
            filesBeta: config.filesBeta,
        });
        this.anthropic = createAnthropic({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
            headers: config.headers,
            fetch: messagesFetch,
        });
    }

    /**
     * Set the default model used when a per-call `model` is not provided.
     */
    withDefaultModel(modelId: string): AnthropicProvider {
        return new AnthropicProvider({ ...this.config, defaultModelId: modelId });
    }

    /**
     * Replace the logger used for execution observability.
     */
    withLogger(newLogger: Logger): AnthropicProvider {
        return new AnthropicProvider({ ...this.config, logger: newLogger });
    }

    /**
     * Override Anthropic pricing. Useful when the consumer negotiates custom
     * rates or wants to validate cost math against a stub before release.
     */
    withPricing(pricing: ProviderPricing): AnthropicProvider {
        validateProviderPricing(pricing, 'anthropic');
        return new AnthropicProvider({ ...this.config, pricingConfig: pricing });
    }

    /**
     * Set default Anthropic provider options for every LLM call. Per-call
     * `providerOptions.anthropic` is deep-merged on top of these defaults.
     *
     * @example
     * ```typescript
     * createAnthropicProvider({ apiKey: 'xxx' })
     *   .withDefaultModel('claude-sonnet-4-6')
     *   .withDefaultOptions({
     *     thinking: { type: 'enabled', budgetTokens: 1024 },
     *     sendReasoning: true,
     *   })
     * ```
     */
    withDefaultOptions(options: AnthropicLanguageModelOptions): AnthropicProvider {
        return new AnthropicProvider({ ...this.config, defaultOptions: options });
    }

    /**
     * Set default AI SDK generation options (maxOutputTokens, temperature,
     * etc.) for every LLM call.
     */
    withDefaultGenerationOptions(options: GenerationOptions): AnthropicProvider {
        return new AnthropicProvider({ ...this.config, defaultGenOptions: options });
    }

    /**
     * Enable file caching to prevent duplicate uploads across sessions. If no
     * cache is provided, an in-memory cache is used.
     *
     * @example
     * ```typescript
     * createAnthropicProvider({ apiKey: 'xxx' })
     *   .withFileCache()
     * ```
     */
    withFileCache(cache?: FileCache): AnthropicProvider {
        return new AnthropicProvider({ ...this.config, fileCache: cache ?? new InMemoryFileCache() });
    }

    /**
     * Enable Anthropic's server-side web search as a provider-level default
     * tool. The tool is merged with any per-call `tools` argument, so callers
     * only need to declare their own custom tools — the search tool is always
     * available.
     *
     * @example
     * ```typescript
     * createAnthropicProvider({ apiKey: 'xxx' })
     *   .withDefaultModel('claude-sonnet-4-6')
     *   .withWebSearch({ maxUses: 2 })
     * ```
     */
    withWebSearch(options: AnthropicWebSearchToolOptions = {}): AnthropicProvider {
        const searchTools = createAnthropicWebSearchTool(options);
        return new AnthropicProvider({
            ...this.config,
            defaultTools: { ...this.config.defaultTools, ...searchTools },
        });
    }

    /**
     * Enable reasoning with Anthropic's named `effort` control. Also turns on
     * `sendReasoning` so reasoning blocks can be carried across multi-turn
     * calls by default. Per-call `providerOptions.anthropic` may override
     * either field.
     *
     * @example
     * ```typescript
     * createAnthropicProvider({ apiKey: 'xxx' })
     *   .withReasoningEffort('high')
     * ```
     */
    withReasoningEffort(effort: AnthropicReasoningEffort): AnthropicProvider {
        return new AnthropicProvider({
            ...this.config,
            defaultOptions: {
                ...this.config.defaultOptions,
                effort,
                sendReasoning: true,
            },
        });
    }

    /**
     * Enable extended thinking with an explicit token budget. Also turns on
     * `sendReasoning` so reasoning blocks can be carried across multi-turn
     * calls by default. Per-call `providerOptions.anthropic` may override
     * either field.
     *
     * @example
     * ```typescript
     * createAnthropicProvider({ apiKey: 'xxx' })
     *   .withReasoningBudget(1024)
     * ```
     */
    withReasoningBudget(budgetTokens: number): AnthropicProvider {
        return new AnthropicProvider({
            ...this.config,
            defaultOptions: {
                ...this.config.defaultOptions,
                thinking: { type: 'enabled', budgetTokens },
                sendReasoning: true,
            },
        });
    }

    /**
     * Enable Anthropic adaptive thinking. Also turns on `sendReasoning` so
     * reasoning blocks can be carried across multi-turn calls by default.
     *
     * @example
     * ```typescript
     * createAnthropicProvider({ apiKey: 'xxx' })
     *   .withAdaptiveReasoning()
     * ```
     */
    withAdaptiveReasoning(): AnthropicProvider {
        return new AnthropicProvider({
            ...this.config,
            defaultOptions: {
                ...this.config.defaultOptions,
                thinking: { type: 'adaptive' },
                sendReasoning: true,
            },
        });
    }

    /**
     * Set whether Anthropic reasoning blocks are carried forward. This does
     * not enable or disable thinking by itself; it only controls the
     * `sendReasoning` flag. Last fluent call wins.
     */
    withSendReasoning(send: boolean): AnthropicProvider {
        return new AnthropicProvider({
            ...this.config,
            defaultOptions: {
                ...this.config.defaultOptions,
                sendReasoning: send,
            },
        });
    }

    private getSessionConfig() {
        return {
            defaultLanguageModel: this.config.defaultModelId
                ? this.anthropic(this.config.defaultModelId)
                : null,
            modelFactory: (modelId: string) => this.anthropic(modelId),
            providerType: 'anthropic' as const,
            providerPricing: this.config.pricingConfig,
            fileManager: new AnthropicFileManager(this.config.apiKey, {
                baseURL: this.config.baseURL,
                filesBeta: this.config.filesBeta,
                strategy: this.config.fileStrategy,
                inlineMaxBytes: this.config.inlineMaxBytes,
                fetch: this.config.fetch,
                cache: this.config.fileCache,
            }),
            logger: this.config.logger,
            defaultProviderOptions: {
                anthropic: withStructuredOutputDefault(this.config.defaultOptions),
            },
            defaultGenerationOptions: this.config.defaultGenOptions,
            defaultTools: this.config.defaultTools,
        };
    }

    protected createStreamingSession<
        TEvent extends { type: string },
    >(signal?: AbortSignal): StreamingSession<TEvent> {
        return applyAnthropicGuard(
            new StreamingSession<TEvent>({ ...this.getSessionConfig(), signal })
        );
    }

    protected createSimpleSession(signal?: AbortSignal): SimpleSession {
        return applyAnthropicGuard(new SimpleSession({ ...this.getSessionConfig(), signal }));
    }
}

/**
 * Create an Anthropic provider configured for AI SDK 6.x and the Anthropic
 * Messages API. The returned provider is fluent: chain `withDefaultModel`,
 * `withDefaultOptions`, `withPricing`, etc. before calling
 * `simpleExecution` or `streamingExecution`.
 *
 * Default `structuredOutputMode` is `'outputFormat'`. Override per call with
 * `providerOptions.anthropic.structuredOutputMode = 'jsonTool'` when the
 * schema contains bound keywords that Anthropic's `outputFormat` wire rejects.
 */
export function createAnthropicProvider(config: AnthropicProviderConfig): AnthropicProvider {
    return new AnthropicProvider({
        apiKey: config.apiKey,
        defaultModelId: null,
        logger: noopLogger,
        baseURL: config.baseURL,
        headers: config.headers,
        fetch: config.fetch,
        filesBeta: config.filesBeta ?? ANTHROPIC_FILES_API_BETA,
        fileStrategy: config.fileStrategy,
        inlineMaxBytes: config.inlineMaxBytes,
    });
}

export type { AnthropicLanguageModelOptions };
