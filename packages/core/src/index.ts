// Main Clippi class
export { Clippi, type ClippiState } from './clippi.js'

// Types
export * from './types/index.js'

// Actionability
export { isActionable, scrollIntoViewIfNeeded, type ActionabilityResult } from './actionability/checks.js'

// Conditions
export {
  parseCondition,
  evaluateCondition,
  checkCondition,
  isJsFunctionCondition,
  stringifyCondition,
  ConditionParseError,
} from './conditions/index.js'

// Selectors
export {
  resolveSelector,
  resolveSelectorString,
  selectorFromString,
  selectorFromTestId,
  waitForSelector,
  type SelectorResult,
} from './selectors/resolver.js'

// Events
export { EventEmitter } from './events/emitter.js'

// Sequencer
export {
  StepSequencer,
  StepObserver,
  checkSuccessCondition,
  checkValueCondition,
  type SequencerConfig,
  type SequencerState,
  type ObserverConfig,
} from './sequencer/index.js'

// Persistence
export {
  SessionPersistence,
  NullPersistence,
  createPersistence,
  type SessionData,
} from './persistence/session-storage.js'

// Manifest
export {
  loadManifest,
  generateContext,
  validateManifest,
  findById,
  findByIdCaseInsensitive,
  matchByQuery,
  findBestMatch,
  findByCategory,
  getContextTargets,
  type MatchResult,
} from './manifest/index.js'
