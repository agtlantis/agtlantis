import { describe, expect, it } from 'vitest';

import { PromptTemplateError } from './errors';
import { PromptTemplate } from './prompt-template';
import { compileTemplate } from './template';
import type { PromptTemplateData } from './types';

describe('compileTemplate', () => {
    describe('basic templating', () => {
        it('should render simple variable', () => {
            const render = compileTemplate<{ name: string }>('Hello, {{name}}!', 'test');
            const result = render({ name: 'World' });

            expect(result).toBe('Hello, World!');
        });

        it('should render multiple variables', () => {
            const render = compileTemplate<{ firstName: string; lastName: string }>(
                '{{firstName}} {{lastName}}',
                'test'
            );
            const result = render({ firstName: 'John', lastName: 'Doe' });

            expect(result).toBe('John Doe');
        });

        it('should handle nested object access', () => {
            const render = compileTemplate<{ user: { name: string } }>(
                'Hello, {{user.name}}!',
                'test'
            );
            const result = render({ user: { name: 'Alice' } });

            expect(result).toBe('Hello, Alice!');
        });

        it('should preserve whitespace', () => {
            const render = compileTemplate<{ text: string }>('  {{text}}  \n  next line', 'test');
            const result = render({ text: 'hello' });

            expect(result).toBe('  hello  \n  next line');
        });
    });

    describe('add helper', () => {
        it('should add two numbers', () => {
            const render = compileTemplate<{ a: number; b: number }>('Result: {{add a b}}', 'test');
            const result = render({ a: 5, b: 3 });

            expect(result).toBe('Result: 8');
        });

        it('should handle negative numbers', () => {
            const render = compileTemplate<{ a: number; b: number }>('{{add a b}}', 'test');
            const result = render({ a: 10, b: -3 });

            expect(result).toBe('7');
        });

        it('should handle decimal numbers', () => {
            const render = compileTemplate<{ a: number; b: number }>('{{add a b}}', 'test');
            const result = render({ a: 1.5, b: 2.5 });

            expect(result).toBe('4');
        });

        it('should return NaN for non-numeric values', () => {
            const render = compileTemplate<{ a: string; b: number }>('{{add a b}}', 'test');
            const result = render({ a: 'not a number', b: 5 });

            expect(result).toBe('NaN');
        });
    });

    describe('built-in helpers', () => {
        it('should support #if helper', () => {
            const render = compileTemplate<{ show: boolean; text: string }>(
                '{{#if show}}{{text}}{{/if}}',
                'test'
            );

            expect(render({ show: true, text: 'visible' })).toBe('visible');
            expect(render({ show: false, text: 'visible' })).toBe('');
        });

        it('should support #each helper', () => {
            const render = compileTemplate<{ items: string[] }>(
                '{{#each items}}{{this}},{{/each}}',
                'test'
            );
            const result = render({ items: ['a', 'b', 'c'] });

            expect(result).toBe('a,b,c,');
        });

        it('should support #unless helper', () => {
            const render = compileTemplate<{ disabled: boolean }>(
                '{{#unless disabled}}enabled{{/unless}}',
                'test'
            );

            expect(render({ disabled: false })).toBe('enabled');
            expect(render({ disabled: true })).toBe('');
        });
    });

    describe('error handling', () => {
        it('should throw PromptTemplateError for mismatched block helpers at render time', () => {
            // Handlebars defers error checking to render time
            const render = compileTemplate<{ show: boolean }>(
                '{{#if show}}hello{{/unless}}',
                'test'
            );

            expect(() => render({ show: true })).toThrow(PromptTemplateError);
        });

        it('should throw PromptTemplateError when strict mode catches missing variable', () => {
            const render = compileTemplate<Record<string, never>>('{{missingVar}}', 'test');

            expect(() => render({})).toThrow(PromptTemplateError);
        });

        it('should throw PromptTemplateError at render time for missing #if argument', () => {
            // Handlebars compiles {{#if}} but throws at render when no argument
            const render = compileTemplate<Record<string, never>>('{{#if}}text{{/if}}', 'test');

            expect(() => render({})).toThrow(PromptTemplateError);
        });

        it('should throw PromptTemplateError for unknown helper', () => {
            const render = compileTemplate<{ arg: string }>('{{unknown_helper arg}}', 'test');

            expect(() => render({ arg: 'value' })).toThrow(PromptTemplateError);
        });

        it('should include promptId in render-time error', () => {
            const render = compileTemplate<Record<string, never>>('{{missing}}', 'my-prompt');

            try {
                render({});
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(PromptTemplateError);
                expect((error as PromptTemplateError).promptId).toBe('my-prompt');
            }
        });
    });

    describe('no HTML escaping', () => {
        it('should not escape HTML characters', () => {
            const render = compileTemplate<{ html: string }>('{{html}}', 'test');
            const result = render({ html: '<b>bold</b>' });

            expect(result).toBe('<b>bold</b>');
        });

        it('should not escape special characters', () => {
            const render = compileTemplate<{ text: string }>('{{text}}', 'test');
            const result = render({ text: '& < > " \'' });

            expect(result).toBe('& < > " \'');
        });
    });
});

