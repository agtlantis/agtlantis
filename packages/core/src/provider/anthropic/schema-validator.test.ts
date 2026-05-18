import { Output } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
    UnsupportedAnthropicSchemaError,
    assertAnthropicResponseFormatSupported,
    guardAnthropicOutput,
} from './schema-validator.js';

describe('Anthropic schema validator', () => {
    it('rejects z.discriminatedUnion converted to JSON Schema oneOf', async () => {
        const output = Output.object({
            schema: z.discriminatedUnion('kind', [
                z.object({ kind: z.literal('text'), value: z.string() }),
                z.object({ kind: z.literal('score'), score: z.number() }),
            ]),
        });

        await expect(guardAnthropicOutput(output).responseFormat).rejects.toThrow(
            UnsupportedAnthropicSchemaError
        );
    });

    it('finds nested discriminated unions and reports the schema path', async () => {
        const output = Output.object({
            schema: z.object({
                item: z.discriminatedUnion('type', [
                    z.object({ type: z.literal('url'), url: z.string() }),
                    z.object({ type: z.literal('doc'), title: z.string() }),
                ]),
            }),
        });

        await expect(guardAnthropicOutput(output).responseFormat).rejects.toThrow(
            '$.properties.item'
        );
    });

    it('allows regular unions because they do not encode a discriminatedUnion marker', async () => {
        const output = Output.object({
            schema: z.object({
                value: z.union([z.string(), z.number()]),
            }),
        });

        await expect(guardAnthropicOutput(output).responseFormat).resolves.toEqual(
            expect.objectContaining({ type: 'json' })
        );
    });

    it('allows flat object schemas', () => {
        expect(() =>
            assertAnthropicResponseFormatSupported({
                type: 'json',
                schema: {
                    type: 'object',
                    properties: {
                        title: { type: 'string' },
                    },
                    required: ['title'],
                },
            })
        ).not.toThrow();
    });
});
