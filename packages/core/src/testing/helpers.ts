import type { FileManager } from '@/provider';

export async function collectEvents<T>(execution: AsyncIterable<T>): Promise<T[]> {
    const events: T[] = [];
    for await (const event of execution) {
        events.push(event);
    }
    return events;
}

export async function consumeExecution<T>(execution: AsyncIterable<T>): Promise<void> {
    for await (const _event of execution) {
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
