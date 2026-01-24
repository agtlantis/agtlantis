/**
 * File-based prompt repository implementation.
 *
 * Stores prompts as YAML files with naming convention: {id}-{version}.yaml
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import * as yaml from 'yaml';

import type { FileSystem, PromptContentData, PromptRepository } from './types';
import { PromptInvalidFormatError, PromptIOError, PromptNotFoundError } from './errors';
import { compileTemplate } from './template';

// =============================================================================
// Types
// =============================================================================

export interface FilePromptRepositoryOptions {
  /** Directory path where prompt files are stored */
  directory: string;
  /** Optional custom file system implementation (defaults to Node.js fs) */
  fs?: FileSystem;
  /** Enable in-memory caching for read operations (defaults to true) */
  cache?: boolean;
}

// =============================================================================
// Error Utilities
// =============================================================================

function toErrorCause(error: unknown): Error | undefined {
  return error instanceof Error ? error : undefined;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// =============================================================================
// Default File System Implementation
// =============================================================================

const defaultFileSystem: FileSystem = {
  readFile: (filePath: string) => fs.readFile(filePath, 'utf-8'),
  writeFile: (filePath: string, content: string) => fs.writeFile(filePath, content, 'utf-8'),
  readdir: (dirPath: string) => fs.readdir(dirPath),
};

// =============================================================================
// Version Utilities
// =============================================================================

/**
 * Parses a semver version string into numeric components.
 * @param version - Version string (e.g., '1.2.3')
 * @returns Tuple of [major, minor, patch] or null if invalid
 */
function parseVersion(version: string): [number, number, number] | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

/**
 * Compares two semver versions.
 * @returns Negative if a < b, positive if a > b, zero if equal
 */
function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);

  // Invalid versions sort last
  if (!parsedA && !parsedB) return 0;
  if (!parsedA) return 1;
  if (!parsedB) return -1;

  for (let i = 0; i < 3; i++) {
    if (parsedA[i] !== parsedB[i]) {
      return parsedA[i] - parsedB[i];
    }
  }
  return 0;
}

// =============================================================================
// File Name Utilities
// =============================================================================

const FILE_EXTENSION = '.yaml';

/**
 * Generates file name from prompt id and version.
 * @example getFileName('greeting', '1.0.0') => 'greeting-1.0.0.yaml'
 */
function getFileName(id: string, version: string): string {
  return `${id}-${version}${FILE_EXTENSION}`;
}

/**
 * Parses file name into id and version.
 * @example parseFileName('greeting-1.0.0.yaml') => { id: 'greeting', version: '1.0.0' }
 */
function parseFileName(fileName: string): { id: string; version: string } | null {
  if (!fileName.endsWith(FILE_EXTENSION)) return null;

  const baseName = fileName.slice(0, -FILE_EXTENSION.length);
  const lastDash = baseName.lastIndexOf('-');
  if (lastDash === -1) return null;

  const id = baseName.slice(0, lastDash);
  const version = baseName.slice(lastDash + 1);

  if (!id || !parseVersion(version)) return null;

  return { id, version };
}

// =============================================================================
// YAML Parsing & Validation
// =============================================================================

/**
 * Parses and validates YAML content as PromptContentData.
 */
