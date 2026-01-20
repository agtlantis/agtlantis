import { readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { FileError, FileErrorCode } from '../errors';
import {
  FilePart,
  FilePartData,
  isFilePart,
  isFilePartPath,
} from './types';

export const EXTENSION_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.zip': 'application/zip',
};

/** Infers MIME type from file extension (case-insensitive) */
export function inferMimeType(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_TO_MIME[ext];
}

export interface FoundFilePart {
  part: FilePart;
  path: (string | number)[];
}

/** Recursively scans an input for FileParts and returns them with their JSON paths */
export function scanForFileParts(
  input: unknown,
  currentPath: (string | number)[] = []
): FoundFilePart[] {
  if (isFilePart(input)) {
    return [{ part: input, path: currentPath }];
  }

  if (input === null || typeof input !== 'object') {
    return [];
  }

  if (Buffer.isBuffer(input) || input instanceof Uint8Array || input instanceof URL) {
    return [];
  }

  const results: FoundFilePart[] = [];

  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i++) {
      results.push(...scanForFileParts(input[i], [...currentPath, i]));
    }
  } else {
    for (const key of Object.keys(input)) {
      results.push(...scanForFileParts((input as Record<string, unknown>)[key], [...currentPath, key]));
    }
  }

  return results;
}

export interface ResolveOptions {
  basePath?: string;
  maxSize?: number;
}

export const DEFAULT_MAX_SIZE = 50 * 1024 * 1024;

/**
 * Resolves a FilePart to AI SDK compatible format.
 * Path-based parts are read into Buffer; others returned unchanged.
 */
export async function resolveFilePart(
  part: FilePart,
  options: ResolveOptions = {}
): Promise<FilePart> {
  const { basePath = process.cwd(), maxSize = DEFAULT_MAX_SIZE } = options;

  if (!isFilePartPath(part)) {
    // data, base64, url - return as-is
    return part;
  }

  // path source - read file and convert to data
  const fullPath = path.isAbsolute(part.path)
    ? part.path
    : path.resolve(basePath, part.path);

  const stats = await stat(fullPath).catch((err) => {
    throw new FileError(`File not found: ${part.path}`, {
      code: FileErrorCode.NOT_FOUND,
      context: { path: part.path, fullPath },
      cause: err,
    });
  });

  if (stats.size > maxSize) {
    throw new FileError(`File too large: ${stats.size} bytes > ${maxSize} bytes`, {
      code: FileErrorCode.TOO_LARGE,
      context: { path: part.path, size: stats.size, maxSize },
    });
  }

  const buffer = await readFile(fullPath);
  const mediaType = part.mediaType ?? inferMimeType(part.path) ?? 'application/octet-stream';
  const filename = part.filename ?? path.basename(part.path);

  const result: FilePartData = { type: 'file', source: 'data', data: buffer, mediaType, filename };
  return result;
}

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (value instanceof URL) return new URL(value.href) as T;
  if (value instanceof Uint8Array) return new Uint8Array(value) as T;
  if (Array.isArray(value)) return value.map(deepClone) as T;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    result[key] = deepClone((value as Record<string, unknown>)[key]);
  }
  return result as T;
}

function setAtPath(obj: unknown, targetPath: (string | number)[], value: unknown): unknown {
  if (targetPath.length === 0) {
    return value;
  }
  let current = obj as Record<string | number, unknown>;
  for (let i = 0; i < targetPath.length - 1; i++) {
    current = current[targetPath[i]] as Record<string | number, unknown>;
  }
  current[targetPath[targetPath.length - 1]] = value;
  return obj;
}

/** Resolves all FileParts in an input (returns new object, original unchanged) */
export async function resolveFilePartsInInput<T>(
  input: T,
  options: ResolveOptions = {}
): Promise<T> {
  const found = scanForFileParts(input);

  if (found.length === 0) {
    return input;
  }

  // Resolve all parts in parallel
  const resolved = await Promise.all(
    found.map(({ part }) => resolveFilePart(part, options))
  );

  // Special case: if input itself is a FilePart (path = [])
  if (found.length === 1 && found[0].path.length === 0) {
    return resolved[0] as T;
  }

  // Clone and replace in-place
  const result = deepClone(input);
  for (let i = 0; i < found.length; i++) {
    setAtPath(result, found[i].path, resolved[i]);
  }

  return result;
}

export interface FilePartDisplayInfo {
  source: FilePart['source'];
  description: string;
  mediaType: string;
  filename?: string;
}

/** Extracts display info from a FilePart for reporting (excludes raw data) */
export function getFilePartDisplayInfo(part: FilePart): FilePartDisplayInfo {
  switch (part.source) {
    case 'path':
      return {
        source: 'path',
        description: part.path,
        mediaType: part.mediaType ?? inferMimeType(part.path) ?? 'unknown',
        filename: part.filename ?? path.basename(part.path),
      };

    case 'url':
      return {
        source: 'url',
        description: part.url,
        mediaType: part.mediaType ?? 'unknown',
        filename: part.filename,
      };

    case 'base64': {
      const sizeKB = ((part.data.length * 3) / 4 / 1024).toFixed(1);
      return {
        source: 'base64',
        description: `[base64 data, ~${sizeKB}KB]`,
        mediaType: part.mediaType,
        filename: part.filename,
      };
    }

    case 'data': {
      const size = Buffer.isBuffer(part.data) ? part.data.length : part.data.length;
      const sizeKB = (size / 1024).toFixed(1);
      return {
        source: 'data',
        description: `[Buffer, ${sizeKB}KB]`,
        mediaType: part.mediaType,
        filename: part.filename,
      };
    }
  }
}

export function getFilePartsDisplayInfo(input: unknown): FilePartDisplayInfo[] {
  const found = scanForFileParts(input);
  return found.map(({ part }) => getFilePartDisplayInfo(part));
}
