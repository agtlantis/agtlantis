/**
 * Prompt module types for @agtlantis/core.
 *
 * Provides structured prompt management with versioning, templating, and repository abstraction.
 */

// =============================================================================
// Prompt Content (Raw Data)
// =============================================================================

/**
 * Raw prompt content data as stored in the repository.
 * This is the serialized form before template compilation.
 *
 * @example
 * ```typescript
 * const data: PromptContentData = {
 *   id: 'greeting',
 *   version: '1.0.0',
 *   system: 'You are a helpful assistant.',
 *   userTemplate: 'Hello, {{name}}!',
 * };
 * ```
 */
export interface PromptContentData {
  /** Unique identifier for the prompt */
  id: string;
  /** Semantic version string (e.g., '1.0.0') */
  version: string;
  /** System prompt template (Handlebars syntax) */
  system: string;
  /** User prompt template (Handlebars syntax) */
  userTemplate: string;
}

// =============================================================================
// Prompt Builder (Compiled)
// =============================================================================

/**
 * Compiled prompt builder with template functions.
 * Created from PromptContent.toBuilder() after Handlebars compilation.
 *
 * @typeParam TSystemInput - Type of the input object for system prompt rendering
 * @typeParam TUserInput - Type of the input object for user prompt rendering
 *
 * @example
 * ```typescript
 * interface SessionContext {
 *   studentName: string;
 * }
 * interface TurnContext {
 *   previousAnswers: string[];
 * }
 *
 * const builder: PromptBuilder<SessionContext, TurnContext> = content.toBuilder();
 *
 * const systemPrompt = builder.buildSystemPrompt({ studentName: 'Kim' });
 * const userPrompt = builder.buildUserPrompt({ previousAnswers: ['A', 'B'] });
 * ```
 */
export interface PromptBuilder<TSystemInput = unknown, TUserInput = unknown> {
  /** Unique identifier for the prompt */
  id: string;
  /** Semantic version string (e.g., '1.0.0') */
  version: string;
  /** Compiled template function that renders the system prompt */
  buildSystemPrompt: (input: TSystemInput) => string;
  /** Compiled template function that renders the user prompt */
  buildUserPrompt: (input: TUserInput) => string;
}

// =============================================================================
// Repository Interface
// =============================================================================

/**
 * Repository interface for prompt storage operations.
 * Implementations can use file system, database, or other storage backends.
 *
 * @example
 * ```typescript
 * import { createFilePromptRepository, PromptContent } from '@agtlantis/core';
 *
 * const repo = createFilePromptRepository({ directory: './prompts' });
 *
 * // Read latest version
 * const data = await repo.read('greeting');
 * const builder = PromptContent.from(data).toBuilder<SessionCtx, TurnCtx>();
 *
 * // Read specific version
 * const v1Data = await repo.read('greeting', '1.0.0');
 *
 * // Write new prompt
 * await repo.write({
 *   id: 'greeting',
 *   version: '2.0.0',
 *   system: 'You are a friendly assistant.',
 *   userTemplate: 'Hi {{name}}! How are you?',
 * });
 * ```
 */
export interface PromptRepository {
  /**
   * Reads raw prompt content from the repository.
   *
   * @param id - Prompt identifier
   * @param version - Optional specific version. If omitted, returns the latest version.
   * @returns Raw prompt content data
   * @throws {PromptNotFoundError} If prompt with given id (and version) doesn't exist
   * @throws {PromptInvalidFormatError} If prompt file has invalid format
   */
  read(id: string, version?: string): Promise<PromptContentData>;

  /**
   * Writes a prompt to the repository.
   *
   * @param content - Raw prompt content to store
   * @throws {PromptIOError} If write operation fails
   */
  write(content: PromptContentData): Promise<void>;
}

// =============================================================================
// File System Abstraction
// =============================================================================

/**
 * Minimal file system interface for repository operations.
 * Abstracts Node.js fs/promises for easier testing and potential browser compatibility.
 *
 * @example
 * ```typescript
 * // Use default Node.js implementation
 * const repo = createFilePromptRepository({ directory: './prompts' });
 *
 * // Use custom implementation for testing
 * const mockFs: FileSystem = {
 *   readFile: async (path) => mockFiles[path],
 *   writeFile: async (path, content) => { mockFiles[path] = content; },
 *   readdir: async (path) => Object.keys(mockFiles),
 * };
 * const repo = createFilePromptRepository({ directory: './prompts', fs: mockFs });
 * ```
 */
export interface FileSystem {
  /**
   * Reads file content as UTF-8 string.
   * @param path - Absolute or relative file path
   * @returns File content as string
   * @throws If file doesn't exist or read fails
   */
  readFile(path: string): Promise<string>;

  /**
   * Writes content to a file (creates or overwrites).
   * @param path - Absolute or relative file path
   * @param content - Content to write
   * @throws If write operation fails
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Lists files in a directory.
   * @param path - Directory path
   * @returns Array of file/directory names (not full paths)
   * @throws If directory doesn't exist or read fails
   */
  readdir(path: string): Promise<string[]>;
}
