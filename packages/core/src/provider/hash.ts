import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { FileSource } from './types';

export async function computeFileSourceHash(source: FileSource): Promise<string> {
    if (source.hash) {
        return source.hash;
    }

    const hash = createHash('sha256');

    switch (source.source) {
        case 'path': {
            const fullPath = path.isAbsolute(source.path)
                ? source.path
                : path.resolve(process.cwd(), source.path);
            const content = await readFile(fullPath);
            hash.update(content);
            break;
        }
        case 'data': {
            hash.update(source.data);
            break;
        }
        case 'base64': {
            const buffer = Buffer.from(source.data, 'base64');
            hash.update(buffer);
            break;
        }
        case 'url': {
            hash.update(source.url);
            break;
        }
    }

    return hash.digest('hex');
}
