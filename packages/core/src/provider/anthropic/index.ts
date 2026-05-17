/**
 * Anthropic Provider Module
 *
 * Exports the standalone surface for Anthropic. `createAnthropicProvider`
 * lands in F11.
 */

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
    createAnthropicWebSearchTool,
    createProviderSearchTool,
    type AnthropicWebSearchToolOptions,
    type ProviderSearchToolKind,
} from './tools.js';
