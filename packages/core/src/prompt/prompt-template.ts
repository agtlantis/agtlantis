/**
 * PromptTemplate class for prompt management.
 *
 * Provides a rich object for prompt templates with compilation capabilities.
 */
import { compileTemplate } from './template';
import type { PromptRenderer, PromptTemplateData } from './types';

/**
 * Prompt template with compilation capabilities.
 *
 * Use `PromptTemplate.from()` to create from raw data, then call `compile()`
 * to get compiled template functions.
 *
 * @example
 * ```typescript
 * // From raw data
 * const template = PromptTemplate.from({
 *   id: 'greeting',
 *   version: '1.0.0',
 *   system: 'You are helping {{studentName}}.',
 *   userTemplate: 'Previous answers: {{answers}}',
 * });
 *
 * // Compile to renderer
 * interface SessionCtx { studentName: string }
 * interface TurnCtx { answers: string[] }
 *
 * const renderer = template.compile<SessionCtx, TurnCtx>();
 * const systemPrompt = renderer.renderSystemPrompt({ studentName: 'Kim' });
 * const userPrompt = renderer.renderUserPrompt({ answers: ['A', 'B'] });
 * ```
 */
export class PromptTemplate implements PromptTemplateData {
    private constructor(
        readonly id: string,
        readonly version: string,
        readonly system: string,
        readonly userTemplate: string
    ) {}

    /**
     * Creates a PromptTemplate instance from raw data.
     *
     * @param data - Raw prompt template data
     * @returns PromptTemplate instance
     */
    static from(data: PromptTemplateData): PromptTemplate {
        return new PromptTemplate(data.id, data.version, data.system, data.userTemplate);
    }

    /**
     * Compiles templates and returns a PromptRenderer.
     *
     * @typeParam TSystemInput - Type of input for system prompt template
     * @typeParam TUserInput - Type of input for user prompt template (defaults to TSystemInput)
     * @returns Compiled prompt renderer with renderSystemPrompt and renderUserPrompt functions
     * @throws {PromptTemplateError} If template compilation fails
     *
     * @example
     * ```typescript
     * // Different input types for system and user prompts
     * const renderer = template.compile<SessionCtx, TurnCtx>();
     *
     * // Same input type for both
     * const simpleRenderer = template.compile<CommonCtx>();
     * ```
     */
    compile<TSystemInput = unknown, TUserInput = TSystemInput>(): PromptRenderer<
        TSystemInput,
        TUserInput
    > {
        return {
            id: this.id,
            version: this.version,
            renderSystemPrompt: compileTemplate<TSystemInput>(this.system, this.id),
            renderUserPrompt: compileTemplate<TUserInput>(this.userTemplate, this.id),
        };
    }

    /**
     * Returns raw data representation.
     * Useful for serialization or passing to repository.write().
     */
    toData(): PromptTemplateData {
        return {
            id: this.id,
            version: this.version,
            system: this.system,
            userTemplate: this.userTemplate,
        };
    }
}