describe('PromptTemplate.compile', () => {
    it('should convert PromptTemplateData to PromptRenderer', () => {
        const data: PromptTemplateData = {
            id: 'greeting',
            version: '1.0.0',
            system: 'You are helping {{studentName}}.',
            userTemplate: 'Hello, {{name}}!',
        };

        const builder = PromptTemplate.from(data).compile<
            { studentName: string },
            { name: string }
        >();

        expect(builder.id).toBe('greeting');
        expect(builder.version).toBe('1.0.0');
        expect(typeof builder.renderSystemPrompt).toBe('function');
        expect(typeof builder.renderUserPrompt).toBe('function');
    });

    it('should compile both templates correctly', () => {
        const data: PromptTemplateData = {
            id: 'test',
            version: '1.0.0',
            system: 'Helping {{studentName}}',
            userTemplate: '{{greeting}}, {{name}}!',
        };

        const builder = PromptTemplate.from(data).compile<
            { studentName: string },
            { greeting: string; name: string }
        >();

        expect(builder.renderSystemPrompt({ studentName: 'Kim' })).toBe('Helping Kim');
        expect(builder.renderUserPrompt({ greeting: 'Hi', name: 'Alice' })).toBe('Hi, Alice!');
    });

    it('should use same input type when only one type param is provided', () => {
        const data: PromptTemplateData = {
            id: 'test',
            version: '1.0.0',
            system: 'User: {{name}}',
            userTemplate: 'Hello, {{name}}!',
        };

        // Single type param applies to both
        const builder = PromptTemplate.from(data).compile<{ name: string }>();

        expect(builder.renderSystemPrompt({ name: 'Kim' })).toBe('User: Kim');
        expect(builder.renderUserPrompt({ name: 'Kim' })).toBe('Hello, Kim!');
    });

    it('should throw PromptTemplateError for template errors at render time', () => {
        // Handlebars defers most error checking to render time
        const data: PromptTemplateData = {
            id: 'invalid',
            version: '1.0.0',
            system: 'System',
            userTemplate: '{{#if a}}hello{{/unless}}',
        };

        const builder = PromptTemplate.from(data).compile<unknown, { a: boolean }>();
        // Error happens when rendering, not when compiling
        expect(() => builder.renderUserPrompt({ a: true })).toThrow(PromptTemplateError);
    });

    it('should return raw data via toData()', () => {
        const data: PromptTemplateData = {
            id: 'test',
            version: '1.0.0',
            system: 'System prompt',
            userTemplate: 'User template',
        };

        const content = PromptTemplate.from(data);
        const result = content.toData();

        expect(result).toEqual(data);
    });
});
