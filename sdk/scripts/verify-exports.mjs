import * as sdk from "../dist/index.js";

const requiredFunctions = [
  "runKodaelus",
  "loadInstructions",
  "loadPolicyForMode",
  "resolvePolicyDir",
  "selectTaskModules",
  "inferDeliveryTier",
  "checkSdkDelivery",
  "resolveInstructionsPath",
  "wrapTaskWithInstructions",
  "loadProjectGuidelines",
  "loadInstructionsWithProjectGuidelines",
  "ensureProjectGuidelines",
  "recordPreferenceCandidate",
  "appendProjectInsight",
  "loadProjectInsights",
  "recommendKodaelusIntent",
  "recommendCeremony",
  "normalizePreferenceKey",
  "extractPreferenceIntent",
  "diffPriorSuggestions",
  "extractSuggestionKeys",
  "describeSdkLimitations",
  "buildModeHeader",
  "detectKodaelusMode",
  "runSdkPreflight",
  "isReadOnlyMode",
  "isBugInvestigationMode",
  "appendDeletionEntry",
  "readDeletionManifest",
  "restoreDeletedFile",
  "undoLastDeletion",
];

const missing = requiredFunctions.filter((name) => typeof sdk[name] !== "function");
if (missing.length > 0) {
  console.error(`Missing SDK exports: ${missing.join(", ")}`);
  process.exit(1);
}

if (sdk.DELETION_MANIFEST_REL !== ".kodaelus/deletion-manifest.json") {
  console.error(`Unexpected DELETION_MANIFEST_REL: ${sdk.DELETION_MANIFEST_REL}`);
  process.exit(1);
}

console.log("SDK dist/index.js exports verified.");
