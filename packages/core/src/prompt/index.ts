/**
 * Prompt module for @agtlantis/core.
 *
 * Provides structured prompt management with versioning, templating, and repository abstraction.
 *
 * @example
 * ```typescript
 * import {
 *   createFilePromptRepository,
 *   PromptTemplate,
 *   type PromptRenderer,
 * } from '@agtlantis/core';
 *
 * // Create a file-based repository
 * const repo = createFilePromptRepository({ directory: './prompts' });
 *
 * // Read a prompt and compile to renderer
 * interface SessionCtx { studentName: string }
 * interface TurnCtx { answers: string[] }
 *
 * const data = await repo.read('greeting');
 * const renderer = PromptTemplate.from(data).compile<SessionCtx, TurnCtx>();
 *
 * // Use the renderer
 * const systemPrompt = renderer.renderSystemPrompt({ studentName: 'Kim' });
 * const userPrompt = renderer.renderUserPrompt({ answers: ['A', 'B'] });
 * ```
 */

// Types
export type { PromptTemplateData, PromptRenderer, PromptRepository, FileSystem } from './types';

// PromptTemplate class
export { PromptTemplate } from './prompt-template';

// Errors
export {
    PromptErrorCode,
    PromptError,
    PromptNotFoundError,
    PromptInvalidFormatError,
    PromptTemplateError,
    PromptIOError,
    type PromptErrorOptions,
} from './errors';

// Template utilities
export { compileTemplate } from './template';

// Repository implementations
export {
    FilePromptRepository,
    createFilePromptRepository,
    type FilePromptRepositoryOptions,
} from './file-prompt-repository';
