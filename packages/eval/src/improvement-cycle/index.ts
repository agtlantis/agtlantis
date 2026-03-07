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
} from './types.js'

// Type Guards
export {
  isTargetScoreCondition,
  isMaxRoundsCondition,
  isNoImprovementCondition,
  isMaxCostCondition,
  isCustomCycleCondition,
  isCycleTerminated,
} from './types.js'

// Condition Utilities
export { checkCycleCondition, checkCycleTermination } from './conditions.js'

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
} from './conditions.js'

// Runner
export { runImprovementCycle, runImprovementCycleAuto } from './runner.js'

// History / Persistence
export type {
  HistoryStorage,
  ImprovementSession,
  SessionConfig,
} from './history.js'

export {
  createSession,
  resumeSession,
  loadHistory,
  saveHistory,
  serializePrompt,
  deserializePrompt,
  defaultHistoryStorage,
} from './history.js'
