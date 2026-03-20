import { afterEach, describe, expect, it } from 'vitest';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

import { OpenAIFileManager } from '../../src/provider/openai/file-manager.js';
import { InMemoryFileCache } from '../../src/provider/file-cache.js';
import type { FileSource } from '../../src/provider/types.js';
import { createMinimalPDF, createTestPNG, describeOpenAI, E2E_CONFIG } from '@e2e/helpers';

describeOpenAI('OpenAIFileManager E2E', () => {
    let fileManager: OpenAIFileManager;

    afterEach(async () => {
        if (fileManager) {
            await fileManager.clear();
        }
    });

    describe('기본 업로드', () => {
        it(
            'PDF 데이터 소스를 OpenAI Files API에 업로드해야 한다',
            async () => {
                fileManager = new OpenAIFileManager(E2E_CONFIG.openai.apiKey!);

                const files: FileSource[] = [{
                    source: 'data',
                    data: createMinimalPDF('E2E upload test'),
                    mediaType: 'application/pdf',
                    filename: 'test-upload.pdf',
                }];

                const result = await fileManager.upload(files);

                expect(result).toHaveLength(1);
                expect(result[0].id).toBeTruthy();
                expect(result[0].id).toMatch(/^file-/);
                expect(result[0].part.type).toBe('file');
                expect(result[0].part.mediaType).toBe('application/pdf');

                const uploaded = fileManager.getUploadedFiles();
                expect(uploaded).toHaveLength(1);
            },
            E2E_CONFIG.timeout,
        );

        it(
            '이미지 데이터 소스를 Files API로 업로드해야 한다 (통합 전략)',
            async () => {
                fileManager = new OpenAIFileManager(E2E_CONFIG.openai.apiKey!);

                const files: FileSource[] = [{
                    source: 'data',
                    data: createTestPNG(),
                    mediaType: 'image/png',
                    filename: 'test-image.png',
                }];

                const result = await fileManager.upload(files);

                expect(result).toHaveLength(1);
                expect(result[0].id).toMatch(/^file-/);
                expect(result[0].part.type).toBe('file');
                expect(result[0].part.mediaType).toBe('image/png');

                const uploaded = fileManager.getUploadedFiles();
                expect(uploaded).toHaveLength(1);
            },
            E2E_CONFIG.timeout,
        );

        it(
            '문서 URL 소스를 업로드 없이 인라인 처리해야 한다',
            async () => {
                fileManager = new OpenAIFileManager(E2E_CONFIG.openai.apiKey!);

                const files: FileSource[] = [{
                    source: 'url',
                    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                    mediaType: 'application/pdf',
                }];

                const result = await fileManager.upload(files);

                expect(result).toHaveLength(1);
                expect(result[0].id).toBeNull();
                expect(result[0].part.type).toBe('file');
                expect(fileManager.getUploadedFiles()).toHaveLength(0);
            },
            E2E_CONFIG.timeout,
        );

        it(
            '이미지 URL 소스를 업로드 없이 인라인 처리해야 한다',
            async () => {
                fileManager = new OpenAIFileManager(E2E_CONFIG.openai.apiKey!);

                const files: FileSource[] = [{
                    source: 'url',
                    url: 'https://www.google.com/favicon.ico',
                    mediaType: 'image/x-icon',
                }];

                const result = await fileManager.upload(files);

                expect(result).toHaveLength(1);
                expect(result[0].id).toBeNull();
                expect(result[0].part.type).toBe('image');
                expect(fileManager.getUploadedFiles()).toHaveLength(0);
            },
            E2E_CONFIG.timeout,
        );
    });

    describe('캐시', () => {
        it(
            '동일 콘텐츠의 두 번째 업로드에서 캐시된 결과를 반환해야 한다',
            async () => {
                const cache = new InMemoryFileCache();
                fileManager = new OpenAIFileManager(E2E_CONFIG.openai.apiKey!, { cache });

                const testContent = `Cache test content ${Date.now()}`;
                const files: FileSource[] = [{
                    source: 'data',
                    data: Buffer.from(testContent),
                    mediaType: 'application/pdf',
                    filename: 'cache-test.pdf',
                }];

                const firstResult = await fileManager.upload(files);
                expect(firstResult).toHaveLength(1);
                const firstId = firstResult[0].id;

                const secondResult = await fileManager.upload(files);
                expect(secondResult).toHaveLength(1);
                expect(secondResult[0].id).toBe(firstId);
                expect(secondResult[0]).toBe(firstResult[0]);
            },
            E2E_CONFIG.timeout,
        );

        it(
            'URL 소스도 캐시해야 한다',
            async () => {
                const cache = new InMemoryFileCache();
                fileManager = new OpenAIFileManager(E2E_CONFIG.openai.apiKey!, { cache });

                const files: FileSource[] = [{
                    source: 'url',
                    url: 'https://www.google.com/favicon.ico',
                    mediaType: 'image/x-icon',
                }];

                const firstResult = await fileManager.upload(files);
                const secondResult = await fileManager.upload(files);

                expect(secondResult[0]).toBe(firstResult[0]);
            },
            E2E_CONFIG.timeout,
        );
    });

    describe('삭제 및 정리', () => {
        it(
            '업로드된 파일을 OpenAI에서 삭제해야 한다',
            async () => {
                fileManager = new OpenAIFileManager(E2E_CONFIG.openai.apiKey!);

                const files: FileSource[] = [{
                    source: 'data',
                    data: Buffer.from(`Delete test ${Date.now()}`),
                    mediaType: 'application/pdf',
                }];

                const result = await fileManager.upload(files);
                expect(fileManager.getUploadedFiles()).toHaveLength(1);

                await fileManager.delete(result[0].id!);
                expect(fileManager.getUploadedFiles()).toHaveLength(0);
            },
            E2E_CONFIG.timeout,
        );

        it(
            '모든 업로드된 파일을 정리해야 한다',
            async () => {
                fileManager = new OpenAIFileManager(E2E_CONFIG.openai.apiKey!);

                const files: FileSource[] = [
                    {
                        source: 'data',
                        data: Buffer.from(`Clear test 1 ${Date.now()}`),
                        mediaType: 'application/pdf',
                    },
                    {
                        source: 'data',
                        data: Buffer.from(`Clear test 2 ${Date.now()}`),
                        mediaType: 'application/pdf',
                    },
                ];

                await fileManager.upload(files);
                expect(fileManager.getUploadedFiles()).toHaveLength(2);

                await fileManager.clear();
                expect(fileManager.getUploadedFiles()).toHaveLength(0);
            },
            E2E_CONFIG.timeout,
        );
    });

    describe('generateText 통합', () => {
        it(
            '업로드된 PDF file_id로 generateText를 호출할 수 있어야 한다',
            async () => {
                fileManager = new OpenAIFileManager(E2E_CONFIG.openai.apiKey!);

                const result = await fileManager.upload([{
                    source: 'data',
                    data: createMinimalPDF('The capital of France is Paris'),
                    mediaType: 'application/pdf',
                    filename: 'test.pdf',
                }]);

                const openai = createOpenAI({ apiKey: E2E_CONFIG.openai.apiKey! });

                const response = await generateText({
                    model: openai(E2E_CONFIG.openai.model),
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: 'What does this PDF say? Reply in one sentence.' },
                            result[0].part,
                        ],
                    }],
                });

                expect(response.text).toBeTruthy();
                expect(response.text.length).toBeGreaterThan(0);
                console.log(`[OpenAIFileManager → generateText] Response: ${response.text}`);
            },
            E2E_CONFIG.timeout,
        );
    });
});
