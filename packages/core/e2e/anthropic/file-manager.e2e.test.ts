/**
 * F10 e2e — AnthropicFileManager standalone behavior.
 *
 * Run:
 *   REAL_AI_ENABLED=true pnpm vitest run e2e/anthropic/file-manager.e2e.test.ts
 */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    AnthropicFileManager,
    parseAnthropicFileIdMarker,
} from '../../src/provider/anthropic/index.js';

const REAL_AI_ENABLED = process.env.REAL_AI_ENABLED === 'true' || process.env.REAL_AI_ENABLED === '1';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SKIP = !REAL_AI_ENABLED || !ANTHROPIC_API_KEY;
const d = SKIP ? describe.skip : describe;

const FIXTURE_DIR = path.resolve(import.meta.dirname, 'fixtures');
const PDF_FIXTURE = path.join(FIXTURE_DIR, 'test-pdf3.pdf');

d('F10 — AnthropicFileManager', () => {
    it('uploads a local PDF through Files API beta and returns a file_id marker', async () => {
        const manager = new AnthropicFileManager(ANTHROPIC_API_KEY!, {
            strategy: 'files-api-only',
        });

        const [uploaded] = await manager.upload([{
            source: 'path',
            path: PDF_FIXTURE,
            mediaType: 'application/pdf',
        }]);

        try {
            expect(uploaded.id).toMatch(/^file_/);
            expect(uploaded.part.type).toBe('file');
            expect(parseAnthropicFileIdMarker((uploaded.part as { data: string }).data)).toBe(uploaded.id);
        } finally {
            if (uploaded.id) {
                await manager.delete(uploaded.id);
            }
        }
    }, 120_000);

    it('returns inline parts without hitting Files API in inline-only mode', async () => {
        const manager = new AnthropicFileManager('unused', {
            strategy: 'inline-only',
        });

        const [uploaded] = await manager.upload([{
            source: 'path',
            path: PDF_FIXTURE,
            mediaType: 'application/pdf',
        }]);

        expect(uploaded.id).toBeNull();
        expect(uploaded.part.type).toBe('file');
    });
});
