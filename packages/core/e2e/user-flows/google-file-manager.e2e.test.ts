import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoogleFileManager } from '@/provider/google/file-manager';
import { InMemoryFileCache } from '@/provider/file-cache';
import type { FileSource } from '@/provider/types';
import { describeGoogle, E2E_CONFIG } from '@e2e/helpers';

describeGoogle('GoogleFileManager E2E', () => {
    let fileManager: GoogleFileManager;
    let cache: InMemoryFileCache;

    afterEach(async () => {
        if (fileManager) {
            await fileManager.clear();
        }
    });

    describe('Basic Upload', () => {
        it(
            'should upload a data source to Google AI',
            async () => {
                fileManager = new GoogleFileManager(E2E_CONFIG.google.apiKey!);

                const testContent = `Test content created at ${new Date().toISOString()}`;
                const files: FileSource[] = [
                    {
                        source: 'data',
                        data: Buffer.from(testContent),
                        mediaType: 'text/plain',
                        filename: 'test-upload.txt',
                    },
                ];

                const result = await fileManager.upload(files);

                expect(result).toHaveLength(1);
                expect(result[0].id).toBeTruthy();
                expect(result[0].id).toMatch(/^files\//);
                expect(result[0].part.type).toBe('file');
                expect(result[0].part.mediaType).toBe('text/plain');

                const uploaded = fileManager.getUploadedFiles();
                expect(uploaded).toHaveLength(1);
            },
            E2E_CONFIG.timeout
        );

        it(
            'should handle URL source without actual upload',
            async () => {
                fileManager = new GoogleFileManager(E2E_CONFIG.google.apiKey!);

                const files: FileSource[] = [
                    {
                        source: 'url',
                        url: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png',
                        mediaType: 'image/png',
                    },
                ];

                const result = await fileManager.upload(files);

                expect(result).toHaveLength(1);
                expect(result[0].id).toBeNull();
                expect(result[0].part.type).toBe('image');

                // URL sources are not tracked
                expect(fileManager.getUploadedFiles()).toHaveLength(0);
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Cache Hit', () => {
        it(
            'should return cached file on second upload of same content',
            async () => {
                cache = new InMemoryFileCache();
                fileManager = new GoogleFileManager(E2E_CONFIG.google.apiKey!, { cache });

                const testContent = `Cache test content ${Date.now()}`;
                const files: FileSource[] = [
                    {
                        source: 'data',
                        data: Buffer.from(testContent),
                        mediaType: 'text/plain',
                        filename: 'cache-test.txt',
                    },
                ];

                // First upload - should hit the API
                const firstResult = await fileManager.upload(files);
                expect(firstResult).toHaveLength(1);
                const firstId = firstResult[0].id;

                // Second upload - should return from cache
                const secondResult = await fileManager.upload(files);
                expect(secondResult).toHaveLength(1);
                expect(secondResult[0].id).toBe(firstId);
                expect(secondResult[0]).toBe(firstResult[0]);
            },
            E2E_CONFIG.timeout
        );

        it(
            'should cache URL sources',
            async () => {
                cache = new InMemoryFileCache();
                fileManager = new GoogleFileManager(E2E_CONFIG.google.apiKey!, { cache });

                const files: FileSource[] = [
                    {
                        source: 'url',
                        url: 'https://www.google.com/favicon.ico',
                        mediaType: 'image/x-icon',
                    },
                ];

                const firstResult = await fileManager.upload(files);
                const secondResult = await fileManager.upload(files);

                expect(secondResult[0]).toBe(firstResult[0]);
            },
            E2E_CONFIG.timeout
        );

        it(
            'should use user-provided hash for cache key',
            async () => {
                cache = new InMemoryFileCache();
                fileManager = new GoogleFileManager(E2E_CONFIG.google.apiKey!, { cache });

                const customHash = `custom-hash-${Date.now()}`;

                // First upload with custom hash
                const files1: FileSource[] = [
                    {
                        source: 'data',
                        data: Buffer.from('content version 1'),
                        mediaType: 'text/plain',
                        hash: customHash,
                    },
                ];
                const firstResult = await fileManager.upload(files1);

                // Second upload with SAME hash but DIFFERENT content
                const files2: FileSource[] = [
                    {
                        source: 'data',
                        data: Buffer.from('content version 2 (different)'),
                        mediaType: 'text/plain',
                        hash: customHash,
                    },
                ];
                const secondResult = await fileManager.upload(files2);

                // Should return cached result because hash is the same
                expect(secondResult[0]).toBe(firstResult[0]);
            },
            E2E_CONFIG.timeout
        );
    });

    describe('TTL Expiry', () => {
        it(
            'should not return expired cache entries',
            async () => {
                vi.useFakeTimers();

                try {
                    const shortTTL = 1000; // 1 second
                    cache = new InMemoryFileCache({ defaultTTL: shortTTL });
                    fileManager = new GoogleFileManager(E2E_CONFIG.google.apiKey!, { cache });

                    const testContent = `TTL test ${Date.now()}`;
                    const files: FileSource[] = [
                        {
                            source: 'data',
                            data: Buffer.from(testContent),
                            mediaType: 'text/plain',
                        },
                    ];

                    // First upload
                    const firstResult = await fileManager.upload(files);
                    const firstId = firstResult[0].id;

                    // Advance time beyond TTL
                    vi.advanceTimersByTime(shortTTL + 100);

                    // Cache should now return null for the expired entry
                    // (In real E2E, this would cause a new upload, but we can verify cache behavior)
                    const cachedValue = cache.get(
                        await computeHashForTest(files[0])
                    );
                    expect(cachedValue).toBeNull();
                } finally {
                    vi.useRealTimers();
                }
            },
            E2E_CONFIG.timeout
        );

        it(
            'should respect per-entry TTL override',
            async () => {
                vi.useFakeTimers();

                try {
                    const defaultTTL = 10000; // 10 seconds
                    const shortTTL = 500; // 0.5 seconds
                    cache = new InMemoryFileCache({ defaultTTL });

                    // Manually set cache entry with short TTL
                    const testHash = 'test-hash-ttl';
                    cache.set(
                        testHash,
                        {
                            id: 'files/test',
                            part: { type: 'file', data: new URL('https://test.com'), mediaType: 'text/plain' },
                        },
                        shortTTL
                    );

                    // Before expiry - should return the entry
                    expect(cache.get(testHash)).not.toBeNull();

                    // Advance time beyond short TTL but before default TTL
                    vi.advanceTimersByTime(shortTTL + 100);

                    // After expiry - should return null
                    expect(cache.get(testHash)).toBeNull();
                } finally {
                    vi.useRealTimers();
                }
            },
            E2E_CONFIG.timeout
        );
    });

    describe('Delete and Clear', () => {
        it(
            'should delete uploaded file from Google AI',
            async () => {
                fileManager = new GoogleFileManager(E2E_CONFIG.google.apiKey!);

                const files: FileSource[] = [
                    {
                        source: 'data',
                        data: Buffer.from(`Delete test ${Date.now()}`),
                        mediaType: 'text/plain',
                    },
                ];

                const result = await fileManager.upload(files);
                expect(fileManager.getUploadedFiles()).toHaveLength(1);

                await fileManager.delete(result[0].id!);
                expect(fileManager.getUploadedFiles()).toHaveLength(0);
            },
            E2E_CONFIG.timeout
        );

        it(
            'should clear all uploaded files',
            async () => {
                fileManager = new GoogleFileManager(E2E_CONFIG.google.apiKey!);

                const files: FileSource[] = [
                    {
                        source: 'data',
                        data: Buffer.from(`Clear test 1 ${Date.now()}`),
                        mediaType: 'text/plain',
                    },
                    {
                        source: 'data',
                        data: Buffer.from(`Clear test 2 ${Date.now()}`),
                        mediaType: 'text/plain',
                    },
                ];

                await fileManager.upload(files);
                expect(fileManager.getUploadedFiles()).toHaveLength(2);

                await fileManager.clear();
                expect(fileManager.getUploadedFiles()).toHaveLength(0);
            },
            E2E_CONFIG.timeout
        );
    });
});

async function computeHashForTest(source: FileSource): Promise<string> {
    const { computeFileSourceHash } = await import('@/provider/hash');
    return computeFileSourceHash(source);
}
