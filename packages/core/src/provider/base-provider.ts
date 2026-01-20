import type { EventMetrics } from '@/observability';
import type { Logger } from '@/observability/logger';
import type { ProviderPricing } from '@/pricing';
import type { StreamingExecution, SimpleExecution, ExecutionOptions } from '../execution/types';
import { StreamingExecutionHost } from '../execution/streaming-host';
import { SimpleExecutionHost } from '../execution/simple-host';
import type { SimpleSession } from '../session/simple-session';
import type { StreamingSession } from '../session/streaming-session';
import type { Provider } from './types';

/**
 * Abstract base class for AI providers.
 *
 * Provides common streamingExecution and simpleExecution implementation.
 * Subclasses implement session creation and fluent configuration methods.
 */
export abstract class BaseProvider implements Provider {
    /**
     * Create a SimpleSession for non-streaming execution.
     * @param signal - AbortSignal for cancellation support
     */
    protected abstract createSimpleSession(signal?: AbortSignal): SimpleSession;

    /**
     * Create a StreamingSession for streaming execution.
     * @param signal - AbortSignal for cancellation support
     */
    protected abstract createStreamingSession<
        TEvent extends { type: string; metrics: EventMetrics },
        TResult,
    >(signal?: AbortSignal): StreamingSession<TEvent, TResult>;

    abstract withDefaultModel(modelId: string): Provider;

    abstract withLogger(logger: Logger): Provider;

    abstract withPricing(pricing: ProviderPricing): Provider;

    streamingExecution<TEvent extends { type: string; metrics: EventMetrics }, TResult>(
        generator: (
            session: StreamingSession<TEvent, TResult>
        ) => AsyncGenerator<TEvent, TEvent | Promise<TEvent>>,
        options?: ExecutionOptions
    ): StreamingExecution<TEvent, TResult> {
        return new StreamingExecutionHost(
            (signal) => this.createStreamingSession<TEvent, TResult>(signal),
            generator,
            options?.signal
        );
    }

    /**
     * Execute a non-streaming function with cancellation support.
     * Returns immediately - execution starts in the background.
     */
    simpleExecution<TResult>(
        fn: (session: SimpleSession) => Promise<TResult>,
        options?: ExecutionOptions
    ): SimpleExecution<TResult> {
        return new SimpleExecutionHost(
            (signal) => this.createSimpleSession(signal),
            fn,
            options?.signal
        );
    }
}
