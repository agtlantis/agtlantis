import type { FileManager } from '@/provider';
import type { SessionEvent, StreamingExecution } from '@/execution/types';

/**
 * Collects all events from a StreamingExecution into an array.
 * Works with both StreamingExecution (via .stream()) and raw AsyncIterable.
 */
export async function collectEvents<T extends { type: string }>(
    execution: StreamingExecution<T, unknown> | AsyncIterable<SessionEvent<T>>
): Promise<SessionEvent<T>[]> {
    const events: SessionEvent<T>[] = [];

    // Check if it's a StreamingExecution (has stream method)
    const iterable =
        'stream' in execution && typeof execution.stream === 'function'
            ? execution.stream()
            : (execution as AsyncIterable<SessionEvent<T>>);

    for await (const event of iterable) {
        events.push(event);
    }
    return events;
}

/**
 * Drains a StreamingExecution or AsyncIterable without storing events.
 */
export async function consumeExecution<T extends { type: string }>(
    execution: StreamingExecution<T, unknown> | AsyncIterable<SessionEvent<T>>
): Promise<void> {
    const iterable =
        'stream' in execution && typeof execution.stream === 'function'
            ? execution.stream()
            : (execution as AsyncIterable<SessionEvent<T>>);

    for await (const _event of iterable) {
        // intentionally empty - drains the async iterator
    }
}

export function expectFileManagerInterface(obj: unknown): asserts obj is FileManager {
    const fm = obj as FileManager;
    const requiredMethods = ['upload', 'delete', 'clear', 'getUploadedFiles'] as const;

    for (const method of requiredMethods) {
        if (typeof fm[method] !== 'function') {
            throw new Error(
                `Expected FileManager.${method} to be a function, got ${typeof fm[method]}`
            );
        }
    }
}
