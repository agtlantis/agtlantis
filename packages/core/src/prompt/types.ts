/**
 * Prompt module types for @agtlantis/core.
 *
 * Provides structured prompt management with versioning, templating, and repository abstraction.
 */

// =============================================================================
// Prompt Content (Raw Data)
// =============================================================================

/**
 * Raw prompt content as stored in the repository.
 * This is the serialized form before template compilation.
 *
 * @example
 * ```typescript
 * const content: PromptContent = {
 *   id: 'greeting',
 *   version: '1.0.0',
 *   system: 'You are a helpful assistant.',
 *   userTemplate: 'Hello, {{name}}!',
 * };
 * ```
 */
export interface PromptContent {
  /** Unique identifier for the prompt */
  id: string;
  /** Semantic version string (e.g., '1.0.0') */
  version: string;
  /** System prompt content */
  system: string;
  /** User prompt template (Handlebars syntax) */
  userTemplate: string;
}

// =============================================================================
// Prompt Definition (Compiled)
// =============================================================================

/**
 * Compiled prompt definition with template function.
 * Created from PromptContent after Handlebars compilation.
 *
 * @typeParam TInput - Type of the input object for template rendering
 *
 * @example
 * ```typescript
 * interface GreetingInput {
 *   name: string;
 * }
 *
 * const prompt: PromptDefinition<GreetingInput> = {
 *   id: 'greeting',
 *   version: '1.0.0',
 *   system: 'You are a helpful assistant.',
 *   userTemplate: 'Hello, {{name}}!',
 *   buildUserPrompt: (input) => `Hello, ${input.name}!`,
 * };
 *
 * const userPrompt = prompt.buildUserPrompt({ name: 'World' });
 * // => 'Hello, World!'
 * ```
 */
export interface PromptDefinition<TInput> {
  /** Unique identifier for the prompt */
  id: string;
  /** Semantic version string (e.g., '1.0.0') */
  version: string;
  /** System prompt content */
  system: string;
  /** Original user prompt template (Handlebars syntax) */
  userTemplate: string;
  /** Compiled template function that renders the user prompt */
  buildUserPrompt: (input: TInput) => string;
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
 * const repo = createFilePromptRepository({ directory: './prompts' });
 *
 * // Read latest version
 * const prompt = await repo.read<GreetingInput>('greeting');
 *
 * // Read specific version
 * const v1 = await repo.read<GreetingInput>('greeting', '1.0.0');
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
   * Reads a prompt definition from the repository.
   *
   * @typeParam TInput - Type of the input object for template rendering
   * @param id - Prompt identifier
   * @param version - Optional specific version. If omitted, returns the latest version.
   * @returns Compiled prompt definition
   * @throws {PromptNotFoundError} If prompt with given id (and version) doesn't exist
   * @throws {PromptInvalidFormatError} If prompt file has invalid format
   * @throws {PromptTemplateError} If template compilation fails
   */
  read<TInput>(id: string, version?: string): Promise<PromptDefinition<TInput>>;

  /**
   * Writes a prompt to the repository.
   *
   * @param content - Raw prompt content to store
   * @throws {PromptIOError} If write operation fails
   */
  write(content: PromptContent): Promise<void>;
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
