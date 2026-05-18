/**
 * Anthropic provider tool wrappers.
 *
 * AI SDK 6.x defines `ToolSet` as
 *   `Record<string, (... | Tool<...>) & Pick<Tool<any, any>, 'execute' | ...>>`
 * which extracts `execute` as a required property (see `ai@6.0.39
 * dist/index.d.ts:408`). Server-side provider tools such as
 * `@ai-sdk/anthropic`'s `webSearch_20250305()` do not carry an `execute` —
 * the platform runs them — so consumers hit a TS2322 when assigning them
 * straight into a `ToolSet`.
 *
 * Runtime works fine (PoC: F9-T9.4 §11). To keep the typing quirk out of
 * consumer code we expose a thin wrapper that absorbs the cast.
 *
 * TODO: drop this wrapper once the upstream fix lands in `vercel/ai`
 *       (issue covering provider-tool variance over `ToolSet`).
 *
 * Reference: F9-go-no-go.md §6.1 1.2, §7 R8 +
 *            packages/core/e2e/anthropic/T9.4-finding.md §11.
 */

import { anthropic as anthropicProvider } from '@ai-sdk/anthropic';
import type { ToolSet } from 'ai';

const ANTHROPIC_WEB_SEARCH_TOOL_NAME = 'web_search';

type AnthropicWebSearchToolFactory =
    typeof anthropicProvider.tools.webSearch_20250305;

/**
 * Options for Anthropic's web search tool, kept in lock-step with
 * `@ai-sdk/anthropic`.
 */
export type AnthropicWebSearchToolOptions = NonNullable<
    Parameters<AnthropicWebSearchToolFactory>[0]
>;

interface AnthropicToolNameOverride {
    toolName?: string;
}

function toToolSet(tools: Record<string, unknown>): ToolSet {
    return tools as unknown as ToolSet;
}

/**
 * Build a `ToolSet`-typed entry for Anthropic's web search server-side tool.
 *
 * Use it directly with `streamText` / `generateText`:
 *
 * ```ts
 * import { streamText } from 'ai';
 * import { createAnthropicWebSearchTool } from '@agtlantis/core';
 *
 * const tools = createAnthropicWebSearchTool({ maxUses: 2 });
 * const stream = streamText({ model, prompt, tools });
 * ```
 *
 * The returned object always uses the key `web_search`, matching the
 * wire-level tool name expected by Anthropic's API. Pass `{ toolName }`
 * to override (rare).
 */
export function createAnthropicWebSearchTool(
    options: AnthropicWebSearchToolOptions = {},
    overrides: AnthropicToolNameOverride = {},
): ToolSet {
    const tool = anthropicProvider.tools.webSearch_20250305(options);
    const toolName = overrides.toolName ?? ANTHROPIC_WEB_SEARCH_TOOL_NAME;

    return toToolSet({ [toolName]: tool });
}

/**
 * Factory for Anthropic provider-supplied server-side tools. Currently only
 * `'webSearch'` is wired; further Anthropic server tools (bash, codeExecution,
 * computer, textEditor, toolSearch*) can be added behind this surface without
 * touching consumer code.
 *
 * Naming is Anthropic-scoped on purpose: a true provider-neutral abstraction
 * would need a shared tool catalog across providers, which does not exist
 * today.
 */
export type AnthropicProviderToolKind = 'webSearch';

export function createAnthropicProviderTool(
    kind: AnthropicProviderToolKind,
    options: AnthropicWebSearchToolOptions = {},
): ToolSet {
    switch (kind) {
        case 'webSearch':
            return createAnthropicWebSearchTool(options);
        default: {
            const exhaustive: never = kind;
            throw new Error(`Unsupported Anthropic provider tool: ${String(exhaustive)}`);
        }
    }
}
