export { runKodaelus } from "./agent.js";
export type { KodaelusRunOptions, KodaelusRunOutcome } from "./agent.js";

export {
  loadInstructions,
  resolveInstructionsPath,
  wrapTaskWithInstructions,
  globalInstructionsPath,
  projectInstructionsPath,
  projectGuidelinesPath,
  loadProjectGuidelines,
  loadInstructionsWithProjectGuidelines,
  ensureProjectGuidelines,
  recordPreferenceCandidate,
  normalizePreferenceKey,
  extractPreferenceIntent,
  resolveDistributionRepoRoot,
  PROJECT_GUIDELINES_REL,
  KODAELUS_DIR_REL,
  PREFERENCE_LOG_REL,
  PREFERENCE_THRESHOLD,
} from "./instructions.js";
export type {
  ResolveInstructionsOptions,
  ProjectGuidelinesOptions,
  EnsureProjectGuidelinesResult,
  PreferenceLog,
  RecordPreferenceResult,
} from "./instructions.js";

export {
  DELETION_MANIFEST_REL,
  appendDeletionEntry,
  readDeletionManifest,
  restoreDeletedFile,
  undoLastDeletion,
} from "./deletion-manifest.js";
export type {
  DeletionManifestEntry,
  RestoreResult,
} from "./deletion-manifest.js";

export {
  diffPriorSuggestions,
  extractSuggestionKeys,
  SUGGESTIONS_DIR_REL,
} from "./suggestions.js";

export {
  buildModeHeader,
  describeSdkLimitations,
  normalizeDetectedMode,
  runSdkPreflight,
} from "./runtime-guards.js";
export type {
  KodaelusModeName,
  SdkPreflightOptions,
  SdkPreflightResult,
} from "./runtime-guards.js";

export {
  detectKodaelusMode,
  isBugInvestigationMode,
  isDeactivatePrompt,
  isMutatingMode,
  isReadOnlyMode,
} from "./mode-detect.js";
