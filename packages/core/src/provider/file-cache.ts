import type { FileCache, UploadedFile } from './types';

export interface InMemoryFileCacheOptions {
    defaultTTL?: number;
}

interface CacheEntry {
    file: UploadedFile;
    expiresAt?: number;
}

export class InMemoryFileCache implements FileCache {
    private readonly cache = new Map<string, CacheEntry>();
    private readonly defaultTTL: number | undefined;

    constructor(options?: InMemoryFileCacheOptions) {
        this.defaultTTL = options?.defaultTTL;
    }

    get(hash: string): UploadedFile | null {
        const entry = this.cache.get(hash);
        if (!entry) return null;
        if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
            this.cache.delete(hash);
            return null;
        }
        return entry.file;
    }

    set(hash: string, file: UploadedFile, ttl?: number): void {
        const effectiveTTL = ttl ?? this.defaultTTL;
        const expiresAt = effectiveTTL !== undefined ? Date.now() + effectiveTTL : undefined;
        this.cache.set(hash, { file, expiresAt });
    }

    delete(hash: string): void {
        this.cache.delete(hash);
    }

    clear(): void {
        this.cache.clear();
    }
}
