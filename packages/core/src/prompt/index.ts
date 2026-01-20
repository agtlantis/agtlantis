/**
 * Prompt module for @agtlantis/core.
 *
 * Provides structured prompt management with versioning, templating, and repository abstraction.
 *
 * @example
 * ```typescript
 * import {
 *   createFilePromptRepository,
 *   toPromptDefinition,
 *   type PromptDefinition,
 * } from '@agtlantis/core';
 *
 * // Create a file-based repository
 * const repo = createFilePromptRepository({ directory: './prompts' });
 *
 * // Read a prompt
 * interface GreetingInput {
 *   name: string;
 * }
 * const prompt = await repo.read<GreetingInput>('greeting');
 *
 * // Use the prompt
 * const userPrompt = prompt.buildUserPrompt({ name: 'World' });
 * console.log(prompt.system);      // System prompt
 * console.log(userPrompt);         // 'Hello, World!'
 * ```
 */

// Types
export type {
  PromptContent,
  PromptDefinition,
  PromptRepository,
  FileSystem,
} from './types';

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
export { compileTemplate, toPromptDefinition } from './template';

// Repository implementations
export {
  FilePromptRepository,
  createFilePromptRepository,
  type FilePromptRepositoryOptions,
} from './file-prompt-repository';
