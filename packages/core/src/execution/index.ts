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
} from './types';

export { StreamingExecutionHost } from './streaming-host';
export { SimpleExecutionHost } from './simple-host';

export { ERRORS } from './constants';
export { getDuration, combineSignals } from './utils';
export { isAbortError, normalizeError, determineResultStatus, createHookRunner, type HookRunner } from './shared';

export { mapExecution, mapExecutionResult, type ReplaceResult } from './mapping';
