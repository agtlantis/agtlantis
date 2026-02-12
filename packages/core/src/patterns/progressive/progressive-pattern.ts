import { type StopCondition, type ToolSet, hasToolCall, tool } from 'ai';
import { z } from 'zod';

import type {
    EmittableEventInput,
    ErrorEvent,
    ExtractResult,
    SessionEvent,
} from '@/execution/types';
import type { BaseProvider } from '@/provider/base-provider';
import type { StreamingSession } from '@/session/streaming-session';
import type { StreamTextParams } from '@/session/types';

export type ProgressiveStreamOptions<TUserTools extends ToolSet = {}> = Omit<
    StreamTextParams<TUserTools>,
    'tools' | 'toolChoice' | 'stopWhen'
> & {
    tools?: TUserTools;
    /**
     * Additional stop conditions. Will be combined with the default
     * `hasToolCall('submitResult')`.
     */
    stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
    /**
     * Custom protocol instructions appended to the system prompt.
     * If not provided, uses the default TOOL_CALLING_PROTOCOL.
     */
    protocol?: string;
};

/**
 * Progress event - pure domain event without metrics.
 * Framework automatically wraps with SessionEvent at runtime.
 */
export interface ProgressEvent<TProgress> {
    type: 'progress';
    data: TProgress;
}

/**
 * Complete event - pure domain event without metrics.
 * Framework automatically wraps with SessionEvent at runtime.
 */
export interface CompleteEvent<TResult> {
    type: 'complete';
    data: TResult;
    summary: unknown;
}

const TOOL_DESCRIPTIONS = {
    reportProgress:
        '[OPTIONAL] Report progress during task execution. Use this to show intermediate work. You may call this multiple times, then you MUST call tools::submitResult.',
    submitResult:
        '[REQUIRED] Submit the final result. You MUST call this exactly once to complete the task. Without this call, the task FAILS.',
} as const;

export const TOOL_CALLING_PROTOCOL = `## CRITICAL INSTRUCTION - READ CAREFULLY

You have 2 tools available:
1. reportProgress - [OPTIONAL] Show intermediate work (multiple times)
2. submitResult - [REQUIRED] Submit your final answer

⚠️ IMPORTANT RULES:
- You may call reportProgress 0-3 times to show progress
- You MUST call submitResult exactly once to complete the task
- After calling reportProgress, you MUST call submitResult in your NEXT response
- If you call reportProgress more than 3 times without submitResult, the task FAILS
- The task is NOT complete until submitResult is called

CORRECT SEQUENCE:
1. [Optional] reportProgress
2. [Required] submitResult (exactly once)

❌ WRONG: reportProgress → reportProgress → reportProgress → reportProgress (no submitResult = FAIL)
✅ CORRECT: reportProgress → submitResult (SUCCESS)`;

/**
 * Creates a progressive pattern for streaming LLM responses with intermediate progress updates.
 *
 * The pattern automatically:
 * - Injects `reportProgress` and `submitResult` tools
 * - Stops when `submitResult` is called (via `hasToolCall('submitResult')`)
 * - Appends protocol instructions to the system prompt
 *
 * @example Basic usage
 * ```typescript
 * const pattern = defineProgressivePattern({
 *   progressSchema: z.object({ stage: z.string(), message: z.string() }),
 *   resultSchema: z.object({ summary: z.string(), score: z.number() }),
 * });
 *
 * for await (const event of pattern.run(provider, {
 *   system: 'You are an analyzer.',
 *   prompt: 'Analyze this...',
 * })) {
 *   console.log(event.type, event.data);
 * }
 * ```
 *
 * @example With custom stopWhen (add step limit)
 * ```typescript
 * import { stepCountIs } from 'ai';
 *
 * for await (const event of pattern.run(provider, {
 *   prompt: 'Analyze...',
 *   stopWhen: stepCountIs(10), // Stop at submitResult OR after 10 steps
 * })) { ... }
 * ```
 *
 * @example With custom protocol
 * ```typescript
 * for await (const event of pattern.run(provider, {
 *   prompt: 'Analyze...',
 *   protocol: 'Call reportProgress for each step, then submitResult.',
 * })) { ... }
 * ```
 *
 * @example Composable (within a session)
 * ```typescript
 * provider.streamingExecution(async function*(session) {
 *   yield* pattern.runInSession(session, {
 *     system: 'You are an analyzer.',
 *     messages: [...],
 *   });
 * });
 * ```
 */
