import { describe, expect, it } from "vitest";
import {
  DELETION_MANIFEST_REL,
  appendDeletionEntry,
  buildModeHeader,
  describeSdkLimitations,
  diffPriorSuggestions,
  extractPreferenceIntent,
  extractSuggestionKeys,
  isBugInvestigationMode,
  isReadOnlyMode,
  readDeletionManifest,
  restoreDeletedFile,
  runKodaelus,
  runSdkPreflight,
  undoLastDeletion,
} from "./index.js";

describe("public SDK exports", () => {
  it("exports agent runner and deletion manifest helpers", () => {
    expect(typeof runKodaelus).toBe("function");
    expect(typeof appendDeletionEntry).toBe("function");
    expect(typeof readDeletionManifest).toBe("function");
    expect(typeof restoreDeletedFile).toBe("function");
    expect(typeof undoLastDeletion).toBe("function");
    expect(typeof diffPriorSuggestions).toBe("function");
    expect(typeof extractSuggestionKeys).toBe("function");
    expect(typeof describeSdkLimitations).toBe("function");
    expect(typeof buildModeHeader).toBe("function");
    expect(typeof runSdkPreflight).toBe("function");
    expect(typeof extractPreferenceIntent).toBe("function");
    expect(typeof isReadOnlyMode).toBe("function");
    expect(typeof isBugInvestigationMode).toBe("function");
    expect(extractPreferenceIntent("I prefer to use pnpm instead of npm here")).toBe(
      "use pnpm instead of npm here",
    );
    expect(DELETION_MANIFEST_REL).toBe(".kodaelus/deletion-manifest.json");
    expect(buildModeHeader("prompt")).toContain("read-only");
    const preflight = runSdkPreflight({
      mode: "prompt",
      task: "use kodaelus 1",
      cwd: process.cwd(),
    });
    expect(preflight.warnings.length).toBeGreaterThan(1);
    expect(preflight.warnings.some((line) => /read-only/i.test(line))).toBe(true);
  });
});
