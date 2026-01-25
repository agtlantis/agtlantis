export {
  type Provider,
  type FileManager,
  type UploadedFile,
  type FilePart,
  type FilePartPath,
  type FilePartData,
  type FilePartBase64,
  type FilePartUrl,
  // Type guards
  isFilePart,
  isFilePartPath,
  isFilePartData,
  isFilePartBase64,
  isFilePartUrl,
  type StreamingSession,
  type SimpleSession,
} from './types';

export type {
  Execution,
  ExecutionOptions,
  SimpleExecution,
  StreamingExecution,
  SessionStreamGeneratorFn,
  // Type helpers for defining events
  DistributiveOmit,
  SessionEvent,
  SessionEventInput,
  EmittableEventInput,
  ReservedEventType,
} from '../execution';

export { combineSignals } from '../execution';

export type { SessionSummary } from '../session';

export { BaseProvider } from './base-provider';
export { NoOpFileManager } from './noop-file-manager';

export {
  EXTENSION_TO_MIME,
  DEFAULT_MAX_SIZE,
  inferMimeType,
  scanForFileParts,
  resolveFilePart,
  resolveFilePartsInInput,
  getFilePartDisplayInfo,
  getFilePartsDisplayInfo,
  type FoundFilePart,
  type ResolveOptions,
  type FilePartDisplayInfo,
} from './file-part';

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

export {
  RateLimitError,
  TimeoutError,
  AuthenticationError,
  ModelNotFoundError,
  type RateLimitErrorContext,
  type TimeoutErrorContext,
  type AuthenticationErrorContext,
  type ModelNotFoundErrorContext,
} from './errors';
