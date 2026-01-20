import { describe, expect, it } from 'vitest';

import { compileTemplate, toPromptDefinition } from './template';
import { PromptTemplateError } from './errors';
import type { PromptContent } from './types';

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
      const render = compileTemplate<{ text: string }>(
        '  {{text}}  \n  next line',
        'test'
      );
      const result = render({ text: 'hello' });

      expect(result).toBe('  hello  \n  next line');
    });
  });

  describe('add helper', () => {
    it('should add two numbers', () => {
      const render = compileTemplate<{ a: number; b: number }>(
        'Result: {{add a b}}',
        'test'
      );
      const result = render({ a: 5, b: 3 });

      expect(result).toBe('Result: 8');
    });

    it('should handle negative numbers', () => {
      const render = compileTemplate<{ a: number; b: number }>(
        '{{add a b}}',
        'test'
      );
      const result = render({ a: 10, b: -3 });

      expect(result).toBe('7');
    });

    it('should handle decimal numbers', () => {
      const render = compileTemplate<{ a: number; b: number }>(
        '{{add a b}}',
        'test'
      );
      const result = render({ a: 1.5, b: 2.5 });

      expect(result).toBe('4');
    });

    it('should return NaN for non-numeric values', () => {
      const render = compileTemplate<{ a: string; b: number }>(
        '{{add a b}}',
        'test'
      );
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
      const render = compileTemplate<{ show: boolean }>('{{#if show}}hello{{/unless}}', 'test');

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

describe('toPromptDefinition', () => {
  it('should convert PromptContent to PromptDefinition', () => {
    const content: PromptContent = {
      id: 'greeting',
      version: '1.0.0',
      system: 'You are a helpful assistant.',
      userTemplate: 'Hello, {{name}}!',
    };

    const definition = toPromptDefinition<{ name: string }>(content);

    expect(definition.id).toBe('greeting');
    expect(definition.version).toBe('1.0.0');
    expect(definition.system).toBe('You are a helpful assistant.');
    expect(definition.userTemplate).toBe('Hello, {{name}}!');
    expect(typeof definition.buildUserPrompt).toBe('function');
  });

  it('should compile template correctly', () => {
    const content: PromptContent = {
      id: 'test',
      version: '1.0.0',
      system: 'System',
      userTemplate: '{{greeting}}, {{name}}!',
    };

    const definition = toPromptDefinition<{ greeting: string; name: string }>(content);
    const result = definition.buildUserPrompt({ greeting: 'Hi', name: 'Alice' });

    expect(result).toBe('Hi, Alice!');
  });

  it('should throw PromptTemplateError for template errors at render time', () => {
    // Handlebars defers most error checking to render time
    const content: PromptContent = {
      id: 'invalid',
      version: '1.0.0',
      system: 'System',
      userTemplate: '{{#if a}}hello{{/unless}}',
    };

    const definition = toPromptDefinition<{ a: boolean }>(content);
    // Error happens when rendering, not when compiling
    expect(() => definition.buildUserPrompt({ a: true })).toThrow(PromptTemplateError);
  });
});
