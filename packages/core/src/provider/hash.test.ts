import { createHash } from 'node:crypto';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { computeFileSourceHash } from './hash';

const TEST_DIR = path.join(process.cwd(), '.test-temp-hash');
const TEST_FILE = path.join(TEST_DIR, 'test-file.txt');
const TEST_CONTENT = 'Hello, World!';

describe('computeFileSourceHash', () => {
    beforeAll(async () => {
        await mkdir(TEST_DIR, { recursive: true });
        await writeFile(TEST_FILE, TEST_CONTENT);
    });

    afterAll(async () => {
        await rm(TEST_DIR, { recursive: true, force: true });
    });

    describe('uses user-provided hash when available', () => {
        it('returns user-provided hash for path source', async () => {
            const customHash = 'user-provided-hash-123';
            const hash = await computeFileSourceHash({
                source: 'path',
                path: TEST_FILE,
                hash: customHash,
            });
            expect(hash).toBe(customHash);
        });

        it('returns user-provided hash for data source', async () => {
            const customHash = 'user-provided-hash-456';
            const hash = await computeFileSourceHash({
                source: 'data',
                data: Buffer.from('test'),
                mediaType: 'text/plain',
                hash: customHash,
            });
            expect(hash).toBe(customHash);
        });
    });

    describe('computes hash for path source', () => {
        it('computes SHA-256 hash of file content', async () => {
            const hash = await computeFileSourceHash({
                source: 'path',
                path: TEST_FILE,
            });

            const expectedHash = createHash('sha256').update(TEST_CONTENT).digest('hex');
            expect(hash).toBe(expectedHash);
        });

        it('handles relative paths', async () => {
            const relativePath = path.relative(process.cwd(), TEST_FILE);
            const hash = await computeFileSourceHash({
                source: 'path',
                path: relativePath,
            });

            const expectedHash = createHash('sha256').update(TEST_CONTENT).digest('hex');
            expect(hash).toBe(expectedHash);
        });
    });

    describe('computes hash for data source', () => {
        it('computes SHA-256 hash of Buffer', async () => {
            const data = Buffer.from('test data');
            const hash = await computeFileSourceHash({
                source: 'data',
                data,
                mediaType: 'text/plain',
            });

            const expectedHash = createHash('sha256').update(data).digest('hex');
            expect(hash).toBe(expectedHash);
        });

        it('computes SHA-256 hash of Uint8Array', async () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const hash = await computeFileSourceHash({
                source: 'data',
                data,
                mediaType: 'application/octet-stream',
            });

            const expectedHash = createHash('sha256').update(data).digest('hex');
            expect(hash).toBe(expectedHash);
        });
    });

    describe('computes hash for base64 source', () => {
        it('computes SHA-256 hash of decoded base64', async () => {
            const originalData = 'base64 test content';
            const base64Data = Buffer.from(originalData).toString('base64');
            const hash = await computeFileSourceHash({
                source: 'base64',
                data: base64Data,
                mediaType: 'text/plain',
            });

            const expectedHash = createHash('sha256').update(originalData).digest('hex');
            expect(hash).toBe(expectedHash);
        });
    });

    describe('computes hash for url source', () => {
        it('computes SHA-256 hash of URL string', async () => {
            const url = 'https://example.com/image.png';
            const hash = await computeFileSourceHash({
                source: 'url',
                url,
            });

            const expectedHash = createHash('sha256').update(url).digest('hex');
            expect(hash).toBe(expectedHash);
        });

        it('different URLs produce different hashes', async () => {
            const hash1 = await computeFileSourceHash({
                source: 'url',
                url: 'https://example.com/a.png',
            });
            const hash2 = await computeFileSourceHash({
                source: 'url',
                url: 'https://example.com/b.png',
            });

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('consistency', () => {
        it('same content produces same hash', async () => {
            const data = Buffer.from('identical content');
            const hash1 = await computeFileSourceHash({
                source: 'data',
                data,
                mediaType: 'text/plain',
            });
            const hash2 = await computeFileSourceHash({
                source: 'data',
                data,
                mediaType: 'text/plain',
            });

            expect(hash1).toBe(hash2);
        });

        it('different content produces different hash', async () => {
            const hash1 = await computeFileSourceHash({
                source: 'data',
                data: Buffer.from('content A'),
                mediaType: 'text/plain',
            });
            const hash2 = await computeFileSourceHash({
                source: 'data',
                data: Buffer.from('content B'),
                mediaType: 'text/plain',
            });

            expect(hash1).not.toBe(hash2);
        });
    });
});
