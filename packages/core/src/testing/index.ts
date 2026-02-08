export {
  TEST_API_KEY,
  createMockUsage,
  createMockSessionSummary,
  createTestEvent,
  type TestBaseEvent,
  type TestEvent,
  type TestResult,
} from './fixtures';

export {
  collectEvents,
  consumeExecution,
  expectFileManagerInterface,
} from './helpers';

export { mock, type ResponseOptions } from './mock';

export {
  MockProvider,
  createMockProvider,
  type MockProviderConfig,
  type ModelFactory,
  type MockCall,
} from './mock-provider';

export { MockLanguageModelV3, simulateReadableStream } from 'ai/test';

// Execution testing helpers (framework-agnostic)
export {
  // Types
  type MockFn,
  type MockFnFactory,
  type TestBaseEvent as ExecutionTestBaseEvent,
  type TestEvent as ExecutionTestEvent,
  type CreateMockModelOptions,
  type CreateMockFileManagerOptions,
  type CreateMockLoggerOptions,
  type CreateSessionFactoryOptions,
  type CreateStreamingSessionFactoryWithSignalOptions,
  TEST_PROVIDER_TYPE,
  // Mock factories
  createMockModel,
  createMockFileManager,
  createMockLogger,
  createMockUsage as createMockLanguageModelUsage,
  // Session factories
  createSimpleSessionFactory,
  createStreamingSessionFactory,
  createStreamingSessionFactoryWithSignal,
  // Utilities
  collectEvents as collectExecutionEvents,
  createControllablePromise,
  // Abort/Signal helpers
  createAbortScenario,
  createAlreadyAbortedSignal,
  type AbortScenario,
  // Generator helpers
  createSimpleGenerator,
  createErrorGenerator,
  createCancelableGenerator,
  createCancelableFunction,
  createDelayedGenerator,
  // Race condition & concurrency helpers
  createSlowGenerator,
  collectStreamAsync,
  createNeverEndingGenerator,
  // Logger helpers
  createOrderTrackingLogger,
  type LoggerEventType,
} from '../execution/testing/fixtures';

export { createTestExecution, createTestErrorExecution, createTestCanceledExecution } from './test-execution';
