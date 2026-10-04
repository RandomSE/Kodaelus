import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendProjectInsight,
  ensureProjectGuidelines,
  loadPolicyForMode,
  resolveDistributionRepoRoot,
} from "./instructions.js";

describe("project insights", () => {
  let tempDir = "";
  const previous = process.env.KODAELUS_INSTRUCTIONS;

  afterEach(async () => {
    if (previous === undefined) delete process.env.KODAELUS_INSTRUCTIONS;
    else process.env.KODAELUS_INSTRUCTIONS = previous;
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("bootstraps guidelines, appends an insight, and the next Main and Prepare load include it", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(import.meta.dirname, ".."));
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-insight-"));
    process.env.KODAELUS_INSTRUCTIONS = path.join(repoRoot, "kodaelus");
    const boot = await ensureProjectGuidelines({ cwd: tempDir });
    expect(boot.created).toBe(true);

    const token = "golden insight token stays on the next load";
    const saved = await appendProjectInsight(`2026-10-03 | memory | ${token}`, { cwd: tempDir });
    expect(saved.appended).toBe(true);
    const onDisk = await readFile(saved.path, "utf8");
    expect(onDisk).toContain(token);

    const main = await loadPolicyForMode("main", {
      cwd: tempDir,
      task: "add a field",
      logTaskMatch: false,
    });
    const prepare = await loadPolicyForMode("prepare", {
      cwd: tempDir,
      task: "review the diff",
      logTaskMatch: false,
    });
    const prompt = await loadPolicyForMode("prompt", {
      cwd: tempDir,
      task: "write a spec",
      logTaskMatch: false,
    });
    expect(main).toContain(token);
    expect(prepare).toContain(token);
    expect(prompt).not.toContain(token);
  });

  it("records a prune note instead of growing past 100 lines", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-insight-cap-"));
    const lines = Array.from({ length: 100 }, (_, index) => `2026-10-03 | cap | row ${index}`);
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.join(tempDir, ".kodaelus"), { recursive: true });
    await writeFile(path.join(tempDir, ".kodaelus", "insights.md"), `${lines.join("\n")}\n`, "utf8");
    const saved = await appendProjectInsight("2026-10-03 | cap | one more row", { cwd: tempDir });
    expect(saved.appended).toBe(false);
    expect(saved.pruneNoted).toBe(true);
    const onDisk = await readFile(saved.path, "utf8");
    expect(onDisk).toContain("prune: file exceeded 100 lines");
    expect(onDisk).not.toContain("one more row");
  });
});
