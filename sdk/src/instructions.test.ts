import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  globalInstructionsPath,
  loadInstructions,
  projectInstructionsPath,
  resolveDistributionRepoRoot,
  resolveInstructionsPath,
  wrapTaskWithInstructions,
} from "./instructions.js";

describe("resolveDistributionRepoRoot", () => {
  it("returns parent when cwd is sdk/", () => {
    const repo = path.resolve("/repo");
    expect(resolveDistributionRepoRoot(path.join(repo, "sdk"))).toBe(repo);
  });
});

describe("globalInstructionsPath", () => {
  it("points under .cursor/kodaelus in the user home", () => {
    expect(globalInstructionsPath("/home/user/.cursor")).toBe(
      path.join("/home/user/.cursor", "kodaelus", "instructions.md"),
    );
  });
});

describe("resolveInstructionsPath", () => {
  let tempDir: string;
  const originalEnv = process.env.KODAELUS_INSTRUCTIONS;

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.KODAELUS_INSTRUCTIONS;
    } else {
      process.env.KODAELUS_INSTRUCTIONS = originalEnv;
    }
    if (tempDir) {
      await import("node:fs/promises").then(({ rm }) =>
        rm(tempDir, { recursive: true, force: true }),
      );
    }
  });

  it("prefers KODAELUS_INSTRUCTIONS when set", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-"));
    const custom = path.join(tempDir, "custom.md");
    await writeFile(custom, "# Custom", "utf8");
    process.env.KODAELUS_INSTRUCTIONS = custom;

    await expect(resolveInstructionsPath()).resolves.toBe(custom);
  });

  it("uses global path when present", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-"));
    const cursorHome = path.join(tempDir, ".cursor");
    const globalPath = globalInstructionsPath(cursorHome);
    await mkdir(path.dirname(globalPath), { recursive: true });
    await writeFile(globalPath, "# Global", "utf8");

    await expect(
      resolveInstructionsPath({ cursorHome }),
    ).resolves.toBe(globalPath);
  });

  it("falls back to project-local in distribution repo", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-"));
    const localPath = projectInstructionsPath(tempDir);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, "# Local", "utf8");

    await expect(
      resolveInstructionsPath({ cwd: tempDir, cursorHome: path.join(tempDir, "missing") }),
    ).resolves.toBe(localPath);
  });
});

describe("loadInstructions", () => {
  let loadTempDir: string;

  afterEach(async () => {
    if (loadTempDir) {
      await import("node:fs/promises").then(({ rm }) =>
        rm(loadTempDir, { recursive: true, force: true }),
      );
    }
  });

  it("reads from resolved path", async () => {
    loadTempDir = await mkdtemp(path.join(tmpdir(), "kodaelus-load-"));
    const localPath = projectInstructionsPath(loadTempDir);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, "# Kodaelus\n\nBody.", "utf8");

    const content = await loadInstructions({
      cwd: loadTempDir,
      cursorHome: path.join(loadTempDir, "no-global"),
    });
    expect(content).toContain("Kodaelus");
  });

  it("includes required policy sections in distribution instructions", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    const content = await loadInstructions({
      cwd: repoRoot,
      cursorHome: path.join(repoRoot, ".cursor-missing"),
    });
    expect(content).toContain("## Process Framework");
    expect(content).toContain("## Session Lock");
    expect(content).toContain("## Confidence Scoring & Anti-Hallucination");
    expect(content).not.toContain("No super files");
  });

  it("includes architecture review, follow-up queue, and kodaelus modes", async () => {
    const repoRoot = resolveDistributionRepoRoot(path.join(__dirname, ".."));
    const content = await loadInstructions({
      cwd: repoRoot,
      cursorHome: path.join(repoRoot, ".cursor-missing"),
    });
    expect(content).toContain("## Architecture Improvement Review");
    expect(content).toContain("## Follow-Up Queue");
    expect(content).toContain("## Kodaelus Modes");
    expect(content).toContain("use kodaelus 1");
    expect(content).toContain("implement suggestions");
    expect(content).toContain("FU-1");
  });
});

describe("wrapTaskWithInstructions", () => {
  it("prepends instructions and separates user task", () => {
    const wrapped = wrapTaskWithInstructions("# Policy", "Fix the login bug");
    expect(wrapped).toMatch(/^# Policy/);
    expect(wrapped).toContain("## User task");
    expect(wrapped).toContain("Fix the login bug");
  });

  it("rejects empty task", () => {
    expect(() => wrapTaskWithInstructions("# Policy", "   ")).toThrow(
      /empty/i,
    );
  });
});
