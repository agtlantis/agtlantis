import { describe, expect, it } from 'vitest';

import { expectFileManagerInterface } from '@/testing';

import { FileError, FileErrorCode } from '../errors';
import { NoOpFileManager } from './noop-file-manager';
import type { FileSource } from './types';

describe('NoOpFileManager', () => {
    describe('upload', () => {
        it('should throw FileError with UNSUPPORTED_TYPE code', () => {
            const fileManager = new NoOpFileManager();
            const files: FileSource[] = [{ source: 'path', path: '/test.pdf' }];

            expect(() => fileManager.upload(files)).toThrow(FileError);
            expect(() => fileManager.upload(files)).toThrow(
                'File upload not supported by this provider'
            );
        });

        it('should include context with provider info', () => {
            const fileManager = new NoOpFileManager();
            const files: FileSource[] = [];

            try {
                fileManager.upload(files);
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(FileError);
                const fileError = error as FileError;
                expect(fileError.code).toBe(FileErrorCode.UNSUPPORTED_TYPE);
                expect(fileError.context?.provider).toBe('noop');
                expect(fileError.context?.suggestion).toBeDefined();
            }
        });

        it('should throw even with empty files array', () => {
            const fileManager = new NoOpFileManager();
            expect(() => fileManager.upload([])).toThrow(FileError);
        });
    });

    describe('delete', () => {
        it('should throw FileError with UNSUPPORTED_TYPE code', () => {
            const fileManager = new NoOpFileManager();

            expect(() => fileManager.delete('file-123')).toThrow(FileError);
            expect(() => fileManager.delete('file-123')).toThrow(
                'File delete not supported by this provider'
            );
        });

        it('should have correct error code', () => {
            const fileManager = new NoOpFileManager();

            try {
                fileManager.delete('any-id');
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(FileError);
                const fileError = error as FileError;
                expect(fileError.code).toBe(FileErrorCode.UNSUPPORTED_TYPE);
            }
        });
    });

    describe('clear', () => {
        it('should resolve without error', async () => {
            const fileManager = new NoOpFileManager();
            await expect(fileManager.clear()).resolves.toBeUndefined();
        });

        it('should be callable multiple times', async () => {
            const fileManager = new NoOpFileManager();
            await fileManager.clear();
            await fileManager.clear();
            await fileManager.clear();
            // No error = success
        });
    });

    describe('getUploadedFiles', () => {
        it('should return empty array', () => {
            const fileManager = new NoOpFileManager();
            expect(fileManager.getUploadedFiles()).toEqual([]);
        });

        it('should always return empty array', () => {
            const fileManager = new NoOpFileManager();
            // Even after multiple calls
            expect(fileManager.getUploadedFiles()).toEqual([]);
            expect(fileManager.getUploadedFiles()).toEqual([]);
        });

        it('should return a new array each time', () => {
            const fileManager = new NoOpFileManager();
            const first = fileManager.getUploadedFiles();
            const second = fileManager.getUploadedFiles();
            expect(first).not.toBe(second);
            expect(first).toEqual(second);
        });
    });

    describe('FileManager interface compliance', () => {
        it('should implement all FileManager methods', () => {
            const fileManager = new NoOpFileManager();
            expectFileManagerInterface(fileManager);
        });
    });

    describe('error serialization', () => {
        it('should produce serializable error', () => {
            const fileManager = new NoOpFileManager();

            try {
                fileManager.upload([]);
            } catch (error) {
                expect(error).toBeInstanceOf(FileError);
                const fileError = error as FileError;
                const json = fileError.toJSON();

                expect(json.name).toBe('FileError');
                expect(json.code).toBe(FileErrorCode.UNSUPPORTED_TYPE);
                expect(json.message).toContain('not supported');
                expect(json.context).toBeDefined();
            }
        });
    });
});
