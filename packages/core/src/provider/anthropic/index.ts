/**
 * Anthropic Provider Module
 *
 * Exports the standalone surface for Anthropic.
 */

export {
    createAnthropicProvider,
    type AnthropicLanguageModelOptions,
    type AnthropicProviderConfig,
    type AnthropicReasoningEffort,
} from './factory.js';

export {
    ANTHROPIC_API_VERSION,
    ANTHROPIC_FILES_API_BETA,
    DEFAULT_ANTHROPIC_INLINE_MAX_BYTES,
    AnthropicFileManager,
    type AnthropicFileManagerOptions,
    type AnthropicFileManagerStrategy,
} from './file-manager.js';

export {
    ANTHROPIC_FILE_ID_MARKER_PREFIX,
    createAnthropicFileIdMarker,
    parseAnthropicFileIdMarker,
    rewriteFileIdMiddleware,
    type RewriteFileIdMiddlewareOptions,
} from './middleware.js';

export {
    createAnthropicProviderTool,
    createAnthropicWebSearchTool,
    type AnthropicProviderToolKind,
    type AnthropicWebSearchToolOptions,
} from './tools.js';

export {
    normalizeAnthropicWebSearchCitation,
    normalizeCitation,
    normalizeCitations,
} from './citation-normalizer.js';

export {
    UnsupportedAnthropicSchemaError,
    assertAnthropicResponseFormatSupported,
    guardAnthropicOutput,
} from './schema-validator.js';

export {
    extractAnthropicServerToolUse,
    type AnthropicServerToolUse,
} from './usage.js';
