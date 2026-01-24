/**
 * Template engine for prompt compilation.
 *
 * Uses Handlebars for template rendering with custom helpers.
 */

import Handlebars from 'handlebars';

// Note: PromptContent class uses compileTemplate, not the other way around
// This avoids circular dependencies
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