function parsePromptYaml(content: string, promptId: string): PromptContentData {
  let parsed: unknown;
  try {
    parsed = yaml.parse(content);
  } catch (error) {
    throw new PromptInvalidFormatError(
      promptId,
      `Invalid YAML: ${toErrorMessage(error)}`,
      { cause: toErrorCause(error) }
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new PromptInvalidFormatError(promptId, 'Expected YAML object');
  }

  const obj = parsed as Record<string, unknown>;

  // Validate required fields
  const requiredFields = ['id', 'version', 'system', 'userTemplate'] as const;
  for (const field of requiredFields) {
    if (typeof obj[field] !== 'string') {
      throw new PromptInvalidFormatError(
        promptId,
        `Missing or invalid required field: ${field} (expected string)`
      );
    }
  }

  return {
    id: obj.id as string,
    version: obj.version as string,
    system: obj.system as string,
    userTemplate: obj.userTemplate as string,
  };
}

/**
 * Serializes PromptContentData to YAML string.
 */
function serializePromptYaml(content: PromptContentData): string {
  return yaml.stringify(content);
}

// =============================================================================
// Repository Implementation
// =============================================================================

/**
 * File-based prompt repository.
 *
 * Prompts are stored as YAML files with naming convention: {id}-{version}.yaml
 *
 * Can be subclassed to customize parsing/serialization (e.g., JSON instead of YAML).
 *
 * @example
 * ```typescript
 * const repo = new FilePromptRepository({ directory: './prompts' });
 *
 * // Read latest version
 * const prompt = await repo.read<GreetingInput>('greeting');
 *
 * // Subclass to use JSON format
 * class JsonPromptRepository extends FilePromptRepository {
 *   protected parseContent(content: string, promptId: string): PromptContent {
 *     return JSON.parse(content);
 *   }
 *   protected serializeContent(content: PromptContent): string {
 *     return JSON.stringify(content, null, 2);
 *   }
 * }
 * ```
 */
export class FilePromptRepository implements PromptRepository {
  protected readonly directory: string;
  protected readonly fileSystem: FileSystem;
  protected readonly cacheEnabled: boolean;

  private readonly contentCache = new Map<string, PromptContentData>();

  constructor(options: FilePromptRepositoryOptions) {
    this.directory = options.directory;
    this.fileSystem = options.fs ?? defaultFileSystem;
    this.cacheEnabled = options.cache ?? true;
  }

  /**
   * Generates file name from prompt id and version.
   * Override this along with `parseFileName` to change file naming convention.
   */
  protected getFileName(id: string, version: string): string {
    return getFileName(id, version);
  }

  /**
   * Parses file name into id and version.
   * Override this along with `getFileName` to change file naming convention.
   */
  protected parseFileName(fileName: string): { id: string; version: string } | null {
    return parseFileName(fileName);
  }

  /**
   * Parses raw file content into PromptContentData.
   * Override this to support different file formats (e.g., JSON, TOML).
   */
  protected parseContent(content: string, promptId: string): PromptContentData {
    return parsePromptYaml(content, promptId);
  }

  /**
   * Serializes PromptContentData to file content string.
   * Override this to support different file formats (e.g., JSON, TOML).
   */
  protected serializeContent(content: PromptContentData): string {
    return serializePromptYaml(content);
  }

  private getCacheKey(id: string, version: string): string {
    return `${id}:${version}`;
  }

  async read(id: string, version?: string): Promise<PromptContentData> {
    if (version) {
      const cacheKey = this.getCacheKey(id, version);

      if (this.cacheEnabled) {
        const cached = this.contentCache.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      const fileName = this.getFileName(id, version);
      const filePath = path.join(this.directory, fileName);

      let content: string;
      try {
        content = await this.fileSystem.readFile(filePath);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          throw new PromptNotFoundError(id, version);
        }
        throw new PromptIOError('read', filePath, { cause: toErrorCause(error) });
      }

      const promptContent = this.parseContent(content, id);

      if (promptContent.id !== id || promptContent.version !== version) {
        throw new PromptInvalidFormatError(
          id,
          `File content mismatch: expected id='${id}' version='${version}', got id='${promptContent.id}' version='${promptContent.version}'`
        );
      }

      if (this.cacheEnabled) {
        this.contentCache.set(cacheKey, promptContent);
      }

      return promptContent;
    }

    let files: string[];
    try {
      files = await this.fileSystem.readdir(this.directory);
    } catch (error) {
      throw new PromptIOError('list', this.directory, { cause: toErrorCause(error) });
    }

    const versions: string[] = [];
    for (const file of files) {
      const parsed = this.parseFileName(file);
      if (parsed && parsed.id === id) {
        versions.push(parsed.version);
      }
    }

    if (versions.length === 0) {
      throw new PromptNotFoundError(id);
    }

    versions.sort((a, b) => compareVersions(b, a));
    const latestVersion = versions[0];

    return this.read(id, latestVersion);
  }

  async write(content: PromptContentData): Promise<void> {
    // Invalidate cache for this id:version (before any validation)
    if (this.cacheEnabled) {
      this.contentCache.delete(this.getCacheKey(content.id, content.version));
    }

    const fileName = this.getFileName(content.id, content.version);
    const filePath = path.join(this.directory, fileName);

    if (!parseVersion(content.version)) {
      throw new PromptInvalidFormatError(
        content.id,
        `Invalid version format: '${content.version}' (expected semver like '1.0.0')`
      );
    }

    // Validate templates can be compiled (fails fast on syntax errors)
    compileTemplate(content.system, content.id);
    compileTemplate(content.userTemplate, content.id);

    const yamlContent = this.serializeContent(content);

    try {
      await this.fileSystem.writeFile(filePath, yamlContent);
    } catch (error) {
      throw new PromptIOError('write', filePath, { cause: toErrorCause(error) });
    }
  }
}

/**
 * Creates a file-based prompt repository.
 *
 * This is a convenience factory function. For subclassing, use `FilePromptRepository` class directly.
 *
 * @example
 * ```typescript
 * const repo = createFilePromptRepository({ directory: './prompts' });
 * const prompt = await repo.read<GreetingInput>('greeting');
 * ```
 */
export function createFilePromptRepository(options: FilePromptRepositoryOptions): PromptRepository {
  return new FilePromptRepository(options);
}
