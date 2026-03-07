export type {
  ConversationContext,
  ContinueResult,
  CustomCondition,
  FieldsCondition,
  FieldSetCondition,
  FieldValueCondition,
  FollowUpInput,
  MaxTurnsCondition,
  MultiTurnTestCase,
  MultiTurnTestResult,
  TerminatedResult,
  TerminationCheckResult,
  TerminationCondition,
} from './types.js'

export {
  isCustomCondition,
  isFieldSetCondition,
  isFieldValueCondition,
  isMaxTurnsCondition,
  isMultiTurnTestCase,
  isTerminated,
} from './types.js'

export { checkCondition, checkTermination, getFieldValue } from './termination.js'

export {
  afterTurns,
  and,
  fieldEquals,
  fieldIsSet,
  naturalLanguage,
  not,
  or,
} from './conditions.js'
export type { NaturalLanguageConditionOptions } from './conditions.js'

export type { MultiTurnExecuteContext, MultiTurnExecuteOptions } from './runner.js'
export { executeMultiTurnTestCase } from './runner.js'

export { aiUser, type AIUserOptions } from './ai-user.js'
