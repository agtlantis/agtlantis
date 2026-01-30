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
} from './types';

export { computeFileSourceHash } from './hash';

export { InMemoryFileCache, type InMemoryFileCacheOptions } from './file-cache';

export { BaseProvider } from './base-provider';
export { NoOpFileManager } from './noop-file-manager';

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
} from './file-source';

export {
    createGoogleProvider,
    GoogleProvider,
    GoogleFileManager,
    type GoogleProviderConfig,
    type SafetySetting,
    type HarmCategory,
    type HarmBlockThreshold,
    type GoogleGenerativeAIProviderOptions,
} from './google';

export {
    createOpenAIProvider,
    type OpenAIProviderConfig,
    type OpenAIChatLanguageModelOptions,
} from './openai';
