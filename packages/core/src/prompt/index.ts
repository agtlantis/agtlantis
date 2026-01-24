/**
 * Prompt module for @agtlantis/core.
 *
 * Provides structured prompt management with versioning, templating, and repository abstraction.
 *
 * @example
 * ```typescript
 * import {
 *   createFilePromptRepository,
 *   PromptContent,
 *   type PromptBuilder,
 * } from '@agtlantis/core';
 *
 * // Create a file-based repository
 * const repo = createFilePromptRepository({ directory: './prompts' });
 *
 * // Read a prompt and compile to builder
 * interface SessionCtx { studentName: string }
 * interface TurnCtx { answers: string[] }
 *
 * const data = await repo.read('greeting');
 * const builder = PromptContent.from(data).toBuilder<SessionCtx, TurnCtx>();
 *
 * // Use the builder
 * const systemPrompt = builder.buildSystemPrompt({ studentName: 'Kim' });
 * const userPrompt = builder.buildUserPrompt({ answers: ['A', 'B'] });
 * ```
 */

// Types
export type {
  PromptContentData,
  PromptBuilder,
  PromptRepository,
  FileSystem,
} from './types';

// PromptContent class
export { PromptContent } from './prompt-content';

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
