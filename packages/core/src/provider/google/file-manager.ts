import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { FileError, FileErrorCode } from '../../errors';
import type { FileManager, FilePart, UploadedFile } from '../types';

interface GoogleFileUploadResponse {
  name?: string;
  uri?: string;
  mimeType?: string;
}

function assertValidUploadResponse(
  response: GoogleFileUploadResponse,
  context: Record<string, unknown>
): asserts response is Required<GoogleFileUploadResponse> {
  if (!response.name || !response.uri || !response.mimeType) {
    throw new FileError(
      'Invalid upload response from Google API: missing required fields',
      {
        code: FileErrorCode.UPLOAD_ERROR,
        context: {
          ...context,
          hasName: !!response.name,
          hasUri: !!response.uri,
          hasMimeType: !!response.mimeType,
        },
      }
    );
  }
}

/** Google GenAI File API implementation with automatic session cleanup */
export class GoogleFileManager implements FileManager {
  private uploadedFiles: UploadedFile[] = [];
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  private async uploadOne(part: FilePart, index: number): Promise<UploadedFile> {
    if (part.source === 'url') {
      return {
        id: part.url,
        uri: part.url,
        mimeType: part.mediaType ?? 'application/octet-stream',
        name: part.filename ?? `file-${index}`,
        isExternal: true,
      };
    }

    if (part.source === 'path') {
      const fullPath = path.isAbsolute(part.path)
        ? part.path
        : path.resolve(process.cwd(), part.path);

      try {
        const uploaded = await this.client.files.upload({
          file: fullPath,
          config: {
            mimeType: part.mediaType,
            displayName: part.filename ?? path.basename(part.path),
          },
        });

        assertValidUploadResponse(uploaded, {
          source: 'path',
          path: part.path,
        });

        return {
          id: uploaded.name,
          uri: uploaded.uri,
          mimeType: uploaded.mimeType,
          name: uploaded.name,
        };
      } catch (error) {
        if (error instanceof FileError) throw error;
        throw FileError.from(error, FileErrorCode.UPLOAD_ERROR, {
          source: 'path',
          path: part.path,
          mediaType: part.mediaType,
        });
      }
    }

    const buffer =
      part.source === 'base64' ? Buffer.from(part.data, 'base64') : part.data;

    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: part.mediaType });

    try {
      const uploaded = await this.client.files.upload({
        file: blob,
        config: {
          mimeType: part.mediaType,
          displayName: part.filename ?? `upload-${Date.now()}-${index}`,
        },
      });

      assertValidUploadResponse(uploaded, {
        source: part.source,
        mediaType: part.mediaType,
      });

      return {
        id: uploaded.name,
        uri: uploaded.uri,
        mimeType: uploaded.mimeType,
        name: uploaded.name,
      };
    } catch (error) {
      if (error instanceof FileError) throw error;
      throw FileError.from(error, FileErrorCode.UPLOAD_ERROR, {
        source: part.source,
        mediaType: part.mediaType,
        filename: part.filename,
      });
    }
  }

  async upload(files: FilePart[]): Promise<UploadedFile[]> {
    const results = await Promise.allSettled(
      files.map((part, i) => this.uploadOne(part, i))
    );

    const successful: UploadedFile[] = [];
    const failed: PromiseRejectedResult[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push(result);
      }
    }

    // Rollback on partial failure: delete successfully uploaded files
    if (failed.length > 0) {
      await Promise.all(
        successful
          .filter((f) => !f.isExternal) // Don't delete external URL sources
          .map((f) => this.client.files.delete({ name: f.id }).catch(() => {}))
      );

      const firstError = failed[0].reason;
      throw new FileError(
        `Failed to upload ${failed.length} file(s): ${firstError instanceof Error ? firstError.message : String(firstError)}`,
        {
          code: FileErrorCode.UPLOAD_ERROR,
          cause: firstError instanceof Error ? firstError : undefined,
          context: {
            totalFiles: files.length,
            failedCount: failed.length,
            successCount: successful.length,
          },
        }
      );
    }

    this.uploadedFiles.push(...successful.filter((f) => !f.isExternal));
    return successful;
  }

  async delete(fileId: string): Promise<void> {
    try {
      await this.client.files.delete({ name: fileId });
      this.uploadedFiles = this.uploadedFiles.filter((f) => f.id !== fileId);
    } catch (error) {
      throw FileError.from(error, FileErrorCode.DELETE_ERROR, {
        fileId,
      });
    }
  }

  async clear(): Promise<void> {
    await Promise.all(this.uploadedFiles.map((f) => this.delete(f.id).catch(() => {})));
    this.uploadedFiles = [];
  }

  getUploadedFiles(): UploadedFile[] {
    return [...this.uploadedFiles];
  }
}
