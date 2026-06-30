import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendManifestEntry as appendHook } from "../../install/hooks/lib/deletion-manifest-io.mjs";
import { appendDeletionEntry as appendSdk } from "../src/deletion-manifest.js";

describe("deletion manifest parity", () => {
  it("hooks and SDK append produce the same on-disk schema", () => {
    const rootA = mkdtempSync(join(tmpdir(), "kodaelus-parity-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "kodaelus-parity-b-"));

    const entry = {
      path: "src/a.ts",
      reason: "parity",
      confidence: 100,
      backup: ".kodaelus/trash/a.ts",
      timestamp: "2026-06-30T00:00:00.000Z",
      entryPointCheck: "Pass",
    };

    appendHook(rootA, entry);
    appendSdk(rootB, entry);

    const hookManifest = JSON.parse(
      readFileSync(join(rootA, ".kodaelus/deletion-manifest.json"), "utf8"),
    );
    const sdkManifest = JSON.parse(
      readFileSync(join(rootB, ".kodaelus/deletion-manifest.json"), "utf8"),
    );

    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });

    expect(hookManifest).toEqual([entry]);
    expect(sdkManifest).toEqual([entry]);
  });
});
