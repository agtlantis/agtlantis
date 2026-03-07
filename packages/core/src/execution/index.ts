export type {
  Execution,
  ExecutionOptions,
  SimpleExecution,
  StreamingExecution,
  SessionStreamGeneratorFn,
  // Result types (Breaking Change)
  ExecutionStatus,
  ExecutionResult,
  SimpleResult,
  StreamingResult,
  // Type helpers
  DistributiveOmit,
  SessionEvent,
  SessionEventInput,
  EmittableEventInput,
  ReservedEventType,
  // Terminal event types
  CompletionEvent,
  ErrorEvent,
  ExtractResult,
} from './types.js';

export { StreamingExecutionHost } from './streaming-host.js';
export { SimpleExecutionHost } from './simple-host.js';

export { ERRORS } from './constants.js';
export { getDuration, combineSignals } from './utils.js';
export { isAbortError, normalizeError, determineResultStatus, createHookRunner, type HookRunner } from './shared.js';

export { mapExecution, mapExecutionResult, type ReplaceResult } from './mapping.js';
