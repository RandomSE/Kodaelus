import { describe, expect, it } from "vitest";
import {
  DELETION_MANIFEST_REL,
  appendDeletionEntry,
  readDeletionManifest,
  restoreDeletedFile,
  runKodaelus,
  undoLastDeletion,
} from "./index.js";

describe("public SDK exports", () => {
  it("exports agent runner and deletion manifest helpers", () => {
    expect(typeof runKodaelus).toBe("function");
    expect(typeof appendDeletionEntry).toBe("function");
    expect(typeof readDeletionManifest).toBe("function");
    expect(typeof restoreDeletedFile).toBe("function");
    expect(typeof undoLastDeletion).toBe("function");
    expect(DELETION_MANIFEST_REL).toBe(".kodaelus/deletion-manifest.json");
  });
});