export function defineProgressivePattern<
    TProgressSchema extends z.ZodType,
    TResultSchema extends z.ZodType,
>(config: { progressSchema: TProgressSchema; resultSchema: TResultSchema }) {
    return new ProgressivePattern(config.progressSchema, config.resultSchema);
}

export class ProgressivePattern<
    TProgressSchema extends z.ZodType,
    TResultSchema extends z.ZodType,
    TProgress = z.infer<TProgressSchema>,
    TResult = z.infer<TResultSchema>,
    TEvent extends { type: string } = { type: string },
> {
    constructor(
        readonly progressSchema: TProgressSchema,
        readonly resultSchema: TResultSchema
    ) {}

    private lastParseError: Error | null = null;

    /**
     * Runs the pattern within an existing session. Use this for composing
     * multiple patterns or when you need fine-grained control over the session.
     *
     * @param session - The streaming session to run within
     * @param options - Stream options including:
     *   - `stopWhen` - Additional stop conditions (combined with default `hasToolCall('submitResult')`)
     *   - `protocol` - Custom protocol instructions (replaces default `TOOL_CALLING_PROTOCOL`)
     *   - All other `streamText` options except `tools`, `toolChoice`, `stopWhen`
     *
     * @example Basic usage
     * ```typescript
     * provider.streamingExecution(async function*(session) {
     *   yield* pattern.runInSession(session, {
     *     system: 'You are an analyzer.',
     *     messages: [{ role: 'user', content: 'Analyze...' }],
     *   });
     * });
     * ```
     *
     * @example With custom stopWhen
     * ```typescript
     * yield* pattern.runInSession(session, {
     *   prompt: 'Analyze...',
     *   stopWhen: stepCountIs(5), // Combined: submitResult OR 5 steps
     * });
     * ```
     */
    async *runInSession<TUserTools extends ToolSet = {}>(
        session: StreamingSession<TEvent>,
        options: ProgressiveStreamOptions<TUserTools>
    ): AsyncGenerator<SessionEvent<TEvent>, SessionEvent<TEvent>, undefined> {
        const {
            tools: userTools,
            system,
            stopWhen: userStopWhen,
            protocol,
            ...restOptions
        } = options;

        const internalTools = this.createTools();
        const allTools = { ...userTools, ...internalTools } as ToolSet;
        const systemString = typeof system === 'string' ? system : undefined;
        const fullSystem = this.renderSystemPrompt(systemString, protocol);

        const defaultStopCondition = hasToolCall('submitResult');
        const stopConditions = this.combineStopConditions(defaultStopCondition, userStopWhen);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream = session.streamText({
            ...restOptions,
            system: fullSystem,
            tools: allTools as any,
            toolChoice: 'required',
            stopWhen: stopConditions as any,
        });

        let result: TResult | null = null;

        for await (const part of stream.fullStream) {
            if (part.type === 'tool-call') {
                if (part.toolName === 'reportProgress') {
                    const input = 'input' in part ? part.input : undefined;
                    const progressData = this.parseProgressInput(input);
                    if (progressData !== null) {
                        // Cast required: TypeScript can't know that TEvent includes a 'progress' variant
                        yield session.emit({
                            type: 'progress',
                            data: progressData,
                        } as unknown as EmittableEventInput<TEvent>);
                    }
                } else if (part.toolName === 'submitResult') {
                    const input = 'input' in part ? part.input : undefined;
                    result = this.parseResultInput(input);
                }
            }
        }

        if (result === null) {
            const baseMsg = 'ProgressivePattern: No result received.';
            const detail = this.lastParseError
                ? ` Last parse error: ${this.lastParseError.message}`
                : ' The LLM did not call submitResult tool.';
            throw new Error(baseMsg + detail);
        }

        const completeEvent = await session.done(result as ExtractResult<TEvent>);
        yield completeEvent;
        return completeEvent;
    }

    /**
     * Standalone execution that creates a new session internally.
     * Use this for simple, single-pattern executions.
     *
     * @param provider - The AI provider to use
     * @param options - Stream options including:
     *   - `stopWhen` - Additional stop conditions (combined with default `hasToolCall('submitResult')`)
     *   - `protocol` - Custom protocol instructions (replaces default `TOOL_CALLING_PROTOCOL`)
     *
     * @example Basic usage
     * ```typescript
     * for await (const event of pattern.run(provider, {
     *   system: 'You are an analyzer.',
     *   prompt: 'Analyze this document...',
     * })) {
     *   if (event.type === 'progress') {
     *     console.log('Progress:', event.data);
     *   } else if (event.type === 'complete') {
     *     console.log('Result:', event.data);
     *   }
     * }
     * ```
     *
     * @example With step limit
     * ```typescript
     * import { stepCountIs } from 'ai';
     *
     * for await (const event of pattern.run(provider, {
     *   prompt: 'Analyze...',
     *   stopWhen: stepCountIs(10),
     * })) { ... }
     * ```
     */
    run<TUserTools extends ToolSet = {}>(
        provider: BaseProvider,
        options: ProgressiveStreamOptions<TUserTools>
    ): AsyncIterable<SessionEvent<TEvent | ErrorEvent>> {
        const self = this;
        const execution = provider.streamingExecution<TEvent>(async function* (session) {
            return yield* self.runInSession(session, options);
        });
        return execution.stream();
    }

    private createTools() {
        return {
            reportProgress: tool({
                description: TOOL_DESCRIPTIONS.reportProgress,
                inputSchema: z.object({
                    data: this.progressSchema,
                }),
                execute: async () => ({
                    status: 'progress_recorded',
                    instruction:
                        'After all progress reports, you MUST call tools::submitResult to complete the task.',
                }),
            }),
            submitResult: tool({
                description: TOOL_DESCRIPTIONS.submitResult,
                inputSchema: z.object({
                    data: this.resultSchema,
                }),
                execute: async () => ({
                    status: 'result_submitted',
                    message: 'Task completed successfully.',
                }),
            }),
        };
    }

    private parseJsonWrapper<T>(input: unknown, schema: z.ZodType<T>): T | null {
        try {
            if (!input || typeof input !== 'object') return null;
            const wrapper = input as { data?: unknown };
            if (wrapper.data === undefined) return null;

            const parsed =
                typeof wrapper.data === 'string' ? JSON.parse(wrapper.data) : wrapper.data;

            return schema.parse(parsed) as T;
        } catch (error) {
            this.lastParseError = error instanceof Error ? error : new Error(String(error));
            return null;
        }
    }

    private parseProgressInput(input: unknown): TProgress | null {
        return this.parseJsonWrapper(input, this.progressSchema) as TProgress | null;
    }

    private parseResultInput(input: unknown): TResult | null {
        return this.parseJsonWrapper(input, this.resultSchema) as TResult | null;
    }

    private combineStopConditions(
        defaultCondition: StopCondition<ToolSet>,
        userConditions?: StopCondition<ToolSet> | StopCondition<ToolSet>[]
    ): StopCondition<ToolSet>[] {
        if (!userConditions) {
            return [defaultCondition];
        }
        const userArray = Array.isArray(userConditions) ? userConditions : [userConditions];
        return [defaultCondition, ...userArray];
    }

    private renderSystemPrompt(userSystem?: string, protocol?: string): string {
        const protocolText = protocol ?? TOOL_CALLING_PROTOCOL;
        return userSystem ? `${userSystem}\n\n${protocolText}` : protocolText;
    }
}
