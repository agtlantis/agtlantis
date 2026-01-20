import { FileError, FileErrorCode } from '../errors';
import type { FileManager, FilePart, UploadedFile } from './types';

/** FileManager for providers without file upload support (throws on upload/delete) */
export class NoOpFileManager implements FileManager {
  upload(_files: FilePart[]): Promise<UploadedFile[]> {
    throw new FileError('File upload not supported by this provider', {
      code: FileErrorCode.UNSUPPORTED_TYPE,
      context: {
        provider: 'noop',
        suggestion: 'Use a provider with file support (e.g., Google) or pass files inline',
      },
    });
  }

  delete(_fileId: string): Promise<void> {
    throw new FileError('File delete not supported by this provider', {
      code: FileErrorCode.UNSUPPORTED_TYPE,
      context: {
        provider: 'noop',
      },
    });
  }

  clear(): Promise<void> {
    return Promise.resolve();
  }

  getUploadedFiles(): UploadedFile[] {
    return [];
  }
}
