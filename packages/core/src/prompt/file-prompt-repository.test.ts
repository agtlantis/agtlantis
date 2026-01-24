import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFilePromptRepository } from './file-prompt-repository';
import { PromptContent } from './prompt-content';
import {
  PromptInvalidFormatError,
  PromptIOError,
  PromptNotFoundError,
  PromptTemplateError,
} from './errors';
import type { PromptContentData } from './types';

describe('createFilePromptRepository', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'prompt-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // ==========================================================================
  // Helper functions
  // ==========================================================================

  async function writePromptFile(content: PromptContentData): Promise<void> {
    const fileName = `${content.id}-${content.version}.yaml`;
    const yaml = `id: ${content.id}
version: "${content.version}"
system: "${content.system}"
userTemplate: "${content.userTemplate}"
`;
    await writeFile(join(testDir, fileName), yaml);
  }

  async function writeRawFile(fileName: string, content: string): Promise<void> {
    await writeFile(join(testDir, fileName), content);
  }

  // ==========================================================================
  // read() tests
  // ==========================================================================

  describe('read', () => {
    describe('with specific version', () => {
      it('should read prompt with specific version', async () => {
        await writePromptFile({
          id: 'greeting',
          version: '1.0.0',
          system: 'You are helpful.',
          userTemplate: 'Hello, {{name}}!',
        });

        const repo = createFilePromptRepository({ directory: testDir });
        const data = await repo.read('greeting', '1.0.0');

        expect(data.id).toBe('greeting');
        expect(data.version).toBe('1.0.0');
        expect(data.system).toBe('You are helpful.');
        expect(data.userTemplate).toBe('Hello, {{name}}!');

        // Test builder
        const builder = PromptContent.from(data).toBuilder<unknown, { name: string }>();
        expect(builder.buildUserPrompt({ name: 'World' })).toBe('Hello, World!');
      });

      it('should throw PromptNotFoundError for non-existent version', async () => {
        await writePromptFile({
          id: 'greeting',
          version: '1.0.0',
          system: 'System',
          userTemplate: 'Hello',
        });

        const repo = createFilePromptRepository({ directory: testDir });

        await expect(repo.read('greeting', '2.0.0')).rejects.toThrow(PromptNotFoundError);
        await expect(repo.read('greeting', '2.0.0')).rejects.toMatchObject({
          promptId: 'greeting',
          version: '2.0.0',
        });
      });

      it('should throw PromptNotFoundError for non-existent prompt', async () => {
        const repo = createFilePromptRepository({ directory: testDir });

        await expect(repo.read('nonexistent', '1.0.0')).rejects.toThrow(PromptNotFoundError);
      });
    });

    describe('without version (latest)', () => {
      it('should return latest version', async () => {
        await writePromptFile({
          id: 'greeting',
          version: '1.0.0',
          system: 'v1',
          userTemplate: 'v1',
        });
        await writePromptFile({
          id: 'greeting',
          version: '2.0.0',
          system: 'v2',
          userTemplate: 'v2',
        });
        await writePromptFile({
          id: 'greeting',
          version: '1.5.0',
          system: 'v1.5',
          userTemplate: 'v1.5',
        });

        const repo = createFilePromptRepository({ directory: testDir });
        const prompt = await repo.read('greeting');

        expect(prompt.version).toBe('2.0.0');
        expect(prompt.system).toBe('v2');
      });

      it('should handle patch version ordering', async () => {
        await writePromptFile({
          id: 'test',
          version: '1.0.9',
          system: 'old',
          userTemplate: 'old',
        });
        await writePromptFile({
          id: 'test',
          version: '1.0.10',
          system: 'new',
          userTemplate: 'new',
        });

        const repo = createFilePromptRepository({ directory: testDir });
        const prompt = await repo.read('test');

        expect(prompt.version).toBe('1.0.10');
      });

      it('should throw PromptNotFoundError when no versions exist', async () => {
        const repo = createFilePromptRepository({ directory: testDir });

        await expect(repo.read('nonexistent')).rejects.toThrow(PromptNotFoundError);
        await expect(repo.read('nonexistent')).rejects.toMatchObject({
          promptId: 'nonexistent',
        });
      });

      it('should ignore files for other prompts', async () => {
        await writePromptFile({
          id: 'other',
          version: '9.0.0',
          system: 'other',
          userTemplate: 'other',
        });
        await writePromptFile({
          id: 'target',
          version: '1.0.0',
          system: 'target',
          userTemplate: 'target',
        });

        const repo = createFilePromptRepository({ directory: testDir });
        const prompt = await repo.read('target');

        expect(prompt.id).toBe('target');
        expect(prompt.version).toBe('1.0.0');
      });
    });

    describe('validation', () => {
      it('should throw PromptInvalidFormatError for invalid YAML', async () => {
        await writeRawFile('greeting-1.0.0.yaml', 'invalid: yaml: content:');

        const repo = createFilePromptRepository({ directory: testDir });

        await expect(repo.read('greeting', '1.0.0')).rejects.toThrow(PromptInvalidFormatError);
      });

      it('should throw PromptInvalidFormatError for missing required field', async () => {
        await writeRawFile(
          'greeting-1.0.0.yaml',
          `id: greeting
version: "1.0.0"
system: "System"
`
        );

        const repo = createFilePromptRepository({ directory: testDir });

        await expect(repo.read('greeting', '1.0.0')).rejects.toThrow(PromptInvalidFormatError);
      });

      it('should throw PromptInvalidFormatError for mismatched id', async () => {
        await writeRawFile(
          'greeting-1.0.0.yaml',
          `id: different
version: "1.0.0"
system: "System"
userTemplate: "Hello"
`
        );

        const repo = createFilePromptRepository({ directory: testDir });

        await expect(repo.read('greeting', '1.0.0')).rejects.toThrow(PromptInvalidFormatError);
      });

      it('should read prompts with template errors (errors occur at render time)', async () => {
        // Handlebars defers most validation to render time
        await writeRawFile(
          'greeting-1.0.0.yaml',
          `id: greeting
version: "1.0.0"
system: "System"
userTemplate: "{{#if a}}hello{{/unless}}"
`
        );

        const repo = createFilePromptRepository({ directory: testDir });
        const data = await repo.read('greeting', '1.0.0');

        // Template compiles but throws when rendering
        const builder = PromptContent.from(data).toBuilder<unknown, { a: boolean }>();
        expect(() => builder.buildUserPrompt({ a: true })).toThrow(PromptTemplateError);
      });
    });
  });

  // ==========================================================================
  // write() tests
  // ==========================================================================

  describe('write', () => {
    it('should write prompt to file', async () => {
      const repo = createFilePromptRepository({ directory: testDir });

      await repo.write({
        id: 'greeting',
        version: '1.0.0',
        system: 'You are helpful.',
        userTemplate: 'Hello, {{name}}!',
      });

      // Verify by reading back
      const data = await repo.read('greeting', '1.0.0');
      expect(data.id).toBe('greeting');
      expect(data.version).toBe('1.0.0');
      expect(data.system).toBe('You are helpful.');

      const builder = PromptContent.from(data).toBuilder<unknown, { name: string }>();
      expect(builder.buildUserPrompt({ name: 'Test' })).toBe('Hello, Test!');
    });

    it('should overwrite existing file', async () => {
      const repo = createFilePromptRepository({ directory: testDir });

      await repo.write({
        id: 'greeting',
        version: '1.0.0',
        system: 'Original',
        userTemplate: 'Original',
      });

      await repo.write({
        id: 'greeting',
        version: '1.0.0',
        system: 'Updated',
        userTemplate: 'Updated',
      });

      const prompt = await repo.read('greeting', '1.0.0');
      expect(prompt.system).toBe('Updated');
    });

    it('should throw PromptInvalidFormatError for invalid version format', async () => {
      const repo = createFilePromptRepository({ directory: testDir });

      await expect(
        repo.write({
          id: 'greeting',
          version: 'invalid',
          system: 'System',
          userTemplate: 'Hello',
        })
      ).rejects.toThrow(PromptInvalidFormatError);
    });

    it('should write prompts even with template errors (Handlebars is lenient)', async () => {
      // Handlebars defers most validation to render time
      // So write succeeds, but reading and rendering will fail
      const repo = createFilePromptRepository({ directory: testDir });

      await repo.write({
        id: 'greeting',
        version: '1.0.0',
        system: 'System',
        userTemplate: '{{#if a}}hello{{/unless}}',
      });

      const data = await repo.read('greeting', '1.0.0');
      const builder = PromptContent.from(data).toBuilder<unknown, { a: boolean }>();
      expect(() => builder.buildUserPrompt({ a: true })).toThrow(PromptTemplateError);
    });

    it('should throw PromptIOError for invalid directory', async () => {
      const repo = createFilePromptRepository({ directory: '/nonexistent/path' });

      await expect(
        repo.write({
          id: 'greeting',
          version: '1.0.0',
          system: 'System',
          userTemplate: 'Hello',
        })
      ).rejects.toThrow(PromptIOError);
    });
  });

  // ==========================================================================
  // Custom FileSystem tests
  // ==========================================================================

  describe('custom FileSystem', () => {
    it('should use custom FileSystem implementation', async () => {
      const files: Record<string, string> = {
        [`${testDir}/greeting-1.0.0.yaml`]: `id: greeting
version: "1.0.0"
system: "Custom FS"
userTemplate: "Hello, {{name}}!"
`,
      };

      const customFs = {
        readFile: async (path: string) => {
          if (files[path]) return files[path];
          const error = new Error('ENOENT') as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        },
        writeFile: async (path: string, content: string) => {
          files[path] = content;
        },
        readdir: async () => ['greeting-1.0.0.yaml'],
      };

      const repo = createFilePromptRepository({ directory: testDir, fs: customFs });
      const data = await repo.read('greeting', '1.0.0');

      expect(data.system).toBe('Custom FS');
    });
  });

  // ==========================================================================
  // Edge cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle prompt id with hyphens', async () => {
      await writePromptFile({
        id: 'my-prompt-name',
        version: '1.0.0',
        system: 'System',
        userTemplate: 'Hello',
      });

      const repo = createFilePromptRepository({ directory: testDir });
      const prompt = await repo.read('my-prompt-name', '1.0.0');

      expect(prompt.id).toBe('my-prompt-name');
    });

    it('should ignore non-yaml files', async () => {
      await writeRawFile('readme.md', '# README');
      await writeRawFile('config.json', '{}');
      await writePromptFile({
        id: 'greeting',
        version: '1.0.0',
        system: 'System',
        userTemplate: 'Hello',
      });

      const repo = createFilePromptRepository({ directory: testDir });
      const prompt = await repo.read('greeting');

      expect(prompt.version).toBe('1.0.0');
    });

    it('should ignore malformed yaml filenames', async () => {
      await writeRawFile('invalid.yaml', 'id: test');
      await writeRawFile('no-version.yaml', 'id: test');
      await writePromptFile({
        id: 'greeting',
        version: '1.0.0',
        system: 'System',
        userTemplate: 'Hello',
      });

      const repo = createFilePromptRepository({ directory: testDir });
      const prompt = await repo.read('greeting');

      expect(prompt.id).toBe('greeting');
    });
  });

  // ==========================================================================
  // Caching tests
  // ==========================================================================

  describe('caching', () => {
    it('should cache prompt after first read with specific version', async () => {
      const yamlContent = `id: greeting
version: "1.0.0"
system: "System"
userTemplate: "Hello, {{name}}!"
`;
      const readFileMock = vi.fn().mockResolvedValue(yamlContent);
      const customFs = {
        readFile: readFileMock,
        writeFile: vi.fn(),
        readdir: vi.fn().mockResolvedValue(['greeting-1.0.0.yaml']),
      };

      const repo = createFilePromptRepository({ directory: testDir, fs: customFs });

      // First read - should call readFile
      await repo.read('greeting', '1.0.0');
      expect(readFileMock).toHaveBeenCalledTimes(1);

      // Second read - should use cache, not call readFile again
      await repo.read('greeting', '1.0.0');
      expect(readFileMock).toHaveBeenCalledTimes(1);
    });

    it('should not cache when cache option is false', async () => {
      const yamlContent = `id: greeting
version: "1.0.0"
system: "System"
userTemplate: "Hello"
`;
      const readFileMock = vi.fn().mockResolvedValue(yamlContent);
      const customFs = {
        readFile: readFileMock,
        writeFile: vi.fn(),
        readdir: vi.fn().mockResolvedValue(['greeting-1.0.0.yaml']),
      };

      const repo = createFilePromptRepository({ directory: testDir, fs: customFs, cache: false });

      await repo.read('greeting', '1.0.0');
      await repo.read('greeting', '1.0.0');

      expect(readFileMock).toHaveBeenCalledTimes(2);
    });

    it('should cache different versions separately', async () => {
      const yaml1 = `id: greeting
version: "1.0.0"
system: "v1"
userTemplate: "Hello"
`;
      const yaml2 = `id: greeting
version: "2.0.0"
system: "v2"
userTemplate: "Hello"
`;
      const readFileMock = vi.fn()
        .mockResolvedValueOnce(yaml1)
        .mockResolvedValueOnce(yaml2);
      const customFs = {
        readFile: readFileMock,
        writeFile: vi.fn(),
        readdir: vi.fn().mockResolvedValue(['greeting-1.0.0.yaml', 'greeting-2.0.0.yaml']),
      };

      const repo = createFilePromptRepository({ directory: testDir, fs: customFs });

      const v1 = await repo.read('greeting', '1.0.0');
      const v2 = await repo.read('greeting', '2.0.0');

      expect(v1.system).toBe('v1');
      expect(v2.system).toBe('v2');
      expect(readFileMock).toHaveBeenCalledTimes(2);

      // Reading again should use cache
      await repo.read('greeting', '1.0.0');
      await repo.read('greeting', '2.0.0');
      expect(readFileMock).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache on write', async () => {
      await writePromptFile({
        id: 'greeting',
        version: '1.0.0',
        system: 'Original',
        userTemplate: 'Hello',
      });

      const repo = createFilePromptRepository({ directory: testDir });

      // First read
      const original = await repo.read('greeting', '1.0.0');
      expect(original.system).toBe('Original');

      // Write new content (same version)
      await repo.write({
        id: 'greeting',
        version: '1.0.0',
        system: 'Updated',
        userTemplate: 'Hello',
      });

      // Read again - should get updated content (cache invalidated)
      const updated = await repo.read('greeting', '1.0.0');
      expect(updated.system).toBe('Updated');
    });

    it('should still call readdir for read without version', async () => {
      const yamlContent = `id: greeting
version: "1.0.0"
system: "System"
userTemplate: "Hello"
`;
      const readdirMock = vi.fn().mockResolvedValue(['greeting-1.0.0.yaml']);
      const customFs = {
        readFile: vi.fn().mockResolvedValue(yamlContent),
        writeFile: vi.fn(),
        readdir: readdirMock,
      };

      const repo = createFilePromptRepository({ directory: testDir, fs: customFs });

      // First read without version
      await repo.read('greeting');
      expect(readdirMock).toHaveBeenCalledTimes(1);

      // Second read without version - should still call readdir
      await repo.read('greeting');
      expect(readdirMock).toHaveBeenCalledTimes(2);
    });
  });
});
