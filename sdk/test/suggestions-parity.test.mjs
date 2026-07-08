import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  diffPriorSuggestions as hookDiff,
  extractSuggestionKeys as hookExtract,
} from "../../install/hooks/lib/suggestions-diff.mjs";
import {
  diffPriorSuggestions as sdkDiff,
  extractSuggestionKeys as sdkExtract,
} from "../src/suggestions.js";

describe("suggestions parity", () => {
  it("hooks and SDK extract the same suggestion keys", () => {
    const content = [
      "| Finding | Severity |",
      "| missing tests | High |",
      "- prefer vitest for unit tests",
    ].join("\n");

    expect([...sdkExtract(content)].sort()).toEqual([...hookExtract(content)].sort());
  });

  it("hooks and SDK diff prior suggestions identically", () => {
    const root = mkdtempSync(join(tmpdir(), "kodaelus-suggest-parity-"));
    const dir = join(root, ".kodaelus", "suggestions");
    mkdirSync(dir, { recursive: true });

    writeFileSync(
      join(dir, "2026-07-01-issues.md"),
      "| missing tests | High |\n| stale docs | Low |\n",
      "utf8",
    );
    writeFileSync(join(dir, "2026-07-08-issues.md"), "| stale docs | Low |\n", "utf8");

    expect(sdkDiff(root, "issues")).toEqual(hookDiff(root, "issues"));

    rmSync(root, { recursive: true, force: true });
  });
});
