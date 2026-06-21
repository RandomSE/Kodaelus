import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendDeletionEntry,
  readDeletionManifest,
  restoreDeletedFile,
  undoLastDeletion,
} from "./deletion-manifest.js";

describe("deletion-manifest restore", () => {
  let tempDir: string;

  function writeBackup(root: string, relativePath: string, content: string): void {
    const absolute = join(root, relativePath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("restores a file from manifest and trash backup", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kodaelus-restore-"));
    const backupRel = ".kodaelus/trash/2026-01-01T00-00-00Z/src/removed.ts";
    writeBackup(tempDir, backupRel, "export const value = 1;\n");

    appendDeletionEntry(tempDir, {
      path: "src/removed.ts",
      reason: "dead code",
      confidence: 95,
      backup: backupRel,
      timestamp: "2026-01-01T00:00:00.000Z",
      entryPointCheck: "Pass",
    });

    const result = restoreDeletedFile(tempDir, "src/removed.ts");
    expect(result.path).toBe("src/removed.ts");
    expect(existsSync(join(tempDir, "src/removed.ts"))).toBe(true);

    const manifest = readDeletionManifest(tempDir);
    expect(manifest[0]?.restoredAt).toBeTruthy();
  });

  it("undoLastDeletion restores the most recent pending entry", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kodaelus-restore-"));
    const firstBackup = ".kodaelus/trash/first.txt";
    const secondBackup = ".kodaelus/trash/second.txt";
    writeBackup(tempDir, firstBackup, "first\n");
    writeBackup(tempDir, secondBackup, "second\n");

    appendDeletionEntry(tempDir, {
      path: "first.txt",
      reason: "test",
      confidence: 90,
      backup: firstBackup,
      timestamp: "2026-01-01T00:00:00.000Z",
      entryPointCheck: "Pass",
    });
    appendDeletionEntry(tempDir, {
      path: "second.txt",
      reason: "test",
      confidence: 90,
      backup: secondBackup,
      timestamp: "2026-01-01T00:01:00.000Z",
      entryPointCheck: "Pass",
    });

    const result = undoLastDeletion(tempDir);
    expect(result.path).toBe("second.txt");
    expect(existsSync(join(tempDir, "second.txt"))).toBe(true);
  });

  it("throws when backup is missing", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kodaelus-restore-"));
    appendDeletionEntry(tempDir, {
      path: "missing.ts",
      reason: "test",
      confidence: 90,
      backup: ".kodaelus/trash/missing.ts",
      timestamp: "2026-01-01T00:00:00.000Z",
      entryPointCheck: "Pass",
    });

    expect(() => restoreDeletedFile(tempDir, "missing.ts")).toThrow(/Backup missing/);
  });
});
