// Types
export type {
  TargetScoreCondition,
  MaxRoundsCondition,
  NoImprovementCondition,
  MaxCostCondition,
  CustomCycleCondition,
  CycleTerminationCondition,
  CycleContext,
  CycleContinueResult,
  CycleTerminatedResult,
  CycleTerminationResult,
  RoundYield,
  RoundDecision,
  RoundCost,
  RoundResult,
  SerializedPrompt,
  SerializedRoundResult,
  ImprovementHistory,
  HistoryConfig,
  ImprovementCycleConfig,
  ImprovementCycleOptions,
  ImprovementCycleResult,
} from './types'

// Type Guards
export {
  isTargetScoreCondition,
  isMaxRoundsCondition,
  isNoImprovementCondition,
  isMaxCostCondition,
  isCustomCycleCondition,
  isCycleTerminated,
} from './types'

// Condition Utilities
export { checkCycleCondition, checkCycleTermination } from './conditions'

// Condition Factory Functions
export {
  targetScore,
  maxRounds,
  noImprovement,
  maxCost,
  customCondition,
  and,
  or,
  not,
} from './conditions'

// Runner
export { runImprovementCycle, runImprovementCycleAuto } from './runner'

// History / Persistence
export type {
  HistoryStorage,
  ImprovementSession,
  SessionConfig,
} from './history'

export {
  createSession,
  resumeSession,
  loadHistory,
  saveHistory,
  serializePrompt,
  deserializePrompt,
  defaultHistoryStorage,
} from './history'
