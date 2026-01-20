/**
 * Template engine for prompt compilation.
 *
 * Uses Handlebars for template rendering with custom helpers.
 */

import Handlebars from 'handlebars';

import type { PromptContent, PromptDefinition } from './types';
import { PromptTemplateError } from './errors';

// =============================================================================
// Handlebars Instance Setup
// =============================================================================

/**
 * Create a sandboxed Handlebars instance with custom helpers.
 * Using a separate instance prevents pollution of the global Handlebars.
 */
const handlebars = Handlebars.create();

// Register custom helpers
handlebars.registerHelper('add', (a: unknown, b: unknown) => {
  const numA = Number(a);
  const numB = Number(b);
  if (Number.isNaN(numA) || Number.isNaN(numB)) {
    return NaN;
  }
  return numA + numB;
});

// =============================================================================
// Template Compilation
// =============================================================================

function wrapTemplateError(promptId: string, error: unknown): PromptTemplateError {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;
  return new PromptTemplateError(promptId, message, { cause });
}

/**
 * Compiles a Handlebars template string into a render function.
 *
 * @typeParam TInput - Type of the input object for template rendering
 * @param template - Handlebars template string
 * @param promptId - Prompt ID for error context
 * @returns Compiled template function
 * @throws {PromptTemplateError} If template compilation fails
 *
 * @example
 * ```typescript
 * const render = compileTemplate<{ name: string }>('Hello, {{name}}!', 'greeting');
 * const result = render({ name: 'World' });
 * // => 'Hello, World!'
 * ```
 */
export function compileTemplate<TInput>(
  template: string,
  promptId: string
): (input: TInput) => string {
  try {
    const compiled = handlebars.compile(template, {
      strict: true,
      noEscape: true,
    });

    return (input: TInput): string => {
      try {
        return compiled(input);
      } catch (error) {
        throw wrapTemplateError(promptId, error);
      }
    };
  } catch (error) {
    throw wrapTemplateError(promptId, error);
  }
}

// =============================================================================
// Prompt Definition Conversion
// =============================================================================

/**
 * Converts raw PromptContent to a compiled PromptDefinition.
 *
 * @typeParam TInput - Type of the input object for template rendering
 * @param content - Raw prompt content from repository
 * @returns Compiled prompt definition with buildUserPrompt function
 * @throws {PromptTemplateError} If template compilation fails
 *
 * @example
 * ```typescript
 * const content: PromptContent = {
 *   id: 'greeting',
 *   version: '1.0.0',
 *   system: 'You are a helpful assistant.',
 *   userTemplate: 'Hello, {{name}}!',
 * };
 *
 * const definition = toPromptDefinition<{ name: string }>(content);
 * const userPrompt = definition.buildUserPrompt({ name: 'World' });
 * // => 'Hello, World!'
 * ```
 */
export function toPromptDefinition<TInput>(content: PromptContent): PromptDefinition<TInput> {
  const buildUserPrompt = compileTemplate<TInput>(content.userTemplate, content.id);

  return {
    id: content.id,
    version: content.version,
    system: content.system,
    userTemplate: content.userTemplate,
    buildUserPrompt,
  };
}
