/**
 * PromptContent class for prompt management.
 *
 * Provides a rich object for prompt content with compilation capabilities.
 */

import type { PromptBuilder, PromptContentData } from './types';
import { compileTemplate } from './template';

/**
 * Prompt content with template compilation capabilities.
 *
 * Use `PromptContent.from()` to create from raw data, then call `toBuilder()`
 * to get compiled template functions.
 *
 * @example
 * ```typescript
 * // From raw data
 * const content = PromptContent.from({
 *   id: 'greeting',
 *   version: '1.0.0',
 *   system: 'You are helping {{studentName}}.',
 *   userTemplate: 'Previous answers: {{answers}}',
 * });
 *
 * // Compile to builder
 * interface SessionCtx { studentName: string }
 * interface TurnCtx { answers: string[] }
 *
 * const builder = content.toBuilder<SessionCtx, TurnCtx>();
 * const systemPrompt = builder.buildSystemPrompt({ studentName: 'Kim' });
 * const userPrompt = builder.buildUserPrompt({ answers: ['A', 'B'] });
 * ```
 */
export class PromptContent implements PromptContentData {
  private constructor(
    readonly id: string,
    readonly version: string,
    readonly system: string,
    readonly userTemplate: string
  ) {}

  /**
   * Creates a PromptContent instance from raw data.
   *
   * @param data - Raw prompt content data
   * @returns PromptContent instance
   */
  static from(data: PromptContentData): PromptContent {
    return new PromptContent(data.id, data.version, data.system, data.userTemplate);
  }

  /**
   * Compiles templates and returns a PromptBuilder.
   *
   * @typeParam TSystemInput - Type of input for system prompt template
   * @typeParam TUserInput - Type of input for user prompt template (defaults to TSystemInput)
   * @returns Compiled prompt builder with buildSystemPrompt and buildUserPrompt functions
   * @throws {PromptTemplateError} If template compilation fails
   *
   * @example
   * ```typescript
   * // Different input types for system and user prompts
   * const builder = content.toBuilder<SessionCtx, TurnCtx>();
   *
   * // Same input type for both
   * const simpleBuilder = content.toBuilder<CommonCtx>();
   * ```
   */
  toBuilder<TSystemInput = unknown, TUserInput = TSystemInput>(): PromptBuilder<
    TSystemInput,
    TUserInput
  > {
    return {
      id: this.id,
      version: this.version,
      buildSystemPrompt: compileTemplate<TSystemInput>(this.system, this.id),
      buildUserPrompt: compileTemplate<TUserInput>(this.userTemplate, this.id),
    };
  }

  /**
   * Returns raw data representation.
   * Useful for serialization or passing to repository.write().
   */
  toData(): PromptContentData {
    return {
      id: this.id,
      version: this.version,
      system: this.system,
      userTemplate: this.userTemplate,
    };
  }
}
