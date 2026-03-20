export {
    type Provider,
    type FileManager,
    type FileManagerOptions,
    type FileCache,
    type UploadedFile,
    type FileSource,
    type FileSourcePath,
    type FileSourceData,
    type FileSourceBase64,
    type FileSourceUrl,
    // Type guards
    isFileSource,
    isFileSourcePath,
    isFileSourceData,
    isFileSourceBase64,
    isFileSourceUrl,
} from './types.js';

export { computeFileSourceHash } from './hash.js';

export { InMemoryFileCache, type InMemoryFileCacheOptions } from './file-cache.js';

export { BaseProvider } from './base-provider.js';
export { BaseFileManager } from './base-file-manager.js';
export { NoOpFileManager } from './noop-file-manager.js';

export {
    EXTENSION_TO_MIME,
    DEFAULT_MAX_SIZE,
    inferMediaType,
    scanForFileSources,
    resolveFileSource,
    resolveFileSourcesInInput,
    getFileSourceDisplayInfo,
    getFileSourcesDisplayInfo,
    type FoundFileSource,
    type ResolveOptions,
    type FileSourceDisplayInfo,
} from './file-source.js';

export {
    createGoogleProvider,
    GoogleProvider,
    GoogleFileManager,
    type GoogleProviderConfig,
    type SafetySetting,
    type HarmCategory,
    type HarmBlockThreshold,
    type GoogleGenerativeAIProviderOptions,
} from './google/index.js';

export {
    createOpenAIProvider,
    OpenAIFileManager,
    type OpenAIProviderConfig,
    type OpenAIFileManagerOptions,
    type OpenAIChatLanguageModelOptions,
} from './openai/index.js';
