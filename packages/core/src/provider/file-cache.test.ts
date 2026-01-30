import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryFileCache } from './file-cache';
import type { UploadedFile } from './types';

function createMockUploadedFile(overrides?: Partial<UploadedFile>): UploadedFile {
    return {
        id: 'file-123',
        part: {
            type: 'file',
            data: new URL('gs://bucket/file'),
            mediaType: 'application/pdf',
        },
        ...overrides,
    };
}

describe('InMemoryFileCache', () => {
    describe('get/set', () => {
        it('should return null for non-existent key', () => {
            const cache = new InMemoryFileCache();
            expect(cache.get('nonexistent')).toBeNull();
        });

        it('should return stored file', () => {
            const cache = new InMemoryFileCache();
            const file = createMockUploadedFile();

            cache.set('hash-abc', file);

            expect(cache.get('hash-abc')).toEqual(file);
        });

        it('should overwrite existing entry', () => {
            const cache = new InMemoryFileCache();
            const file1 = createMockUploadedFile({ id: 'file-1' });
            const file2 = createMockUploadedFile({ id: 'file-2' });

            cache.set('hash', file1);
            cache.set('hash', file2);

            expect(cache.get('hash')?.id).toBe('file-2');
        });
    });

    describe('delete', () => {
        it('should remove cached entry', () => {
            const cache = new InMemoryFileCache();
            const file = createMockUploadedFile();

            cache.set('hash', file);
            cache.delete('hash');

            expect(cache.get('hash')).toBeNull();
        });

        it('should not throw for non-existent key', () => {
            const cache = new InMemoryFileCache();
            expect(() => cache.delete('nonexistent')).not.toThrow();
        });
    });

    describe('clear', () => {
        it('should remove all entries', () => {
            const cache = new InMemoryFileCache();
            cache.set('hash1', createMockUploadedFile({ id: '1' }));
            cache.set('hash2', createMockUploadedFile({ id: '2' }));

            cache.clear();

            expect(cache.get('hash1')).toBeNull();
            expect(cache.get('hash2')).toBeNull();
        });

        it('should be callable multiple times', () => {
            const cache = new InMemoryFileCache();
            cache.clear();
            cache.clear();
        });
    });

    describe('TTL', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should expire entry after TTL', () => {
            const cache = new InMemoryFileCache();
            const file = createMockUploadedFile();

            cache.set('hash', file, 1000);
            expect(cache.get('hash')).toEqual(file);

            vi.advanceTimersByTime(1001);
            expect(cache.get('hash')).toBeNull();
        });

        it('should use defaultTTL when ttl not specified', () => {
            const cache = new InMemoryFileCache({ defaultTTL: 500 });
            const file = createMockUploadedFile();

            cache.set('hash', file);
            expect(cache.get('hash')).toEqual(file);

            vi.advanceTimersByTime(501);
            expect(cache.get('hash')).toBeNull();
        });

        it('should override defaultTTL with explicit ttl', () => {
            const cache = new InMemoryFileCache({ defaultTTL: 500 });
            const file = createMockUploadedFile();

            cache.set('hash', file, 2000);

            vi.advanceTimersByTime(1000);
            expect(cache.get('hash')).toEqual(file);

            vi.advanceTimersByTime(1001);
            expect(cache.get('hash')).toBeNull();
        });

        it('should not expire when no TTL configured', () => {
            const cache = new InMemoryFileCache();
            const file = createMockUploadedFile();

            cache.set('hash', file);

            vi.advanceTimersByTime(100000);
            expect(cache.get('hash')).toEqual(file);
        });
    });

    describe('FileCache interface compliance', () => {
        it('should implement all FileCache methods', () => {
            const cache = new InMemoryFileCache();

            expect(typeof cache.get).toBe('function');
            expect(typeof cache.set).toBe('function');
            expect(typeof cache.delete).toBe('function');
            expect(typeof cache.clear).toBe('function');
        });
    });
});
