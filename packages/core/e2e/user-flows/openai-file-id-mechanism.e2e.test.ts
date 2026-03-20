import { afterAll, describe, expect, it } from 'vitest';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

import { createMinimalPDF, createTestPNG, describeOpenAI, E2E_CONFIG } from '@e2e/helpers';

const OPENAI_FILES_API = 'https://api.openai.com/v1/files';

async function uploadToOpenAI(
    apiKey: string,
    content: Buffer,
    filename: string,
): Promise<string> {
    const formData = new FormData();
    formData.append('purpose', 'user_data');
    formData.append('file', new Blob([content]), filename);

    const response = await fetch(OPENAI_FILES_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload failed (${response.status}): ${error}`);
    }

    const data = (await response.json()) as { id: string };
    return data.id;
}

async function deleteFromOpenAI(
    apiKey: string,
    fileId: string,
): Promise<void> {
    await fetch(`${OPENAI_FILES_API}/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
    });
}

describeOpenAI('OpenAI file_id mechanism (Responses API)', () => {
    const apiKey = E2E_CONFIG.openai.apiKey!;
    const uploadedFileIds: string[] = [];

    afterAll(async () => {
        for (const fileId of uploadedFileIds) {
            await deleteFromOpenAI(apiKey, fileId).catch(() => {});
        }
    });

    describe('Document file_id', () => {
        it(
            'should accept a PDF file_id and generate a response',
            async () => {
                const pdfContent = createMinimalPDF('Hello from file_id test');
                const fileId = await uploadToOpenAI(apiKey, pdfContent, 'test.pdf');
                uploadedFileIds.push(fileId);

                expect(fileId).toMatch(/^file-/);

                const openai = createOpenAI({ apiKey });

                const result = await generateText({
                    model: openai(E2E_CONFIG.openai.model),
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: 'What does this PDF contain? Reply in one sentence.' },
                                {
                                    type: 'file',
                                    data: fileId,
                                    mediaType: 'application/pdf',
                                },
                            ],
                        },
                    ],
                });

                expect(result.text).toBeTruthy();
                expect(result.text.length).toBeGreaterThan(0);
                console.log(`[Document file_id] Response: ${result.text}`);
            },
            E2E_CONFIG.timeout,
        );
    });

    describe('Image file_id', () => {
        it(
            'should accept an image file_id and generate a response',
            async () => {
                const imageBuffer = createTestPNG();
                const fileId = await uploadToOpenAI(apiKey, imageBuffer, 'test-image.png');
                uploadedFileIds.push(fileId);

                expect(fileId).toMatch(/^file-/);

                const openai = createOpenAI({ apiKey });

                const result = await generateText({
                    model: openai(E2E_CONFIG.openai.model),
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: 'Describe this image briefly.' },
                                {
                                    type: 'file',
                                    data: fileId,
                                    mediaType: 'image/png',
                                },
                            ],
                        },
                    ],
                });

                expect(result.text).toBeTruthy();
                expect(result.text.length).toBeGreaterThan(0);
                console.log(`[Image file_id] Response: ${result.text}`);
            },
            E2E_CONFIG.timeout,
        );
    });

});
