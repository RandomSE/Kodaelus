export { runKodaelus } from "./agent.js";
export type { KodaelusRunOptions, KodaelusRunOutcome } from "./agent.js";

export {
  loadInstructions,
  resolveInstructionsPath,
  wrapTaskWithInstructions,
  globalInstructionsPath,
  projectInstructionsPath,
  resolveDistributionRepoRoot,
} from "./instructions.js";
export type { ResolveInstructionsOptions } from "./instructions.js";

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
